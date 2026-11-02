import * as PIXI from "pixi.js";
import { App as PixiApp } from "../engine/app";
import { Grid } from "../engine/grid";
import { TokenManager } from "../engine/tokenManager";
import type { SceneDrawing, SceneDrawingKind, SceneMeasurementConfig, ServerMessage } from "@vtt/protocol";
import { SceneMapLayer } from "../engine/sceneMapLayer";
import { SocketManager } from "../network/socket";
import { registerTokenInteractions, type SelectionState } from "./tokenInteractions";
import { assetUrl } from "../network/apiBase";
import { Camera } from "../engine/camera";

// Orquestra o canvas Pixi (grid + tokens) e traduz mensagens do servidor
// em mudanças visuais. É a única peça que fala tanto com o Pixi quanto com o socket.
export class GameController {
  private pixiApp: PixiApp;
  private grid!: Grid;
  private tokens!: TokenManager;
  private maps!: SceneMapLayer;
  private camera!: Camera;
  private drawingLayer!: PIXI.Container;
  private selectionGraphics!: PIXI.Graphics;
  private socket: SocketManager;

  private currentSceneId: string | null = null;
  private canCreateTokens = false;
  private currentUserId: string | null = null;
  private currentRole: "gm" | "player" | "viewer" = "player";
  private measurementConfig: SceneMeasurementConfig = { mode: "grid", unit_label: "unidades", units_per_cell: 1, snap_to_cell_centers: false };
  private sceneWidth = 2000;
  private sceneHeight = 1500;
  private activeTool: "select" | "measurement" | "line" | "ellipse" | "polygon" | "freehand" = "select";
  private measurementShared = false;
  private measurementKeep = false;
  private drawings = new Map<string, { data: SceneDrawing; graphic: PIXI.Graphics; label?: PIXI.Text }>();
  private selectedDrawingId: string | null = null;
  private draft: { kind: SceneDrawingKind; points: number[]; graphic: PIXI.Graphics; label?: PIXI.Text } | null = null;
  private drawingDrag: { id: string; pointer: { x: number; y: number }; points: number[] } | null = null;
  private tokenOwners = new Map<string, string[]>();
  private tokenSheets = new Map<string, string>();
  private selectedTokenIds = new Set<string>();
  private mapPings = new Set<PIXI.Container>();
  private selectionBox: { x: number; y: number; currentX: number; currentY: number } | null = null;

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

