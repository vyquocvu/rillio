/**
 * Focus and selection capture and restoration for DOM updates.
 */

import type { FlatNode, FocusState, NodeId } from "./types.js";

export function captureFocus(doc: Document, node: FlatNode): FocusState | undefined {
  const active = doc.activeElement;
  if (!(active instanceof HTMLElement) || !(node.domStart instanceof Element) || !node.domStart.contains(active)) {
    return undefined;
  }
  const input = active as HTMLInputElement | HTMLTextAreaElement;
  return {
    element: active,
    start: "selectionStart" in input ? input.selectionStart : null,
    end: "selectionEnd" in input ? input.selectionEnd : null,
    direction: "selectionDirection" in input ? input.selectionDirection : null
  };
}

export function captureFocusInRecords(doc: Document, parentDom: Node, records: readonly FlatNode[]): FocusState | undefined {
  const active = doc.activeElement;
  if (!(active instanceof HTMLElement) || !(parentDom instanceof Element) || !parentDom.contains(active)) {
    return undefined;
  }
  for (const child of records) {
    if (child.domStart instanceof Element && child.domStart.contains(active)) {
      return captureFocus(doc, child);
    }
  }
  return undefined;
}

export function captureFocusInChildren(
  doc: Document,
  parentDom: Node,
  childIds: readonly NodeId[],
  records: ReadonlyMap<NodeId, FlatNode>
): FocusState | undefined {
  const active = doc.activeElement;
  if (!(active instanceof HTMLElement) || !(parentDom instanceof Element) || !parentDom.contains(active)) {
    return undefined;
  }
  for (const id of childIds) {
    const child = records.get(id);
    if (child?.domStart instanceof Element && child.domStart.contains(active)) {
      return captureFocus(doc, child);
    }
  }
  return undefined;
}

export function restoreFocus(state: FocusState | undefined): void {
  if (!state || !state.element.isConnected) return;
  state.element.focus({ preventScroll: true });
  if (state.start !== null && state.end !== null && "setSelectionRange" in state.element) {
    (state.element as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
      state.start,
      state.end,
      state.direction ?? undefined
    );
  }
}
