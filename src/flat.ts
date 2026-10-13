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
  domStart: Node;
  domEnd: Node;
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
  listeners?: Map<string, EventListener>;
  ref?: unknown;
  styleSnapshot?: Record<string, unknown>;
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

export interface NodeRegistryOptions {
  /** Maximum total number of lightweight disposed node/owner records retained for diagnostics. */
  maxTombstones?: number;
}

/** A flat, addressable index for roots, nodes and ownership scopes. */
export class NodeRegistry implements OwnerHost {
  private nextNodeId = 1;
  private nextRootId = 1;
  private nextOwnerId = 1;
  private readonly nodes = new Map<NodeId, FlatNode>();
  private readonly roots = new Map<RootId, RootHandle>();
  private readonly rootByContainer = new WeakMap<Element, RootId>();
  private readonly owners = new Map<OwnerId, FlatOwner>();
  private readonly nodeTombstones = new Map<NodeId, true>();
  private readonly ownerTombstones = new Map<OwnerId, true>();
  private readonly tombstoneOrder = new Map<string, { kind: "node" | "owner"; id: number }>();
  private readonly maxTombstones: number;
  private tombstoneAnchor: Comment | undefined;

  constructor(options: NodeRegistryOptions = {}) {
    const maxTombstones = options.maxTombstones ?? 1_000;
    if (!Number.isInteger(maxTombstones) || maxTombstones < 0) {
      throw new RangeError("ZUI_INVALID_TOMBSTONE_LIMIT");
    }
    this.maxTombstones = maxTombstones;
  }

