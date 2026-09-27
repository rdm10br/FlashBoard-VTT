import * as PIXI from "pixi.js";
import type { Grid } from "../engine/grid";

export type SelectionState = {
  selectedToken: PIXI.Container | null;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
};

type TokenInteractionDeps = {
  grid: Grid;
  highlights: Map<PIXI.Container, PIXI.Graphics>;
  selection: SelectionState;
  getTokenId: (token: PIXI.Container) => string | undefined;
  onMoveCommitted: (id: string, x: number, y: number) => void;
};

// Registra os handlers de seleção/drag de um token individual.
// Toda a coordenação entre tokens (qual está selecionado, offset do drag)
// vive no objeto `selection`, compartilhado por referência com o GameController.
export function registerTokenInteractions(token: PIXI.Container, deps: TokenInteractionDeps) {
  const { grid, highlights, selection, getTokenId, onMoveCommitted } = deps;

  token.cursor = "pointer";
  token.eventMode = "static";

  token.on("pointerdown", (event) => {
    if (selection.selectedToken) {
      const prev = highlights.get(selection.selectedToken);
      if (prev) prev.visible = false;
    }
    selection.selectedToken = token;
    selection.isDragging = true;

    const highlight = highlights.get(token);
    if (highlight) highlight.visible = true;

    const parent = token.parent;
    if (!parent) return;
    const pos = event.getLocalPosition(parent);
    selection.dragOffset.x = token.x - pos.x;
    selection.dragOffset.y = token.y - pos.y;
  });

  const stopDrag = () => {
    if (!selection.isDragging || !selection.selectedToken) return;
    selection.isDragging = false;

    const snapped = grid.snapPoint(selection.selectedToken.x, selection.selectedToken.y);
    selection.selectedToken.x = snapped.x;
    selection.selectedToken.y = snapped.y;

    const id = getTokenId(selection.selectedToken);
    if (id) {
      onMoveCommitted(id, selection.selectedToken.x, selection.selectedToken.y);
    }
  };

  token.on("pointerup", stopDrag);
  token.on("pointerupoutside", stopDrag);
}
