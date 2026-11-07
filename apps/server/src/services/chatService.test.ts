import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ServerMessage } from "@vtt/protocol";
import type { WebSocket } from "ws";

test("whisper com /whisper e /w", async () => {
  const testDataDir = mkdtempSync(path.join(tmpdir(), "projeto-vtt-chat-"));
  const previousDataDir = process.env.VTT_DATA_DIR;
  process.env.VTT_DATA_DIR = testDataDir;

  const dbModule = await import("../db/connection.js");
  try {
    const { initDb, createUser, createSession, createMembership } = await import("../db/index.js");
    initDb();
    const { handleChatCommand } = await import("./chatService.js");

    const gmUser = createUser("GM_Test_" + Date.now());
    const playerUser = createUser("Player_Test_" + Date.now());
    const session = createSession("ChatTestSession_" + Date.now(), gmUser.id);
    createMembership(gmUser.id, session.id, "gm");
    createMembership(playerUser.id, session.id, "player");

    const sentWhispers: { target: string; msg: ServerMessage }[] = [];
    const fakeSendToMembers = (_sid: string, nicknames: string[], msg: ServerMessage) => {
      sentWhispers.push({ target: nicknames[1], msg });
    };
    const fakeWs = {} as WebSocket;
    const noop = () => {};

    // Testa /whisper
    handleChatCommand(
      `/whisper ${playerUser.nickname} Olá jogador`,
      session.id,
      { nickname: gmUser.nickname, role: "gm" },
      fakeWs,
      noop,
      noop,
      fakeSendToMembers,
      noop,
    );

    assert.equal(sentWhispers.length, 1);
    assert.equal(sentWhispers[0].target, playerUser.nickname);
    assert.equal(sentWhispers[0].msg.type, "CHAT_RECEIVE");
    if (sentWhispers[0].msg.type === "CHAT_RECEIVE") {
      assert.equal(sentWhispers[0].msg.payload.message_type, "whisper");
      assert.equal(sentWhispers[0].msg.payload.text, `(sussurro para ${playerUser.nickname}) Olá jogador`);
    }

    // Testa /w (alias)
    handleChatCommand(
      `/w ${playerUser.nickname} Outra mensagem via alias`,
      session.id,
      { nickname: gmUser.nickname, role: "gm" },
      fakeWs,
      noop,
      noop,
      fakeSendToMembers,
      noop,
    );

    assert.equal(sentWhispers.length, 2);
    assert.equal(sentWhispers[1].target, playerUser.nickname);
    if (sentWhispers[1].msg.type === "CHAT_RECEIVE") {
      assert.equal(sentWhispers[1].msg.payload.message_type, "whisper");
      assert.equal(sentWhispers[1].msg.payload.text, `(sussurro para ${playerUser.nickname}) Outra mensagem via alias`);
    }
  } finally {
    dbModule.closeDatabase();
    if (previousDataDir === undefined) delete process.env.VTT_DATA_DIR;
    else process.env.VTT_DATA_DIR = previousDataDir;
    rmSync(testDataDir, { recursive: true, force: true });
  }
});
