import type { Role } from "../db/index.js";
import { createChatMessage, getChatMessagesForSession, getMembersForSession, getSession, updateSessionDiceLimits } from "../db/index.js";
import type { ServerMessage, ChatMessage } from "@vtt/protocol";
import type { WebSocket } from "ws";
import { LIMITS } from "@vtt/protocol";
import { executeRoll, formatBreakdown, parseRoll, type RollMode } from "./dice.js";

export type ChatPayload = {
  session_id: string;
  sender: string;
  text: string;
  timestamp: number;
  message_type?: "text" | "roll" | "whisper" | "secret" | "system";
  target?: string;
  roll_details?: Record<string, unknown>;
  visible_to?: "all" | "gm" | "sender" | "target" | "sender-target";
};

export function getSessionChat(session_id: string, role: Role, requester: string) {
  return getChatMessagesForSession(session_id, role, requester);
}

export function buildMessage(id: string, text: string, sender: string, timestamp: number): ChatMessage {
  return { id, sender, text, timestamp, message_type: "text", visible_to: "all" } as ChatMessage;
}

export function handleChatCommand(
  rawText: string,
  session_id: string,
  state: { nickname: string; role: Role },
  ws: WebSocket,
  send: (message: ServerMessage) => void,
  broadcastToSession: (session_id: string, msg: ServerMessage) => void,
  sendToSessionMembers: (session_id: string, nicknames: string[], msg: ServerMessage) => void,
  broadcastToGMs: (session_id: string, msg: ServerMessage) => void
) {
  const now = Math.floor(Date.now() / 1000);

  function sendGlobalMessage(message: ServerMessage) {
    broadcastToSession(session_id, message);
  }

  function sendWhisperMessage(message: ServerMessage, targetName: string) {
    const recipients = [state.nickname, targetName];
    sendToSessionMembers(session_id, recipients, message);
  }

  function sendSecretMessage(message: ServerMessage) {
    broadcastToGMs(session_id, message);
  }

  if (!rawText.startsWith("/")) {
    const created = createChatMessage(session_id, state.nickname, rawText, now);
    sendGlobalMessage({ type: "CHAT_RECEIVE", payload: buildMessage(created.id, rawText, state.nickname, now) });
    return;
  }

  const pieces = rawText.slice(1).split(/\s+/);
  const command = pieces[0]?.toLowerCase();
  // Tudo que vem depois do comando, preservando espaços internos.
  const args = rawText.slice(1 + pieces[0].length).trim();

  if (command === "roll" || command === "r" || command === "adv" || command === "dis") {
    const mode: RollMode = command === "adv" ? "adv" : command === "dis" ? "dis" : "normal";
    if (!args) {
      send({ type: "USER_ERROR", payload: { message: "Uso: /roll 1d20+5 [rótulo] — também /adv e /dis" } });
      return;
    }

    const session = getSession(session_id);
    const parsed = parseRoll(
      args,
      { maxDice: session?.max_dice_count ?? 100, maxSides: session?.max_dice_sides ?? 100 },
      mode,
    );
    if (!parsed.ok) {
      send({ type: "USER_ERROR", payload: { message: parsed.error } });
      return;
    }

    const { roll } = parsed;
    const outcome = executeRoll(roll);
    const rollDetails = {
      dice: roll.expression,
      modifier: outcome.modifier,
      attribute: roll.label || undefined,
      advantage: mode === "adv",
      disadvantage: mode === "dis",
      results: outcome.results,
      total: outcome.total,
    };

    const rollMode = mode === "adv" ? " (vantagem)" : mode === "dis" ? " (desvantagem)" : "";
    const rollText = `${state.nickname} rolou ${roll.expression}${rollMode}${roll.label ? ` ${roll.label}` : ""}`;
    const detailedText = `${rollText} → ${formatBreakdown(outcome)} = ${outcome.total}`;
    const fullText = detailedText.length <= LIMITS.chatText
      ? detailedText
      : `${rollText} → (${outcome.results.length} dados) = ${outcome.total}`;

    const createdRoll = createChatMessage(session_id, state.nickname, fullText, now, "roll", undefined, rollDetails);
    sendGlobalMessage({
      type: "CHAT_RECEIVE",
      payload: { id: createdRoll.id, sender: state.nickname, text: fullText, timestamp: now, message_type: "roll", roll_details: rollDetails, visible_to: "all" },
    });
    return;
  }

  if (command === "whisper") {
    if (!args) {
      send({ type: "USER_ERROR", payload: { message: "Uso: /whisper <nome> <mensagem>" } });
      return;
    }

    // O apelido pode ter espaços ("Jogador antigo"), então não dá para pegar só a
    // primeira palavra. Testa os membros do maior apelido para o menor, para que
    // "Ana Maria" ganhe de "Ana".
    const member = [...getMembersForSession(session_id)]
      .sort((a, b) => b.nickname.length - a.nickname.length)
      .find((m) =>
        args.slice(0, m.nickname.length).toLowerCase() === m.nickname.toLowerCase() &&
        /\s/.test(args.charAt(m.nickname.length)),
      );
    if (!member) {
      send({ type: "USER_ERROR", payload: { message: "Jogador não encontrado na sessão. Uso: /whisper <nome> <mensagem>" } });
      return;
    }

    const targetNickname = member.nickname;
    const message = args.slice(targetNickname.length).trim();
    const text = `(sussurro para ${targetNickname}) ${message}`;
    const createdWhisper = createChatMessage(session_id, state.nickname, text, now, "whisper", targetNickname, { raw: message });
    sendWhisperMessage({
      type: "CHAT_RECEIVE",
      payload: { id: createdWhisper.id, sender: state.nickname, text, timestamp: now, message_type: "whisper", target: targetNickname, visible_to: "sender-target" },
    }, targetNickname);
    return;
  }

  if (command === "secret") {
    if (state.role !== "gm") {
      send({ type: "USER_ERROR", payload: { message: "Apenas o mestre pode usar /secret." } });
      return;
    }

    const message = pieces.slice(1).join(" ");
    if (!message) {
      send({ type: "USER_ERROR", payload: { message: "Uso: /secret <mensagem>" } });
      return;
    }

    const text = `(secreto) ${message}`;
    const createdSecret = createChatMessage(session_id, state.nickname, text, now, "secret", undefined, { raw: message });
    sendSecretMessage({ type: "CHAT_RECEIVE", payload: { id: createdSecret.id, sender: state.nickname, text, timestamp: now, message_type: "secret", visible_to: "gm" } });
    return;
  }

  if (command === "setdice" || (command === "config" && pieces[1]?.toLowerCase() === "dice")) {
    if (state.role !== "gm") {
      send({ type: "USER_ERROR", payload: { message: "Apenas o mestre pode configurar os limites de dados da sessão." } });
      return;
    }

    const argsOffset = command === "config" ? 2 : 1;
    const countStr = pieces[argsOffset];
    const sidesStr = pieces[argsOffset + 1];

    if (!countStr || !sidesStr || !/^\d+$/.test(countStr) || !/^\d+$/.test(sidesStr)) {
      send({
        type: "USER_ERROR",
        payload: { message: "Uso: /setdice <máx_dados> <máx_faces> (números inteiros positivos, ex: /setdice 50 100)" }
      });
      return;
    }

    const newMaxCount = parseInt(countStr, 10);
    const newMaxSides = parseInt(sidesStr, 10);

    if (newMaxCount < 1 || newMaxSides < 1) {
      send({
        type: "USER_ERROR",
        payload: { message: "Apenas números inteiros e positivos maiores que zero são aceitos." }
      });
      return;
    }

    if (newMaxCount > 1000 || newMaxSides > 10000) {
      send({
        type: "USER_ERROR",
        payload: { message: "O limite de segurança máximo permitido pelo servidor é de 1000 dados e 10000 faces." }
      });
      return;
    }

    updateSessionDiceLimits(session_id, newMaxCount, newMaxSides);

    const msgText = `🎲 O mestre configurou os limites de rolagem para: máx. ${newMaxCount} dados e dados de até ${newMaxSides} faces.`;
    const createdMsg = createChatMessage(session_id, "Sistema", msgText, now, "system");
    sendGlobalMessage({
      type: "CHAT_RECEIVE",
      payload: {
        id: createdMsg.id,
        sender: "Sistema",
        text: msgText,
        timestamp: now,
        message_type: "system",
        visible_to: "all",
      }
    });
    return;
  }

  send({ type: "USER_ERROR", payload: { message: "Comando desconhecido." } });
}