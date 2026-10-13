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
  isSvg?: boolean;
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
  isSvg?: boolean;
};

export interface NodeRegistryOptions {
  /** Maximum total number of lightweight disposed node/owner records retained for diagnostics. */
  maxTombstones?: number;
}

export interface RegistryDiagnostics {
  readonly activeNodes: number;
  readonly tombstoneNodes: number;
  readonly totalNodes: number;
  readonly activeOwners: number;
  readonly tombstoneOwners: number;
  readonly totalOwners: number;
  readonly totalRoots: number;
  readonly maxTombstones: number;
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
  private cacheId0 = 0;
  private cacheNode0: FlatNode | undefined;
  private cacheId1 = 0;
  private cacheNode1: FlatNode | undefined;
  private cacheId2 = 0;
  private cacheNode2: FlatNode | undefined;
  private cacheId3 = 0;
  private cacheNode3: FlatNode | undefined;
  private cacheOwnerId0 = 0;
  private cacheOwner0: FlatOwner | undefined;
  private cacheOwnerId1 = 0;
  private cacheOwner1: FlatOwner | undefined;

  constructor(options: NodeRegistryOptions = {}) {
    const maxTombstones = options.maxTombstones ?? 1_000;
    if (!Number.isInteger(maxTombstones) || maxTombstones < 0) {
      throw new RangeError("ZUI_INVALID_TOMBSTONE_LIMIT");
    }
    this.maxTombstones = maxTombstones;
  }

  get nextId(): NodeId {
    return this.nextNodeId;
  }

  diagnostics(): RegistryDiagnostics {
    return {
      activeNodes: this.nodes.size - this.nodeTombstones.size,
      tombstoneNodes: this.nodeTombstones.size,
      totalNodes: this.nodes.size,
      activeOwners: this.owners.size - this.ownerTombstones.size,
      tombstoneOwners: this.ownerTombstones.size,
      totalOwners: this.owners.size,
      totalRoots: this.roots.size,
      maxTombstones: this.maxTombstones
    };
  }

