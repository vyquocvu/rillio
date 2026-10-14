/**
 * DOM mutation gateway and execution engine.
 */

import { PatchTransaction } from "./transaction.js";
import type { NodeRegistry } from "./registry.js";
import type { FlatNode, FocusState, NodeId, PatchEngineOptions, RootId } from "./types.js";
import { SVG_NAMESPACE, isKnownSVGTag, setProperty, setAttribute, eventName } from "./properties.js";
import { parentDom, parentAnchor, extractRange, appendRange } from "./dom.js";
import { captureFocus, captureFocusInRecords, captureFocusInChildren, restoreFocus } from "./focus.js";
import { isEventProperty } from "./security.js";

/**
 * The only module allowed to mutate the browser DOM for the flat runtime.
 * Transactions validate their complete operation list, commit structural and
 * property changes, then dispose removed subtrees.
 */
export class PatchEngine {
  private activeTransaction: PatchTransaction | undefined;
  private readonly assertAfterCommit: boolean;

  constructor(
    readonly registry: NodeRegistry,
    readonly document: Document = globalThis.document,
    options: PatchEngineOptions = {}
  ) {
    this.assertAfterCommit = options.assertAfterCommit ?? false;
  }

  transaction<T>(rootId: RootId, work: (tx: PatchTransaction) => T): T {
    if (this.activeTransaction) {
      if (this.activeTransaction.rootId !== rootId) throw new Error("ZUI_NESTED_ROOT_TRANSACTION");
      return work(this.activeTransaction);
    }
    const tx = new PatchTransaction(this, rootId);
    this.activeTransaction = tx;
    try {
      const value = work(tx);
      tx.commit();
      if (this.assertAfterCommit) this.registry.assertConsistent(rootId);
      return value;
    } catch (error) {
      tx.rollback();
      throw error;
    } finally {
      this.activeTransaction = undefined;
    }
  }

  update<T>(rootId: RootId, work: (tx: PatchTransaction) => T): T {
    return this.activeTransaction?.rootId === rootId
      ? work(this.activeTransaction)
      : this.transaction(rootId, work);
  }

  resolveNamespace(parentId: NodeId | null | undefined, tag: string): string | undefined {
    if (tag === "svg" || (tag.length === 3 && tag.toLowerCase() === "svg")) return SVG_NAMESPACE;
    if (parentId == null) {
      return isKnownSVGTag(tag) ? SVG_NAMESPACE : undefined;
    }
    let currentId: NodeId | null = parentId;
    while (currentId !== null) {
      const node = this.registry.getNode(currentId);
      if (node.kind === "element" || node.kind === "root") {
        if (!node.isSvg) return undefined;
        if (node.kind === "element" && typeof node.type === "string" && node.type.toLowerCase() === "foreignobject") {
          return undefined;
        }
        return SVG_NAMESPACE;
      }
      currentId = node.parentId;
    }
    return isKnownSVGTag(tag) ? SVG_NAMESPACE : undefined;
  }

  insertRange(
    nodeId: NodeId,
    parentId: NodeId,
    beforeId: NodeId | null,
    cachedNode?: FlatNode,
    cachedParent?: FlatNode
  ): void {
    const node = cachedNode ?? this.registry.getNode(nodeId);
    const parent = cachedParent ?? this.registry.getNode(parentId);
    const pDom = (parent.kind === "root" || parent.kind === "element") ? (parent.domStart as Node) : this.parentDom(parent);
    const beforeDom = beforeId === null ? (parent.kind === "boundary" ? parent.domEnd : null) : this.registry.getNode(beforeId).domStart;
    if (!node.domStart.parentNode && (node.domEnd === node.domStart || !node.domEnd.parentNode)) {
      if (beforeDom === null) pDom.appendChild(node.domStart);
      else pDom.insertBefore(node.domStart, beforeDom);
      if (node.domEnd !== node.domStart) {
        if (beforeDom === null) pDom.appendChild(node.domEnd);
        else pDom.insertBefore(node.domEnd, beforeDom);
      }
    } else {
      const fragment = this.extractRange(node);
      if (beforeDom === null) pDom.appendChild(fragment);
      else pDom.insertBefore(fragment, beforeDom);
    }
    this.registry.linkChild(nodeId, parentId, beforeId, node, parent);
  }

