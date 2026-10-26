/**
 * Atomic batch mutation transactions and validation.
 */

import type { PatchEngine } from "./engine.js";
import type {
  Dispose,
  FlatNode,
  Key,
  NodeId,
  OwnerId,
  PatchOp,
  PortalAttachment,
  RootId,
  TransactionSavepoint
} from "./types.js";
import { SVG_NAMESPACE } from "./properties.js";
import { validateProperty } from "./security.js";

type ValidationScratch = {
  removed: Set<NodeId>;
  inserted: Set<NodeId>;
  projectedChildren: Set<NodeId>;
  projectedParents: Map<NodeId, NodeId | null>;
};

type MoveManyConflictIndex = {
  insertedParentIds: Set<NodeId>;
  movedParentIds: Set<NodeId>;
  movedNodeIds: Set<NodeId>;
  removedNodeIds: Set<NodeId>;
  moveManyParentCounts: Map<NodeId, number>;
};

// Pools are per engine, and a scratch frame stays checked out until its
// validation finishes. Reentrant validation therefore gets a distinct frame.
const validationScratchPools = new WeakMap<PatchEngine, ValidationScratch[]>();

function acquireValidationScratch(engine: PatchEngine): ValidationScratch {
  let pool = validationScratchPools.get(engine);
  if (!pool) validationScratchPools.set(engine, pool = []);
  return pool.pop() ?? {
    removed: new Set<NodeId>(),
    inserted: new Set<NodeId>(),
    projectedChildren: new Set<NodeId>(),
    projectedParents: new Map<NodeId, NodeId | null>()
  };
}

function releaseValidationScratch(engine: PatchEngine, scratch: ValidationScratch): void {
  validationScratchPools.get(engine)!.push(scratch);
}

export class PatchTransaction {
  private readonly operations: PatchOp[] = [];
  private readonly created: NodeId[] = [];
  private readonly cleanupChanges: Array<{ nodeId: NodeId; previous: Dispose | undefined }> = [];
  private readonly startNodeId: NodeId;
  private committed = false;
  private lifecycle: "OPEN" | "VALIDATING" | "COMMITTING" | "FINALIZING" | "COMMITTED" | "ABORTED" = "OPEN";
  private onlyTextOperations = true;
  private onlyCreatedOperations = true;
  private hasRemovals = false;
  private lastCreatedId = 0;
  private lastCreatedNode: FlatNode | undefined;
  private moveManyConflicts: MoveManyConflictIndex | undefined;

  constructor(private readonly engine: PatchEngine, readonly rootId: RootId) {
    this.startNodeId = engine.registry.nextId;
  }

  get ops(): readonly PatchOp[] {
    return this.operations;
  }

  get phase(): "OPEN" | "VALIDATING" | "COMMITTING" | "FINALIZING" | "COMMITTED" | "ABORTED" {
    return this.lifecycle;
  }

