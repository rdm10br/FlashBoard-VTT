import type { BackupChatMessage, Role, SessionBackup } from "../db/types.js";

export class BackupValidationError extends Error {}

const ROLES: readonly string[] = ["gm", "player", "viewer"];
const MESSAGE_TYPES = ["text", "roll", "whisper", "secret", "system"] as const;
type MessageType = (typeof MESSAGE_TYPES)[number];

const MAX_TIMESTAMP = 4_102_444_800; // 2100-01-01
const LIMITS = {
  scenes: 200,
  tokens: 20_000,
  chat: 50_000,
  members: 500,
  invites: 200,
  name: 100,
  nickname: 32,
  text: 4_000,
  metadataChars: 4_000,
  coordinate: 1_000_000,
} as const;

function fail(message: string): never {
  throw new BackupValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`Backup inválido: "${field}" deve ser um objeto.`);
  return value;
}

function list(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`Backup inválido: "${field}" deve ser uma lista.`);
  if (value.length > max) fail(`Backup inválido: "${field}" excede o limite de ${max} itens.`);
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    fail(`Backup inválido: "${field}" deve ser um texto de 1 a ${max} caracteres.`);
  }
  return value;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(`Backup inválido: "${field}" deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function nullableInteger(value: unknown, field: string, min: number, max: number): number | null {
  return value === null || value === undefined ? null : integer(value, field, min, max);
}

function coordinate(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > LIMITS.coordinate) {
    fail(`Backup inválido: "${field}" fora do intervalo permitido.`);
  }
  return value;
}

function role(value: unknown, field: string): Role {
  if (typeof value !== "string" || !ROLES.includes(value)) {
    fail(`Backup inválido: "${field}" deve ser gm, player ou viewer.`);
  }
  return value as Role;
}

// Backups antigos não guardavam o tipo da mensagem; o prefixo do texto ainda o revela.
function classifyLegacyMessage(body: string): { message_type: MessageType; target?: string } {
  if (body.startsWith("(secreto) ")) return { message_type: "secret" };
  const whisper = /^\(sussurro para (.+?)\) /.exec(body);
  if (whisper && whisper[1].length <= LIMITS.nickname) {
    return { message_type: "whisper", target: whisper[1] };
  }
  return { message_type: "text" };
}

function parseChatMessage(raw: unknown, legacy: boolean): BackupChatMessage {
  const r = record(raw, "chat_messages[]");
  const body = text(r.text, "chat_messages[].text", LIMITS.text);
  const base = {
    sender: text(r.sender, "chat_messages[].sender", LIMITS.nickname),
    text: body,
    timestamp: integer(r.timestamp, "chat_messages[].timestamp", 0, MAX_TIMESTAMP),
    created_at: integer(r.created_at, "chat_messages[].created_at", 0, MAX_TIMESTAMP),
  };

  if (legacy) return { ...base, ...classifyLegacyMessage(body) };

  const type = r.message_type;
  if (typeof type !== "string" || !(MESSAGE_TYPES as readonly string[]).includes(type)) {
    fail(`Backup inválido: tipo de mensagem desconhecido.`);
  }
  const target =
    r.target === undefined || r.target === null
      ? undefined
      : text(r.target, "chat_messages[].target", LIMITS.nickname);
  const metadata =
    isRecord(r.metadata) && JSON.stringify(r.metadata).length <= LIMITS.metadataChars
      ? r.metadata
      : undefined;

  return { ...base, message_type: type as MessageType, target, metadata };
}

export function parseSessionBackup(input: unknown): SessionBackup {
  const root = record(input, "backup");

  // Backups sem "version" são a versão 1 (formato antigo).
  const version = root.version === undefined ? 1 : root.version;
  if (version !== 1 && version !== 2) fail("Versão de backup não suportada.");
  const legacy = version === 1;

  const sessionName = text(root.session_name, "session_name", LIMITS.name).trim();
  if (!sessionName) fail(`Backup inválido: "session_name" está vazio.`);

  const scenes = list(root.scenes, "scenes", LIMITS.scenes).map((raw) => {
    const s = record(raw, "scenes[]");
    return {
      name: text(s.name, "scenes[].name", LIMITS.name),
      is_visible: s.is_visible === true,
      created_at: integer(s.created_at, "scenes[].created_at", 0, MAX_TIMESTAMP),
    };
  });

  // Só backups antigos referenciam a cena pelo nome (a primeira com o nome vence).
  const sceneIndexByName = new Map<string, number>();
  scenes.forEach((scene, index) => {
    if (!sceneIndexByName.has(scene.name)) sceneIndexByName.set(scene.name, index);
  });

  const tokens: SessionBackup["tokens"] = [];
  for (const raw of list(root.tokens, "tokens", LIMITS.tokens)) {
    const t = record(raw, "tokens[]");
    let sceneIndex: number;
    if (legacy) {
      const found = sceneIndexByName.get(text(t.scene_name, "tokens[].scene_name", LIMITS.name));
      if (found === undefined) continue;
      sceneIndex = found;
    } else {
      if (scenes.length === 0) continue;
      sceneIndex = integer(t.scene_index, "tokens[].scene_index", 0, scenes.length - 1);
    }
    tokens.push({
      scene_index: sceneIndex,
      x: coordinate(t.x, "tokens[].x"),
      y: coordinate(t.y, "tokens[].y"),
      created_at: integer(t.created_at, "tokens[].created_at", 0, MAX_TIMESTAMP),
    });
  }

  const members = list(root.members, "members", LIMITS.members).map((raw) => {
    const m = record(raw, "members[]");
    return {
      nickname: text(m.nickname, "members[].nickname", LIMITS.nickname),
      role: role(m.role, "members[].role"),
      created_at: integer(m.created_at, "members[].created_at", 0, MAX_TIMESTAMP),
    };
  });

  const invite_codes = list(root.invite_codes, "invite_codes", LIMITS.invites).map((raw) => {
    const i = record(raw, "invite_codes[]");
    return {
      role: role(i.role, "invite_codes[].role"),
      use_count: integer(i.use_count, "invite_codes[].use_count", 0, 1_000_000),
      max_uses: nullableInteger(i.max_uses, "invite_codes[].max_uses", 1, 1_000_000),
      expires_at: nullableInteger(i.expires_at, "invite_codes[].expires_at", 0, MAX_TIMESTAMP),
      created_at: integer(i.created_at, "invite_codes[].created_at", 0, MAX_TIMESTAMP),
    };
  });

  return {
    version: 2,
    session_name: sessionName,
    owner_nickname: text(root.owner_nickname, "owner_nickname", LIMITS.nickname),
    max_dice_count:
      root.max_dice_count === undefined ? 100 : integer(root.max_dice_count, "max_dice_count", 1, 1000),
    max_dice_sides:
      root.max_dice_sides === undefined ? 100 : integer(root.max_dice_sides, "max_dice_sides", 1, 10_000),
    members,
    invite_codes,
    scenes,
    tokens,
    chat_messages: list(root.chat_messages, "chat_messages", LIMITS.chat).map((raw) =>
      parseChatMessage(raw, legacy),
    ),
    created_at: integer(root.created_at, "created_at", 0, MAX_TIMESTAMP),
  };
}

export function parseTargetName(input: unknown): string | undefined {
  if (!isRecord(input) || input.target_name === undefined) return undefined;
  const name = text(input.target_name, "target_name", LIMITS.name).trim();
  return name || undefined;
}