import * as PIXI from "pixi.js";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.12;

/** Pan e zoom locais do jogador; o conteúdo dentro do container usa coordenadas da cena. */
export class Camera {
  private readonly viewport: HTMLElement;
  private readonly world: PIXI.Container;
  private sceneWidth = 2000;
  private sceneHeight = 1500;
  private drag: { pointerId: number; x: number; y: number } | null = null;

  constructor(viewport: HTMLElement, world: PIXI.Container) {
    this.viewport = viewport;
    this.world = world;
    this.viewport.style.touchAction = "none";
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    this.viewport.addEventListener("pointercancel", this.onPointerUp);
    this.viewport.addEventListener("wheel", this.onWheel, { passive: false });
  }

  setScene(width: number, height: number): void {
    this.sceneWidth = width;
    this.sceneHeight = height;
    this.world.scale.set(1);
    const bounds = this.viewport.getBoundingClientRect();
    this.world.position.set((bounds.width - width) / 2, (bounds.height - height) / 2);
    this.clampPosition();
  }

  setSceneBounds(width: number, height: number): void {
    this.sceneWidth = width;
    this.sceneHeight = height;
    this.clampPosition();
  }

  resize(): void {
    this.clampPosition();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 1) return;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    this.viewport.setPointerCapture(event.pointerId);
    this.viewport.style.cursor = "grabbing";
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.world.x += event.clientX - this.drag.x;
    this.world.y += event.clientY - this.drag.y;
    this.drag = { ...this.drag, x: event.clientX, y: event.clientY };
    this.clampPosition();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.drag = null;
    this.viewport.style.cursor = "";
    if (this.viewport.hasPointerCapture(event.pointerId)) {
      this.viewport.releasePointerCapture(event.pointerId);
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const oldScale = this.world.scale.x;
    const nextScale = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, oldScale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)),
    );
    if (nextScale === oldScale) return;

    const worldX = (pointerX - this.world.x) / oldScale;
    const worldY = (pointerY - this.world.y) / oldScale;
    this.world.scale.set(nextScale);
    this.world.position.set(pointerX - worldX * nextScale, pointerY - worldY * nextScale);
    this.clampPosition();
  };

  private clampPosition(): void {
    const rect = this.viewport.getBoundingClientRect();
    const width = this.sceneWidth * this.world.scale.x;
    const height = this.sceneHeight * this.world.scale.y;
    this.world.x = width <= rect.width ? (rect.width - width) / 2 : Math.min(0, Math.max(rect.width - width, this.world.x));
    this.world.y = height <= rect.height ? (rect.height - height) / 2 : Math.min(0, Math.max(rect.height - height, this.world.y));
  }
}
