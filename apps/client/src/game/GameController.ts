import * as PIXI from "pixi.js";
import { App as PixiApp } from "../engine/app";
import { Grid } from "../engine/grid";
import { TokenManager } from "../engine/tokenManager";
import type { ServerMessage } from "@vtt/protocol";
import { SceneMapLayer } from "../engine/sceneMapLayer";
import { SocketManager } from "../network/socket";
import { registerTokenInteractions, type SelectionState } from "./tokenInteractions";
import { API_ORIGIN } from "../network/apiBase";

// Orquestra o canvas Pixi (grid + tokens) e traduz mensagens do servidor
// em mudanças visuais. É a única peça que fala tanto com o Pixi quanto com o socket.
export class GameController {
  private pixiApp: PixiApp;
  private grid!: Grid;
  private tokens!: TokenManager;
  private maps!: SceneMapLayer;
  private socket: SocketManager;

  private currentSceneId: string | null = null;
  private canCreateTokens = false;

  private highlights = new Map<PIXI.Container, PIXI.Graphics>();
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
    this.maps = new SceneMapLayer(
      this.pixiApp.layers.background,
      this.pixiApp.app.stage,
      (map) => {
        if (!this.currentSceneId) return;
        this.socket.send({ type: "SCENE_MAP_SET", payload: { scene_id: this.currentSceneId, ...map } });
      },
    );
    this.grid.draw(window.innerWidth, window.innerHeight);

    this.pixiApp.app.stage.on("pointermove", (event) => this.onStagePointerMove(event));
    window.addEventListener("vtt-create-token", (event) => {
      const assetId = (event as CustomEvent<{ assetId?: string }>).detail?.assetId;
      this.requestTokenCreate(assetId);
    });
    window.addEventListener("vtt-set-selected-token-image", (event) => {
      const assetId = (event as CustomEvent<{ assetId: string }>).detail?.assetId;
      const token = this.selection.selectedToken;
      const tokenId = token ? this.tokens.getId(token) : undefined;
      if (assetId && tokenId && this.canCreateTokens) {
        this.socket.send({ type: "TOKEN_SET_ASSET", payload: { id: tokenId, asset_id: assetId } });
      }
    });
    window.addEventListener("vtt-map-edit", (event) => {
      const editing = (event as CustomEvent<{ editing: boolean }>).detail?.editing;
      this.maps.setEditing(editing === true && this.canCreateTokens);
    });

    this.socket.setGameHandler((data) => this.handleServerMessage(data));
  }

  // Chamado pelo botão "Criar token" da UI (SessionInfo/TokenPanel).
  requestTokenCreate(assetId?: string) {
    if (!this.currentSceneId || !this.canCreateTokens) return;
    const x = this.grid.snap(window.innerWidth / 2);
    const y = this.grid.snap(window.innerHeight / 2);
    this.socket.send({ type: "TOKEN_CREATE_REQUEST", payload: { scene_id: this.currentSceneId, x, y, asset_id: assetId } });
  }

  // Chamado pelo App.tsx quando a role do jogador é conhecida (SESSION_JOINED).
  setCanCreateTokens(value: boolean) {
    this.canCreateTokens = value;
    if (!value) this.maps.setEditing(false);
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

  private createHighlight(token: PIXI.Container) {
    const highlight = new PIXI.Graphics();
    highlight.rect(0, 0, 50, 50).stroke({ width: 2, color: 0x000000, alpha: 1 });
    highlight.visible = false;
    token.addChild(highlight);
    this.highlights.set(token, highlight);
  }

  private registerToken(token: PIXI.Container) {
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
      void this.maps.setMap(data.payload.map, (assetId) => `${API_ORIGIN}/assets/${assetId}`);
      this.clearTokens();
      for (const t of data.payload.tokens) {
        const token = this.tokens.create(t.id, t.x, t.y);
        this.registerToken(token);
        if (t.asset_id) void this.tokens.setImage(t.id, `${API_ORIGIN}/assets/${t.asset_id}`);
      }
      return;
    }

    if (data.type === "SCENE_MAP_CHANGED") {
      if (data.payload.scene_id !== this.currentSceneId) return;
      void this.maps.setMap(data.payload.map, (assetId) => `${API_ORIGIN}/assets/${assetId}`);
      return;
    }

    if (data.type === "SCENE_PUSHED") {
      this.clearTokens();
      void this.maps.setMap(null, (assetId) => `${API_ORIGIN}/assets/${assetId}`);
      this.currentSceneId = null;
      this.socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.scene_id } });
      return;
    }

    if (data.type === "TOKEN_CREATE") {
      const token = this.tokens.create(data.payload.id, data.payload.x, data.payload.y);
      this.registerToken(token);
      if (data.payload.asset_id) void this.tokens.setImage(data.payload.id, `${API_ORIGIN}/assets/${data.payload.asset_id}`);
      return;
    }

    if (data.type === "TOKEN_MOVE") {
      this.tokens.move(data.payload.id, data.payload.x, data.payload.y);
      return;
    }

    if (data.type === "TOKEN_ASSET_CHANGED") {
      void this.tokens.setImage(data.payload.id, `${API_ORIGIN}/assets/${data.payload.asset_id}`);
    }
  }
}
