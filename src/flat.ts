/**
 * Addressable DOM foundation.
 *
 * The registry is the only structural index used by the flat renderer. DOM
 * nodes are implementation details addressed by monotonic ids; renderers do
 * not keep a second child tree. All DOM writes go through PatchEngine.
 */

export type NodeId = number;
export type RootId = number;
export type OwnerId = number;
export type Key = string | number;
export type Dispose = () => void;

export type NodeKind = "root" | "element" | "text" | "comment" | "boundary";

export interface FlatNode {
  readonly id: NodeId;
  readonly rootId: RootId;
  readonly kind: NodeKind;
  readonly domStart: Node;
  readonly domEnd: Node;
  ownerId: OwnerId;
  parentId: NodeId | null;
  prevSibling: NodeId | null;
  nextSibling: NodeId | null;
  firstChild: NodeId | null;
  lastChild: NodeId | null;
  version: number;
  key?: Key;
  type?: string | ((props: any) => any);
  props: Record<string, any>;
  value?: unknown;
  payload?: unknown;
  listeners: Map<string, EventListener>;
  ref?: unknown;
  styleSnapshot: Record<string, unknown>;
  cleanup?: Dispose;
  disposed: boolean;
}

export interface FlatOwner {
  readonly id: OwnerId;
  readonly rootId: RootId;
  readonly parentId: OwnerId | null;
  readonly children: Set<OwnerId>;
  readonly nodeIds: Set<NodeId>;
  version: number;
  disposed: boolean;
}

export interface RootHandle {
  readonly rootId: RootId;
  readonly nodeId: NodeId;
  readonly ownerId: OwnerId;
  readonly container: Element;
}

export interface OwnerHost {
  createOwner(rootId: RootId, parentId?: OwnerId | null): OwnerId;
  ownerParent(ownerId: OwnerId): OwnerId | null;
  ownerChildren(ownerId: OwnerId): readonly OwnerId[];
  disposeOwner(ownerId: OwnerId): void;
}

type NodeInit = {
  rootId: RootId;
  ownerId: OwnerId;
  kind: NodeKind;
  domStart: Node;
  domEnd?: Node;
  key?: Key;
  type?: string | ((props: any) => any);
  props?: Record<string, any>;
  value?: unknown;
  payload?: unknown;
};

/** A flat, addressable index for roots, nodes and ownership scopes. */
export class NodeRegistry implements OwnerHost {
  private nextNodeId = 1;
  private nextRootId = 1;
  private nextOwnerId = 1;
  private readonly nodes = new Map<NodeId, FlatNode>();
  private readonly roots = new Map<RootId, RootHandle>();
  private readonly rootByContainer = new WeakMap<Element, RootId>();
  private readonly owners = new Map<OwnerId, FlatOwner>();

  createRoot(container: Element): RootHandle {
    const previous = this.rootByContainer.get(container);
    if (previous !== undefined) this.disposeRoot(previous);

    const rootId = this.nextRootId++;
    const ownerId = this.createOwner(rootId, null);
    const nodeId = this.createNode({
      rootId,
      ownerId,
      kind: "root",
      domStart: container,
      domEnd: container
    });
    const handle = { rootId, nodeId, ownerId, container } satisfies RootHandle;
    this.roots.set(rootId, handle);
    this.rootByContainer.set(container, rootId);
    return handle;
  }

  getRoot(rootId: RootId): RootHandle {
    const root = this.roots.get(rootId);
    if (!root) throw new Error("ZUI_UNKNOWN_ROOT");
    return root;
  }

  rootFor(container: Element): RootHandle | undefined {
    const rootId = this.rootByContainer.get(container);
    return rootId === undefined ? undefined : this.roots.get(rootId);
  }

  createNode(init: NodeInit): NodeId {
    const owner = this.getOwner(init.ownerId);
    if (owner.disposed) throw new Error("ZUI_OWNER_DISPOSED");
    const id = this.nextNodeId++;
    const node: FlatNode = {
      id,
      rootId: init.rootId,
      kind: init.kind,
      domStart: init.domStart,
      domEnd: init.domEnd ?? init.domStart,
      ownerId: init.ownerId,
      parentId: null,
      prevSibling: null,
      nextSibling: null,
      firstChild: null,
      lastChild: null,
      version: 1,
      key: init.key,
      type: init.type,
      props: init.props ?? {},
      value: init.value,
      payload: init.payload,
      listeners: new Map(),
      styleSnapshot: {},
      cleanup: undefined,
      disposed: false
    };
    this.nodes.set(id, node);
    owner.nodeIds.add(id);
    owner.version++;
    return id;
  }