  createRoot(container: Element): RootHandle {
    if (this.rootByContainer.has(container)) throw new Error("ZUI_ROOT_OCCUPIED");

    const rootId = this.nextRootId++;
    const ownerId = this.createOwner(rootId, null);
    const isSvg = container.namespaceURI === SVG_NAMESPACE;
    const nodeId = this.createNode({
      rootId,
      ownerId,
      kind: "root",
      domStart: container,
      domEnd: container,
      isSvg
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
    if (owner.rootId !== init.rootId) throw new Error("ZUI_OWNER_ROOT_MISMATCH");
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
      disposed: false,
      isSvg: init.isSvg
    };
    this.nodes.set(id, node);
    owner.nodeIds.add(id);
    owner.version++;
    this.cacheId3 = this.cacheId2;
    this.cacheNode3 = this.cacheNode2;
    this.cacheId2 = this.cacheId1;
    this.cacheNode2 = this.cacheNode1;
    this.cacheId1 = this.cacheId0;
    this.cacheNode1 = this.cacheNode0;
    this.cacheId0 = id;
    this.cacheNode0 = node;
    return id;
  }

  getNode(nodeId: NodeId): FlatNode {
    if (nodeId === this.cacheId0 && this.cacheNode0 !== undefined) return this.cacheNode0;
    if (nodeId === this.cacheId1 && this.cacheNode1 !== undefined) {
      const node = this.cacheNode1;
      this.cacheId1 = this.cacheId0;
      this.cacheNode1 = this.cacheNode0;
      this.cacheId0 = nodeId;
      this.cacheNode0 = node;
      return node;
    }
    if (nodeId === this.cacheId2 && this.cacheNode2 !== undefined) {
      const node = this.cacheNode2;
      this.cacheId2 = this.cacheId1;
      this.cacheNode2 = this.cacheNode1;
      this.cacheId1 = this.cacheId0;
      this.cacheNode1 = this.cacheNode0;
      this.cacheId0 = nodeId;
      this.cacheNode0 = node;
      return node;
    }
    if (nodeId === this.cacheId3 && this.cacheNode3 !== undefined) {
      const node = this.cacheNode3;
      this.cacheId3 = this.cacheId2;
      this.cacheNode3 = this.cacheNode2;
      this.cacheId2 = this.cacheId1;
      this.cacheNode2 = this.cacheNode1;
      this.cacheId1 = this.cacheId0;
      this.cacheNode1 = this.cacheNode0;
      this.cacheId0 = nodeId;
      this.cacheNode0 = node;
      return node;
    }
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error("ZUI_UNKNOWN_NODE");
    this.cacheId3 = this.cacheId2;
    this.cacheNode3 = this.cacheNode2;
    this.cacheId2 = this.cacheId1;
    this.cacheNode2 = this.cacheNode1;
    this.cacheId1 = this.cacheId0;
    this.cacheNode1 = this.cacheNode0;
    this.cacheId0 = nodeId;
    this.cacheNode0 = node;
    return node;
  }

  hasNode(nodeId: NodeId): boolean {
    return this.nodes.has(nodeId);
  }

  allNodes(): readonly FlatNode[] {
    return [...this.nodes.values()];
  }

  getOwner(ownerId: OwnerId): FlatOwner {
    if (ownerId === this.cacheOwnerId0 && this.cacheOwner0 !== undefined) return this.cacheOwner0;
    if (ownerId === this.cacheOwnerId1 && this.cacheOwner1 !== undefined) {
      const owner = this.cacheOwner1;
      this.cacheOwnerId1 = this.cacheOwnerId0;
      this.cacheOwner1 = this.cacheOwner0;
      this.cacheOwnerId0 = ownerId;
      this.cacheOwner0 = owner;
      return owner;
    }
    const owner = this.owners.get(ownerId);
    if (!owner) throw new Error("ZUI_UNKNOWN_OWNER");
    this.cacheOwnerId1 = this.cacheOwnerId0;
    this.cacheOwner1 = this.cacheOwner0;
    this.cacheOwnerId0 = ownerId;
    this.cacheOwner0 = owner;
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
    this.cacheOwnerId1 = this.cacheOwnerId0;
    this.cacheOwner1 = this.cacheOwner0;
    this.cacheOwnerId0 = id;
    this.cacheOwner0 = owner;
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
    const last = result.length === 0 ? null : result[result.length - 1]!;
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
    const lastId = result.length === 0 ? null : result[result.length - 1]!.id;
    if (lastId !== parent.lastChild) throw new Error("ZUI_INDEX_CORRUPT");
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

  linkChild(
    nodeId: NodeId,
    parentId: NodeId,
    beforeId: NodeId | null,
    cachedNode?: FlatNode,
    cachedParent?: FlatNode
  ): void {
    const node = cachedNode ?? this.getNode(nodeId);
    const parent = cachedParent ?? this.getNode(parentId);
    if (node.disposed || parent.disposed) throw new Error("ZUI_NODE_DISPOSED");
    if (node.rootId !== parent.rootId) throw new Error("ZUI_ROOT_MISMATCH");
    if (nodeId === parentId || (node.firstChild !== null && this.isDescendant(nodeId, parentId))) throw new Error("ZUI_INDEX_CYCLE");
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

  /** Links a freshly created child to parent without redundant ancestor/disposed validation. */
  linkCreatedChild(
    nodeId: NodeId,
    parentId: NodeId,
    beforeId: NodeId | null,
    node: FlatNode,
    parent: FlatNode
  ): void {
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
    finalRecords: readonly FlatNode[],
    trusted = false
  ): void {
    const parent = this.getNode(parentId);
    if (finalRecords.length !== originalRecords.length) throw new Error("ZUI_INVALID_CHILD_ORDER");

    if (!trusted) {
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
    }

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
    if (this.cacheId0 === nodeId) { this.cacheId0 = 0; this.cacheNode0 = undefined; }
    if (this.cacheId1 === nodeId) { this.cacheId1 = 0; this.cacheNode1 = undefined; }
    if (this.cacheId2 === nodeId) { this.cacheId2 = 0; this.cacheNode2 = undefined; }
    if (this.cacheId3 === nodeId) { this.cacheId3 = 0; this.cacheNode3 = undefined; }
    if (this.maxTombstones === 0) {
      this.nodes.delete(nodeId);
      return;
    }
    this.nodeTombstones.set(nodeId, true);
    this.rememberTombstone("node", nodeId);
  }

  private rememberOwnerTombstone(ownerId: OwnerId): void {
    if (this.cacheOwnerId0 === ownerId) { this.cacheOwnerId0 = 0; this.cacheOwner0 = undefined; }
    if (this.cacheOwnerId1 === ownerId) { this.cacheOwnerId1 = 0; this.cacheOwner1 = undefined; }
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
        if (this.cacheId0 === oldest.id) { this.cacheId0 = 0; this.cacheNode0 = undefined; }
        if (this.cacheId1 === oldest.id) { this.cacheId1 = 0; this.cacheNode1 = undefined; }
        if (this.cacheId2 === oldest.id) { this.cacheId2 = 0; this.cacheNode2 = undefined; }
        if (this.cacheId3 === oldest.id) { this.cacheId3 = 0; this.cacheNode3 = undefined; }
      } else {
        this.ownerTombstones.delete(oldest.id);
        this.owners.delete(oldest.id);
        if (this.cacheOwnerId0 === oldest.id) { this.cacheOwnerId0 = 0; this.cacheOwner0 = undefined; }
        if (this.cacheOwnerId1 === oldest.id) { this.cacheOwnerId1 = 0; this.cacheOwner1 = undefined; }
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
  | { kind: "insert"; nodeId: NodeId; parentId: NodeId; beforeId: NodeId | null; cachedNode?: FlatNode; cachedParent?: FlatNode }
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
      movingRecords?: FlatNode[];
      beforeRecords?: Array<FlatNode | null>;
    }
  | { kind: "props"; nodeId: NodeId; previous: Record<string, any>; next: Record<string, any>; changedKeys: string[] }
  | { kind: "text"; nodeId: NodeId; value: string; cachedNode?: FlatNode; previous?: string }
  | { kind: "meta"; nodeId: NodeId; patch: Partial<Pick<FlatNode, "key" | "type" | "props" | "value" | "payload">> }
  | { kind: "remove"; nodeId: NodeId };

const blockedHTMLProperties = new Set(["innerhtml", "outerhtml", "srcdoc"]);
const urlProperties = new Set(["href", "xlink:href", "xlinkhref", "src", "action", "formaction", "poster", "data"]);

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

const svgTags = new Set([
  "circle", "ellipse", "line", "path", "polygon", "polyline", "rect",
  "g", "defs", "symbol", "use", "animate", "animateMotion", "animateTransform",
  "clipPath", "desc", "feBlend", "feColorMatrix", "feComponentTransfer",
  "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap",
  "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG",
  "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode",
  "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
  "feSpotLight", "feTile", "feTurbulence", "filter", "foreignObject",
  "linearGradient", "marker", "mask", "metadata", "mpath", "pattern",
  "radialGradient", "stop", "switch", "textPath", "tspan", "view"
]);

function isKnownSVGTag(tag: string): boolean {
  return svgTags.has(tag) || svgTags.has(tag.toLowerCase());
}

const xlinkAttributes: Record<string, string> = {
  "xlink:href": "xlink:href",
  "xlinkHref": "xlink:href",
  "xlink:title": "xlink:title",
  "xlinkTitle": "xlink:title",
  "xlink:show": "xlink:show",
  "xlinkShow": "xlink:show",
  "xlink:actuate": "xlink:actuate",
  "xlinkActuate": "xlink:actuate",
  "xlink:role": "xlink:role",
  "xlinkRole": "xlink:role",
  "xlink:arcrole": "xlink:arcrole",
  "xlinkArcrole": "xlink:arcrole",
  "xlink:type": "xlink:type",
  "xlinkType": "xlink:type"
};

const xmlAttributes: Record<string, string> = {
  "xml:space": "xml:space",
  "xmlSpace": "xml:space",
  "xml:lang": "xml:lang",
  "xmlLang": "xml:lang"
};

const svgHyphenatedAttributes: Record<string, string> = {
  strokeWidth: "stroke-width",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  fillRule: "fill-rule",
  fillOpacity: "fill-opacity",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  vectorEffect: "vector-effect",
  fontFamily: "font-family",
  fontSize: "font-size",
  textAnchor: "text-anchor",
  dominantBaseline: "dominant-baseline",
  shapeRendering: "shape-rendering",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  lightingColor: "lighting-color",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity"
};

const svgCamelCaseAttributes: Record<string, string> = {
  viewbox: "viewBox",
  viewBox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  preserveAspectRatio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradientUnits: "gradientUnits",
  gradienttransform: "gradientTransform",
  gradientTransform: "gradientTransform",
  clippathunits: "clipPathUnits",
  clipPathUnits: "clipPathUnits",
  maskunits: "maskUnits",
  maskUnits: "maskUnits",
  maskcontentunits: "maskContentUnits",
  maskContentUnits: "maskContentUnits",
  patternunits: "patternUnits",
  patternUnits: "patternUnits",
  patterncontentunits: "patternContentUnits",
  patternContentUnits: "patternContentUnits",
  patterntransform: "patternTransform",
  patternTransform: "patternTransform",
  spreadmethod: "spreadMethod",
  spreadMethod: "spreadMethod",
  markerunits: "markerUnits",
  markerUnits: "markerUnits",
  markerwidth: "markerWidth",
  markerWidth: "markerWidth",
  markerheight: "markerHeight",
  markerHeight: "markerHeight",
  refx: "refX",
  refX: "refX",
  refy: "refY",
  refY: "refY",
  tablevalues: "tableValues",
  tableValues: "tableValues",
  stddeviation: "stdDeviation",
  stdDeviation: "stdDeviation",
  basefrequency: "baseFrequency",
  baseFrequency: "baseFrequency",
  numoctaves: "numOctaves",
  numOctaves: "numOctaves",
  stitchtiles: "stitchTiles",
  stitchTiles: "stitchTiles",
  surfacescale: "surfaceScale",
  surfaceScale: "surfaceScale",
  specularconstant: "specularConstant",
  specularConstant: "specularConstant",
  specularexponent: "specularExponent",
  specularExponent: "specularExponent",
  kernelmatrix: "kernelMatrix",
  kernelMatrix: "kernelMatrix",
  kernelunitlength: "kernelUnitLength",
  kernelUnitLength: "kernelUnitLength",
  targetx: "targetX",
  targetX: "targetX",
  targety: "targetY",
  targetY: "targetY",
  edgemode: "edgeMode",
  edgeMode: "edgeMode",
  limitingconeangle: "limitingConeAngle",
  limitingConeAngle: "limitingConeAngle",
  pointsatx: "pointsAtX",
  pointsAtX: "pointsAtX",
  pointsaty: "pointsAtY",
  pointsAtY: "pointsAtY",
  pointsatz: "pointsAtZ",
  pointsAtZ: "pointsAtZ",
  diffuseconstant: "diffuseConstant",
  diffuseConstant: "diffuseConstant",
  xchannelselector: "xChannelSelector",
  xChannelSelector: "xChannelSelector",
  ychannelselector: "yChannelSelector",
  yChannelSelector: "yChannelSelector"
};
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

function validateProperty(name: string, value: unknown): void {
  const classification = classifyProperty(name);
  if (classification.blockedHTML) throw new Error("ZUI_UNSAFE_HTML_PROP");
  if (classification.event && value != null && typeof value !== "function") {
    throw new Error("ZUI_UNSAFE_EVENT_PROP");
  }
  if (isUnsafeUrlProperty(name, value)) throw new Error("ZUI_UNSAFE_URL_PROP");
}

export class PatchTransaction {
  private readonly operations: PatchOp[] = [];
  private readonly created: NodeId[] = [];
  private readonly startNodeId: NodeId;
  private committed = false;
  private onlyTextOperations = true;
  private onlyCreatedOperations = true;
  private hasRemovals = false;
  private lastCreatedId = 0;
  private lastCreatedNode: FlatNode | undefined;

  constructor(private readonly engine: PatchEngine, readonly rootId: RootId) {
    this.startNodeId = engine.registry.nextId;
  }

  private isCreated(nodeId: NodeId): boolean {
    return nodeId >= this.startNodeId;
  }

  createElement(
    ownerId: OwnerId,
    tag: string,
    type?: string | ((props: any) => any),
    key?: Key,
    props?: Record<string, any>,
    value?: unknown,
    parentId?: NodeId | null
  ): NodeId {
    const ns = this.engine.resolveNamespace(parentId, tag);
    let element: Element;
    if (ns) {
      element = this.engine.document.createElementNS(ns, tag);
    } else if (props?.is) {
      element = this.engine.document.createElement(tag, { is: String(props.is) });
      element.setAttribute("is", String(props.is));
    } else {
      element = this.engine.document.createElement(tag);
    }
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "element", domStart: element, type, key, props, value, isSvg: ns === SVG_NAMESPACE
    });
    this.recordCreated(id);
    return id;
  }

  createText(ownerId: OwnerId, value: string): NodeId {
    const text = this.engine.document.createTextNode(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "text", domStart: text, value
    });
    this.recordCreated(id);
    return id;
  }

  createComment(ownerId: OwnerId, value: string): NodeId {
    const comment = this.engine.document.createComment(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "comment", domStart: comment, value
    });
    this.recordCreated(id);
    return id;
  }

