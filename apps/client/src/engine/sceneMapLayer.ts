import * as PIXI from "pixi.js";
import type { SceneMap } from "@vtt/protocol";

type DragMode = "move" | "resize";

const MIN_SCALE = 0.05;
const MAX_SCALE = 10;

export class SceneMapLayer {
  private readonly layer: PIXI.Container;
  private readonly stage: PIXI.Container;
  private readonly onCommit: (map: SceneMap) => void;
  private object: PIXI.Container | null = null;
  private sprite: PIXI.Sprite | null = null;
  private border: PIXI.Graphics | null = null;
  private handle: PIXI.Graphics | null = null;
  private editing = false;
  private map: SceneMap | null = null;
  private imageWidth = 0;
  private imageHeight = 0;
  private generation = 0;
  private drag: {
    mode: DragMode;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    scale: number;
  } | null = null;

  constructor(layer: PIXI.Container, stage: PIXI.Container, onCommit: (map: SceneMap) => void) {
    this.layer = layer;
    this.stage = stage;
    this.onCommit = onCommit;
    this.stage.on("pointermove", this.handlePointerMove);
    this.stage.on("pointerup", this.finishDrag);
    this.stage.on("pointerupoutside", this.finishDrag);
  }

  async setMap(map: SceneMap | null, urlForAsset: (assetId: string) => string): Promise<void> {
    const generation = ++this.generation;
    this.drag = null;
    this.removeMapObject();
    this.map = map;
    if (!map) return;

    try {
      const image = await this.loadImage(urlForAsset(map.asset_id));
      if (generation !== this.generation) return;

      this.imageWidth = image.naturalWidth;
      this.imageHeight = image.naturalHeight;
      this.createMapObject(image);
      this.applyTransform(map);
      this.setEditing(this.editing);
    } catch (error) {
      console.error("Não foi possível carregar o mapa da cena.", error);
    }
  }

  setEditing(editing: boolean): void {
    this.editing = editing;
    if (this.sprite) {
      this.sprite.eventMode = editing ? "static" : "none";
      this.sprite.cursor = editing ? "move" : "default";
    }
    if (this.border) this.border.visible = editing;
    if (this.handle) {
      this.handle.visible = editing;
      this.handle.eventMode = editing ? "static" : "none";
      this.handle.cursor = editing ? "nwse-resize" : "default";
    }
    if (!editing) this.drag = null;
  }

  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("A resposta do servidor não é uma imagem válida."));
      image.src = url;
    });
  }

  private createMapObject(image: HTMLImageElement): void {
    const object = new PIXI.Container();
    const sprite = new PIXI.Sprite(PIXI.Texture.from(image));
    sprite.width = this.imageWidth;
    sprite.height = this.imageHeight;
    sprite.eventMode = "none";
    sprite.on("pointerdown", (event) => this.startDrag("move", event));
    object.addChild(sprite);

    const border = new PIXI.Graphics();
    border.rect(0, 0, this.imageWidth, this.imageHeight)
      .stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });
    border.visible = false;
    object.addChild(border);

    const handle = new PIXI.Graphics();
    handle.circle(this.imageWidth, this.imageHeight, 12)
      .fill({ color: 0x38bdf8, alpha: 1 })
      .stroke({ width: 2, color: 0xffffff, alpha: 1 });
    handle.visible = false;
    handle.eventMode = "none";
    handle.on("pointerdown", (event) => this.startDrag("resize", event));
    object.addChild(handle);

    this.object = object;
    this.sprite = sprite;
    this.border = border;
    this.handle = handle;
    this.layer.addChild(object);
  }

  private startDrag(mode: DragMode, event: PIXI.FederatedPointerEvent): void {
    if (!this.editing || !this.map) return;
    event.stopPropagation();
    const pointer = event.getLocalPosition(this.layer);
    this.drag = {
      mode,
      pointerX: pointer.x,
      pointerY: pointer.y,
      x: this.map.x,
      y: this.map.y,
      scale: this.map.scale,
    };
  }

  private readonly handlePointerMove = (event: PIXI.FederatedPointerEvent): void => {
    if (!this.drag || !this.map || !this.object) return;
    const pointer = event.getLocalPosition(this.layer);
    const dx = pointer.x - this.drag.pointerX;
    const dy = pointer.y - this.drag.pointerY;

    if (this.drag.mode === "move") {
      this.map = { ...this.map, x: this.drag.x + dx, y: this.drag.y + dy };
    } else {
      const proportionalDelta = Math.max(dx / this.imageWidth, dy / this.imageHeight);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.drag.scale * (1 + proportionalDelta)));
      this.map = { ...this.map, scale };
    }
    this.applyTransform(this.map);
  };

  private readonly finishDrag = (): void => {
    if (!this.drag || !this.map) return;
    this.drag = null;
    this.onCommit({ ...this.map });
  };

  private applyTransform(map: SceneMap): void {
    if (!this.object) return;
    this.object.position.set(map.x, map.y);
    this.object.scale.set(map.scale);
  }

  private removeMapObject(): void {
    if (this.object) {
      this.layer.removeChild(this.object);
      this.object.destroy({ children: true });
    }
    this.object = null;
    this.sprite = null;
    this.border = null;
    this.handle = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
  }
}