  getNode(nodeId: NodeId): FlatNode {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error("ZUI_UNKNOWN_NODE");
    return node;
  }

  hasNode(nodeId: NodeId): boolean {
    return this.nodes.has(nodeId);
  }

  allNodes(): readonly FlatNode[] {
    return [...this.nodes.values()];
  }

  getOwner(ownerId: OwnerId): FlatOwner {
    const owner = this.owners.get(ownerId);
    if (!owner) throw new Error("ZUI_UNKNOWN_OWNER");
    return owner;
  }

  allOwners(): readonly FlatOwner[] {
    return [...this.owners.values()];
  }

  createOwner(rootId: RootId, parentId: OwnerId | null = null): OwnerId {
    if (parentId !== null) {
      const parent = this.getOwner(parentId);
      if (parent.rootId !== rootId) throw new Error("ZUI_OWNER_ROOT_MISMATCH");
    }
    const id = this.nextOwnerId++;
    const owner: FlatOwner = {
      id,
      rootId,
      parentId,
      children: new Set(),
      nodeIds: new Set(),
      version: 1,
      disposed: false
    };
    this.owners.set(id, owner);
    if (parentId !== null) {
      this.getOwner(parentId).children.add(id);
      this.getOwner(parentId).version++;
    }
    return id;
  }

  ownerParent(ownerId: OwnerId): OwnerId | null {
    return this.getOwner(ownerId).parentId;
  }

  ownerChildren(ownerId: OwnerId): readonly OwnerId[] {
    return [...this.getOwner(ownerId).children];
  }

  disposeOwner(ownerId: OwnerId): void {
    const owner = this.getOwner(ownerId);
    if (owner.disposed) return;
    owner.disposed = true;
    for (const childId of [...owner.children]) this.disposeOwner(childId);
    const parent = owner.parentId === null ? undefined : this.getOwner(owner.parentId);
    parent?.children.delete(ownerId);
    parent && parent.version++;
    owner.children.clear();
    owner.nodeIds.clear();
    owner.version++;
  }

  attachCleanup(nodeId: NodeId, cleanup: Dispose): void {
    const node = this.getNode(nodeId);
    const previous = node.cleanup;
    node.cleanup = previous
      ? () => { previous(); cleanup(); }
      : cleanup;
    node.version++;
  }

  updateNode(nodeId: NodeId, patch: Partial<Pick<FlatNode, "ownerId" | "key" | "type" | "props" | "value" | "payload">>): void {
    const node = this.getNode(nodeId);
    if (patch.ownerId !== undefined && patch.ownerId !== node.ownerId) {
      const oldOwner = this.getOwner(node.ownerId);
      const newOwner = this.getOwner(patch.ownerId);
      if (oldOwner.rootId !== newOwner.rootId || newOwner.disposed) {
        throw new Error("ZUI_OWNER_ROOT_MISMATCH");
      }
      oldOwner.nodeIds.delete(nodeId);
      newOwner.nodeIds.add(nodeId);
      oldOwner.version++;
      newOwner.version++;
      node.ownerId = patch.ownerId;
    }
    if (patch.key !== undefined || Object.prototype.hasOwnProperty.call(patch, "key")) node.key = patch.key;
    if (patch.type !== undefined) node.type = patch.type;
    if (patch.props !== undefined) node.props = patch.props;
    if (Object.prototype.hasOwnProperty.call(patch, "value")) node.value = patch.value;
    if (Object.prototype.hasOwnProperty.call(patch, "payload")) node.payload = patch.payload;
    node.version++;
  }

  children(parentId: NodeId): NodeId[] {
    const parent = this.getNode(parentId);
    const result: NodeId[] = [];
    let current = parent.firstChild;
    while (current !== null) {
      const child = this.getNode(current);
      if (child.parentId !== parentId || child.disposed) throw new Error("ZUI_INDEX_CORRUPT");
      result.push(current);
      current = child.nextSibling;
    }
    const last = result.length === 0 ? null : result.at(-1)!;
    if (last !== parent.lastChild) throw new Error("ZUI_INDEX_CORRUPT");
    return result;
  }