  createRoot(container: Element): RootHandle {
    if (this.rootByContainer.has(container)) throw new Error("ZUI_ROOT_OCCUPIED");

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
      if (parent.rootId !== rootId || parent.disposed) throw new Error("ZUI_OWNER_ROOT_MISMATCH");
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
    this.rememberOwnerTombstone(ownerId);
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
    if (patch.type !== undefined || Object.prototype.hasOwnProperty.call(patch, "type")) node.type = patch.type;
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

  childRecords(parentId: NodeId): FlatNode[] {
    const parent = this.getNode(parentId);
    const result: FlatNode[] = [];
    let current = parent.firstChild;
    while (current !== null) {
      const child = this.getNode(current);
      if (child.parentId !== parentId || child.disposed) throw new Error("ZUI_INDEX_CORRUPT");
      result.push(child);
      current = child.nextSibling;
    }
    if ((result.at(-1)?.id ?? null) !== parent.lastChild) throw new Error("ZUI_INDEX_CORRUPT");
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

  /** Repositions an already-linked sibling without unlink/reinsert validation. */
  moveChildBefore(nodeId: NodeId, beforeId: NodeId | null): void {
    const node = this.getNode(nodeId);
    const parentId = node.parentId;
    if (parentId === null) throw new Error("ZUI_INVALID_MOVE");
    const parent = this.getNode(parentId);
    if (node.disposed || parent.disposed) throw new Error("ZUI_NODE_DISPOSED");
    if (node.rootId !== parent.rootId) throw new Error("ZUI_ROOT_MISMATCH");
    if (beforeId !== null) {
      const before = this.getNode(beforeId);
      if (before.disposed || before.parentId !== parentId) throw new Error("ZUI_INVALID_ANCHOR");
    }
    if (beforeId === nodeId || node.nextSibling === beforeId) return;

    const previous = node.prevSibling;
    const next = node.nextSibling;
    if (previous === null) parent.firstChild = next;
    else this.getNode(previous).nextSibling = next;
    if (next === null) parent.lastChild = previous;
    else this.getNode(next).prevSibling = previous;

    const insertionPrevious = beforeId === null ? parent.lastChild : this.getNode(beforeId).prevSibling;
    node.parentId = parentId;
    node.prevSibling = insertionPrevious;
    node.nextSibling = beforeId;
    if (insertionPrevious === null) parent.firstChild = nodeId;
    else this.getNode(insertionPrevious).nextSibling = nodeId;
    if (beforeId === null) parent.lastChild = nodeId;
    else this.getNode(beforeId).prevSibling = nodeId;
    parent.version++;
    node.version++;
  }

  reorderChildRecords(
    parentId: NodeId,
    originalRecords: readonly FlatNode[],
    finalRecords: readonly FlatNode[]
  ): void {
    const parent = this.getNode(parentId);
    if (finalRecords.length !== originalRecords.length) throw new Error("ZUI_INVALID_CHILD_ORDER");

    let current = parent.firstChild;
    for (const child of originalRecords) {
      if (child.id !== current || child.parentId !== parentId || child.disposed || child.rootId !== parent.rootId) {
        throw new Error("ZUI_INDEX_CORRUPT");
      }
      current = child.nextSibling;
    }
    if (current !== null) throw new Error("ZUI_INDEX_CORRUPT");

    const remaining = new Set(originalRecords);
    for (const child of finalRecords) {
      if (!remaining.delete(child) || child.parentId !== parentId || child.disposed || child.rootId !== parent.rootId) {
        throw new Error("ZUI_INVALID_CHILD_ORDER");
      }
    }
    if (remaining.size !== 0) throw new Error("ZUI_INVALID_CHILD_ORDER");

    for (let index = 0; index < finalRecords.length; index++) {
      const child = finalRecords[index]!;
      const previous = index === 0 ? null : finalRecords[index - 1]!.id;
      const next = index + 1 === finalRecords.length ? null : finalRecords[index + 1]!.id;
      if (child.prevSibling !== previous || child.nextSibling !== next) {
        child.prevSibling = previous;
        child.nextSibling = next;
        child.version++;
      }
    }
    parent.firstChild = finalRecords[0]?.id ?? null;
    parent.lastChild = finalRecords.at(-1)?.id ?? null;
    parent.version++;
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
    const owner = this.owners.get(node.ownerId);
    owner?.nodeIds.delete(nodeId);
    if (owner) owner.version++;
    node.disposed = true;
    node.version++;
    this.releaseNodeReferences(node);
    this.rememberNodeTombstone(nodeId);
  }

  disposeRoot(rootId: RootId): void {
    const root = this.roots.get(rootId);
    if (!root) return;
    if (this.children(root.nodeId).length > 0) throw new Error("ZUI_ROOT_NOT_EMPTY");
    this.disposeNode(root.nodeId);
    this.disposeOwner(root.ownerId);
    this.roots.delete(rootId);
    if (this.rootByContainer.get(root.container) === rootId) this.rootByContainer.delete(root.container);
  }

  private releaseNodeReferences(node: FlatNode): void {
    const ownerDocument = node.domStart.ownerDocument ?? globalThis.document;
    this.tombstoneAnchor ??= ownerDocument.createComment("zui:disposed");
    node.domStart = this.tombstoneAnchor;
    node.domEnd = this.tombstoneAnchor;
    node.props = {};
    node.type = undefined;
    node.key = undefined;
    node.value = undefined;
    node.payload = undefined;
    node.listeners?.clear();
    node.listeners = undefined;
    node.ref = undefined;
    node.styleSnapshot = undefined;
    node.cleanup = undefined;
  }

  private rememberNodeTombstone(nodeId: NodeId): void {
    if (this.maxTombstones === 0) {
      this.nodes.delete(nodeId);
      return;
    }
    this.nodeTombstones.set(nodeId, true);
    this.rememberTombstone("node", nodeId);
  }

  private rememberOwnerTombstone(ownerId: OwnerId): void {
    if (this.maxTombstones === 0) {
      this.owners.delete(ownerId);
      return;
    }
    this.ownerTombstones.set(ownerId, true);
    this.rememberTombstone("owner", ownerId);
  }

  private rememberTombstone(kind: "node" | "owner", id: number): void {
    this.tombstoneOrder.set(`${kind}:${id}`, { kind, id });
    while (this.tombstoneOrder.size > this.maxTombstones) {
      const oldestKey = this.tombstoneOrder.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.tombstoneOrder.get(oldestKey)!;
      this.tombstoneOrder.delete(oldestKey);
      if (oldest.kind === "node") {
        this.nodeTombstones.delete(oldest.id);
        this.nodes.delete(oldest.id);
      } else {
        this.ownerTombstones.delete(oldest.id);
        this.owners.delete(oldest.id);
      }
    }
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
  | {
      kind: "move-many";
      parentId: NodeId;
      originalIds: NodeId[];
      finalIds: NodeId[];
      movingIds: NodeId[];
      beforeIds: Array<NodeId | null>;
      originalRecords?: FlatNode[];
      finalRecords?: FlatNode[];
      recordsById?: Map<NodeId, FlatNode>;
    }
  | { kind: "props"; nodeId: NodeId; previous: Record<string, any>; next: Record<string, any>; changedKeys: string[] }
  | { kind: "text"; nodeId: NodeId; value: string; cachedNode?: FlatNode; previous?: string }
  | { kind: "meta"; nodeId: NodeId; patch: Partial<Pick<FlatNode, "key" | "type" | "props" | "value" | "payload">> }
  | { kind: "remove"; nodeId: NodeId };

const blockedHTMLProperties = new Set(["innerhtml", "outerhtml", "srcdoc"]);
const urlProperties = new Set(["href", "xlink:href", "src", "action", "formaction", "poster", "data"]);
interface PropertyClassification {
  readonly blockedHTML: boolean;
  readonly event: boolean;
  readonly url: boolean;
}
const propertyClassifications = new Map<string, PropertyClassification>();
const PROPERTY_CLASSIFICATION_LIMIT = 128;

function classifyProperty(name: string): PropertyClassification {
  const cached = propertyClassifications.get(name);
  if (cached) return cached;
  const normalized = name.toLowerCase();
  const classification = {
    blockedHTML: blockedHTMLProperties.has(normalized),
    event: /^on[a-z]/i.test(name),
    url: urlProperties.has(normalized)
  };
  if (propertyClassifications.size >= PROPERTY_CLASSIFICATION_LIMIT) {
    const oldest = propertyClassifications.keys().next().value as string | undefined;
    if (oldest !== undefined) propertyClassifications.delete(oldest);
  }
  propertyClassifications.set(name, classification);
  return classification;
}

function isEventProperty(name: string): boolean {
  return classifyProperty(name).event;
}

function isUnsafeUrlProperty(name: string, value: unknown): boolean {
  if (!classifyProperty(name).url || typeof value !== "string") return false;
  const normalized = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();
  return /^(javascript|vbscript):/.test(normalized) || normalized.startsWith("data:text/html");
}

export class PatchTransaction {
  private readonly operations: PatchOp[] = [];
  private readonly created: NodeId[] = [];
  private readonly createdSet = new Set<NodeId>();
  private committed = false;
  private onlyTextOperations = true;
  private onlyCreatedOperations = true;
  private hasRemovals = false;

  constructor(private readonly engine: PatchEngine, readonly rootId: RootId) {}

  createElement(
    ownerId: OwnerId,
    tag: string,
    type?: string | ((props: any) => any),
    key?: Key,
    props?: Record<string, any>,
    value?: unknown
  ): NodeId {
    const element = this.engine.document.createElement(tag);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "element", domStart: element, type, key, props, value
    });
    this.created.push(id);
    this.createdSet.add(id);
    return id;
  }

  createText(ownerId: OwnerId, value: string): NodeId {
    const text = this.engine.document.createTextNode(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "text", domStart: text, value
    });
    this.created.push(id);
    this.createdSet.add(id);
    return id;
  }

  createComment(ownerId: OwnerId, value: string): NodeId {
    const comment = this.engine.document.createComment(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "comment", domStart: comment, value
    });
    this.created.push(id);
    this.createdSet.add(id);
    return id;
  }

