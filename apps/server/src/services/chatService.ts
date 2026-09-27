import type { Role } from "../db/index.js";
import { createChatMessage, getChatMessagesForSession, getMembersForSession, getSession, updateSessionDiceLimits } from "../db/index.js";
import type { ServerMessage, ChatMessage } from "@vtt/protocol";
import type { WebSocket } from "ws";

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
  const memberList = getMembersForSession(session_id);

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

  if (command === "roll" || command === "r" || command === "adv" || command === "dis") {
    const isAdv = command === "adv";
    const isDis = command === "dis";
    const target = pieces[1];
    if (!target) {
      send({ type: "USER_ERROR", payload: { message: "Uso: /roll 1d20 [+mod] [atributo]" } });
      return;
    }

    const parsed = /^([0-9]*)d([0-9]+)$/.exec(target.toLowerCase());
    if (!parsed) {
      send({ type: "USER_ERROR", payload: { message: "Formato de dado inválido." } });
      return;
    }

    const count = parsed[1] ? parseInt(parsed[1], 10) : 1;
    const sides = parseInt(parsed[2], 10);

    const session = getSession(session_id);
    const maxDiceCount = session?.max_dice_count ?? 100;
    const maxDiceSides = session?.max_dice_sides ?? 100;

    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 1) {
      send({ type: "USER_ERROR", payload: { message: "Apenas números inteiros e positivos são aceitos para quantidade e faces dos dados." } });
      return;
    }

    if (count > maxDiceCount) {
      send({ type: "USER_ERROR", payload: { message: `Limite excedido: a sessão permite no máximo ${maxDiceCount} dados por rolagem.` } });
      return;
    }

    if (sides > maxDiceSides) {
      send({ type: "USER_ERROR", payload: { message: `Limite excedido: a sessão permite dados com no máximo ${maxDiceSides} faces.` } });
      return;
    }
    let modifier = 0;
    let attribute: string | undefined;
    for (let i = 2; i < pieces.length; i += 1) {
      const part = pieces[i];
      if (/^[+-]?\d+$/.test(part)) {
        modifier += parseInt(part, 10);
      } else {
        attribute = part.toUpperCase();
      }
    }

    const values: number[] = [];
    if ((isAdv || isDis) && count === 1 && sides === 20) {
      const first = Math.floor(Math.random() * 20) + 1;
      const second = Math.floor(Math.random() * 20) + 1;
      values.push(first, second);
    } else {
      for (let i = 0; i < count; i += 1) {
        values.push(Math.floor(Math.random() * sides) + 1);
      }
    }

    let baseValue = 0;
    let chosen: number | undefined;

    if (isAdv && values.length > 1) {
      chosen = Math.max(...values);
      baseValue = chosen;
    } else if (isDis && values.length > 1) {
      chosen = Math.min(...values);
      baseValue = chosen;
    } else {
      baseValue = values.reduce((sum, v) => sum + v, 0);
    }

    const total = baseValue + modifier;
    const rollDetails = {
      dice: `${count}d${sides}`,
      modifier,
      attribute,
      advantage: isAdv,
      disadvantage: isDis,
      results: values,
      total,
    };
    const rollMode = isAdv ? " (vantagem)" : isDis ? " (desvantagem)" : "";
    const rollText = `${state.nickname} rolou ${rollDetails.dice}${rollMode}${modifier ? ` ${modifier >= 0 ? "+" : ""}${modifier}` : ""}${attribute ? ` ${attribute}` : ""}`;
    const resultDetails = chosen !== undefined ? `[${values.join(", ")}] (escolhido: ${chosen})` : values.join(", ");
    const fullText = `${rollText} → ${resultDetails} = ${total}`;

    const createdRoll = createChatMessage(session_id, state.nickname, fullText, now, "roll", undefined, rollDetails);
    sendGlobalMessage({ type: "CHAT_RECEIVE", payload: { id: createdRoll.id, sender: state.nickname, text: fullText, timestamp: now, message_type: "roll", roll_details: rollDetails, visible_to: "all" } });
    return;
  }

  if (command === "whisper") {
    const target = pieces[1];
    const message = pieces.slice(2).join(" ");
    if (!target || !message) {
      send({ type: "USER_ERROR", payload: { message: "Uso: /whisper <nome> <mensagem>" } });
      return;
    }

    const targetNickname = memberList.find((m) => m.nickname.toLowerCase() === target.toLowerCase())?.nickname;
    if (!targetNickname) {
      send({ type: "USER_ERROR", payload: { message: "Jogador não encontrado na sessão." } });
      return;
    }

    const text = `(sussurro para ${targetNickname}) ${message}`;
    const createdWhisper = createChatMessage(session_id, state.nickname, text, now, "whisper", targetNickname, { raw: message });
    sendWhisperMessage({ type: "CHAT_RECEIVE", payload: { id: createdWhisper.id, sender: state.nickname, text, timestamp: now, message_type: "whisper", target: targetNickname, visible_to: "sender-target" } }, targetNickname);
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