  isDescendant(ancestorId: NodeId, nodeId: NodeId): boolean {
    let current: NodeId | null = nodeId;
    while (current !== null) {
      if (current === ancestorId) return true;
      current = this.getNode(current).parentId;
    }
    return false;
  }

  linkChild(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null): void {
    const node = this.getNode(nodeId);
    const parent = this.getNode(parentId);
    if (node.disposed || parent.disposed) throw new Error("ZUI_NODE_DISPOSED");
    if (node.rootId !== parent.rootId) throw new Error("ZUI_ROOT_MISMATCH");
    if (nodeId === parentId || this.isDescendant(nodeId, parentId)) throw new Error("ZUI_INDEX_CYCLE");
    if (beforeId !== null) {
      const before = this.getNode(beforeId);
      if (before.parentId !== parentId) throw new Error("ZUI_INVALID_ANCHOR");
    }
    if (node.parentId !== null) this.unlinkChild(nodeId);
    const previous = beforeId === null ? parent.lastChild : this.getNode(beforeId).prevSibling;
    node.parentId = parentId;
    node.prevSibling = previous;
    node.nextSibling = beforeId;
    if (previous === null) parent.firstChild = nodeId;
    else this.getNode(previous).nextSibling = nodeId;
    if (beforeId === null) parent.lastChild = nodeId;
    else this.getNode(beforeId).prevSibling = nodeId;
    parent.version++;
    node.version++;
  }

  unlinkChild(nodeId: NodeId): void {
    const node = this.getNode(nodeId);
    const parentId = node.parentId;
    if (parentId === null) return;
    const parent = this.getNode(parentId);
    const previous = node.prevSibling;
    const next = node.nextSibling;
    if (previous === null) parent.firstChild = next;
    else this.getNode(previous).nextSibling = next;
    if (next === null) parent.lastChild = previous;
    else this.getNode(next).prevSibling = previous;
    node.parentId = null;
    node.prevSibling = null;
    node.nextSibling = null;
    parent.version++;
    node.version++;
  }

  disposeNode(nodeId: NodeId): void {
    const node = this.getNode(nodeId);
    if (node.disposed) return;
    for (const childId of this.children(nodeId)) this.disposeNode(childId);
    this.unlinkChild(nodeId);
    const owner = this.getOwner(node.ownerId);
    owner.nodeIds.delete(nodeId);
    owner.version++;
    node.disposed = true;
    node.version++;
  }

  disposeRoot(rootId: RootId): void {
    const root = this.roots.get(rootId);
    if (!root) return;
    for (const childId of this.children(root.nodeId)) this.disposeNode(childId);
    this.disposeNode(root.nodeId);
    this.disposeOwner(root.ownerId);
    this.roots.delete(rootId);
    if (this.rootByContainer.get(root.container) === rootId) this.rootByContainer.delete(root.container);
  }

  assertConsistent(rootId: RootId): void {
    const root = this.getRoot(rootId);
    const seen = new Set<NodeId>();
    const walk = (nodeId: NodeId, parentId: NodeId | null): void => {
      const node = this.getNode(nodeId);
      if (node.disposed || node.rootId !== rootId || node.parentId !== parentId || seen.has(nodeId)) {
        throw new Error("ZUI_INDEX_CORRUPT");
      }
      seen.add(nodeId);
      let previous: NodeId | null = null;
      for (const childId of this.children(nodeId)) {
        const child = this.getNode(childId);
        if (child.prevSibling !== previous) throw new Error("ZUI_INDEX_CORRUPT");
        walk(childId, nodeId);
        previous = childId;
      }
      if (node.lastChild !== previous) throw new Error("ZUI_INDEX_CORRUPT");
    };
    walk(root.nodeId, null);
  }
}

type PatchOp =
  | { kind: "insert"; nodeId: NodeId; parentId: NodeId; beforeId: NodeId | null }
  | { kind: "move"; nodeId: NodeId; parentId: NodeId; beforeId: NodeId | null }
  | { kind: "props"; nodeId: NodeId; previous: Record<string, any>; next: Record<string, any> }
  | { kind: "text"; nodeId: NodeId; value: string }
  | { kind: "meta"; nodeId: NodeId; patch: Partial<Pick<FlatNode, "key" | "type" | "props" | "value" | "payload">> }
  | { kind: "remove"; nodeId: NodeId };