  insertCreatedRange(
    nodeId: NodeId,
    parentId: NodeId,
    beforeId: NodeId | null,
    node: FlatNode,
    parent: FlatNode
  ): void {
    const pDom = (parent.kind === "root" || parent.kind === "element") ? (parent.domStart as Node) : this.parentDom(parent);
    const beforeDom = beforeId === null ? (parent.kind === "boundary" ? parent.domEnd : null) : this.registry.getNode(beforeId).domStart;
    if (node.kind !== "boundary") {
      if (beforeDom === null) pDom.appendChild(node.domStart);
      else pDom.insertBefore(node.domStart, beforeDom);
    } else {
      if (beforeDom === null) {
        pDom.appendChild(node.domStart);
        pDom.appendChild(node.domEnd);
      } else {
        pDom.insertBefore(node.domStart, beforeDom);
        pDom.insertBefore(node.domEnd, beforeDom);
      }
    }
    this.registry.linkCreatedChild(nodeId, parentId, beforeId, node, parent);
  }

  moveRange(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null): void {
    const node = this.registry.getNode(nodeId);
    if (node.parentId === parentId && node.nextSibling === beforeId) return;
    const parent = this.registry.getNode(parentId);
    const pDom = this.parentDom(parent);
    const beforeDom = beforeId === null ? this.parentAnchor(parent) : this.registry.getNode(beforeId).domStart;
    const focus = this.captureFocus(node);
    if (node.domStart === node.domEnd) {
      // insertBefore already moves a single node; a DocumentFragment here only
      // adds allocation and a remove/append pair for keyed sibling updates.
      pDom.insertBefore(node.domStart, beforeDom);
    } else {
      const fragment = this.extractRange(node);
      pDom.insertBefore(fragment, beforeDom);
    }
    if (node.parentId === parentId) this.registry.moveChildBefore(nodeId, beforeId);
    else this.registry.linkChild(nodeId, parentId, beforeId);
    this.restoreFocus(focus);
  }

  moveChildren(
    parentId: NodeId,
    movingIds: NodeId[],
    beforeIds: Array<NodeId | null>,
    originalRecords: FlatNode[],
    finalRecords: FlatNode[],
    movingRecords: FlatNode[],
    beforeRecords: Array<FlatNode | null>
  ): void {
    const parent = this.registry.getNode(parentId);
    const pDom = this.parentDom(parent);
    const pAnchor = this.parentAnchor(parent);
    const focus = this.captureFocusInRecords(pDom, movingRecords);

    try {
      for (let index = 0; index < movingIds.length; index++) {
        const node = movingRecords[index]!;
        const beforeId = beforeIds[index]!;
        if (node.disposed || node.parentId !== parentId) throw new Error("ZUI_TRANSACTION_NODE");
        const before = beforeRecords[index] ?? undefined;
        if (beforeId !== null && (!before || before.disposed || before.parentId !== parentId)) {
          throw new Error("ZUI_TRANSACTION_ANCHOR");
        }
        const beforeDom = before?.domStart ?? pAnchor;
        if (node.domStart === node.domEnd) pDom.insertBefore(node.domStart, beforeDom);
        else pDom.insertBefore(this.extractRange(node), beforeDom);
      }
      this.registry.reorderChildRecords(parentId, originalRecords, finalRecords, true);
    } finally {
      this.restoreFocus(focus);
    }
  }

  restoreChildrenOrder(parentId: NodeId, orderedIds: NodeId[]): void {
    const currentRecords = this.registry.childRecords(parentId);

    const parent = this.registry.getNode(parentId);
    const pDom = this.parentDom(parent);
    const pAnchor = this.parentAnchor(parent);
    const records = new Map<NodeId, FlatNode>();
    for (const node of currentRecords) records.set(node.id, node);
    const focus = this.captureFocusInChildren(pDom, orderedIds, records);
    const fragment = this.document.createDocumentFragment();

    try {
      for (const id of orderedIds) this.appendRange(fragment, records.get(id)!);
      pDom.insertBefore(fragment, pAnchor);
      this.registry.reorderChildRecords(parentId, currentRecords, orderedIds.map(id => records.get(id)!));
    } finally {
      this.restoreFocus(focus);
    }
  }

