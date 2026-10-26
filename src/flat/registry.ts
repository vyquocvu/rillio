/**
 * Flat addressable index for roots, nodes, and ownership scopes.
 */

import type {
  Dispose,
  FlatNode,
  FlatOwner,
  Key,
  NodeId,
  NodeInit,
  NodeRegistryOptions,
  OwnerHost,
  OwnerId,
  RegistryDiagnostics,
  RootHandle,
  RootId
} from "./types.js";
import { SVG_NAMESPACE } from "./properties.js";

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
      throw new RangeError("RILLIO_INVALID_TOMBSTONE_LIMIT");
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
    if (this.rootByContainer.has(container)) throw new Error("RILLIO_ROOT_OCCUPIED");

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
    if (!root) throw new Error("RILLIO_UNKNOWN_ROOT");
    return root;
  }

  rootFor(container: Element): RootHandle | undefined {
    const rootId = this.rootByContainer.get(container);
    return rootId === undefined ? undefined : this.roots.get(rootId);
  }

  createNode(init: NodeInit): NodeId {
    const owner = this.getOwner(init.ownerId);
    if (owner.disposed) throw new Error("RILLIO_OWNER_DISPOSED");
    if (owner.rootId !== init.rootId) throw new Error("RILLIO_OWNER_ROOT_MISMATCH");
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
    if (!node) throw new Error("RILLIO_UNKNOWN_NODE");
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
    if (!owner) throw new Error("RILLIO_UNKNOWN_OWNER");
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
      if (parent.rootId !== rootId || parent.disposed) throw new Error("RILLIO_OWNER_ROOT_MISMATCH");
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

  ownerNodeIds(ownerId: OwnerId): readonly NodeId[] {
    return [...this.getOwner(ownerId).nodeIds];
  }

  disposeOwner(ownerId: OwnerId): void {
    const stack: Array<{ id: OwnerId; exit: boolean }> = [{ id: ownerId, exit: false }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      const owner = this.getOwner(frame.id);
      if (!frame.exit) {
        if (owner.disposed) continue;
        owner.disposed = true;
        stack.push({ id: frame.id, exit: true });
        const children = [...owner.children];
        for (let index = children.length - 1; index >= 0; index--) {
          stack.push({ id: children[index]!, exit: false });
        }
        continue;
      }
      const parent = owner.parentId === null ? undefined : this.getOwner(owner.parentId);
      parent?.children.delete(frame.id);
      if (parent) parent.version++;
      owner.children.clear();
      owner.nodeIds.clear();
      owner.version++;
      this.rememberOwnerTombstone(frame.id);
    }
  }

  attachCleanup(nodeId: NodeId, cleanup: Dispose): void {
    const node = this.getNode(nodeId);
    const previous = node.cleanup;
    node.cleanup = previous
      ? () => { previous(); cleanup(); }
      : cleanup;
    node.version++;
  }

  restoreCleanup(nodeId: NodeId, cleanup: Dispose | undefined): void {
    const node = this.getNode(nodeId);
    node.cleanup = cleanup;
    node.version++;
  }

  updateNode(nodeId: NodeId, patch: Partial<Pick<FlatNode, "ownerId" | "key" | "type" | "props" | "value" | "payload">>): void {
    const node = this.getNode(nodeId);
    if (patch.ownerId !== undefined && patch.ownerId !== node.ownerId) {
      const oldOwner = this.getOwner(node.ownerId);
      const newOwner = this.getOwner(patch.ownerId);
      if (oldOwner.rootId !== newOwner.rootId || newOwner.disposed) {
        throw new Error("RILLIO_OWNER_ROOT_MISMATCH");
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
      if (child.parentId !== parentId || child.disposed) throw new Error("RILLIO_INDEX_CORRUPT");
      result.push(current);
      current = child.nextSibling;
    }
    const last = result.length === 0 ? null : result[result.length - 1]!;
    if (last !== parent.lastChild) throw new Error("RILLIO_INDEX_CORRUPT");
    return result;
  }

  childRecords(parentId: NodeId): FlatNode[] {
    const parent = this.getNode(parentId);
    const result: FlatNode[] = [];
    let current = parent.firstChild;
    while (current !== null) {
      const child = this.getNode(current);
      if (child.parentId !== parentId || child.disposed) throw new Error("RILLIO_INDEX_CORRUPT");
      result.push(child);
      current = child.nextSibling;
    }
    const lastId = result.length === 0 ? null : result[result.length - 1]!.id;
    if (lastId !== parent.lastChild) throw new Error("RILLIO_INDEX_CORRUPT");
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
    if (node.disposed || parent.disposed) throw new Error("RILLIO_NODE_DISPOSED");
    if (node.rootId !== parent.rootId) throw new Error("RILLIO_ROOT_MISMATCH");
    if (nodeId === parentId || (node.firstChild !== null && this.isDescendant(nodeId, parentId))) throw new Error("RILLIO_INDEX_CYCLE");
    if (beforeId !== null) {
      const before = this.getNode(beforeId);
      if (before.parentId !== parentId) throw new Error("RILLIO_INVALID_ANCHOR");
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
    if (parentId === null) throw new Error("RILLIO_INVALID_MOVE");
    const parent = this.getNode(parentId);
    if (node.disposed || parent.disposed) throw new Error("RILLIO_NODE_DISPOSED");
    if (node.rootId !== parent.rootId) throw new Error("RILLIO_ROOT_MISMATCH");
    if (beforeId !== null) {
      const before = this.getNode(beforeId);
      if (before.disposed || before.parentId !== parentId) throw new Error("RILLIO_INVALID_ANCHOR");
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
    if (finalRecords.length !== originalRecords.length) throw new Error("RILLIO_INVALID_CHILD_ORDER");

    if (!trusted) {
      let current = parent.firstChild;
      for (const child of originalRecords) {
        if (child.id !== current || child.parentId !== parentId || child.disposed || child.rootId !== parent.rootId) {
          throw new Error("RILLIO_INDEX_CORRUPT");
        }
        current = child.nextSibling;
      }
      if (current !== null) throw new Error("RILLIO_INDEX_CORRUPT");

      const remaining = new Set(originalRecords);
      for (const child of finalRecords) {
        if (!remaining.delete(child) || child.parentId !== parentId || child.disposed || child.rootId !== parent.rootId) {
          throw new Error("RILLIO_INVALID_CHILD_ORDER");
        }
      }
      if (remaining.size !== 0) throw new Error("RILLIO_INVALID_CHILD_ORDER");
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
    type Frame = { id: NodeId; nextChild: NodeId | null };
    const initial = this.getNode(nodeId);
    if (initial.disposed) return;
    const stack: Frame[] = [{ id: nodeId, nextChild: initial.firstChild }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.nextChild !== null) {
        const childId = frame.nextChild;
        const child = this.getNode(childId);
        frame.nextChild = child.nextSibling;
        if (!child.disposed) stack.push({ id: childId, nextChild: child.firstChild });
        continue;
      }
      stack.pop();
      const node = this.getNode(frame.id);
      if (node.disposed) continue;
      this.unlinkChild(frame.id);
      const owner = this.owners.get(node.ownerId);
      owner?.nodeIds.delete(frame.id);
      if (owner) owner.version++;
      node.disposed = true;
      node.version++;
      this.releaseNodeReferences(node);
      this.rememberNodeTombstone(frame.id);
    }
  }

  disposeRoot(rootId: RootId): void {
    const root = this.roots.get(rootId);
    if (!root) return;
    if (this.children(root.nodeId).length > 0) throw new Error("RILLIO_ROOT_NOT_EMPTY");
    this.disposeNode(root.nodeId);
    this.disposeOwner(root.ownerId);
    this.roots.delete(rootId);
    if (this.rootByContainer.get(root.container) === rootId) this.rootByContainer.delete(root.container);
  }

  private releaseNodeReferences(node: FlatNode): void {
    const ownerDocument = node.domStart.ownerDocument ?? globalThis.document;
    this.tombstoneAnchor ??= ownerDocument.createComment("rillio:disposed");
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
    type Frame = {
      id: NodeId;
      parentId: NodeId | null;
      entered: boolean;
      nextChild: NodeId | null;
      previousChild: NodeId | null;
    };
    const stack: Frame[] = [{
      id: root.nodeId, parentId: null, entered: false, nextChild: null, previousChild: null
    }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const node = this.getNode(frame.id);
      if (!frame.entered) {
        if (node.disposed || node.rootId !== rootId || node.parentId !== frame.parentId || seen.has(frame.id)) {
          throw new Error("RILLIO_INDEX_CORRUPT");
        }
        seen.add(frame.id);
        frame.entered = true;
        frame.nextChild = node.firstChild;
      }
      if (frame.nextChild !== null) {
        const childId = frame.nextChild;
        const child = this.getNode(childId);
        if (child.prevSibling !== frame.previousChild) throw new Error("RILLIO_INDEX_CORRUPT");
        frame.previousChild = childId;
        frame.nextChild = child.nextSibling;
        stack.push({
          id: childId, parentId: frame.id, entered: false, nextChild: null, previousChild: null
        });
      } else {
        if (node.lastChild !== frame.previousChild) throw new Error("RILLIO_INDEX_CORRUPT");
        stack.pop();
      }
    }
  }
}