export class PatchTransaction {
  private readonly operations: PatchOp[] = [];
  private readonly created: NodeId[] = [];
  private committed = false;

  constructor(private readonly engine: PatchEngine, readonly rootId: RootId) {}

  createElement(ownerId: OwnerId, tag: string, type?: string | ((props: any) => any), key?: Key): NodeId {
    const element = this.engine.document.createElement(tag);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "element", domStart: element, type, key
    });
    this.created.push(id);
    return id;
  }

  createText(ownerId: OwnerId, value: string): NodeId {
    const text = this.engine.document.createTextNode(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "text", domStart: text, value
    });
    this.created.push(id);
    return id;
  }

  createComment(ownerId: OwnerId, value: string): NodeId {
    const comment = this.engine.document.createComment(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "comment", domStart: comment, value
    });
    this.created.push(id);
    return id;
  }

  createBoundary(ownerId: OwnerId, startValue = "zui:start", endValue = "zui:end", key?: Key): NodeId {
    const start = this.engine.document.createComment(startValue);
    const end = this.engine.document.createComment(endValue);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "boundary", domStart: start, domEnd: end, key
    });
    this.created.push(id);
    return id;
  }

  insert(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null = null): void {
    this.operations.push({ kind: "insert", nodeId, parentId, beforeId });
  }

  move(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null = null): void {
    this.operations.push({ kind: "move", nodeId, parentId, beforeId });
  }

  patchProps(nodeId: NodeId, previous: Record<string, any>, next: Record<string, any>): void {
    this.operations.push({ kind: "props", nodeId, previous, next });
  }

  setText(nodeId: NodeId, value: string): void {
    this.operations.push({ kind: "text", nodeId, value });
  }

  setMeta(nodeId: NodeId, patch: Partial<Pick<FlatNode, "key" | "type" | "props" | "value" | "payload">>): void {
    this.operations.push({ kind: "meta", nodeId, patch });
  }

  remove(nodeId: NodeId): void {
    this.operations.push({ kind: "remove", nodeId });
  }

  attachCleanup(nodeId: NodeId, cleanup: Dispose): void {
    this.engine.registry.attachCleanup(nodeId, cleanup);
  }

  commit(): void {
    if (this.committed) throw new Error("ZUI_TRANSACTION_REUSED");
    this.validate();
    const removals = this.operations.filter(op => op.kind === "remove");
    const changes = this.operations.filter(op => op.kind !== "remove");
    const inserted = new Set<NodeId>();
    try {
      for (const operation of changes) {
        if (operation.kind === "insert") {
          this.engine.insertRange(operation.nodeId, operation.parentId, operation.beforeId);
          inserted.add(operation.nodeId);
        } else if (operation.kind === "move") {
          if (operation.beforeId === operation.nodeId) continue;
          this.engine.moveRange(operation.nodeId, operation.parentId, operation.beforeId);
        } else if (operation.kind === "props") {
          this.engine.applyProps(operation.nodeId, operation.previous, operation.next);
        } else if (operation.kind === "text") {
          this.engine.applyText(operation.nodeId, operation.value);
        } else if (operation.kind === "meta") {
          this.engine.registry.updateNode(operation.nodeId, operation.patch);
        }
      }
      for (const operation of removals) this.engine.removeSubtree(operation.nodeId);
      this.committed = true;
    } catch (error) {
      // DOM writes are deliberately centralized here. If a browser rejects a
      // commit, remove every newly-created range and leave old records intact
      // wherever possible; the caller still receives the original exception.
      for (const nodeId of [...inserted].reverse()) {
        if (this.engine.registry.hasNode(nodeId) && !this.engine.registry.getNode(nodeId).disposed) {
          this.engine.removeSubtree(nodeId);
        }
      }
      throw error;
    }
  }

  rollback(): void {
    if (this.committed) return;
    for (const nodeId of [...this.created].reverse()) {
      if (!this.engine.registry.hasNode(nodeId)) continue;
      const node = this.engine.registry.getNode(nodeId);
      if (!node.disposed) this.engine.discardSubtree(nodeId);
    }
  }

  private validate(): void {
    const removed = new Set<NodeId>();
    const inserted = new Set<NodeId>();
    for (const operation of this.operations) {
      const node = this.engine.registry.getNode(operation.nodeId);
      if (node.rootId !== this.rootId || node.disposed) throw new Error("ZUI_TRANSACTION_NODE");
      if (operation.kind === "remove") {
        if (removed.has(operation.nodeId)) throw new Error("ZUI_TRANSACTION_DUPLICATE_REMOVE");
        removed.add(operation.nodeId);
        continue;
      }
      if (removed.has(operation.nodeId)) throw new Error("ZUI_TRANSACTION_AFTER_REMOVE");
      if (operation.kind === "insert" || operation.kind === "move") {
        const parent = this.engine.registry.getNode(operation.parentId);
        if (parent.rootId !== this.rootId || parent.disposed) throw new Error("ZUI_TRANSACTION_PARENT");
        if (operation.beforeId !== null) {
          const before = this.engine.registry.getNode(operation.beforeId);
          if (before.rootId !== this.rootId || before.disposed) throw new Error("ZUI_TRANSACTION_ANCHOR");
        }
        if (inserted.has(operation.nodeId) && operation.kind === "insert") {
          throw new Error("ZUI_TRANSACTION_DUPLICATE_INSERT");
        }
        inserted.add(operation.nodeId);
        if (operation.nodeId === operation.parentId || this.engine.registry.isDescendant(operation.nodeId, operation.parentId)) {
          throw new Error("ZUI_TRANSACTION_CYCLE");
        }
      }
      if (operation.kind === "text" && node.kind !== "text") throw new Error("ZUI_TRANSACTION_TEXT");
      if (operation.kind === "props" && node.kind !== "element") throw new Error("ZUI_TRANSACTION_PROPS");
    }
  }
}

