import type { ClientMessage, ServerMessage } from "@vtt/protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export class SocketManager {
  private socket!: WebSocket;
  private readonly url: string;
  private messageHandler: ((data: ServerMessage) => void) | null = null;
  private gameHandler: ((data: ServerMessage) => void) | null = null;
  private statusHandler: ((status: ConnectionStatus) => void) | null = null;
  private backupHandler: ((data: ServerMessage) => void) | null = null;
  private queue: ClientMessage[] = [];
  
  setBackupHandler(handler: ((data: ServerMessage) => void) | null) {
    this.backupHandler = handler;
  }

  forwardToBackup(data: ServerMessage) {
    this.backupHandler?.(data);
  }

  // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 30s (teto)
  private retryDelay = 1000;
  private readonly maxDelay = 30_000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(url: string) {
    this.url = url;
    this.open();
  }

  // ─── Conexão ─────────────────────────────────────────────────────────────

  private open() {
    this.socket = new WebSocket(this.url);
    this.notifyStatus("connecting");
    this.attachListeners();
  }

  private attachListeners() {
    this.socket.onopen = () => {
      console.log("Conectado ao servidor");
      this.retryDelay = 1000; // reseta backoff após sucesso
      this.notifyStatus("open");
      this.flushQueue();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ServerMessage;
        console.debug("WS recv:", data.type, (data as Record<string, unknown>).payload ?? "");
        this.messageHandler?.(data);
      } catch {
        console.warn("Mensagem WS inválida recebida, ignorando.");
      }
    };

    this.socket.onclose = () => {
      if (this.destroyed) return;
      console.warn(`Conexão perdida. Reconectando em ${this.retryDelay / 1000}s…`);
      this.notifyStatus("reconnecting");
      this.scheduleReconnect();
    };

    this.socket.onerror = (err) => {
      // onerror sempre é seguido de onclose — apenas loga.
      console.error("Erro no WebSocket:", err);
    };
  }

  private scheduleReconnect() {
    this.retryTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.open();
    }, this.retryDelay);

    // Backoff exponencial com teto
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay);
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /** Registra o handler principal de mensagens e o callback de status. */
  connect(
    onMessage: (data: ServerMessage) => void,
    onStatusChange?: (status: ConnectionStatus) => void,
  ) {
    this.messageHandler = onMessage;
    this.statusHandler = onStatusChange ?? null;
  }

  setGameHandler(handler: (data: ServerMessage) => void) {
    this.gameHandler = handler;
  }

  forwardToGame(data: ServerMessage) {
    this.gameHandler?.(data);
  }

  send(message: ClientMessage) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      // Guarda e envia quando a conexão reabrir.
      this.queue.push(message);
    }
  }

  /** Encerra permanentemente — sem reconexão. */
  destroy() {
    this.destroyed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.socket.close();
  }

  // ─── Interno ──────────────────────────────────────────────────────────────

  private flushQueue() {
    while (this.queue.length > 0 && this.socket.readyState === WebSocket.OPEN) {
      const message = this.queue.shift()!;
      this.socket.send(JSON.stringify(message));
    }
  }

  private notifyStatus(status: ConnectionStatus) {
    this.statusHandler?.(status);
  }
}