  detachRange(nodeId: NodeId): void {
    const node = this.registry.getNode(nodeId);
    this.extractRange(node);
    this.registry.unlinkChild(nodeId);
  }

  applyText(nodeId: NodeId, value: string, cachedNode?: FlatNode, knownPrevious?: string): string {
    const node = cachedNode ?? this.registry.getNode(nodeId);
    if (node.kind !== "text") throw new Error("ZUI_TRANSACTION_TEXT");
    const previous = knownPrevious ?? (typeof node.value === "string" ? node.value : (node.domStart as CharacterData).data);
    if (previous !== value) {
      (node.domStart as CharacterData).data = value;
      node.value = value;
      node.version++;
    }
    return previous;
  }

  applyProps(
    nodeId: NodeId,
    previous: Record<string, any>,
    next: Record<string, any>,
    changedKeys?: readonly string[],
    deferRef = false
  ): (() => void) | undefined {
    const record = this.registry.getNode(nodeId);
    if (record.kind !== "element" || !(record.domStart instanceof Element)) throw new Error("ZUI_TRANSACTION_PROPS");
    const names = changedKeys ?? new Set([...Object.keys(previous), ...Object.keys(next)]);
    let attachRef: (() => void) | undefined;
    for (const name of names) {
      const oldValue = previous[name];
      const newValue = next[name];
      if (Object.is(oldValue, newValue)) {
        if (name === "value" && (record.domStart instanceof HTMLInputElement || record.domStart instanceof HTMLTextAreaElement || record.domStart instanceof HTMLSelectElement)) {
          const expected = newValue == null ? "" : String(newValue);
          if ((record.domStart as any).value !== expected) {
            (record.domStart as any).value = expected;
          }
        } else if (name === "checked" && record.domStart instanceof HTMLInputElement) {
          const expected = Boolean(newValue);
          if (record.domStart.checked !== expected) {
            record.domStart.checked = expected;
          }
        }
        continue;
      }
      if (name === "children" || name === "key") continue;
      if (name === "ref") {
        if (deferRef) {
          attachRef = () => {
            this.clearRef(record);
            this.setRef(record, newValue);
          };
        } else {
          this.clearRef(record);
          this.setRef(record, newValue);
        }
      } else if (isEventProperty(name)) {
        this.setEvent(record, name, newValue);
      } else {
        this.setProperty(record, name, newValue);
      }
    }
    record.props = next;
    record.version++;
    return attachRef;
  }

  /** Apply only inert initial data/ARIA attributes to a detached native element. */
  applyInitialAttributes(record: FlatNode, props: Record<string, any>): string[] | undefined {
    let deferredKeys: string[] | undefined;
    const dom = record.domStart;
    const isDetachedNative = record.kind === "element" &&
      typeof record.type === "string" && !record.type.includes("-") && !record.props?.is &&
      record.parentId === null;

    let applied = false;
    for (const name in props) {
      if (!Object.prototype.hasOwnProperty.call(props, name) || name === "children" || name === "key") continue;
      if (isDetachedNative && (name.startsWith("data-") || name.startsWith("aria-"))) {
        this.setAttribute(dom as Element, name, props[name]);
        applied = true;
      } else {
        (deferredKeys ??= []).push(name);
      }
    }
    if (applied) record.version++;
    return deferredKeys;
  }

  /** Apply only inert initial data/ARIA attributes to a detached native element. */
  applyInitialDataAttribute(nodeId: NodeId, name: string, value: unknown): boolean {
    if (!name.startsWith("data-") && !name.startsWith("aria-")) return false;
    const record = this.registry.getNode(nodeId);
    if (record.kind !== "element" || !(record.domStart instanceof Element) ||
      record.domStart.localName.includes("-") || record.domStart.hasAttribute("is") || Boolean(record.props?.is) ||
      record.parentId !== null || record.domStart.parentNode !== null) {
      return false;
    }
    this.setAttribute(record.domStart, name, value);
    record.version++;
    return true;
  }

