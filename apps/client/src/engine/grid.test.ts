import * as PIXI from "pixi.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, Grid } from "./grid";

function createGrid() {
  return new Grid(new PIXI.Container());
}

describe("Grid", () => {
  it("spawns tokens at the center of the scene", () => {
    const grid = createGrid();

    expect(grid.spawnPoint()).toEqual({ x: 1000, y: 750 });
  });

  it("snaps square-grid coordinates to cell origins", () => {
    const grid = createGrid();

    expect(grid.snapPoint(30, 30)).toEqual({ x: 50, y: 50 });
  });

  it("leaves coordinates unchanged when the grid is disabled", () => {
    const grid = createGrid();
    grid.setConfig({ ...DEFAULT_CONFIG, grid_type: "none" });

    expect(grid.snapPoint(30, 70)).toEqual({ x: 30, y: 70 });
  });

  it.each(["hex_pointy", "hex_flat"] as const)("snaps %s coordinates consistently", (grid_type) => {
    const grid = createGrid();
    grid.setConfig({ ...DEFAULT_CONFIG, grid_type });
    const snapped = grid.snapPoint(123, 456);

    expect(grid.snapPoint(snapped.x, snapped.y)).toEqual(snapped);
  });
});