  createBoundary(ownerId: OwnerId, startValue = "zui:start", endValue = "zui:end", key?: Key): NodeId {
    const start = this.engine.document.createComment(startValue);
    const end = this.engine.document.createComment(endValue);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "boundary", domStart: start, domEnd: end, key
    });
    this.created.push(id);
    this.createdSet.add(id);
    return id;
  }

  insert(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null = null): void {
    this.pushOperation({ kind: "insert", nodeId, parentId, beforeId });
  }

  move(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null = null): void {
    this.pushOperation({ kind: "move", nodeId, parentId, beforeId });
  }

  moveMany(
    parentId: NodeId,
    originalIds: NodeId[],
    finalIds: NodeId[],
    movingIds: NodeId[],
    beforeIds: Array<NodeId | null>
  ): void {
    if (movingIds.length === 0) return;
    this.onlyTextOperations = false;
    this.onlyCreatedOperations = false;
    this.operations.push({ kind: "move-many", parentId, originalIds, finalIds, movingIds, beforeIds });
  }

  patchProps(nodeId: NodeId, previous: Record<string, any>, next: Record<string, any>): void {
    let changedKeys: string[] | undefined;
    for (const name in previous) {
      if (!Object.prototype.hasOwnProperty.call(previous, name) || name === "children" || name === "key") continue;
      if (!Object.is(previous[name], next[name])) (changedKeys ??= []).push(name);
    }
    for (const name in next) {
      if (!Object.prototype.hasOwnProperty.call(next, name) || name === "children" || name === "key") continue;
      if (!Object.prototype.hasOwnProperty.call(previous, name)) {
        (changedKeys ??= []).push(name);
      }
    }
    if (changedKeys) this.pushOperation({ kind: "props", nodeId, previous, next, changedKeys });
  }

  setText(nodeId: NodeId, value: string, cachedNode?: FlatNode): void {
    this.pushOperation({ kind: "text", nodeId, value, cachedNode });
  }

  setMeta(nodeId: NodeId, patch: Partial<Pick<FlatNode, "key" | "type" | "props" | "value" | "payload">>): void {
    this.pushOperation({ kind: "meta", nodeId, patch });
  }

  remove(nodeId: NodeId): void {
    this.pushOperation({ kind: "remove", nodeId });
  }

  attachCleanup(nodeId: NodeId, cleanup: Dispose): void {
    this.engine.registry.attachCleanup(nodeId, cleanup);
  }

  commit(): void {
    if (this.committed) throw new Error("ZUI_TRANSACTION_REUSED");
    if (this.operations.length === 0) {
      this.committed = true;
      return;
    }
    if (this.onlyTextOperations) {
      this.commitTextOnly();
      return;
    }
    this.validate();
    const removals = this.hasRemovals ? this.operations.filter(op => op.kind === "remove") : undefined;
    const changes = removals ? this.operations.filter(op => op.kind !== "remove") : this.operations;
    // Fresh records are discarded as a subtree if commit fails, so per-op
    // undo closures are unnecessary when this transaction only touches them.
    const undo: Array<() => void> | undefined = this.onlyCreatedOperations ? undefined : [];
    try {
      for (const operation of changes) {
        if (operation.kind === "move-many") {
          if (undo) undo.push(() => this.engine.restoreChildrenOrder(operation.parentId, operation.originalIds));
          this.engine.moveChildren(
            operation.parentId,
            operation.movingIds,
            operation.beforeIds,
            operation.originalRecords!,
            operation.finalRecords!,
            operation.recordsById!
          );
          continue;
        }
        const needsUndo = undo !== undefined && !this.createdSet.has(operation.nodeId);
        if (operation.kind === "insert") {
          if (needsUndo) undo!.push(() => this.engine.detachRange(operation.nodeId));
          this.engine.insertRange(operation.nodeId, operation.parentId, operation.beforeId);
        } else if (operation.kind === "move") {
          if (operation.beforeId === operation.nodeId) continue;
          const node = this.engine.registry.getNode(operation.nodeId);
          const previousParentId = node.parentId;
          const previousNextId = node.nextSibling;
          if (needsUndo) {
            undo!.push(() => {
              if (previousParentId === null) this.engine.detachRange(operation.nodeId);
              else this.engine.moveRange(operation.nodeId, previousParentId, previousNextId);
            });
          }
          this.engine.moveRange(operation.nodeId, operation.parentId, operation.beforeId);
        } else if (operation.kind === "props") {
          if (needsUndo) undo!.push(() => this.engine.applyProps(operation.nodeId, operation.next, operation.previous, operation.changedKeys));
          this.engine.applyProps(operation.nodeId, operation.previous, operation.next, operation.changedKeys);
        } else if (operation.kind === "text") {
          const previous = (this.engine.registry.getNode(operation.nodeId).domStart as CharacterData).data;
          if (needsUndo) undo!.push(() => this.engine.applyText(operation.nodeId, previous));
          this.engine.applyText(operation.nodeId, operation.value);
        } else if (operation.kind === "meta") {
          const node = this.engine.registry.getNode(operation.nodeId);
          const previous = {
            key: node.key,
            type: node.type,
            props: node.props,
            value: node.value,
            payload: node.payload
          };
          if (needsUndo) undo!.push(() => this.engine.registry.updateNode(operation.nodeId, previous));
          this.engine.registry.updateNode(operation.nodeId, operation.patch);
        }
      }
      this.committed = true;
      let disposalFailure: unknown;
      for (const operation of removals ?? []) {
        try { this.engine.removeSubtree(operation.nodeId); }
        catch (error) { disposalFailure ??= error; }
      }
      if (disposalFailure) throw disposalFailure;
    } catch (error) {
      // Revert completed writes in reverse order. This is best-effort: user
      // refs/setters can themselves throw, and disposal callbacks run only
      // after the structural/property commit has become final.
      if (!this.committed) for (const revert of undo?.reverse() ?? []) {
        try { revert(); } catch { /* preserve the original commit error */ }
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

  private commitTextOnly(): void {
    const operations = this.operations as Array<Extract<PatchOp, { kind: "text" }>>;
    let appliedCount = 0;
    try {
      for (let index = 0; index < operations.length; index++) {
        const operation = operations[index]!;
        const node = operation.cachedNode ?? this.engine.registry.getNode(operation.nodeId);
        if (node.id !== operation.nodeId || node.rootId !== this.rootId || node.disposed) {
          throw new Error("ZUI_TRANSACTION_NODE");
        }
        if (node.kind !== "text") throw new Error("ZUI_TRANSACTION_TEXT");
        operation.previous = (node.domStart as CharacterData).data;
        appliedCount = index + 1;
        this.engine.applyText(operation.nodeId, operation.value, node, operation.previous);
      }
      this.committed = true;
    } catch (error) {
      for (let index = appliedCount - 1; index >= 0; index--) {
        const operation = operations[index]!;
        try { this.engine.applyText(operation.nodeId, operation.previous!, operation.cachedNode); }
        catch { /* preserve the original commit error */ }
      }
      throw error;
    }
  }

  private pushOperation(operation: PatchOp): void {
    if (operation.kind !== "text") this.onlyTextOperations = false;
    if (operation.kind === "remove") this.hasRemovals = true;
    if (operation.kind !== "move-many" && !this.createdSet.has(operation.nodeId)) this.onlyCreatedOperations = false;
    this.operations.push(operation);
  }

  private validate(): void {
    const removed = new Set<NodeId>();
    const inserted = new Set<NodeId>();
    const projectedChildren = new Set<NodeId>();
    const projectedParents = new Map<NodeId, NodeId | null>();
    const projectedParent = (nodeId: NodeId): NodeId | null =>
      projectedParents.has(nodeId)
        ? projectedParents.get(nodeId)!
        : this.engine.registry.getNode(nodeId).parentId;

    for (const operation of this.operations) {
      if (operation.kind === "move-many") {
        this.validateMoveMany(operation);
        continue;
      }
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
          if (operation.beforeId === operation.nodeId || projectedParent(operation.beforeId) !== operation.parentId) {
            throw new Error("ZUI_INVALID_ANCHOR");
          }
        }
        if (operation.kind === "insert" && projectedParent(operation.nodeId) !== null) {
          throw new Error("ZUI_TRANSACTION_INSERT_ATTACHED");
        }
        if (inserted.has(operation.nodeId) && operation.kind === "insert") {
          throw new Error("ZUI_TRANSACTION_DUPLICATE_INSERT");
        }
        if (operation.nodeId === operation.parentId) throw new Error("ZUI_TRANSACTION_CYCLE");
        inserted.add(operation.nodeId);
        const isSameParentMove = operation.kind === "move" &&
          projectedParent(operation.nodeId) === operation.parentId;
        const newLeafInsert = this.createdSet.has(operation.nodeId) && !projectedChildren.has(operation.nodeId);
        if (!isSameParentMove && !newLeafInsert) {
          let ancestor: NodeId | null = operation.parentId;
          while (ancestor !== null) {
            if (ancestor === operation.nodeId) throw new Error("ZUI_TRANSACTION_CYCLE");
            ancestor = projectedParent(ancestor);
          }
        }
        projectedParents.set(operation.nodeId, operation.parentId);
        projectedChildren.add(operation.parentId);
      }
      if (operation.kind === "text" && node.kind !== "text") throw new Error("ZUI_TRANSACTION_TEXT");
      if (operation.kind === "props") {
        if (node.kind !== "element") throw new Error("ZUI_TRANSACTION_PROPS");
        for (const name of operation.changedKeys) {
          const value = operation.next[name];
          const classification = classifyProperty(name);
          if (classification.blockedHTML) throw new Error("ZUI_UNSAFE_HTML_PROP");
          if (classification.event && value != null && typeof value !== "function") {
            throw new Error("ZUI_UNSAFE_EVENT_PROP");
          }
          if (isUnsafeUrlProperty(name, value)) throw new Error("ZUI_UNSAFE_URL_PROP");
        }
      }
    }
  }

  private validateMoveMany(operation: Extract<PatchOp, { kind: "move-many" }>): void {
    const parent = this.engine.registry.getNode(operation.parentId);
    if (parent.rootId !== this.rootId || parent.disposed) throw new Error("ZUI_TRANSACTION_PARENT");
    if (operation.movingIds.length !== operation.beforeIds.length || operation.finalIds.length !== operation.originalIds.length) {
      throw new Error("ZUI_INVALID_CHILD_ORDER");
    }
    const batchedIds = new Set(operation.originalIds);
    for (const candidate of this.operations) {
      if (candidate === operation) continue;
      if (candidate.kind === "insert" && candidate.parentId === operation.parentId) {
        throw new Error("ZUI_INVALID_CHILD_ORDER");
      }
      if (candidate.kind === "move" &&
        (candidate.parentId === operation.parentId || batchedIds.has(candidate.nodeId))) {
        throw new Error("ZUI_INVALID_CHILD_ORDER");
      }
      if ((candidate.kind === "remove" && batchedIds.has(candidate.nodeId)) ||
        (candidate.kind === "move-many" && candidate.parentId === operation.parentId)) {
        throw new Error("ZUI_INVALID_CHILD_ORDER");
      }
    }

    const originalRecords = this.engine.registry.childRecords(operation.parentId);
    if (originalRecords.length !== operation.originalIds.length ||
      originalRecords.some((node, index) => node.id !== operation.originalIds[index] || node.rootId !== this.rootId)) {
      throw new Error("ZUI_INDEX_CORRUPT");
    }
    const recordsById = new Map<NodeId, FlatNode>();
    for (const node of originalRecords) recordsById.set(node.id, node);
    const remainingIds = new Set(operation.originalIds);
    const finalRecords: FlatNode[] = [];
    for (const id of operation.finalIds) {
      const record = recordsById.get(id);
      if (!record || !remainingIds.delete(id)) throw new Error("ZUI_INVALID_CHILD_ORDER");
      finalRecords.push(record);
    }
    if (remainingIds.size !== 0) throw new Error("ZUI_INVALID_CHILD_ORDER");

    const movedIds = new Set<NodeId>();
    for (let index = 0; index < operation.movingIds.length; index++) {
      const nodeId = operation.movingIds[index]!;
      const beforeId = operation.beforeIds[index]!;
      if (movedIds.has(nodeId) || !recordsById.has(nodeId) || beforeId === nodeId) {
        throw new Error("ZUI_INVALID_MOVE");
      }
      movedIds.add(nodeId);
      if (beforeId !== null && !recordsById.has(beforeId)) throw new Error("ZUI_INVALID_ANCHOR");
    }
    operation.originalRecords = originalRecords;
    operation.finalRecords = finalRecords;
    operation.recordsById = recordsById;
  }
}

