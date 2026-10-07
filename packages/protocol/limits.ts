export const LIMITS = {
  wsPayloadBytes: 64 * 1024,
  chatText: 4_000,
  // Texto armazenado inclui prefixos como "(sussurro para X) ", então a margem
  // evita que o backup rejeite uma mensagem que o chat aceitou.
  chatStoredText: 4_200,
  name: 100,       // sessão e cena
  nickname: 32,
  coordinate: 1_000_000,
} as const;