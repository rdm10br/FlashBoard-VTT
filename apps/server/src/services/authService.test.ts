import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import Database from "better-sqlite3";
import { createSchema } from "../db/schema.js";
import { runMigrations } from "../db/migrations.js";
import type { ClientState } from "../clientRegistry.js";

test("legacy user rows survive the credential migration without gaining a login", () => {
  const legacyDb = new Database(":memory:");
  legacyDb.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    INSERT INTO users (id, nickname) VALUES ('legacy-1', 'Jogador antigo');
    CREATE TABLE scenes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_visible INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE tokens (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  createSchema(legacyDb);
  runMigrations(legacyDb);
  const user = legacyDb.prepare(
    "SELECT id, nickname, email, password_hash, is_admin FROM users WHERE id = ?",
  ).get("legacy-1") as {
    id: string;
    nickname: string;
    email: string | null;
    password_hash: string | null;
    is_admin: number;
  };

  assert.deepEqual(user, {
    id: "legacy-1",
    nickname: "Jogador antigo",
    email: null,
    password_hash: null,
    is_admin: 0,
  });
  const sceneColumns = legacyDb.prepare("PRAGMA table_info(scenes)").all() as { name: string }[];
  assert.deepEqual(
    sceneColumns.filter((column) => column.name.startsWith("map_")).map((column) => column.name),
    ["map_asset_id", "map_x", "map_y", "map_scale"],
  );
  legacyDb.close();
});

test("account authentication, legacy association, and session revocation", async () => {
  const testDataDir = mkdtempSync(path.join(tmpdir(), "projeto-vtt-auth-"));
  const previousDataDir = process.env.VTT_DATA_DIR;
  const previousBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  process.env.VTT_DATA_DIR = testDataDir;
  process.env.ADMIN_BOOTSTRAP_TOKEN = randomBytes(32).toString("base64url");

  const dbModule = await import("../db/connection.js");
  try {
    await import("../db/index.js");
    const { createUser } = await import("../db/userRepo.js");
    const { createSession } = await import("../db/sessionRepo.js");
    const { createScene, getScene } = await import("../db/sceneRepo.js");
    const { createToken, getToken } = await import("../db/tokenRepo.js");
    const { createAsset } = await import("../db/assetRepo.js");
    const { createInviteCode, getInviteCode } = await import("../db/inviteRepo.js");
    const { tokenHandlers } = await import("../handlers/tokenHandlers.js");
    const { sceneHandlers } = await import("../handlers/sceneHandlers.js");
    const { activeScenesPerSession } = await import("../state/activeScenes.js");
    const {
      authenticate,
      hashPassword,
      isAdminBootstrapAvailable,
      registerAccount,
      resumeAuthentication,
      updateAccountCredentials,
    } = await import("./authService.js");

    const legacyUser = createUser("Aventureiro");
    assert.equal(await authenticate("Aventureiro", "senha muito segura"), undefined);
    assert.equal(isAdminBootstrapAvailable(), true);

    const firstAdmin = await registerAccount({
      email: "Admin@Example.com",
      nickname: "Admin",
      password: "senha de administrador segura",
      bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN,
    });
    assert.equal(firstAdmin.user.is_admin, true);
    assert.equal(isAdminBootstrapAvailable(), false);

    assert.equal((await authenticate("admin@example.com", "senha de administrador segura"))?.user.id, firstAdmin.user.id);
    assert.equal((await authenticate("ADMIN", "senha de administrador segura"))?.user.id, firstAdmin.user.id);
    assert.equal(await authenticate("admin@example.com", "senha incorreta"), undefined);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await authenticate("admin@example.com", "senha incorreta", "test-client");
    }
    assert.equal(
      await authenticate("admin@example.com", "senha de administrador segura", "test-client"),
      undefined,
      "login attempts should be temporarily throttled by client and identifier",
    );
    assert.equal(resumeAuthentication(firstAdmin.token)?.user.id, firstAdmin.user.id);

    const player = await registerAccount({
      email: "player@example.com",
      nickname: "Jogador",
      password: "uma senha segura para jogador",
    });
    const playerLogin = await authenticate("player@example.com", "uma senha segura para jogador");
    assert.ok(playerLogin);
    assert.equal(resumeAuthentication(playerLogin.token)?.user.id, player.user.id);

    assert.equal(
      updateAccountCredentials(
        player.user.id,
        "new-player@example.com",
        await hashPassword("senha nova para jogador"),
      ),
      true,
    );
    assert.equal(resumeAuthentication(playerLogin.token), undefined);
    assert.equal(await authenticate("player@example.com", "uma senha segura para jogador"), undefined);
    assert.equal((await authenticate("NEW-PLAYER@example.com", "senha nova para jogador"))?.user.id, player.user.id);

    assert.equal(
      updateAccountCredentials(
        legacyUser.id,
        "aventureiro@example.com",
        await hashPassword("nova senha segura para conta antiga"),
      ),
      true,
    );
    assert.equal(
      (await authenticate("aventureiro@example.com", "nova senha segura para conta antiga"))?.user.id,
      legacyUser.id,
    );
    assert.equal(
      (await authenticate("Aventureiro", "nova senha segura para conta antiga"))?.user.id,
      legacyUser.id,
    );

    const otherUser = await registerAccount({
      email: "other@example.com",
      nickname: "Outro",
      password: "senha segura para outra conta",
    });
    const sessionA = createSession("Sessão autorizada", player.user.id);
    const sessionB = createSession("Sessão isolada", otherUser.user.id);
    const sceneA = createScene(sessionA.id, "Cena A");
    const sceneB = createScene(sessionB.id, "Cena B");
    const tokenA = createToken(sceneA.id, 10, 20);
    const tokenB = createToken(sceneB.id, 30, 40);
    const mapAsset = createAsset({
      sessionId: sessionA.id,
      kind: "map_image",
      filename: "map.webp",
      path: "map.webp",
      mimeType: "image/webp",
      sizeBytes: 2048,
    });
    const foreignMapAsset = createAsset({
      sessionId: sessionB.id,
      kind: "map_image",
      filename: "foreign.webp",
      path: "foreign.webp",
      mimeType: "image/webp",
      sizeBytes: 2048,
    });
    const foreignInviteCode = createInviteCode({
      sessionId: sessionB.id,
      role: "player",
      createdBy: otherUser.user.id,
    });
    const ws = {
      readyState: WebSocket.OPEN,
      send: (_message: string) => {},
    } as WebSocket;
    let role: "gm" | "player" = "gm";
    const state: ClientState = {
      ws,
      user_id: player.user.id,
      nickname: "Jogador",
      auth_token: player.token,
      auth_client_key: "test-client",
      is_admin: false,
      session_id: sessionA.id,
      role,
      scene_id: sceneA.id,
    };

    tokenHandlers.TOKEN_MOVE?.({ id: tokenB.id, x: 900, y: 900 }, { state, ws });
    assert.deepEqual(getToken(tokenB.id), tokenB);
    tokenHandlers.TOKEN_MOVE?.({ id: tokenA.id, x: 50, y: 60 }, { state, ws });
    assert.deepEqual({ x: getToken(tokenA.id)?.x, y: getToken(tokenA.id)?.y }, { x: 50, y: 60 });

    sceneHandlers.SCENE_PUSH?.({ scene_id: sceneB.id }, { state, ws });
    assert.equal(activeScenesPerSession.has(sessionA.id), false);
    sceneHandlers.SCENE_SET_VISIBLE?.({ scene_id: sceneB.id, visible: true }, { state, ws });
    assert.equal(getScene(sceneB.id)?.is_visible, 0);
    sceneHandlers.SCENE_MAP_SET?.({
      scene_id: sceneA.id,
      asset_id: foreignMapAsset.id,
      x: 0,
      y: 0,
      scale: 1,
    }, { state, ws });
    assert.equal(getScene(sceneA.id)?.map_asset_id, null);
    sceneHandlers.SCENE_MAP_SET?.({
      scene_id: sceneA.id,
      asset_id: mapAsset.id,
      x: 120,
      y: 90,
      scale: 0.75,
    }, { state, ws });
    assert.deepEqual(
      {
        map_asset_id: getScene(sceneA.id)?.map_asset_id,
        map_x: getScene(sceneA.id)?.map_x,
        map_y: getScene(sceneA.id)?.map_y,
        map_scale: getScene(sceneA.id)?.map_scale,
      },
      { map_asset_id: mapAsset.id, map_x: 120, map_y: 90, map_scale: 0.75 },
    );
    sceneHandlers.SCENE_MAP_SET?.({
      scene_id: sceneA.id,
      asset_id: mapAsset.id,
      x: 0,
      y: 0,
      scale: 20,
    }, { state, ws });
    assert.equal(getScene(sceneA.id)?.map_scale, 0.75);
    state.role = "player";
    sceneHandlers.SCENE_MAP_SET?.({
      scene_id: sceneA.id,
      asset_id: mapAsset.id,
      x: 0,
      y: 0,
      scale: 1,
    }, { state, ws });
    assert.equal(getScene(sceneA.id)?.map_scale, 0.75);
    state.role = "gm";
    const { inviteHandlers } = await import("../handlers/inviteHandlers.js");
    inviteHandlers.INVITE_DELETE?.({ code: foreignInviteCode }, { state, ws });
    assert.equal(getInviteCode(foreignInviteCode)?.session_id, sessionB.id);

    await assert.rejects(
      registerAccount({
        email: "ADMIN@example.com",
        nickname: "OutroAdmin",
        password: "outra senha de administrador",
      }),
      /E-mail ou apelido já está vinculado/,
    );
    await assert.rejects(
      registerAccount({
        email: "taken@example.com",
        nickname: "admin@example.com",
        password: "senha longa para impedir conflito",
      }),
      /E-mail ou apelido já está vinculado/,
    );
  } finally {
    dbModule.closeDatabase();
    rmSync(testDataDir, { recursive: true, force: true });
    if (previousDataDir === undefined) delete process.env.VTT_DATA_DIR;
    else process.env.VTT_DATA_DIR = previousDataDir;
    if (previousBootstrapToken === undefined) delete process.env.ADMIN_BOOTSTRAP_TOKEN;
    else process.env.ADMIN_BOOTSTRAP_TOKEN = previousBootstrapToken;
  }
});
