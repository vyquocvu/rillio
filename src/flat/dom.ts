/**
 * DOM range manipulation and hierarchical parent/anchor resolution.
 */

import type { FlatNode } from "./types.js";

export function parentDom(parent: FlatNode): Node {
  if (parent.kind === "root" || parent.kind === "element") return parent.domStart;
  const domParent = parent.domStart.parentNode;
  if (!domParent) throw new Error("RILLIO_DETACHED_PARENT");
  return domParent;
}

export function parentAnchor(parent: FlatNode): Node | null {
  return parent.kind === "boundary" ? parent.domEnd : null;
}

export function extractRange(doc: Document, node: FlatNode): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  if (!node.domStart.parentNode) {
    fragment.appendChild(node.domStart);
    if (node.domEnd !== node.domStart) fragment.appendChild(node.domEnd);
    return fragment;
  }
  let current: Node | null = node.domStart;
  while (current) {
    const next: Node | null = current.nextSibling;
    fragment.appendChild(current);
    if (current === node.domEnd) break;
    current = next;
  }
  if (current !== node.domEnd) throw new Error("RILLIO_DOM_RANGE_CORRUPT");
  return fragment;
}

export function appendRange(fragment: DocumentFragment, node: FlatNode): void {
  let current: Node | null = node.domStart;
  while (current) {
    const next: Node | null = current.nextSibling;
    fragment.appendChild(current);
    if (current === node.domEnd) return;
    current = next;
  }
  throw new Error("RILLIO_DOM_RANGE_CORRUPT");
}