/**
 * The only module allowed to mutate the browser DOM for the flat runtime.
 * Transactions validate their complete operation list, commit structural and
 * property changes, then dispose removed subtrees.
 */
export class PatchEngine {
  constructor(readonly registry: NodeRegistry, readonly document: Document = globalThis.document) {}

  transaction<T>(rootId: RootId, work: (tx: PatchTransaction) => T): T {
    const tx = new PatchTransaction(this, rootId);
    try {
      const value = work(tx);
      tx.commit();
      this.registry.assertConsistent(rootId);
      return value;
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }

  update<T>(rootId: RootId, work: (tx: PatchTransaction) => T): T {
    return this.transaction(rootId, work);
  }

  insertRange(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null): void {
    const node = this.registry.getNode(nodeId);
    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const beforeDom = beforeId === null ? this.parentAnchor(parent) : this.registry.getNode(beforeId).domStart;
    const fragment = this.extractRange(node);
    parentDom.insertBefore(fragment, beforeDom);
    this.registry.linkChild(nodeId, parentId, beforeId);
  }

  moveRange(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null): void {
    const node = this.registry.getNode(nodeId);
    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const beforeDom = beforeId === null ? this.parentAnchor(parent) : this.registry.getNode(beforeId).domStart;
    const focus = this.captureFocus(node);
    const fragment = this.extractRange(node);
    parentDom.insertBefore(fragment, beforeDom);
    this.registry.linkChild(nodeId, parentId, beforeId);
    this.restoreFocus(focus);
  }

  applyText(nodeId: NodeId, value: string): void {
    const node = this.registry.getNode(nodeId);
    if (node.kind !== "text") throw new Error("ZUI_TRANSACTION_TEXT");
    const text = node.domStart as CharacterData;
    if (text.data !== value) {
      text.data = value;
      node.value = value;
      node.version++;
    }
  }

  applyProps(nodeId: NodeId, previous: Record<string, any>, next: Record<string, any>): void {
    const record = this.registry.getNode(nodeId);
    if (record.kind !== "element" || !(record.domStart instanceof Element)) throw new Error("ZUI_TRANSACTION_PROPS");
    const names = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const name of names) {
      const oldValue = previous[name];
      const newValue = next[name];
      if (Object.is(oldValue, newValue)) continue;
      if (name === "children" || name === "key") continue;
      if (name === "ref") {
        this.clearRef(record);
        this.setRef(record, newValue);
      } else if (/^on[A-Z]/.test(name)) {
        this.setEvent(record, name, newValue);
      } else {
        this.setProperty(record, name, newValue);
      }
    }
    this.registry.updateNode(nodeId, { props: next });
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
    for (const childId of this.registry.children(nodeId)) this.disposeSubtree(childId);
    this.clearBindings(node);
    const cleanup = node.cleanup;
    node.cleanup = undefined;
    try { cleanup?.(); }
    finally { this.registry.disposeNode(nodeId); }
  }