export interface PatchEngineOptions {
  /** Run a full-root index walk after each commit. Keep disabled in production hot paths. */
  assertAfterCommit?: boolean;
}

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

  insertRange(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null): void {
    const node = this.registry.getNode(nodeId);
    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const beforeDom = beforeId === null ? this.parentAnchor(parent) : this.registry.getNode(beforeId).domStart;
    if (!node.domStart.parentNode && (node.domEnd === node.domStart || !node.domEnd.parentNode)) {
      // Fresh nodes are already detached. Avoid allocating a DocumentFragment
      // for every element/text node during initial mount.
      parentDom.insertBefore(node.domStart, beforeDom);
      if (node.domEnd !== node.domStart) parentDom.insertBefore(node.domEnd, beforeDom);
    } else {
      const fragment = this.extractRange(node);
      parentDom.insertBefore(fragment, beforeDom);
    }
    this.registry.linkChild(nodeId, parentId, beforeId);
  }

  moveRange(nodeId: NodeId, parentId: NodeId, beforeId: NodeId | null): void {
    const node = this.registry.getNode(nodeId);
    if (node.parentId === parentId && node.nextSibling === beforeId) return;
    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const beforeDom = beforeId === null ? this.parentAnchor(parent) : this.registry.getNode(beforeId).domStart;
    const focus = this.captureFocus(node);
    if (node.domStart === node.domEnd) {
      // insertBefore already moves a single node; a DocumentFragment here only
      // adds allocation and a remove/append pair for keyed sibling updates.
      parentDom.insertBefore(node.domStart, beforeDom);
    } else {
      const fragment = this.extractRange(node);
      parentDom.insertBefore(fragment, beforeDom);
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
    records: ReadonlyMap<NodeId, FlatNode>
  ): void {
    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const parentAnchor = this.parentAnchor(parent);
    const focus = this.captureFocusInChildren(parentDom, movingIds, records);

    try {
      for (let index = 0; index < movingIds.length; index++) {
        const node = records.get(movingIds[index]!)!;
        const beforeId = beforeIds[index]!;
        if (node.disposed || node.parentId !== parentId) throw new Error("ZUI_TRANSACTION_NODE");
        const before = beforeId === null ? undefined : records.get(beforeId)!;
        if (beforeId !== null && (!before || before.disposed || before.parentId !== parentId)) {
          throw new Error("ZUI_TRANSACTION_ANCHOR");
        }
        const beforeDom = before?.domStart ?? parentAnchor;
        if (node.domStart === node.domEnd) parentDom.insertBefore(node.domStart, beforeDom);
        else parentDom.insertBefore(this.extractRange(node), beforeDom);
      }
      this.registry.reorderChildRecords(parentId, originalRecords, finalRecords);
    } finally {
      this.restoreFocus(focus);
    }
  }

  restoreChildrenOrder(parentId: NodeId, orderedIds: NodeId[]): void {
    const currentRecords = this.registry.childRecords(parentId);

    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const parentAnchor = this.parentAnchor(parent);
    const records = new Map<NodeId, FlatNode>();
    for (const node of currentRecords) records.set(node.id, node);
    const focus = this.captureFocusInChildren(parentDom, orderedIds, records);
    const fragment = this.document.createDocumentFragment();

    try {
      for (const id of orderedIds) this.appendRange(fragment, records.get(id)!);
      parentDom.insertBefore(fragment, parentAnchor);
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
    const text = node.domStart as CharacterData;
    const previous = knownPrevious ?? text.data;
    if (previous !== value) {
      text.data = value;
      node.value = value;
      node.version++;
    }
    return previous;
  }

  applyProps(
    nodeId: NodeId,
    previous: Record<string, any>,
    next: Record<string, any>,
    changedKeys?: readonly string[]
  ): void {
    const record = this.registry.getNode(nodeId);
    if (record.kind !== "element" || !(record.domStart instanceof Element)) throw new Error("ZUI_TRANSACTION_PROPS");
    const names = changedKeys ?? new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const name of names) {
      const oldValue = previous[name];
      const newValue = next[name];
      if (Object.is(oldValue, newValue)) continue;
      if (name === "children" || name === "key") continue;
      if (name === "ref") {
        this.clearRef(record);
        this.setRef(record, newValue);
      } else if (isEventProperty(name)) {
        this.setEvent(record, name, newValue);
      } else {
        this.setProperty(record, name, newValue);
      }
    }
    record.props = next;
    record.version++;
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
    const classification = classifyProperty(name);
    if (classification.blockedHTML) throw new Error("ZUI_UNSAFE_HTML_PROP");
    if (classification.event && value != null && typeof value !== "function") {
      throw new Error("ZUI_UNSAFE_EVENT_PROP");
    }
    if (isUnsafeUrlProperty(name, value)) throw new Error("ZUI_UNSAFE_URL_PROP");
    const element = node.domStart as HTMLElement;
    if (name === "className" || name === "class") {
      element.className = stringify(value);
    } else if (name === "style") {
      const next = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const previous = node.styleSnapshot;
      for (const prop of Object.keys(previous ?? {})) {
        if (prop in next) continue;
        if (prop.startsWith("--")) element.style.removeProperty(prop);
        else (element.style as any)[prop] = "";
      }
      for (const [prop, entry] of Object.entries(next)) {
        if (Object.is(previous?.[prop], entry)) continue;
        if (prop.startsWith("--")) element.style.setProperty(prop, stringify(entry));
        else (element.style as any)[prop] = entry ?? "";
      }
      node.styleSnapshot = Object.keys(next).length > 0 ? { ...next } : undefined;
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

  private appendRange(fragment: DocumentFragment, node: FlatNode): void {
    let current: Node | null = node.domStart;
    while (current) {
      const next: Node | null = current.nextSibling;
      fragment.appendChild(current);
      if (current === node.domEnd) return;
      current = next;
    }
    throw new Error("ZUI_DOM_RANGE_CORRUPT");
  }

  private captureFocusInChildren(
    parentDom: Node,
    childIds: readonly NodeId[],
    records: ReadonlyMap<NodeId, FlatNode>
  ): FocusState | undefined {
    const active = this.document.activeElement;
    if (!(active instanceof HTMLElement) || !(parentDom instanceof Element) || !parentDom.contains(active)) return undefined;
    for (const id of childIds) {
      const child = records.get(id);
      if (child?.domStart instanceof Element && child.domStart.contains(active)) return this.captureFocus(child);
    }
    return undefined;
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
