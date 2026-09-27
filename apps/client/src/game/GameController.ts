import * as PIXI from "pixi.js";
import { App as PixiApp } from "../engine/app";
import { Grid } from "../engine/grid";
import { TokenManager } from "../engine/tokenManager";
import type { ServerMessage } from "@vtt/protocol";
import { SocketManager } from "../network/socket";
import { registerTokenInteractions, type SelectionState } from "./tokenInteractions";

// Orquestra o canvas Pixi (grid + tokens) e traduz mensagens do servidor
// em mudanças visuais. É a única peça que fala tanto com o Pixi quanto com o socket.
export class GameController {
  private pixiApp: PixiApp;
  private grid!: Grid;
  private tokens!: TokenManager;
  private socket: SocketManager;

  private currentSceneId: string | null = null;
  private canCreateTokens = false;

  private highlights = new Map<PIXI.Graphics, PIXI.Graphics>();
  private selection: SelectionState = {
    selectedToken: null,
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
  };

  constructor(socket: SocketManager) {
    this.pixiApp = new PixiApp();
    this.socket = socket;
  }

  async init() {
    await this.pixiApp.init();

    this.grid = new Grid(this.pixiApp.layers.grid);
    this.tokens = new TokenManager(this.pixiApp.layers.tokens);
    this.grid.draw(window.innerWidth, window.innerHeight);

    this.pixiApp.app.stage.on("pointermove", (event) => this.onStagePointerMove(event));
    window.addEventListener("vtt-create-token", () => this.requestTokenCreate());

    this.socket.setGameHandler((data) => this.handleServerMessage(data));
  }

  // Chamado pelo botão "Criar token" da UI (SessionInfo/TokenPanel).
  requestTokenCreate() {
    if (!this.currentSceneId || !this.canCreateTokens) return;
    const x = this.grid.snap(window.innerWidth / 2);
    const y = this.grid.snap(window.innerHeight / 2);
    this.socket.send({ type: "TOKEN_CREATE_REQUEST", payload: { scene_id: this.currentSceneId, x, y } });
  }

  // Chamado pelo App.tsx quando a role do jogador é conhecida (SESSION_JOINED).
  setCanCreateTokens(value: boolean) {
    this.canCreateTokens = value;
  }

  private onStagePointerMove(event: PIXI.FederatedPointerEvent) {
    const { selectedToken, isDragging, dragOffset } = this.selection;
    if (!isDragging || !selectedToken) return;
    const parent = selectedToken.parent;
    if (!parent) return;
    const pos = event.getLocalPosition(parent);
    selectedToken.x = pos.x + dragOffset.x;
    selectedToken.y = pos.y + dragOffset.y;
  }

  private createHighlight(token: PIXI.Graphics) {
    const highlight = new PIXI.Graphics();
    highlight.rect(0, 0, 50, 50).stroke({ width: 2, color: 0x000000, alpha: 1 });
    highlight.visible = false;
    token.addChild(highlight);
    this.highlights.set(token, highlight);
  }

  private registerToken(token: PIXI.Graphics) {
    this.createHighlight(token);
    registerTokenInteractions(token, {
      grid: this.grid,
      highlights: this.highlights,
      selection: this.selection,
      getTokenId: (t) => this.tokens.getId(t),
      onMoveCommitted: (id, x, y) => {
        this.socket.send({ type: "TOKEN_MOVE", payload: { id, x, y } });
      },
    });
  }

  private clearTokens() {
    this.tokens.clear();
    this.highlights.clear();
    this.selection.selectedToken = null;
    this.selection.isDragging = false;
  }

  private handleServerMessage(data: ServerMessage) {
    console.debug("Game message:", data.type, (data as any).payload ?? "");

    if (data.type === "SCENE_CREATED") {
      this.currentSceneId = data.payload.id;
      this.socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.id } });
      return;
    }

    if (data.type === "SCENE_STATE") {
      this.currentSceneId = data.payload.scene_id;
      this.clearTokens();
      for (const t of data.payload.tokens) {
        const token = this.tokens.create(t.id, t.x, t.y);
        this.registerToken(token);
      }
      return;
    }

    if (data.type === "SCENE_PUSHED") {
      this.clearTokens();
      this.currentSceneId = null;
      this.socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.scene_id } });
      return;
    }

    if (data.type === "TOKEN_CREATE") {
      const token = this.tokens.create(data.payload.id, data.payload.x, data.payload.y);
      this.registerToken(token);
      return;
    }

    if (data.type === "TOKEN_MOVE") {
      this.tokens.move(data.payload.id, data.payload.x, data.payload.y);
      return;
    }
  }
}