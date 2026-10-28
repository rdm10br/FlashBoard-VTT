import * as PIXI from "pixi.js";
import type { SceneConfig } from "@vtt/protocol";

const SQRT3 = Math.sqrt(3);

export const DEFAULT_CONFIG: SceneConfig = {
  width: 2000, height: 1500,
  grid_type: "square", grid_size: 50,
  grid_color: "#ffffff", grid_opacity: 0.5,
};

type Pt = { x: number; y: number };

function axialRound(q: number, r: number) {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

export class Grid {
  private graphics = new PIXI.Graphics();
  private config: SceneConfig = DEFAULT_CONFIG;

  constructor(layer: PIXI.Container) {
    layer.addChild(this.graphics);
  }

  get cellSize() { return this.config.grid_size; }
  get sceneWidth() { return this.config.width; }
  get sceneHeight() { return this.config.height; }

  setConfig(config: SceneConfig) {
    this.config = config;
    this.draw();
  }

  // ── geometria dos hexágonos (grid_size = distância entre lados paralelos) ──
  private get R() { return this.config.grid_size / SQRT3; }

  private hexCenter(q: number, r: number): Pt {
    const { grid_size: s } = this.config, R = this.R;
    return this.config.grid_type === "hex_pointy"
      ? { x: s * (q + r / 2) + s / 2, y: 1.5 * R * r + R }
      : { x: 1.5 * R * q + R, y: s * (r + q / 2) + s / 2 };
  }

  private pixelToHex(px: number, py: number) {
    const { grid_size: s } = this.config, R = this.R;
    if (this.config.grid_type === "hex_pointy") {
      const x = px - s / 2, y = py - R;
      return axialRound((x / s) - (y / (3 * R)), (2 * y) / (3 * R));
    }
    const x = px - R, y = py - s / 2;
    return axialRound((2 * x) / (3 * R), (y / s) - (x / (3 * R)));
  }

  private hexCorners(c: Pt): Pt[] {
    const offset = this.config.grid_type === "hex_pointy" ? -30 : 0;
    return Array.from({ length: 6 }, (_, i) => {
      const a = ((60 * i + offset) * Math.PI) / 180;
      return { x: c.x + this.R * Math.cos(a), y: c.y + this.R * Math.sin(a) };
    });
  }

  // ── desenho ──
  draw() {
    const { width, height, grid_type, grid_size: s, grid_color, grid_opacity } = this.config;
    const g = this.graphics;
    g.clear();
    const color = new PIXI.Color(grid_color).toNumber();

    if (grid_type === "square") {
      for (let x = 0; x <= width; x += s) g.moveTo(x, 0).lineTo(x, height);
      for (let y = 0; y <= height; y += s) g.moveTo(0, y).lineTo(width, y);
    } else if (grid_type !== "none") {
      const rows = Math.ceil(height / s) + 2, cols = Math.ceil(width / s) + 2;
      for (let r = -2; r < rows + cols; r++) {
        for (let q = -rows - 2; q < cols + rows; q++) {
          const c = this.hexCenter(q, r);
          if (c.x < -s || c.y < -s || c.x > width + s || c.y > height + s) continue;
          const pts = this.hexCorners(c);
          g.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < 6; i++) g.lineTo(pts[i].x, pts[i].y);
          g.closePath();
        }
      }
    }
    g.stroke({ width: 1, color, alpha: grid_opacity });

    // borda da cena, sempre visível para o GM ver os limites
    g.rect(0, 0, width, height).stroke({ width: 2, color: 0x38bdf8, alpha: 0.6 });
  }

  // ── snap: recebe/devolve o canto superior esquerdo do token ──
  snapPoint(x: number, y: number): Pt {
    const s = this.config.grid_size, half = s / 2;
    const cx = x + half, cy = y + half;
    let c: Pt;
    switch (this.config.grid_type) {
      case "none":
        return { x, y };
      case "square":
        c = { x: Math.round((cx - half) / s) * s + half, y: Math.round((cy - half) / s) * s + half };
        break;
      default: {
        const { q, r } = this.pixelToHex(cx, cy);
        c = this.hexCenter(q, r);
      }
    }
    return { x: c.x - half, y: c.y - half };
  }

  // spawn no centro da cena (já alinhado ao grid)
  spawnPoint(): Pt {
    return this.snapPoint(this.config.width / 2, this.config.height / 2);
  }
}