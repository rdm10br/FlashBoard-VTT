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
  const appliedMigrations = legacyDb.prepare(
    "SELECT version, name FROM schema_migrations ORDER BY version",
  ).all();
  assert.deepEqual(appliedMigrations, [{ version: 1, name: "legacy-schema-compatibility" }]);
  legacyDb.close();
});

test("schema migrations roll back all changes when a migration fails", () => {
  const failingDb = new Database(":memory:");
  failingDb.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      email TEXT
    );
    INSERT INTO users (id, nickname, email) VALUES
      ('user-1', 'Jogador 1', 'duplicado@example.com'),
      ('user-2', 'Jogador 2', 'duplicado@example.com');
  `);

  assert.throws(() => runMigrations(failingDb), /UNIQUE constraint failed/);
  const userColumns = failingDb.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  assert.equal(userColumns.some((column) => column.name === "password_hash"), false);
  assert.equal(
    (failingDb.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number }).count,
    0,
  );
  failingDb.close();
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
    const { createSession, getSession } = await import("../db/sessionRepo.js");
    const { createScene, getScene } = await import("../db/sceneRepo.js");
    const { createToken, getToken } = await import("../db/tokenRepo.js");
    const { createAsset } = await import("../db/assetRepo.js");
    const { createInviteCode, getInviteCode, getInviteCodesForSession } = await import("../db/inviteRepo.js");
    const { tokenHandlers } = await import("../handlers/tokenHandlers.js");
    const { sceneHandlers } = await import("../handlers/sceneHandlers.js");
    const { resolveActiveSceneId } = await import("./sessionService.js");
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
    const sessionInviteCode = createInviteCode({
      sessionId: sessionA.id,
      role: "player",
      createdBy: player.user.id,
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
    
    tokenHandlers.TOKEN_DELETE?.({ id: tokenB.id }, { state, ws });
    assert.deepEqual(getToken(tokenB.id), tokenB); // token de outra sessão não some
    tokenHandlers.TOKEN_DELETE?.({ id: tokenA.id }, { state, ws });
    assert.equal(getToken(tokenA.id), undefined);

    const tokenOwnedByPlayer = createToken(sceneA.id, 70, 80, undefined, player.user.id);
    const tokenOwnedByOtherPlayer = createToken(sceneA.id, 90, 100, undefined, otherUser.user.id);
    const tokenForGmDelete = createToken(sceneA.id, 110, 120, undefined, otherUser.user.id);
    tokenHandlers.TOKEN_DELETE?.({ id: tokenForGmDelete.id }, { state, ws });
    assert.equal(getToken(tokenForGmDelete.id), undefined, "GM can delete any token in the current scene");

    state.role = "player";
    tokenHandlers.TOKEN_DELETE?.({ id: tokenOwnedByOtherPlayer.id }, { state, ws });
    assert.ok(getToken(tokenOwnedByOtherPlayer.id), "player cannot delete another player's token");
    tokenHandlers.TOKEN_DELETE?.({ id: tokenOwnedByPlayer.id }, { state, ws });
    assert.equal(getToken(tokenOwnedByPlayer.id), undefined, "player can delete their own token");
    state.role = "gm";

    sceneHandlers.SCENE_PUSH?.({ scene_id: sceneB.id }, { state, ws });
    assert.equal(getSession(sessionA.id)?.active_scene_id, null);
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
    const { inviteHandlers } = await import("../handlers/inviteHandlers.js");

    sceneHandlers.SCENE_SET_VISIBLE?.({ scene_id: sceneA.id, visible: true }, { state, ws });
    assert.equal(getScene(sceneA.id)?.is_visible, 0, "player cannot change scene visibility");
    sceneHandlers.SCENE_CONFIG_SET?.({
      scene_id: sceneA.id,
      width: 3000,
      height: 1800,
      grid_type: "hex_flat",
      grid_size: 60,
      grid_color: "#ff0000",
      grid_opacity: 0.8,
    }, { state, ws });
    assert.equal(getScene(sceneA.id)?.width, 2000, "player cannot change scene configuration");
    sceneHandlers.SCENE_PUSH?.({ scene_id: sceneA.id }, { state, ws });
    assert.equal(getSession(sessionA.id)?.active_scene_id, null, "player cannot push a scene to the session");

    const inviteExpiry = Math.floor(Date.now() / 1000) + 3600;
    inviteHandlers.INVITE_CREATE?.({
      role: "gm",
      max_uses: 2,
      expires_at: inviteExpiry,
    }, { state, ws });
    assert.equal(getInviteCodesForSession(sessionA.id).length, 1, "player cannot create invites");
    inviteHandlers.INVITE_DELETE?.({ code: sessionInviteCode }, { state, ws });
    assert.ok(getInviteCode(sessionInviteCode), "player cannot delete an invite in their session");
    inviteHandlers.INVITE_DELETE?.({ code: foreignInviteCode }, { state, ws });
    assert.equal(getInviteCode(foreignInviteCode)?.session_id, sessionB.id);

    state.role = "gm";
    inviteHandlers.INVITE_DELETE?.({ code: sessionInviteCode }, { state, ws });
    assert.equal(getInviteCode(sessionInviteCode), undefined, "GM can delete an invite in their session");
    sceneHandlers.SCENE_SET_VISIBLE?.({ scene_id: sceneA.id, visible: true }, { state, ws });
    assert.equal(getScene(sceneA.id)?.is_visible, 1, "GM can change scene visibility");
    sceneHandlers.SCENE_CONFIG_SET?.({
      scene_id: sceneA.id,
      width: 3000,
      height: 1800,
      grid_type: "hex_flat",
      grid_size: 60,
      grid_color: "#ff0000",
      grid_opacity: 0.8,
    }, { state, ws });
    assert.equal(getScene(sceneA.id)?.width, 3000, "GM can change scene configuration");
    sceneHandlers.SCENE_PUSH?.({ scene_id: sceneA.id }, { state, ws });
    const persistedActiveSceneId = getSession(sessionA.id)?.active_scene_id ?? undefined;
    assert.equal(persistedActiveSceneId, sceneA.id, "GM can persist the pushed scene");
    assert.equal(resolveActiveSceneId(sessionA.id, "player", persistedActiveSceneId), sceneA.id,
      "rejoining members resolve the scene from persisted session state");

    inviteHandlers.INVITE_CREATE?.({
      role: "viewer",
      max_uses: 2,
      expires_at: inviteExpiry,
    }, { state, ws });
    const createdInvite = getInviteCodesForSession(sessionA.id)[0];
    assert.ok(createdInvite, "GM can create an invite");
    assert.equal(createdInvite.role, "viewer");
    assert.equal(createdInvite.max_uses, 2);
    inviteHandlers.INVITE_DELETE?.({ code: createdInvite.code }, { state, ws });
    assert.equal(getInviteCode(createdInvite.code), undefined, "GM can delete an invite in their session");

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