  createBoundary(ownerId: OwnerId, startValue = "zui:start", endValue = "zui:end", key?: Key): NodeId {
    const start = this.engine.document.createComment(startValue);
    const end = this.engine.document.createComment(endValue);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "boundary", domStart: start, domEnd: end, key
    });
    this.recordCreated(id);
    return id;
  }

  insert(
    nodeId: NodeId,
    parentId: NodeId,
    beforeId: NodeId | null = null,
    cachedNode?: FlatNode,
    cachedParent?: FlatNode
  ): void {
    const node = cachedNode ?? (nodeId === this.lastCreatedId ? this.lastCreatedNode : undefined);
    const parent = cachedParent ?? (parentId === this.lastCreatedId ? this.lastCreatedNode : undefined);
    this.pushOperation({ kind: "insert", nodeId, parentId, beforeId, cachedNode: node, cachedParent: parent });
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
    const node = this.engine.registry.getNode(nodeId);
    const dom = node.domStart;
    for (const name in previous) {
      if (!Object.prototype.hasOwnProperty.call(previous, name) || name === "children" || name === "key") continue;
      if (!Object.is(previous[name], next[name])) {
        (changedKeys ??= []).push(name);
      } else if (name === "value" && (dom instanceof HTMLInputElement || dom instanceof HTMLTextAreaElement || dom instanceof HTMLSelectElement)) {
        const expected = next[name] == null ? "" : String(next[name]);
        if ((dom as any).value !== expected) (changedKeys ??= []).push(name);
      } else if (name === "checked" && dom instanceof HTMLInputElement) {
        if (dom.checked !== Boolean(next[name])) (changedKeys ??= []).push(name);
      }
    }
    for (const name in next) {
      if (!Object.prototype.hasOwnProperty.call(next, name) || name === "children" || name === "key") continue;
      if (!Object.prototype.hasOwnProperty.call(previous, name)) {
        (changedKeys ??= []).push(name);
      }
    }
    if (changedKeys) this.pushOperation({ kind: "props", nodeId, previous, next, changedKeys });
  }

  patchInitialProps(nodeId: NodeId, props: Record<string, any>, cachedRecord?: FlatNode): void {
    const record = cachedRecord ?? this.engine.registry.getNode(nodeId);
    const deferredKeys = this.engine.applyInitialAttributes(record, props);
    if (deferredKeys) this.pushOperation({ kind: "props", nodeId, previous: {}, next: props, changedKeys: deferredKeys });
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
      // Creating records is already an observable registry mutation. A
      // transaction that never schedules any patch must not leak those nodes.
      this.rollback();
      this.committed = true;
      return;
    }
    if (this.onlyTextOperations) {
      this.commitTextOnly();
      return;
    }
    if (this.onlyCreatedOperations && !this.hasRemovals) {
      try {
        this.commitCreatedOnly();
        return;
      } catch (error) {
        this.rollback();
        throw error;
      }
    }
    this.validate();
    const removals = this.hasRemovals ? this.operations.filter(op => op.kind === "remove") : undefined;
    const changes = removals ? this.operations.filter(op => op.kind !== "remove") : this.operations;
    // Fresh records are discarded as a subtree if commit fails, so per-op
    // undo closures are unnecessary when this transaction only touches them.
    const undo: Array<() => void> | undefined = this.onlyCreatedOperations ? undefined : [];
    const deferredRefs: Array<() => void> = [];
    let operationIndex = 0;
    let refIndex = 0;
    try {
      // Ref callbacks on fresh nodes run after their newly-built DOM subtree is
      // attached. A callback may enqueue more work into this same transaction,
      // so keep consuming operations before advancing to the next callback.
      while (operationIndex < changes.length || refIndex < deferredRefs.length) {
        if (operationIndex >= changes.length) {
          deferredRefs[refIndex++]!();
          continue;
        }
        const operation = changes[operationIndex++]!;
        if (operation.kind === "move-many") {
          if (undo) undo.push(() => this.engine.restoreChildrenOrder(operation.parentId, operation.originalIds));
          this.engine.moveChildren(
            operation.parentId,
            operation.movingIds,
            operation.beforeIds,
            operation.originalRecords!,
            operation.finalRecords!,
            operation.movingRecords!,
            operation.beforeRecords!
          );
          continue;
        }
        const needsUndo = undo !== undefined && !this.isCreated(operation.nodeId);
        if (operation.kind === "insert") {
          if (needsUndo) undo!.push(() => this.engine.detachRange(operation.nodeId));
          this.engine.insertRange(
            operation.nodeId,
            operation.parentId,
            operation.beforeId,
            operation.cachedNode,
            operation.cachedParent
          );
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
          const attachRef = this.engine.applyProps(
            operation.nodeId,
            operation.previous,
            operation.next,
            operation.changedKeys,
            this.isCreated(operation.nodeId)
          );
          if (attachRef) deferredRefs.push(attachRef);
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
    for (let index = this.created.length - 1; index >= 0; index--) {
      const nodeId = this.created[index]!;
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
        const previous = typeof node.value === "string" ? node.value : (node.domStart as CharacterData).data;
        operation.previous = previous;
        appliedCount = index + 1;
        this.engine.applyText(operation.nodeId, operation.value, node, previous);
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

  private commitCreatedOnly(): void {
    const operations = this.operations;
    const deferredRefs: Array<() => void> = [];
    let operationIndex = 0;
    let refIndex = 0;

    while (operationIndex < operations.length || refIndex < deferredRefs.length) {
      if (operationIndex >= operations.length) {
        deferredRefs[refIndex++]!();
        continue;
      }
      const operation = operations[operationIndex++]!;
      if (operation.kind === "insert") {
        const nodeId = operation.nodeId;
        const parentId = operation.parentId;
        if (nodeId === parentId) throw new Error("ZUI_TRANSACTION_CYCLE");

        const node = operation.cachedNode ?? this.engine.registry.getNode(nodeId);
        if (node.parentId !== null) {
          throw new Error("ZUI_TRANSACTION_DUPLICATE_INSERT");
        }

        const parent = operation.cachedParent ?? this.engine.registry.getNode(parentId);
        if (parent.rootId !== this.rootId || parent.disposed) throw new Error("ZUI_TRANSACTION_PARENT");

        if (operation.beforeId !== null) {
          const before = this.engine.registry.getNode(operation.beforeId);
          if (before.rootId !== this.rootId || before.disposed) throw new Error("ZUI_TRANSACTION_ANCHOR");
          if (operation.beforeId === nodeId || before.parentId !== parentId) {
            throw new Error("ZUI_INVALID_ANCHOR");
          }
        }

        if (node.firstChild !== null) {
          let ancestor: NodeId | null = parentId;
          while (ancestor !== null) {
            if (ancestor === nodeId) throw new Error("ZUI_TRANSACTION_CYCLE");
            ancestor = this.engine.registry.getNode(ancestor).parentId;
          }
        }

        this.engine.insertCreatedRange(nodeId, parentId, operation.beforeId, node, parent);
      } else if (operation.kind === "props") {
        const node = this.engine.registry.getNode(operation.nodeId);
        if (node.kind !== "element") throw new Error("ZUI_TRANSACTION_PROPS");
        for (const name of operation.changedKeys) {
          validateProperty(name, operation.next[name]);
        }
        const attachRef = this.engine.applyProps(
          operation.nodeId,
          operation.previous,
          operation.next,
          operation.changedKeys,
          true
        );
        if (attachRef) deferredRefs.push(attachRef);
      } else if (operation.kind === "text") {
        const node = operation.cachedNode ?? this.engine.registry.getNode(operation.nodeId);
        if (node.kind !== "text") throw new Error("ZUI_TRANSACTION_TEXT");
        this.engine.applyText(operation.nodeId, operation.value, node);
      } else if (operation.kind === "meta") {
        this.engine.registry.updateNode(operation.nodeId, operation.patch);
      }
    }
    this.committed = true;
  }

  private pushOperation(operation: PatchOp): void {
    if (operation.kind !== "text") this.onlyTextOperations = false;
    if (operation.kind === "remove") this.hasRemovals = true;
    if (operation.kind !== "move-many" && !this.isCreated(operation.nodeId)) this.onlyCreatedOperations = false;
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
        const newLeafInsert = this.isCreated(operation.nodeId) && !projectedChildren.has(operation.nodeId);
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
          validateProperty(name, operation.next[name]);
        }
      }
    }
  }

  private recordCreated(nodeId: NodeId, node?: FlatNode): void {
    this.created.push(nodeId);
    this.lastCreatedId = nodeId;
    this.lastCreatedNode = node ?? this.engine.registry.getNode(nodeId);
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
    if (originalRecords.length !== operation.originalIds.length) {
      throw new Error("ZUI_INDEX_CORRUPT");
    }
    const indexesById = new Map<NodeId, number>();
    for (let index = 0; index < originalRecords.length; index++) {
      const record = originalRecords[index]!;
      if (record.id !== operation.originalIds[index] || record.rootId !== this.rootId) {
        throw new Error("ZUI_INDEX_CORRUPT");
      }
      indexesById.set(record.id, index);
    }

    const seenFinalIndexes = new Uint8Array(originalRecords.length);
    const finalRecords = new Array<FlatNode>(operation.finalIds.length);
    for (let index = 0; index < operation.finalIds.length; index++) {
      const originalIndex = indexesById.get(operation.finalIds[index]!);
      if (originalIndex === undefined || seenFinalIndexes[originalIndex] !== 0) {
        throw new Error("ZUI_INVALID_CHILD_ORDER");
      }
      seenFinalIndexes[originalIndex] = 1;
      finalRecords[index] = originalRecords[originalIndex]!;
    }

    const movedIndexes = new Uint8Array(originalRecords.length);
    const movingRecords = new Array<FlatNode>(operation.movingIds.length);
    const beforeRecords = new Array<FlatNode | null>(operation.movingIds.length);
    for (let index = 0; index < operation.movingIds.length; index++) {
      const nodeId = operation.movingIds[index]!;
      const beforeId = operation.beforeIds[index]!;
      const originalIndex = indexesById.get(nodeId);
      if (originalIndex === undefined || movedIndexes[originalIndex] !== 0 || beforeId === nodeId) {
        throw new Error("ZUI_INVALID_MOVE");
      }
      movedIndexes[originalIndex] = 1;
      movingRecords[index] = originalRecords[originalIndex]!;
      if (beforeId === null) beforeRecords[index] = null;
      else {
        const beforeIndex = indexesById.get(beforeId);
        if (beforeIndex === undefined) throw new Error("ZUI_INVALID_ANCHOR");
        beforeRecords[index] = originalRecords[beforeIndex]!;
      }
    }
    operation.originalRecords = originalRecords;
    operation.finalRecords = finalRecords;
    operation.movingRecords = movingRecords;
    operation.beforeRecords = beforeRecords;
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
    const parentDom = (parent.kind === "root" || parent.kind === "element") ? (parent.domStart as Node) : this.parentDom(parent);
    const beforeDom = beforeId === null ? (parent.kind === "boundary" ? parent.domEnd : null) : this.registry.getNode(beforeId).domStart;
    if (!node.domStart.parentNode && (node.domEnd === node.domStart || !node.domEnd.parentNode)) {
      if (beforeDom === null) parentDom.appendChild(node.domStart);
      else parentDom.insertBefore(node.domStart, beforeDom);
      if (node.domEnd !== node.domStart) {
        if (beforeDom === null) parentDom.appendChild(node.domEnd);
        else parentDom.insertBefore(node.domEnd, beforeDom);
      }
    } else {
      const fragment = this.extractRange(node);
      if (beforeDom === null) parentDom.appendChild(fragment);
      else parentDom.insertBefore(fragment, beforeDom);
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
    const parentDom = (parent.kind === "root" || parent.kind === "element") ? (parent.domStart as Node) : this.parentDom(parent);
    const beforeDom = beforeId === null ? (parent.kind === "boundary" ? parent.domEnd : null) : this.registry.getNode(beforeId).domStart;
    if (node.kind !== "boundary") {
      if (beforeDom === null) parentDom.appendChild(node.domStart);
      else parentDom.insertBefore(node.domStart, beforeDom);
    } else {
      if (beforeDom === null) {
        parentDom.appendChild(node.domStart);
        parentDom.appendChild(node.domEnd);
      } else {
        parentDom.insertBefore(node.domStart, beforeDom);
        parentDom.insertBefore(node.domEnd, beforeDom);
      }
    }
    this.registry.linkCreatedChild(nodeId, parentId, beforeId, node, parent);
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
    movingRecords: FlatNode[],
    beforeRecords: Array<FlatNode | null>
  ): void {
    const parent = this.registry.getNode(parentId);
    const parentDom = this.parentDom(parent);
    const parentAnchor = this.parentAnchor(parent);
    const focus = this.captureFocusInRecords(parentDom, movingRecords);

    try {
      for (let index = 0; index < movingIds.length; index++) {
        const node = movingRecords[index]!;
        const beforeId = beforeIds[index]!;
        if (node.disposed || node.parentId !== parentId) throw new Error("ZUI_TRANSACTION_NODE");
        const before = beforeRecords[index] ?? undefined;
        if (beforeId !== null && (!before || before.disposed || before.parentId !== parentId)) {
          throw new Error("ZUI_TRANSACTION_ANCHOR");
        }
        const beforeDom = before?.domStart ?? parentAnchor;
        if (node.domStart === node.domEnd) parentDom.insertBefore(node.domStart, beforeDom);
        else parentDom.insertBefore(this.extractRange(node), beforeDom);
      }
      this.registry.reorderChildRecords(parentId, originalRecords, finalRecords, true);
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
    validateProperty(name, value);
    const element = node.domStart as Element;
    if (element.namespaceURI === SVG_NAMESPACE) {
      this.setSvgProperty(node, element as SVGElement, name, value);
      node.version++;
      return;
    }
    const isCustom = element.localName.includes("-") || element.hasAttribute("is") || Boolean(node.props?.is);
    if (isCustom) {
      this.setCustomElementProperty(node, element, name, value);
      node.version++;
      return;
    }
    this.setHtmlProperty(node, element as HTMLElement, name, value);
    node.version++;
  }

  private setSvgProperty(node: FlatNode, element: SVGElement, name: string, value: unknown): void {
    if (name === "className" || name === "class") {
      this.setAttribute(element, "class", value);
      return;
    }
    if (name === "style") {
      this.applyStyle(node, element, value);
      return;
    }
    if (name in xlinkAttributes) {
      const qualified = xlinkAttributes[name]!;
      const local = qualified.slice(6);
      if (value == null || value === false) {
        element.removeAttributeNS(XLINK_NAMESPACE, local);
        element.removeAttribute(qualified);
      } else {
        element.setAttributeNS(XLINK_NAMESPACE, qualified, String(value));
      }
      return;
    }
    if (name in xmlAttributes) {
      const qualified = xmlAttributes[name]!;
      const local = qualified.slice(4);
      if (value == null || value === false) {
        element.removeAttributeNS(XML_NAMESPACE, local);
        element.removeAttribute(qualified);
      } else {
        element.setAttributeNS(XML_NAMESPACE, qualified, String(value));
      }
      return;
    }
    if (name === "xmlns:xlink" || name === "xmlnsXlink") {
      if (value == null || value === false) {
        element.removeAttributeNS(XMLNS_NAMESPACE, "xlink");
        element.removeAttribute("xmlns:xlink");
      } else {
        element.setAttributeNS(XMLNS_NAMESPACE, "xmlns:xlink", String(value));
      }
      return;
    }
    const attrName = svgHyphenatedAttributes[name] ?? svgCamelCaseAttributes[name] ?? name;
    this.setAttribute(element, attrName, value);
  }

  private setCustomElementProperty(node: FlatNode, element: Element, name: string, value: unknown): void {
    if (name === "className" || name === "class") {
      element.className = stringify(value);
      return;
    }
    if (name === "style") {
      this.applyStyle(node, element as unknown as ElementCSSInlineStyle, value);
      return;
    }
    if (name === "role") {
      if (value == null || value === false) {
        element.removeAttribute("role");
        if ("role" in element) try { (element as any).role = null; } catch {}
      } else {
        element.setAttribute("role", String(value));
        if ("role" in element) try { (element as any).role = String(value); } catch {}
      }
      return;
    }
    if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
      (element as any)[name] = value;
    } else if (typeof value === "boolean") {
      (element as any)[name] = value;
      if (value) element.setAttribute(name, "");
      else element.removeAttribute(name);
    } else {
      if (name in element) {
        try { (element as any)[name] = value; } catch {}
      }
      this.setAttribute(element, name, value);
    }
  }

  private setHtmlProperty(node: FlatNode, element: HTMLElement, name: string, value: unknown): void {
    if (name === "className" || name === "class") {
      element.className = stringify(value);
    } else if (name === "style") {
      this.applyStyle(node, element, value);
    } else if (name === "value") {
      const normalized = value == null ? "" : String(value);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        if ((element as any).value !== normalized) (element as any).value = normalized;
      } else if (element instanceof HTMLOptionElement) {
        if (element.value !== normalized) element.value = normalized;
        this.setAttribute(element, "value", value);
      } else {
        this.setAttribute(element, "value", value);
      }
    } else if (name === "checked") {
      const bool = Boolean(value);
      if (element instanceof HTMLInputElement && element.checked !== bool) element.checked = bool;
      if (bool) element.setAttribute("checked", "");
      else element.removeAttribute("checked");
    } else if (name === "disabled") {
      const bool = Boolean(value);
      if ("disabled" in element && (element as any).disabled !== bool) (element as any).disabled = bool;
      if (bool) element.setAttribute("disabled", "");
      else element.removeAttribute("disabled");
    } else if (name === "selected") {
      const bool = Boolean(value);
      if (element instanceof HTMLOptionElement && element.selected !== bool) element.selected = bool;
      if (bool) element.setAttribute("selected", "");
      else element.removeAttribute("selected");
    } else if (name === "indeterminate") {
      const bool = Boolean(value);
      if (element instanceof HTMLInputElement && element.indeterminate !== bool) element.indeterminate = bool;
    } else if (name === "readOnly" || name === "readonly") {
      const bool = Boolean(value);
      if ("readOnly" in element && (element as any).readOnly !== bool) (element as any).readOnly = bool;
      if (bool) element.setAttribute("readonly", "");
      else element.removeAttribute("readonly");
    } else if (name === "required") {
      const bool = Boolean(value);
      if ("required" in element && (element as any).required !== bool) (element as any).required = bool;
      if (bool) element.setAttribute("required", "");
      else element.removeAttribute("required");
    } else if (name === "multiple") {
      const bool = Boolean(value);
      if ("multiple" in element && (element as any).multiple !== bool) (element as any).multiple = bool;
      if (bool) element.setAttribute("multiple", "");
      else element.removeAttribute("multiple");
    } else if (name === "autoFocus" || name === "autofocus") {
      const bool = Boolean(value);
      if ("autofocus" in element && (element as any).autofocus !== bool) (element as any).autofocus = bool;
      if (bool) element.setAttribute("autofocus", "");
      else element.removeAttribute("autofocus");
    } else if (name === "formNoValidate" || name === "formnovalidate") {
      const bool = Boolean(value);
      if ("formNoValidate" in element && (element as any).formNoValidate !== bool) (element as any).formNoValidate = bool;
      if (bool) element.setAttribute("formnovalidate", "");
      else element.removeAttribute("formnovalidate");
    } else if (name === "htmlFor" || name === "for") {
      if (value == null) element.removeAttribute("for");
      else element.setAttribute("for", String(value));
      if ("htmlFor" in element) (element as any).htmlFor = String(value ?? "");
    } else if (name === "tabIndex" || name === "tabindex") {
      if (value == null) {
        element.removeAttribute("tabindex");
      } else {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          if ("tabIndex" in element) (element as any).tabIndex = num;
          element.setAttribute("tabindex", String(num));
        }
      }
    } else if (name === "role") {
      if (value == null || value === false) {
        element.removeAttribute("role");
        if ("role" in element) try { (element as any).role = null; } catch {}
      } else {
        element.setAttribute("role", String(value));
        if ("role" in element) try { (element as any).role = String(value); } catch {}
      }
    } else if (name in element && !name.startsWith("aria-") && !name.startsWith("data-")) {
      try { (element as any)[name] = value ?? ""; }
      catch { this.setAttribute(element, name, value); }
    } else {
      this.setAttribute(element, name, value);
    }
  }

  private applyStyle(node: FlatNode, element: ElementCSSInlineStyle, value: unknown): void {
    const next = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const previous = node.styleSnapshot;
    const style = element.style;
    for (const prop of Object.keys(previous ?? {})) {
      if (prop in next) continue;
      if (prop.startsWith("--")) style.removeProperty(prop);
      else (style as any)[prop] = "";
    }
    for (const [prop, entry] of Object.entries(next)) {
      if (Object.is(previous?.[prop], entry)) continue;
      if (prop.startsWith("--")) style.setProperty(prop, stringify(entry));
      else (style as any)[prop] = entry ?? "";
    }
    node.styleSnapshot = Object.keys(next).length > 0 ? { ...next } : undefined;
  }

  private setAttribute(element: Element, name: string, value: unknown): void {
    if (name.startsWith("aria-")) {
      if (typeof value === "boolean") {
        element.setAttribute(name, value ? "true" : "false");
        return;
      }
      if (value == null) {
        element.removeAttribute(name);
        return;
      }
      element.setAttribute(name, String(value));
      return;
    }
    if (name === "role") {
      if (value == null || value === false) element.removeAttribute("role");
      else element.setAttribute("role", String(value));
      return;
    }
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

  private captureFocusInRecords(parentDom: Node, records: readonly FlatNode[]): FocusState | undefined {
    const active = this.document.activeElement;
    if (!(active instanceof HTMLElement) || !(parentDom instanceof Element) || !parentDom.contains(active)) return undefined;
    for (const child of records) {
      if (child.domStart instanceof Element && child.domStart.contains(active)) return this.captureFocus(child);
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