    this.camera = new Camera(this.pixiApp.app.canvas, this.pixiApp.camera);
    this.camera.setRightInset(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vtt-sidebar-inset")) || 0);
    window.addEventListener("vtt-sidebar-width", (event) => {
      const width = (event as CustomEvent<{ width?: number }>).detail?.width;
      this.camera.setRightInset(typeof width === "number" ? width : 0);
    });
    const canvas = this.pixiApp.app.canvas;
    canvas.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("application/x-vtt-sheet-id")) event.preventDefault();
    });
    canvas.addEventListener("drop", (event) => {
      const sheetId = event.dataTransfer?.getData("application/x-vtt-sheet-id");
      if (!sheetId || !this.currentSceneId || !this.canCreateTokens) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = this.pixiApp.camera.toLocal(new PIXI.Point(event.clientX - rect.left, event.clientY - rect.top));
      let { x, y } = { x: point.x - 25, y: point.y - 25 };
      if (!event.altKey) ({ x, y } = this.grid.snapPoint(x, y));
      x = Math.max(0, Math.min(this.sceneWidth - 50, x));
      y = Math.max(0, Math.min(this.sceneHeight - 50, y));
      this.socket.send({ type: "TOKEN_CREATE_REQUEST", payload: { scene_id: this.currentSceneId, x, y, sheet_id: sheetId } });
    });
    this.drawingLayer = this.pixiApp.layers.drawings;
    this.selectionGraphics = new PIXI.Graphics();
    this.selectionGraphics.eventMode = "none";
    this.pixiApp.layers.ui.addChild(this.selectionGraphics);
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
    this.grid.draw();

    window.addEventListener("resize", () => {
      this.pixiApp.resize();
      this.camera.resize();
    });

    this.pixiApp.app.stage.on("pointermove", (event) => this.onStagePointerMove(event));
    this.pixiApp.app.stage.on("pointerdown", (event) => this.onStagePointerDown(event));
    this.pixiApp.app.stage.on("pointerup", (event) => this.onStagePointerUp(event));
    this.pixiApp.app.stage.on("pointerupoutside", (event) => this.onStagePointerUp(event));
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
    
    window.addEventListener("vtt-delete-selected-token", () => this.deleteSelectedToken());
    window.addEventListener("vtt-map-tool", (event) => {
      const tool = (event as CustomEvent<{ tool?: string }>).detail?.tool;
      if (["select", "measurement", "line", "ellipse", "polygon", "freehand"].includes(tool ?? "")) {
        const nextTool = tool as typeof this.activeTool;
        if (nextTool !== this.activeTool && this.draft) {
          this.draft.graphic.destroy();
          this.draft.label?.destroy();
          this.draft = null;
        }
        this.activeTool = nextTool;
        this.updateDrawingInteractivity();
      }
    });
    window.addEventListener("vtt-map-tool-settings", (event) => {
      const options = (event as CustomEvent<{ shared?: boolean; keep?: boolean }>).detail;
      this.measurementShared = options?.shared === true;
      this.measurementKeep = options?.keep === true;
    });
    window.addEventListener("vtt-delete-selected-drawing", () => this.deleteSelectedDrawing());
    window.addEventListener("keydown", (event) => this.onKeyDown(event));

    this.socket.setGameHandler((data) => this.handleServerMessage(data));
  }

  // Chamado pelo botão "Criar token" da UI (SessionInfo/TokenPanel).
  requestTokenCreate(assetId?: string) {
    if (!this.currentSceneId || !this.canCreateTokens) return;
    const { x, y } = this.grid.spawnPoint();
    this.socket.send({ type: "TOKEN_CREATE_REQUEST", payload: { scene_id: this.currentSceneId, x, y, asset_id: assetId } });
  }

  // Chamado pelo App.tsx quando a role do jogador é conhecida (SESSION_JOINED).
  setCanCreateTokens(value: boolean) {
    this.canCreateTokens = value;
    if (!value) this.maps.setEditing(false);
  }

  deleteSelectedToken() {
    if (!this.canCreateTokens) return;
    for (const id of this.selectedTokenIds) this.socket.send({ type: "TOKEN_DELETE", payload: { id } });
  }

  private onKeyDown(event: KeyboardEvent) {
    // Não apagar token enquanto a pessoa digita no chat ou em qualquer campo.
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      if (this.activeTool !== "select" || this.currentRole === "viewer" || this.selectedTokenIds.size === 0) return;
      event.preventDefault();
      const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      for (const id of this.selectedTokenIds) {
        const token = this.tokens.get(id);
        if (!token || !this.canControlToken(id)) continue;
        const point = this.grid.stepCell(token.x, token.y, dx, dy);
        const x = Math.max(0, Math.min(this.sceneWidth - 50, point.x));
        const y = Math.max(0, Math.min(this.sceneHeight - 50, point.y));
        this.tokens.move(id, x, y);
        this.socket.send({ type: "TOKEN_MOVE", payload: { id, x, y } });
      }
      return;
    }
    if (event.key === "Escape" && this.draft) {
      this.draft.graphic.destroy(); this.draft.label?.destroy(); this.draft = null;
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (this.selectedDrawingId) {
      event.preventDefault();
      this.deleteSelectedDrawing();
      return;
    }
    if (this.selectedTokenIds.size === 0) return;
    event.preventDefault();
    this.deleteSelectedToken();
  }

  private onStagePointerMove(event: PIXI.FederatedPointerEvent) {
    if (this.selectionBox) {
      this.selectionBox.currentX = event.global.x;
      this.selectionBox.currentY = event.global.y;
      this.drawSelectionBox();
      return;
    }
    const world = event.getLocalPosition(this.pixiApp.camera);
    if (this.drawingDrag) {
      const dx = world.x - this.drawingDrag.pointer.x;
      const dy = world.y - this.drawingDrag.pointer.y;
      const xs = this.drawingDrag.points.filter((_, index) => index % 2 === 0);
      const ys = this.drawingDrag.points.filter((_, index) => index % 2 === 1);
      const offsetX = Math.max(-Math.min(...xs), Math.min(this.sceneWidth - Math.max(...xs), dx));
      const offsetY = Math.max(-Math.min(...ys), Math.min(this.sceneHeight - Math.max(...ys), dy));
      const points = this.drawingDrag.points.map((value, index) => value + (index % 2 === 0 ? offsetX : offsetY));
      const drawing = this.drawings.get(this.drawingDrag.id);
      if (drawing) this.updateDrawing({ ...drawing.data, points });
      return;
    }
    if (this.draft) {
      const point = this.measurementPoint(world, this.draft.kind);
      if (this.draft.kind === "freehand") {
        const last = this.draft.points.length - 2;
        if (Math.hypot(point.x - this.draft.points[last], point.y - this.draft.points[last + 1]) >= 3 && this.draft.points.length < 2000) {
          this.draft.points.push(point.x, point.y);
        }
      } else if (this.draft.kind !== "polygon") {
        this.draft.points[this.draft.points.length - 2] = point.x;
        this.draft.points[this.draft.points.length - 1] = point.y;
      }
      this.renderDraft(point);
      return;
    }
    const { selectedToken, isDragging, dragOffset } = this.selection;
    if (!isDragging || !selectedToken) return;
    const parent = selectedToken.parent;
    if (!parent) return;
    const pos = event.getLocalPosition(parent);
    selectedToken.x = pos.x + dragOffset.x;
    selectedToken.y = pos.y + dragOffset.y;
  }

  private onStagePointerDown(event: PIXI.FederatedPointerEvent) {
    if (event.button === 2) {
      if (this.activeTool === "measurement" && this.draft?.kind === "measurement") {
        event.stopPropagation();
        const point = this.measurementPoint(event.getLocalPosition(this.pixiApp.camera), "measurement");
        const last = this.draft.points.length - 2;
        this.draft.points[last] = point.x; this.draft.points[last + 1] = point.y;
        this.draft.points.push(point.x, point.y);
        this.renderDraft();
      }
      return;
    }
    if (event.button !== 0) return;
    if (this.activeTool === "select") {
      if (event.target !== this.pixiApp.app.stage) return;
      event.stopPropagation();
      this.selection.selectedToken = null;
      this.selection.isDragging = false;
      this.setSelectedTokenIds([]);
      this.selectionBox = { x: event.global.x, y: event.global.y, currentX: event.global.x, currentY: event.global.y };
      return;
    }
    event.stopPropagation();
    const point = this.measurementPoint(event.getLocalPosition(this.pixiApp.camera), this.activeTool);
    if (this.activeTool === "measurement") {
      if (!this.draft) this.startDraft("measurement", [point.x, point.y, point.x, point.y]);
      else if (this.draft.kind === "measurement") {
        const last = this.draft.points.length - 2;
        this.draft.points[last] = point.x; this.draft.points[last + 1] = point.y;
        this.finishDraft();
      }
      return;
    }
    if (this.activeTool === "polygon") {
      if (this.draft?.kind === "polygon" && event.detail >= 2) {
        this.finishDraft();
        return;
      }
      if (!this.draft) this.startDraft("polygon", [point.x, point.y]);
      else {
        this.draft.points.push(point.x, point.y);
        this.renderDraft(point);
      }
      return;
    }
    this.startDraft(this.activeTool, [point.x, point.y, point.x, point.y]);
  }

  private startDraft(kind: SceneDrawingKind, points: number[]) {
    const graphic = new PIXI.Graphics();
    this.drawingLayer.addChild(graphic);
    const draft: NonNullable<typeof this.draft> = { kind, points, graphic };
    if (kind === "measurement") {
      draft.label = new PIXI.Text({ text: "0", style: { fontSize: 14, fill: "#ffffff", stroke: { color: "#111827", width: 3 } } });
      draft.label.anchor.set(0.5);
      this.drawingLayer.addChild(draft.label);
    }
    this.draft = draft;
    this.renderDraft();
  }

  private clampWorldPoint(point: { x: number; y: number }) {
    return {
      x: Math.max(0, Math.min(this.sceneWidth, point.x)),
      y: Math.max(0, Math.min(this.sceneHeight, point.y)),
    };
  }

  private measurementPoint(point: { x: number; y: number }, kind: SceneDrawingKind) {
    const clamped = this.clampWorldPoint(point);
    return kind === "measurement" && this.measurementConfig.snap_to_cell_centers
      ? this.grid.snapCellCenter(clamped.x, clamped.y)
      : clamped;
  }

  private onStagePointerUp(event: PIXI.FederatedPointerEvent) {
    if (this.selectionBox) this.finishSelectionBox(event.global);
    if (this.draft?.kind === "measurement") return;
    this.finishDrawingGesture();
  }

  private drawSelectionBox() {
    const box = this.selectionBox;
    if (!box) return;
    const x = Math.min(box.x, box.currentX), y = Math.min(box.y, box.currentY);
    const width = Math.abs(box.currentX - box.x), height = Math.abs(box.currentY - box.y);
    this.selectionGraphics.clear();
    this.selectionGraphics.rect(x, y, width, height)
      .fill({ color: 0x38bdf8, alpha: 0.12 })
      .stroke({ width: 1, color: 0x38bdf8, alpha: 0.9 });
  }

  private finishSelectionBox(point: { x: number; y: number }) {
    const box = this.selectionBox;
    if (!box) return;
    this.selectionBox = null;
    this.selectionGraphics.clear();
    const left = Math.min(box.x, point.x), right = Math.max(box.x, point.x);
    const top = Math.min(box.y, point.y), bottom = Math.max(box.y, point.y);
    const ids: string[] = [];
    if (right - left >= 4 || bottom - top >= 4) {
      for (const [id, token] of this.tokens.all()) {
        if (!this.canControlToken(id)) continue;
        const bounds = token.getBounds();
        if (bounds.x <= right && bounds.x + bounds.width >= left && bounds.y <= bottom && bounds.y + bounds.height >= top) ids.push(id);
      }
    }
    this.selection.selectedToken = null;
    this.selection.isDragging = false;
    this.selectedDrawingId = null;
    this.setSelectedTokenIds(ids);
  }

  private canControlToken(id: string): boolean {
    if (this.currentRole === "gm") return true;
    return this.currentRole === "player" && this.currentUserId !== null && (this.tokenOwners.get(id) ?? []).includes(this.currentUserId);
  }

  private setSelectedTokenIds(ids: string[]) {
    this.selectedTokenIds = new Set(ids);
    for (const [id, token] of this.tokens.all()) {
      const highlight = this.highlights.get(token);
      if (highlight) highlight.visible = this.selectedTokenIds.has(id);
    }
    const selectedOwners = [...this.selectedTokenIds].map((id) => this.tokenOwners.get(id) ?? []);
    const commonOwners = selectedOwners.length ? selectedOwners[0].filter((owner) => selectedOwners.every((owners) => owners.includes(owner))) : [];
    window.dispatchEvent(new CustomEvent("vtt-token-selection", { detail: { tokenIds: [...this.selectedTokenIds], ownerUserIds: commonOwners } }));
  }

  private renderDraft(pointer?: { x: number; y: number }) {
    if (!this.draft) return;
    const points = [...this.draft.points];
    if (pointer && this.draft.kind === "polygon") points.push(pointer.x, pointer.y);
    this.paintGeometry(this.draft.graphic, this.draft.kind, points, false);
    if (this.draft.kind === "measurement" && this.draft.label) {
      const labelPoint = this.measurementLabelPosition(this.draft.points);
      this.draft.label.text = this.measurementLabel(this.draft.points);
      this.draft.label.position.set(labelPoint.x, labelPoint.y - 14);
    }
  }

  private finishDrawingGesture() {
    if (this.drawingDrag) {
      const drawing = this.drawings.get(this.drawingDrag.id);
      if (drawing) this.socket.send({ type: "SCENE_DRAWING_MOVE", payload: { id: drawing.data.id, points: drawing.data.points } });
      this.drawingDrag = null;
      return;
    }
    if (!this.draft || this.draft.kind === "polygon") return;
    this.finishDraft();
  }

  private finishDraft() {
    const draft = this.draft;
    if (!draft) return;
    this.draft = null;
    draft.label?.destroy();
    draft.graphic.destroy();
    const count = draft.points.length / 2;
    if ((draft.kind === "polygon" && count < 3) || (draft.kind !== "polygon" && count < 2) || !this.currentSceneId) return;
    this.socket.send({
      type: "SCENE_DRAWING_CREATE",
      payload: {
        scene_id: this.currentSceneId,
        kind: draft.kind,
        points: draft.points,
        shared: draft.kind === "measurement" && this.measurementShared,
        keep: draft.kind !== "measurement" || this.measurementKeep,
      },
    });
  }

  private createDrawing(drawing: SceneDrawing) {
    const previous = this.drawings.get(drawing.id);
    previous?.graphic.destroy({ children: true });
    const graphic = new PIXI.Graphics();
    this.drawingLayer.addChild(graphic);
    const entry: { data: SceneDrawing; graphic: PIXI.Graphics; label?: PIXI.Text } = { data: drawing, graphic };
    this.drawings.set(drawing.id, entry);
    this.updateDrawing(drawing);
  }

  private updateDrawing(drawing: SceneDrawing) {
    const entry = this.drawings.get(drawing.id);
    if (!entry) return;
    entry.data = drawing;
    entry.graphic.clear();
    entry.label?.destroy();
    entry.label = undefined;
    this.paintGeometry(entry.graphic, drawing.kind, drawing.points, true);
    const xs = drawing.points.filter((_, index) => index % 2 === 0);
    const ys = drawing.points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    entry.graphic.hitArea = new PIXI.Rectangle(minX - 8, minY - 8, Math.max(16, maxX - minX + 16), Math.max(16, maxY - minY + 16));
    entry.graphic.eventMode = this.activeTool === "select" ? "static" : "none";
    entry.graphic.cursor = this.activeTool === "select" ? "move" : "default";
    entry.graphic.removeAllListeners("pointerdown");
    entry.graphic.on("pointerdown", (event) => {
      if (this.activeTool !== "select") return;
      event.stopPropagation();
      this.selectedDrawingId = drawing.id;
      const oldToken = this.selection.selectedToken;
      const oldHighlight = oldToken ? this.highlights.get(oldToken) : undefined;
      if (oldHighlight) oldHighlight.visible = false;
      this.selection.selectedToken = null;
      this.selection.isDragging = false;
      this.setSelectedTokenIds([]);
      if (this.currentUserId && (this.currentRole === "gm" || drawing.owner_user_id === this.currentUserId)) {
        const point = event.getLocalPosition(this.pixiApp.camera);
        this.drawingDrag = { id: drawing.id, pointer: point, points: [...drawing.points] };
      }
    });
    if (drawing.kind === "measurement") {
      entry.label = new PIXI.Text({
        text: this.measurementLabel(drawing.points),
        style: { fontSize: 14, fill: "#ffffff", stroke: { color: "#111827", width: 3 } },
      });
      entry.label.anchor.set(0.5);
      const labelPoint = this.measurementLabelPosition(drawing.points);
      entry.label.position.set(labelPoint.x, labelPoint.y);
      entry.graphic.addChild(entry.label);
    }
  }

  private paintGeometry(graphic: PIXI.Graphics, kind: SceneDrawingKind, points: number[], persistent: boolean) {
    graphic.clear();
    const color = kind === "measurement" ? 0xfbbf24 : 0x38bdf8;
    const alpha = persistent ? 0.95 : 0.65;
    if (kind === "ellipse") {
      const cx = (points[0] + points[2]) / 2, cy = (points[1] + points[3]) / 2;
      graphic.ellipse(cx, cy, Math.abs(points[2] - points[0]) / 2, Math.abs(points[3] - points[1]) / 2)
        .fill({ color, alpha: 0.08 }).stroke({ width: 3, color, alpha });
    } else {
      graphic.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) graphic.lineTo(points[i], points[i + 1]);
      if (kind === "polygon" && points.length >= 6) graphic.closePath().fill({ color, alpha: 0.08 });
      graphic.stroke({ width: 3, color, alpha });
    }
  }

  private measurementLabel(points: number[]): string {
    const distance = this.measurementDistance(points);
    if (this.measurementConfig.mode === "free") return `${Math.round(distance)} px`;
    const cells = this.measurementConfig.snap_to_cell_centers
      ? this.measurementCellDistance(points)
      : distance / Math.max(1, this.grid.cellSize);
    if (this.measurementConfig.mode === "custom") {
      return `${Number((cells * this.measurementConfig.units_per_cell).toFixed(2))} ${this.measurementConfig.unit_label}`;
    }
    return `${Number(cells.toFixed(2))} células`;
  }

  private measurementDistance(points: number[]): number {
    let distance = 0;
    for (let i = 2; i < points.length; i += 2) distance += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    return distance;
  }

  private measurementCellDistance(points: number[]): number {
    let cells = 0;
    for (let i = 2; i < points.length; i += 2) cells += this.grid.distanceInCells(points[i - 2], points[i - 1], points[i], points[i + 1]);
    return cells;
  }

  private measurementLabelPosition(points: number[]) {
    const i = points.length - 4;
    return { x: (points[i] + points[i + 2]) / 2, y: (points[i + 1] + points[i + 3]) / 2 };
  }

  private updateDrawingInteractivity() {
    for (const { graphic } of this.drawings.values()) graphic.eventMode = this.activeTool === "select" ? "static" : "none";
  }

  private deleteSelectedDrawing() {
    if (this.selectedDrawingId) this.socket.send({ type: "SCENE_DRAWING_DELETE", payload: { id: this.selectedDrawingId } });
  }

  private removeDrawing(id: string) {
    const entry = this.drawings.get(id);
    if (!entry) return;
    entry.graphic.destroy({ children: true });
    this.drawings.delete(id);
    if (this.selectedDrawingId === id) this.selectedDrawingId = null;
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
      canInteract: (candidate) => {
        const id = this.tokens.getId(candidate);
        return this.activeTool === "select" && !!id && this.canControlToken(id);
      },
      onTokenSelected: (candidate, event) => {
        this.selectedDrawingId = null;
        const id = this.tokens.getId(candidate);
        if (!id) return;
        const ctrl = event.ctrlKey || event.metaKey;
        if (ctrl) {
          const next = new Set(this.selectedTokenIds);
          if (next.has(id)) next.delete(id); else next.add(id);
          this.setSelectedTokenIds([...next]);
          return "toggle";
        }
        if (this.selectedTokenIds.has(id) && this.selectedTokenIds.size > 1) return "keep";
        this.setSelectedTokenIds([id]);
        return "select";
      },
      getSelectedTokens: () => [...this.selectedTokenIds].map((id) => this.tokens.get(id)).filter((t): t is PIXI.Container => !!t),
      onMeasureStart: (candidate) => {
        if (this.activeTool !== "measurement") return false;
        const point = this.measurementPoint({ x: candidate.x + 25, y: candidate.y + 25 }, "measurement");
        if (!this.draft) this.startDraft("measurement", [point.x, point.y, point.x, point.y]);
        else if (this.draft.kind === "measurement") {
          const last = this.draft.points.length - 2;
          this.draft.points[last] = point.x; this.draft.points[last + 1] = point.y;
          this.finishDraft();
        }
        return true;
      },
    });
  }

  private clearTokens() {
    this.tokens.clear();
    this.highlights.clear();
    this.tokenOwners.clear();
    this.tokenSheets.clear();
    this.selectedTokenIds.clear();
    this.selection.selectedToken = null;
    this.selection.isDragging = false;
    this.selectionBox = null;
    this.selectionGraphics.clear();
  }

  private clearDrawings() {
    for (const { graphic } of this.drawings.values()) graphic.destroy({ children: true });
    this.drawings.clear();
    this.selectedDrawingId = null;
    this.draft?.graphic.destroy();
    this.draft?.label?.destroy();
    this.draft = null;
    this.drawingDrag = null;
    for (const ping of this.mapPings) ping.destroy({ children: true });
    this.mapPings.clear();
  }

  private handleServerMessage(data: ServerMessage) {
    console.debug("Game message:", data.type, (data as any).payload ?? "");

    if (data.type === "SESSION_JOINED") {
      this.currentUserId = data.payload.member.id;
      this.currentRole = data.payload.member.role;
      return;
    }

    if (data.type === "SCENE_CREATED") {
      this.currentSceneId = data.payload.id;
      this.socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.id } });
      return;
    }

    if (data.type === "SCENE_STATE") {
      this.currentSceneId = data.payload.scene_id;
      this.measurementConfig = data.payload.measurement_config;
      this.sceneWidth = data.payload.config.width;
      this.sceneHeight = data.payload.config.height;
      this.camera.setScene(data.payload.config.width, data.payload.config.height);
      this.grid.setConfig(data.payload.config);
      void this.maps.setMap(data.payload.map, (assetId) => assetUrl(assetId));
      this.clearTokens();
      this.clearDrawings();
      for (const drawing of data.payload.drawings) this.createDrawing(drawing);
      for (const t of data.payload.tokens) {
        const token = this.tokens.create(t.id, t.x, t.y);
        this.tokenOwners.set(t.id, t.owner_user_ids ?? (t.owner_user_id ? [t.owner_user_id] : []));
        this.tokenSheets.set(t.id, t.sheet_id);
        this.registerToken(token);
        if (t.asset_id) void this.tokens.setImage(t.id, assetUrl(t.asset_id));
      }
      return;
    }

    if (data.type === "SCENE_MAP_CHANGED") {
      if (data.payload.scene_id !== this.currentSceneId) return;
      void this.maps.setMap(data.payload.map, (assetId) => assetUrl(assetId));
      return;
    }

    // if (data.type === "SCENE_CONFIG_CHANGED") {
    //   if (data.payload.scene_id !== this.currentSceneId) return;
    //   this.sceneWidth = data.payload.config.width;
    //   this.sceneHeight = data.payload.config.height;
    //   this.camera.setSceneBounds(data.payload.config.width, data.payload.config.height);
    //   this.grid.setConfig(data.payload.config);
    //   return;
    // }

    if (data.type === "SCENE_CONFIG_CHANGED") {
      if (data.payload.scene_id !== this.currentSceneId) return;
      const resized = data.payload.config.width !== this.sceneWidth || data.payload.config.height !== this.sceneHeight;
      this.sceneWidth = data.payload.config.width;
      this.sceneHeight = data.payload.config.height;
      this.camera.setSceneBounds(data.payload.config.width, data.payload.config.height);
      this.grid.setConfig(data.payload.config);
      // if (resized) this.camera.fit();
      if (resized) this.camera.resize();
      return;
    }

    if (data.type === "SCENE_MEASURE_CONFIG_CHANGED") {
      if (data.payload.scene_id !== this.currentSceneId) return;
      this.measurementConfig = data.payload.config;
      for (const { data: drawing } of this.drawings.values()) {
        if (drawing.kind === "measurement") this.updateDrawing(drawing);
      }
      return;
    }

    if (data.type === "SCENE_DRAWING_CREATED") {
      if (data.payload.drawing.scene_id === this.currentSceneId) this.createDrawing(data.payload.drawing);
      return;
    }

    if (data.type === "SCENE_DRAWING_MOVED") {
      if (data.payload.drawing.scene_id === this.currentSceneId) this.updateDrawing(data.payload.drawing);
      return;
    }

    if (data.type === "SCENE_DRAWING_DELETED") {
      if (data.payload.scene_id === this.currentSceneId) this.removeDrawing(data.payload.drawing_id);
      return;
    }

    if (data.type === "SCENE_PUSHED") {
      this.clearTokens();
      this.clearDrawings();
      void this.maps.setMap(null, (assetId) => assetUrl(assetId));
      this.currentSceneId = null;
      this.socket.send({ type: "SCENE_SWITCH", payload: { scene_id: data.payload.scene_id } });
      return;
    }

    if (data.type === "SCENE_CLEARED") {
      this.clearTokens();
      this.clearDrawings();
      void this.maps.setMap(null, (assetId) => assetUrl(assetId));
      this.currentSceneId = null;
      return;
    }

    if (data.type === "TOKEN_CREATE") {
      const token = this.tokens.create(data.payload.id, data.payload.x, data.payload.y);
      this.tokenOwners.set(data.payload.id, data.payload.owner_user_ids ?? (data.payload.owner_user_id ? [data.payload.owner_user_id] : []));
      this.tokenSheets.set(data.payload.id, data.payload.sheet_id);
      this.registerToken(token);
      if (data.payload.asset_id) void this.tokens.setImage(data.payload.id, assetUrl(data.payload.asset_id));
      return;
    }

    if (data.type === "TOKEN_OWNERS_CHANGED") {
      if (data.payload.scene_id !== this.currentSceneId) return;
      for (const item of data.payload.tokens) this.tokenOwners.set(item.token_id, item.owner_user_ids);
      this.setSelectedTokenIds([...this.selectedTokenIds]);
      return;
    }

    if (data.type === "TOKEN_MOVE") {
      this.tokens.move(data.payload.id, data.payload.x, data.payload.y);
      return;
    }

    if (data.type === "TOKEN_ASSET_CHANGED") {
      if (data.payload.asset_id) void this.tokens.setImage(data.payload.id, assetUrl(data.payload.asset_id));
      else this.tokens.clearImage(data.payload.id);
    }

    if (data.type === "TOKEN_DELETED") {
      const token = this.tokens.get(data.payload.id);
      if (token) {
        this.highlights.delete(token);
        if (this.selection.selectedToken === token) {
          this.selection.selectedToken = null;
          this.selection.isDragging = false;
        }
      }
      this.tokens.remove(data.payload.id);
      this.tokenOwners.delete(data.payload.id);
      this.tokenSheets.delete(data.payload.id);
      this.selectedTokenIds.delete(data.payload.id);
      return;
    }

    if (data.type === "MAP_PING") {
      if (data.payload.scene_id !== this.currentSceneId) return;
      const marker = new PIXI.Container();
      marker.addChild(new PIXI.Graphics().circle(0, 0, 28).stroke({ width: 3, color: 0xfacc15, alpha: 0.95 }).circle(0, 0, 38).stroke({ width: 1, color: 0xffffff, alpha: 0.7 }));
      const label = new PIXI.Text({ text: `${data.payload.nickname}: ${data.payload.label}`, style: { fontSize: 13, fill: "#facc15", stroke: { color: "#111827", width: 3 } } });
      label.position.set(32, -12); marker.addChild(label); marker.position.set(data.payload.x + 25, data.payload.y + 25);
      this.drawingLayer.addChild(marker); this.mapPings.add(marker);
      window.setTimeout(() => { marker.destroy({ children: true }); this.mapPings.delete(marker); }, 2500);
    }
  }
}