  /** True once finalization has begun and applied DOM/index writes cannot roll back. */
  get isIrreversible(): boolean {
    return this.lifecycle === "FINALIZING" || this.lifecycle === "COMMITTED";
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
    this.assertMutable();
    const ns = this.engine.resolveNamespace(parentId, tag);
    let element: Element;
    if (ns) {
      element = this.engine.createElementNS(ns, tag);
    } else {
      element = this.engine.createElement(tag, props?.is ? String(props.is) : undefined);
    }
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "element", domStart: element, type, key, props, value, isSvg: ns === SVG_NAMESPACE
    });
    this.recordCreated(id);
    return id;
  }

  createText(ownerId: OwnerId, value: string): NodeId {
    this.assertMutable();
    const text = this.engine.createTextNode(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "text", domStart: text, value
    });
    this.recordCreated(id);
    return id;
  }

  createComment(ownerId: OwnerId, value: string): NodeId {
    this.assertMutable();
    const comment = this.engine.createComment(value);
    const id = this.engine.registry.createNode({
      rootId: this.rootId, ownerId, kind: "comment", domStart: comment, value
    });
    this.recordCreated(id);
    return id;
  }

  createBoundary(ownerId: OwnerId, startValue = "rillio:start", endValue = "rillio:end", key?: Key): NodeId {
    this.assertMutable();
    const start = this.engine.createComment(startValue);
    const end = this.engine.createComment(endValue);
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

  placePortal(nodeId: NodeId, container: Element, attachment: PortalAttachment): void {
    this.assertMutable();
    // Portal ranges target external DOM containers, so they cannot use the
    // created-subtree insertion fast path.
    this.onlyCreatedOperations = false;
    this.pushOperation({ kind: "portal", nodeId, container, attachment });
  }

  /**
   * Batched sibling reorder for keyed lists whose children were all reused.
   * Contract: no other structural operation may overlap this batch — no
   * insert/move/remove targeting `parentId`, no move/remove of the moved ids,
   * and no second move-many on the same parent. `validate()` enforces this
   * with RILLIO_INVALID_CHILD_ORDER; the reconcilers uphold it by only batching
   * fully-reused reorderings (see reconcileChildren and renderList).
   */
  moveMany(
    parentId: NodeId,
    originalIds: NodeId[],
    finalIds: NodeId[],
    movingIds: NodeId[],
    beforeIds: Array<NodeId | null>
  ): void {
    this.assertMutable();
    if (movingIds.length === 0) return;
    this.onlyTextOperations = false;
    this.onlyCreatedOperations = false;
    const operation = { kind: "move-many", parentId, originalIds, finalIds, movingIds, beforeIds } as const;
    this.indexMoveManyConflict(operation);
    this.operations.push(operation);
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
    if (changedKeys && changedKeys.length > 0) {
      this.pushOperation({ kind: "props", nodeId, previous, next, changedKeys });
    }
  }

  patchInitialProps(nodeId: NodeId, props: Record<string, any>, cachedRecord?: FlatNode): void {
    this.assertMutable();
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
    this.assertMutable();
    this.cleanupChanges.push({ nodeId, previous: this.engine.registry.getNode(nodeId).cleanup });
    this.engine.registry.attachCleanup(nodeId, cleanup);
  }

  commit(): void {
    if (this.lifecycle !== "OPEN") throw new Error("RILLIO_TRANSACTION_REUSED");
    if (this.operations.length === 0) {
      // Creating records is already an observable registry mutation. A
      // transaction that never schedules any patch must not leak those nodes.
      this.rollback();
      this.committed = true;
      this.lifecycle = "COMMITTED";
      return;
    }

    this.lifecycle = "VALIDATING";
    let validatedOperationCount = this.validate();
    this.lifecycle = "COMMITTING";
    if (this.onlyTextOperations) {
      this.commitTextOnly();
      return;
    }
    const hasDeferredRefs = this.operations.some(operation =>
      operation.kind === "props" && this.isCreated(operation.nodeId) && operation.changedKeys.includes("ref")
    );
    if (this.onlyCreatedOperations && !this.hasRemovals && !hasDeferredRefs) {
      try {
        this.commitCreatedOnly();
        return;
      } catch (error) {
        this.rollback();
        throw error;
      }
    }
    // Fresh records are discarded as a subtree if commit fails, so per-op
    // undo closures are unnecessary when this transaction only touches them.
    let undo: Array<() => void> | undefined =
      this.onlyCreatedOperations && !hasDeferredRefs ? undefined : [];
    const deferredRefs: Array<() => void> = [];
    let operationIndex = 0;
    let refIndex = 0;
    try {
      // Ref callbacks on fresh nodes run after their newly-built DOM subtree is
      // attached. A callback may enqueue more work into this same transaction,
      // so keep consuming operations before advancing to the next callback.
      // Removals are skipped here and executed after the structural/property
      // commit, without materializing a filtered copy of the op list.
      while (operationIndex < this.operations.length || refIndex < deferredRefs.length) {
        if (validatedOperationCount < this.operations.length) {
          // A ref callback may append work after the first validation pass.
          // Revalidate the uncommitted suffix against the registry as it now
          // stands, while carrying forward removals that are still deferred.
          validatedOperationCount = this.validateFrom(operationIndex);
          // A callback can extend a created-only transaction with existing
          // nodes after the undo mode was selected.
          if (!undo && !this.onlyCreatedOperations) undo = [];
        }
        if (operationIndex >= this.operations.length) {
          deferredRefs[refIndex++]!();
          continue;
        }
      const operation = this.operations[operationIndex++]!;
      if (operation.kind === "remove") continue;
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
        if (operation.kind === "portal") {
          const previousContainer = operation.attachment.container;
          const actualPrevious = this.engine.movePortalRange(
            operation.nodeId,
            operation.container,
            operation.attachment
          );
          if (!this.isCreated(operation.nodeId) && undo) {
            const restoreContainer = actualPrevious ?? previousContainer;
            undo.push(() => this.engine.movePortalRange(operation.nodeId, restoreContainer, operation.attachment));
          }
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
      this.lifecycle = "FINALIZING";
      this.committed = true;
      let disposalFailure: unknown;
      if (this.hasRemovals) {
        for (const operation of this.operations) {
          if (operation.kind !== "remove") continue;
          try { this.engine.removeSubtree(operation.nodeId); }
          catch (error) { disposalFailure ??= error; }
        }
      }
      if (disposalFailure) throw disposalFailure;
      this.lifecycle = "COMMITTED";
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
    if (this.committed || this.lifecycle === "COMMITTED" || this.lifecycle === "ABORTED") return;
    const created = new Set(this.created);
    let failure: unknown;
    try {
      for (let index = this.created.length - 1; index >= 0; index--) {
        const nodeId = this.created[index]!;
        if (!this.engine.registry.hasNode(nodeId)) continue;
        const node = this.engine.registry.getNode(nodeId);
        if (!node.disposed) {
          try { this.engine.discardSubtree(nodeId); }
          catch (error) { failure ??= error; }
        }
      }
      const cleanupFailure = this.restoreCleanupChanges(0, created);
      failure ??= cleanupFailure;
    } finally {
      this.lifecycle = "ABORTED";
    }
    if (failure) throw failure;
  }

  savepoint(): TransactionSavepoint {
    return {
      operationsCount: this.operations.length,
      createdCount: this.created.length,
      cleanupChangesCount: this.cleanupChanges.length,
      onlyTextOperations: this.onlyTextOperations,
      onlyCreatedOperations: this.onlyCreatedOperations,
      hasRemovals: this.hasRemovals
    };
  }

  rollbackTo(savepoint: TransactionSavepoint): void {
    if (this.committed || (this.lifecycle !== "OPEN" && this.lifecycle !== "COMMITTING")) return;
    const createdSinceSavepoint = new Set(this.created.slice(savepoint.createdCount));
    let failure: unknown;
    for (let index = this.created.length - 1; index >= savepoint.createdCount; index--) {
      const nodeId = this.created[index]!;
      if (!this.engine.registry.hasNode(nodeId)) continue;
      const node = this.engine.registry.getNode(nodeId);
      if (!node.disposed) {
        try { this.engine.discardSubtree(nodeId); }
        catch (error) { failure ??= error; }
      }
    }
    const cleanupFailure = this.restoreCleanupChanges(savepoint.cleanupChangesCount, createdSinceSavepoint);
    failure ??= cleanupFailure;
    this.created.length = savepoint.createdCount;
    this.operations.length = savepoint.operationsCount;
    if (this.moveManyConflicts) this.rebuildMoveManyConflictIndex();
    this.onlyTextOperations = savepoint.onlyTextOperations;
    this.onlyCreatedOperations = savepoint.onlyCreatedOperations;
    this.hasRemovals = savepoint.hasRemovals;
    this.lastCreatedId = 0;
    this.lastCreatedNode = undefined;
    if (failure) throw failure;
  }

  private restoreCleanupChanges(startIndex: number, disposedNodes: ReadonlySet<NodeId>): unknown {
    let failure: unknown;
    for (let index = this.cleanupChanges.length - 1; index >= startIndex; index--) {
      const change = this.cleanupChanges[index]!;
      if (disposedNodes.has(change.nodeId) || !this.engine.registry.hasNode(change.nodeId)) continue;
      const node = this.engine.registry.getNode(change.nodeId);
      if (!node.disposed) {
        try { this.engine.registry.restoreCleanup(change.nodeId, change.previous); }
        catch (error) { failure ??= error; }
      }
    }
    this.cleanupChanges.length = startIndex;
    return failure;
  }

  private commitTextOnly(): void {
    const operations = this.operations as Array<Extract<PatchOp, { kind: "text" }>>;
    let appliedCount = 0;
    try {
      for (let index = 0; index < operations.length; index++) {
        const operation = operations[index]!;
        const node = operation.cachedNode ?? this.engine.registry.getNode(operation.nodeId);
        if (node.id !== operation.nodeId || node.rootId !== this.rootId || node.disposed) {
          throw new Error("RILLIO_TRANSACTION_NODE");
        }
        const previous = typeof node.value === "string" ? node.value : (node.domStart as CharacterData).data;
        operation.previous = previous;
        appliedCount = index + 1;
        this.engine.applyText(operation.nodeId, operation.value, node, previous);
      }
      this.lifecycle = "FINALIZING";
      this.committed = true;
      this.lifecycle = "COMMITTED";
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
        if (nodeId === parentId) throw new Error("RILLIO_TRANSACTION_CYCLE");

        const node = operation.cachedNode ?? this.engine.registry.getNode(nodeId);
        if (node.parentId !== null) {
          throw new Error("RILLIO_TRANSACTION_DUPLICATE_INSERT");
        }

        const parent = operation.cachedParent ?? this.engine.registry.getNode(parentId);
        if (parent.rootId !== this.rootId || parent.disposed) throw new Error("RILLIO_TRANSACTION_PARENT");

        if (operation.beforeId !== null) {
          const before = this.engine.registry.getNode(operation.beforeId);
          if (before.rootId !== this.rootId || before.disposed) throw new Error("RILLIO_TRANSACTION_ANCHOR");
          if (operation.beforeId === nodeId || before.parentId !== parentId) {
            throw new Error("RILLIO_INVALID_ANCHOR");
          }
        }

        if (node.firstChild !== null) {
          let ancestor: NodeId | null = parentId;
          while (ancestor !== null) {
            if (ancestor === nodeId) throw new Error("RILLIO_TRANSACTION_CYCLE");
            ancestor = this.engine.registry.getNode(ancestor).parentId;
          }
        }

        this.engine.insertCreatedRange(nodeId, parentId, operation.beforeId, node, parent);
      } else if (operation.kind === "props") {
        const node = this.engine.registry.getNode(operation.nodeId);
        if (node.kind !== "element") throw new Error("RILLIO_TRANSACTION_PROPS");
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
        if (node.kind !== "text") throw new Error("RILLIO_TRANSACTION_TEXT");
        this.engine.applyText(operation.nodeId, operation.value, node);
      } else if (operation.kind === "meta") {
        this.engine.registry.updateNode(operation.nodeId, operation.patch);
      }
    }
    this.lifecycle = "FINALIZING";
    this.committed = true;
    this.lifecycle = "COMMITTED";
  }

  private pushOperation(operation: PatchOp): void {
    this.assertMutable();
    if (operation.kind !== "text") this.onlyTextOperations = false;
    if (operation.kind === "remove") this.hasRemovals = true;
    if (operation.kind !== "move-many" && !this.isCreated(operation.nodeId)) {
      this.onlyCreatedOperations = false;
    }
    if (this.moveManyConflicts) this.addMoveManyConflict(operation);
    this.operations.push(operation);
  }

  private assertMutable(): void {
    if (this.lifecycle !== "OPEN" && this.lifecycle !== "COMMITTING") {
      throw new Error("RILLIO_TRANSACTION_PHASE");
    }
  }

  private validate(): number {
    return this.validateFrom(0);
  }

  private validateFrom(startIndex: number): number {
    const endIndex = this.operations.length;
    const scratch = acquireValidationScratch(this.engine);
    const { removed, inserted, projectedChildren, projectedParents } = scratch;
    removed.clear();
    inserted.clear();
    projectedChildren.clear();
    projectedParents.clear();
    const projectedParent = (nodeId: NodeId): NodeId | null =>
      projectedParents.has(nodeId)
        ? projectedParents.get(nodeId)!
        : this.engine.registry.getNode(nodeId).parentId;
    try {
      // Prefix removals are not physically applied until the end of commit,
      // but suffix operations must still observe their logical removal.
      for (let index = 0; index < startIndex; index++) {
        const operation = this.operations[index]!;
        if (operation.kind === "remove") removed.add(operation.nodeId);
      }

      for (let index = startIndex; index < endIndex; index++) {
        const operation = this.operations[index]!;
        if (operation.kind === "move-many") {
          this.validateMoveMany(operation, this.moveManyConflicts!);
          continue;
        }
        const node = this.engine.registry.getNode(operation.nodeId);
        if (node.rootId !== this.rootId || node.disposed) throw new Error("RILLIO_TRANSACTION_NODE");
        if (operation.kind === "portal") {
          if (
            node.kind !== "boundary" || node.parentId !== null ||
            !operation.container || operation.container.nodeType !== 1 ||
            typeof operation.container.appendChild !== "function" ||
            !operation.attachment || typeof operation.attachment !== "object"
          ) throw new Error("RILLIO_TRANSACTION_PORTAL");
          continue;
        }
        if (operation.kind === "remove") {
          if (removed.has(operation.nodeId)) throw new Error("RILLIO_TRANSACTION_DUPLICATE_REMOVE");
          removed.add(operation.nodeId);
          continue;
        }
        if (removed.has(operation.nodeId)) throw new Error("RILLIO_TRANSACTION_AFTER_REMOVE");
        if (operation.kind === "insert" || operation.kind === "move") {
          const parent = this.engine.registry.getNode(operation.parentId);
          if (parent.rootId !== this.rootId || parent.disposed) throw new Error("RILLIO_TRANSACTION_PARENT");
          if (operation.beforeId !== null) {
            const before = this.engine.registry.getNode(operation.beforeId);
            if (before.rootId !== this.rootId || before.disposed) throw new Error("RILLIO_TRANSACTION_ANCHOR");
            if (operation.beforeId === operation.nodeId || projectedParent(operation.beforeId) !== operation.parentId) {
              throw new Error("RILLIO_INVALID_ANCHOR");
            }
          }
          if (operation.kind === "insert" && projectedParent(operation.nodeId) !== null) {
            throw new Error("RILLIO_TRANSACTION_INSERT_ATTACHED");
          }
          if (inserted.has(operation.nodeId) && operation.kind === "insert") {
            throw new Error("RILLIO_TRANSACTION_DUPLICATE_INSERT");
          }
          if (operation.nodeId === operation.parentId) throw new Error("RILLIO_TRANSACTION_CYCLE");
          inserted.add(operation.nodeId);
          const isSameParentMove = operation.kind === "move" &&
            projectedParent(operation.nodeId) === operation.parentId;
          const newLeafInsert = this.isCreated(operation.nodeId) &&
            node.firstChild === null && !projectedChildren.has(operation.nodeId);
          if (!isSameParentMove && !newLeafInsert) {
            let ancestor: NodeId | null = operation.parentId;
            while (ancestor !== null) {
              if (ancestor === operation.nodeId) throw new Error("RILLIO_TRANSACTION_CYCLE");
              ancestor = projectedParent(ancestor);
            }
          }
          projectedParents.set(operation.nodeId, operation.parentId);
          projectedChildren.add(operation.parentId);
        }
        if (operation.kind === "text" && node.kind !== "text") throw new Error("RILLIO_TRANSACTION_TEXT");
        if (operation.kind === "props") {
          if (node.kind !== "element") throw new Error("RILLIO_TRANSACTION_PROPS");
          for (const name of operation.changedKeys) {
            validateProperty(name, operation.next[name]);
          }
        }
      }
      return endIndex;
    } finally {
      releaseValidationScratch(this.engine, scratch);
    }
  }

  private recordCreated(nodeId: NodeId, node?: FlatNode): void {
    this.created.push(nodeId);
    this.lastCreatedId = nodeId;
    this.lastCreatedNode = node ?? this.engine.registry.getNode(nodeId);
  }

  private validateMoveMany(
    operation: Extract<PatchOp, { kind: "move-many" }>,
    conflicts: MoveManyConflictIndex
  ): void {
    const parent = this.engine.registry.getNode(operation.parentId);
    if (parent.rootId !== this.rootId || parent.disposed) throw new Error("RILLIO_TRANSACTION_PARENT");
    if (operation.movingIds.length !== operation.beforeIds.length || operation.finalIds.length !== operation.originalIds.length) {
      throw new Error("RILLIO_INVALID_CHILD_ORDER");
    }
    const batchedIds = new Set(operation.originalIds);
    if (
      conflicts.insertedParentIds.has(operation.parentId) ||
      conflicts.movedParentIds.has(operation.parentId) ||
      conflicts.moveManyParentCounts.get(operation.parentId)! > 1
    ) {
      throw new Error("RILLIO_INVALID_CHILD_ORDER");
    }
    for (const nodeId of batchedIds) {
      if (conflicts.movedNodeIds.has(nodeId) || conflicts.removedNodeIds.has(nodeId)) {
        throw new Error("RILLIO_INVALID_CHILD_ORDER");
      }
    }

    const originalRecords = this.engine.registry.childRecords(operation.parentId);
    if (originalRecords.length !== operation.originalIds.length) {
      throw new Error("RILLIO_INDEX_CORRUPT");
    }
    const indexesById = new Map<NodeId, number>();
    for (let index = 0; index < originalRecords.length; index++) {
      const record = originalRecords[index]!;
      if (record.id !== operation.originalIds[index] || record.rootId !== this.rootId) {
        throw new Error("RILLIO_INDEX_CORRUPT");
      }
      indexesById.set(record.id, index);
    }

    const seenFinalIndexes = new Uint8Array(originalRecords.length);
    const finalRecords = new Array<FlatNode>(operation.finalIds.length);
    for (let index = 0; index < operation.finalIds.length; index++) {
      const originalIndex = indexesById.get(operation.finalIds[index]!);
      if (originalIndex === undefined || seenFinalIndexes[originalIndex] !== 0) {
        throw new Error("RILLIO_INVALID_CHILD_ORDER");
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
        throw new Error("RILLIO_INVALID_MOVE");
      }
      movedIndexes[originalIndex] = 1;
      movingRecords[index] = originalRecords[originalIndex]!;
      if (beforeId === null) beforeRecords[index] = null;
      else {
        const beforeIndex = indexesById.get(beforeId);
        if (beforeIndex === undefined) throw new Error("RILLIO_INVALID_ANCHOR");
        beforeRecords[index] = originalRecords[beforeIndex]!;
      }
    }
    operation.originalRecords = originalRecords;
    operation.finalRecords = finalRecords;
    operation.movingRecords = movingRecords;
    operation.beforeRecords = beforeRecords;
  }

  private indexMoveManyConflict(operation: PatchOp): void {
    if (!this.moveManyConflicts) {
      this.moveManyConflicts = {
        insertedParentIds: new Set(),
        movedParentIds: new Set(),
        movedNodeIds: new Set(),
        removedNodeIds: new Set(),
        moveManyParentCounts: new Map()
      };
      for (const existing of this.operations) this.addMoveManyConflict(existing);
    }
    this.addMoveManyConflict(operation);
  }

  private addMoveManyConflict(operation: PatchOp): void {
    const conflicts = this.moveManyConflicts!;
    if (operation.kind === "insert") conflicts.insertedParentIds.add(operation.parentId);
    else if (operation.kind === "move") {
      conflicts.movedParentIds.add(operation.parentId);
      conflicts.movedNodeIds.add(operation.nodeId);
    } else if (operation.kind === "remove") conflicts.removedNodeIds.add(operation.nodeId);
    else if (operation.kind === "move-many") {
      conflicts.moveManyParentCounts.set(
        operation.parentId,
        (conflicts.moveManyParentCounts.get(operation.parentId) ?? 0) + 1
      );
    }
  }

  private rebuildMoveManyConflictIndex(): void {
    const conflicts = this.moveManyConflicts!;
    conflicts.insertedParentIds.clear();
    conflicts.movedParentIds.clear();
    conflicts.movedNodeIds.clear();
    conflicts.removedNodeIds.clear();
    conflicts.moveManyParentCounts.clear();
    for (const operation of this.operations) this.addMoveManyConflict(operation);
  }

}
