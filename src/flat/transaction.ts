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

  get ops(): readonly PatchOp[] {
    return this.operations;
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

  /**
   * Batched sibling reorder for keyed lists whose children were all reused.
   * Contract: no other structural operation may overlap this batch — no
   * insert/move/remove targeting `parentId`, no move/remove of the moved ids,
   * and no second move-many on the same parent. `validate()` enforces this
   * with ZUI_INVALID_CHILD_ORDER; the reconcilers uphold it by only batching
   * fully-reused reorderings (see reconcileChildren and renderList).
   */
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
    if (changedKeys && changedKeys.length > 0) {
      this.pushOperation({ kind: "props", nodeId, previous, next, changedKeys });
    }
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
    let validatedOperationCount = this.validate();
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
      if (this.hasRemovals) {
        for (const operation of this.operations) {
          if (operation.kind !== "remove") continue;
          try { this.engine.removeSubtree(operation.nodeId); }
          catch (error) { disposalFailure ??= error; }
        }
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

  savepoint(): TransactionSavepoint {
    return {
      operationsCount: this.operations.length,
      createdCount: this.created.length,
      onlyTextOperations: this.onlyTextOperations,
      onlyCreatedOperations: this.onlyCreatedOperations,
      hasRemovals: this.hasRemovals
    };
  }

  rollbackTo(savepoint: TransactionSavepoint): void {
    if (this.committed) return;
    for (let index = this.created.length - 1; index >= savepoint.createdCount; index--) {
      const nodeId = this.created[index]!;
      if (!this.engine.registry.hasNode(nodeId)) continue;
      const node = this.engine.registry.getNode(nodeId);
      if (!node.disposed) this.engine.discardSubtree(nodeId);
    }
    this.created.length = savepoint.createdCount;
    this.operations.length = savepoint.operationsCount;
    this.onlyTextOperations = savepoint.onlyTextOperations;
    this.onlyCreatedOperations = savepoint.onlyCreatedOperations;
    this.hasRemovals = savepoint.hasRemovals;
    this.lastCreatedId = 0;
    this.lastCreatedNode = undefined;
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
    if (operation.kind !== "move-many" && !this.isCreated(operation.nodeId)) {
      this.onlyCreatedOperations = false;
    }
    this.operations.push(operation);
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
          this.validateMoveMany(operation, endIndex);
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
          const newLeafInsert = this.isCreated(operation.nodeId) &&
            node.firstChild === null && !projectedChildren.has(operation.nodeId);
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
    candidateEndIndex = this.operations.length
  ): void {
    const parent = this.engine.registry.getNode(operation.parentId);
    if (parent.rootId !== this.rootId || parent.disposed) throw new Error("ZUI_TRANSACTION_PARENT");
    if (operation.movingIds.length !== operation.beforeIds.length || operation.finalIds.length !== operation.originalIds.length) {
      throw new Error("ZUI_INVALID_CHILD_ORDER");
    }
    const batchedIds = new Set(operation.originalIds);
    for (let candidateIndex = 0; candidateIndex < candidateEndIndex; candidateIndex++) {
      const candidate = this.operations[candidateIndex]!;
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