  removeSubtree(nodeId: NodeId): void {
    const node = this.registry.getNode(nodeId);
    if (node.disposed) return;
    this.extractRange(node);
    this.disposeSubtree(nodeId);
  }

  discardSubtree(nodeId: NodeId): void {
    const node = this.registry.getNode(nodeId);
    if (node.disposed) return;
    if (node.domStart.parentNode) this.extractRange(node);
    this.disposeSubtree(nodeId);
  }

  private disposeSubtree(nodeId: NodeId): void {
    const node = this.registry.getNode(nodeId);
    if (node.disposed) return;
    let failure: unknown;
    const capture = (work: () => void): void => {
      try { work(); } catch (error) { failure ??= error; }
    };
    for (const childId of this.registry.children(nodeId)) capture(() => this.disposeSubtree(childId));
    capture(() => this.clearBindings(node));
    const cleanup = node.cleanup;
    node.cleanup = undefined;
    if (cleanup) capture(cleanup);
    capture(() => this.registry.disposeNode(nodeId));
    if (failure) throw failure;
  }

  private clearBindings(node: FlatNode): void {
    if (!(node.domStart instanceof Element)) return;
    if (node.listeners) {
      for (const [event, listener] of node.listeners) node.domStart.removeEventListener(event, listener);
      node.listeners.clear();
      node.listeners = undefined;
    }
    this.clearRef(node);
  }

  private setEvent(node: FlatNode, prop: string, value: unknown): void {
    if (!(node.domStart instanceof Element)) return;
    const event = eventName(prop);
    let listeners = node.listeners;
    const previous = listeners?.get(event);
    if (previous) node.domStart.removeEventListener(event, previous);
    listeners?.delete(event);
    if (typeof value === "function") {
      const listener = value as EventListener;
      node.domStart.addEventListener(event, listener);
      if (!listeners) node.listeners = listeners = new Map();
      listeners.set(event, listener);
    } else if (listeners?.size === 0) {
      node.listeners = undefined;
    }
    node.version++;
  }

  private setRef(node: FlatNode, value: unknown): void {
    if (!(node.domStart instanceof Element)) return;
    if (typeof value === "function") (value as (element: Element) => void)(node.domStart);
    else if (value && typeof value === "object") (value as { current: Element | null }).current = node.domStart;
    node.ref = value;
    node.version++;
  }

  private clearRef(node: FlatNode): void {
    if (typeof node.ref === "function") (node.ref as (element: Element | null) => void)(null);
    else if (node.ref && typeof node.ref === "object") (node.ref as { current: Element | null }).current = null;
    node.ref = undefined;
  }

  private setProperty(node: FlatNode, name: string, value: unknown): void {
    setProperty(node, name, value);
  }

  private setAttribute(element: Element, name: string, value: unknown): void {
    setAttribute(element, name, value);
  }

  private parentDom(parent: FlatNode): Node {
    return parentDom(parent);
  }

  private parentAnchor(parent: FlatNode): Node | null {
    return parentAnchor(parent);
  }

  private extractRange(node: FlatNode): DocumentFragment {
    return extractRange(this.document, node);
  }

  private appendRange(fragment: DocumentFragment, node: FlatNode): void {
    appendRange(fragment, node);
  }

  private captureFocusInChildren(
    parentDom: Node,
    childIds: readonly NodeId[],
    records: ReadonlyMap<NodeId, FlatNode>
  ): FocusState | undefined {
    return captureFocusInChildren(this.document, parentDom, childIds, records);
  }

  private captureFocusInRecords(parentDom: Node, records: readonly FlatNode[]): FocusState | undefined {
    return captureFocusInRecords(this.document, parentDom, records);
  }

  private captureFocus(node: FlatNode): FocusState | undefined {
    return captureFocus(this.document, node);
  }

  private restoreFocus(state: FocusState | undefined): void {
    restoreFocus(state);
  }
}
