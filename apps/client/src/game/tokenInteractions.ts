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
  canInteract?: (token: PIXI.Container) => boolean;
  onTokenSelected?: (token: PIXI.Container, event: PIXI.FederatedPointerEvent) => "toggle" | "select" | "keep" | void;
  getSelectedTokens?: () => PIXI.Container[];
  onMeasureStart?: (token: PIXI.Container) => boolean;
};

// Registra os handlers de seleção/drag de um token individual.
// Toda a coordenação entre tokens (qual está selecionado, offset do drag)
// vive no objeto `selection`, compartilhado por referência com o GameController.
export function registerTokenInteractions(token: PIXI.Container, deps: TokenInteractionDeps) {
  const { grid, highlights, selection, getTokenId, onMoveCommitted, canInteract, onTokenSelected, getSelectedTokens, onMeasureStart } = deps;
  let group: { pointer: { x: number; y: number }; origins: { token: PIXI.Container; x: number; y: number }[] } | null = null;

  token.cursor = "pointer";
  token.eventMode = "static";

  token.on("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (onMeasureStart?.(token)) { event.stopPropagation(); return; }
    if (canInteract && !canInteract(token)) {
      event.stopPropagation();
      return;
    }
    const wasSelected = getSelectedTokens?.().includes(token) ?? false;
    const action = onTokenSelected?.(token, event);
    if (action === "toggle") { event.stopPropagation(); return; }
    const selected = getSelectedTokens?.() ?? [token];
    if ((action === "keep" || wasSelected) && selected.length > 1) {
      const parent = token.parent;
      if (!parent) return;
      const pointer = event.getLocalPosition(parent);
      group = { pointer: { x: pointer.x, y: pointer.y }, origins: selected.map((item) => ({ token: item, x: item.x, y: item.y })) };
      selection.isDragging = false;
      selection.selectedToken = null;
      event.stopPropagation();
      return;
    }
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

  const stopDrag = (event: PIXI.FederatedPointerEvent) => {
    if (!selection.isDragging || !selection.selectedToken) return;
    selection.isDragging = false;

    if (!event.altKey) {
      const snapped = grid.snapPoint(selection.selectedToken.x, selection.selectedToken.y);
      selection.selectedToken.x = snapped.x;
      selection.selectedToken.y = snapped.y;
    }

    const id = getTokenId(selection.selectedToken);
    if (id) {
      onMoveCommitted(id, selection.selectedToken.x, selection.selectedToken.y);
    }
  };

  token.on("globalpointermove", (event: PIXI.FederatedPointerEvent) => {
    if (!group) return;
    const parent = token.parent;
    if (!parent) return;
    const pointer = event.getLocalPosition(parent);
    const dx = pointer.x - group.pointer.x, dy = pointer.y - group.pointer.y;
    for (const origin of group.origins) { origin.token.x = origin.x + dx; origin.token.y = origin.y + dy; }
  });

  const stopGroup = (event: PIXI.FederatedPointerEvent) => {
    if (!group) return;
    const moving = group.origins;
    group = null;
    for (const { token: item } of moving) {
      if (!event.altKey) {
        const snapped = grid.snapPoint(item.x, item.y); item.x = snapped.x; item.y = snapped.y;
      }
      const id = getTokenId(item); if (id) onMoveCommitted(id, item.x, item.y);
    }
  };
  token.on("pointerup", stopGroup);
  token.on("pointerupoutside", stopGroup);

  token.on("pointerup", stopDrag);
  token.on("pointerupoutside", stopDrag);
}