  private clearBindings(node: FlatNode): void {
    if (!(node.domStart instanceof Element)) return;
    for (const [event, listener] of node.listeners) node.domStart.removeEventListener(event, listener);
    node.listeners.clear();
    this.clearRef(node);
  }

  private setEvent(node: FlatNode, prop: string, value: unknown): void {
    if (!(node.domStart instanceof Element)) return;
    const event = eventName(prop);
    const previous = node.listeners.get(event);
    if (previous) node.domStart.removeEventListener(event, previous);
    node.listeners.delete(event);
    if (typeof value === "function") {
      const listener = value as EventListener;
      node.domStart.addEventListener(event, listener);
      node.listeners.set(event, listener);
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
    const element = node.domStart as HTMLElement;
    if (name === "className" || name === "class") {
      element.className = stringify(value);
    } else if (name === "style") {
      const next = value && typeof value === "object" ? value as Record<string, unknown> : {};
      for (const prop of Object.keys(node.styleSnapshot)) {
        if (prop in next) continue;
        if (prop.startsWith("--")) element.style.removeProperty(prop);
        else (element.style as any)[prop] = "";
      }
      for (const [prop, entry] of Object.entries(next)) {
        if (Object.is(node.styleSnapshot[prop], entry)) continue;
        if (prop.startsWith("--")) element.style.setProperty(prop, stringify(entry));
        else (element.style as any)[prop] = entry ?? "";
      }
      node.styleSnapshot = { ...next };
    } else if (name === "value" || name === "checked" || name === "disabled") {
      const normalized = value ?? (name === "value" ? "" : false);
      if ((element as any)[name] !== normalized) (element as any)[name] = normalized;
    } else if (name in element && !name.startsWith("aria-") && !name.startsWith("data-")) {
      try { (element as any)[name] = value ?? ""; }
      catch { this.setAttribute(element, name, value); }
    } else {
      this.setAttribute(element, name, value);
    }
    node.version++;
  }

  private setAttribute(element: Element, name: string, value: unknown): void {
    if (value == null || value === false) element.removeAttribute(name);
    else if (value === true) element.setAttribute(name, "");
    else element.setAttribute(name, String(value));
  }

  private parentDom(parent: FlatNode): Node {
    if (parent.kind === "root" || parent.kind === "element") return parent.domStart;
    const domParent = parent.domStart.parentNode;
    if (!domParent) throw new Error("ZUI_DETACHED_PARENT");
    return domParent;
  }

  private parentAnchor(parent: FlatNode): Node | null {
    return parent.kind === "boundary" ? parent.domEnd : null;
  }

  private extractRange(node: FlatNode): DocumentFragment {
    const fragment = this.document.createDocumentFragment();
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
    if (current !== node.domEnd) throw new Error("ZUI_DOM_RANGE_CORRUPT");
    return fragment;
  }

  private captureFocus(node: FlatNode): FocusState | undefined {
    const active = this.document.activeElement;
    if (!(active instanceof HTMLElement) || !(node.domStart instanceof Element) || !node.domStart.contains(active)) return undefined;
    const input = active as HTMLInputElement | HTMLTextAreaElement;
    return {
      element: active,
      start: "selectionStart" in input ? input.selectionStart : null,
      end: "selectionEnd" in input ? input.selectionEnd : null,
      direction: "selectionDirection" in input ? input.selectionDirection : null
    };
  }

  private restoreFocus(state: FocusState | undefined): void {
    if (!state || !state.element.isConnected) return;
    state.element.focus({ preventScroll: true });
    if (state.start !== null && state.end !== null && "setSelectionRange" in state.element) {
      (state.element as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(state.start, state.end, state.direction ?? undefined);
    }
  }
}

interface FocusState {
  element: HTMLElement;
  start: number | null;
  end: number | null;
  direction: "forward" | "backward" | "none" | null;
}

function stringify(value: unknown): string {
  return value == null || typeof value === "boolean" ? "" : String(value);
}

function eventName(name: string): string {
  if (name === "onChange") return "change";
  if (name === "onDoubleClick") return "dblclick";
  return name.slice(2).toLowerCase();
}
