/**
 * Reconciler and virtual tree planner for addressable flat DOM.
 */

import {
  longestIncreasingSubsequencePositions,
  planStationaryMoves,
  type FlatNode,
  type Key,
  type NodeId,
  type OwnerId,
  type PatchTransaction
} from "../flat.js";
import type {
  Child,
  ComponentState,
  ErrorBoundaryProps,
  FlatRoot,
  PortalState,
  VNode
} from "./types.js";
import {
  nodeRegistry,
  setActive,
  renderingDepth,
  incrementRenderingDepth,
  decrementRenderingDepth,
  pendingEffects,
  rootForId,
  snapshotComponent,
  restoreComponentSnapshot,
  renderTransaction,
  flushEffects,
  setComponentUpdater,
  getRenderTransactionSnapshot,
  getLastFailedState,
  setLastFailedState
} from "./state.js";
import { disposeComponent } from "./hooks.js";
import { PORTAL_TYPE, disposePortal } from "./portal.js";
import {
  ErrorBoundary,
  formatComponentStack,
  findNearestErrorBoundary
} from "./error-boundary.js";

export function isVNode(value: Child): value is VNode {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value;
}

export function isComponentState(value: unknown): value is ComponentState {
  return typeof value === "object" && value !== null && "nodeId" in value && "hooks" in value;
}

export function isSameVNode(record: FlatNode, value: VNode): boolean {
  return record.value !== undefined && record.type === value.type && record.key === value.key;
}

export function canReuseNode(record: FlatNode, value: Child): boolean {
  return isVNode(value) ? isSameVNode(record, value) : record.kind === "text";
}

function flattenChild(entry: Child, out: Child[]): void {
  if (Array.isArray(entry)) {
    for (let i = 0; i < entry.length; i++) flattenChild(entry[i], out);
  } else if (entry !== null && entry !== undefined && typeof entry !== "boolean") {
    out.push(entry);
  }
}

export function normalize(value: Child): Child[] {
  if (!Array.isArray(value)) {
    return value !== null && value !== undefined && typeof value !== "boolean" ? [value] : [];
  }
  let needsFlatten = false;
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (Array.isArray(entry) || entry === null || entry === undefined || typeof entry === "boolean") {
      needsFlatten = true;
      break;
    }
  }
  if (!needsFlatten) return value;
  const out: Child[] = [];
  for (let i = 0; i < value.length; i++) flattenChild(value[i], out);
  return out;
}

function mountPortal(
  value: VNode,
  parentId: NodeId,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction,
  parentRecord?: FlatNode
): NodeId {
  const container = value.props.container as Element;
  if (!container || typeof container !== "object" || (container as any).nodeType !== 1) {
    throw new Error("ZUI_INVALID_PORTAL_CONTAINER");
  }

  const placeholderId = tx.createBoundary(ownerId, "zui:portal-placeholder", "/zui:portal-placeholder", value.key);
  const portalOwner = nodeRegistry.createOwner(root.rootId, ownerId);
  const portalBoundaryId = tx.createBoundary(portalOwner, "zui:portal", "/zui:portal", value.key);
  const portalRecord = nodeRegistry.getNode(portalBoundaryId);

  const state: PortalState = {
    placeholderId,
    portalBoundaryId,
    container,
    rootId: root.rootId,
    ownerId: portalOwner,
    disposed: false
  };

  tx.placePortal(portalBoundaryId, container, state);

  nodeRegistry.updateNode(placeholderId, {
    type: PORTAL_TYPE as any,
    key: value.key,
    props: value.props,
    value,
    payload: state
  });

  tx.attachCleanup(placeholderId, () => disposePortal(state));
  tx.insert(placeholderId, parentId, null, undefined, parentRecord);

  reconcileChildren(portalBoundaryId, value.props.children as Child, portalOwner, root, tx, portalRecord);
  return placeholderId;
}

function reconcilePortal(
  placeholderId: NodeId,
  placeholder: FlatNode,
  value: VNode,
  root: FlatRoot,
  tx: PatchTransaction
): void {
  const state = placeholder.payload as PortalState | undefined;
  if (!state || state.disposed) return;

  const nextContainer = value.props.container as Element;
  if (!nextContainer || typeof nextContainer !== "object" || (nextContainer as any).nodeType !== 1) {
    throw new Error("ZUI_INVALID_PORTAL_CONTAINER");
  }

  const portalBoundary = nodeRegistry.getNode(state.portalBoundaryId);
  if (state.container !== nextContainer) {
    tx.placePortal(state.portalBoundaryId, nextContainer, state);
  }

  if (placeholder.props !== value.props) {
    tx.setMeta(placeholderId, { props: value.props, value });
  }

  reconcileChildren(state.portalBoundaryId, value.props.children as Child, state.ownerId, root, tx, portalBoundary);
}

function renderErrorBoundary(
  nodeId: NodeId,
  state: ComponentState,
  props: ErrorBoundaryProps,
  tx: PatchTransaction,
  record: FlatNode
): void {
  state.boundaryState ??= {
    error: null,
    reset: () => {
      if (state.disposed) return;
      state.boundaryState!.error = null;
      updateComponent(nodeId);
    }
  };

  const boundaryState = state.boundaryState;

  if (boundaryState.error !== null) {
    const fallbackChild = typeof props.fallback === "function"
      ? props.fallback(boundaryState.error, boundaryState.reset)
      : props.fallback;
    if (record.props !== props) tx.setMeta(nodeId, { props });
    reconcileChildren(nodeId, fallbackChild, state.ownerId, rootForId(state.rootId), tx, record);
    return;
  }

  snapshotComponent(state);
  state.props = props;

  const sp = tx.savepoint();
  const txSnapshot = getRenderTransactionSnapshot();
  const snapKeys = txSnapshot ? new Set(txSnapshot.components.keys()) : undefined;
  const effectsSnapshot = new Set(pendingEffects);

  try {
    if (record.props !== props) tx.setMeta(nodeId, { props });
    reconcileChildren(nodeId, props.children ?? null, state.ownerId, rootForId(state.rootId), tx, record);
  } catch (err) {
    const failingState = getLastFailedState() ?? state;
    setLastFailedState(undefined);
    const componentStack = formatComponentStack(failingState);
    const error = err instanceof Error ? err : new Error(String(err));
    tx.rollbackTo(sp);

    if (txSnapshot && snapKeys) {
      for (const [comp, snap] of txSnapshot.components) {
        if (!snapKeys.has(comp)) {
          if (!comp.disposed) restoreComponentSnapshot(snap);
          txSnapshot.components.delete(comp);
        }
      }
    }
    pendingEffects.clear();
    for (const eff of effectsSnapshot) pendingEffects.add(eff);

    boundaryState.error = error;
    try {
      props.onError?.(error, { componentStack });
    } catch {
      // Keep boundary resilient if onError throws
    }

    const fallbackChild = typeof props.fallback === "function"
      ? props.fallback(error, boundaryState.reset)
      : props.fallback;
    reconcileChildren(nodeId, fallbackChild, state.ownerId, rootForId(state.rootId), tx, record);
  }
}

export function mountValue(
  value: Child,
  parentId: NodeId,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction,
  parentRecord?: FlatNode
): NodeId {
  if (!isVNode(value)) {
    const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
    const nodeId = tx.createText(ownerId, text);
    if (typeof value !== "string") tx.setMeta(nodeId, { value });
    tx.insert(nodeId, parentId, null, undefined, parentRecord);
    return nodeId;
  }

  if (value.type === PORTAL_TYPE) {
    return mountPortal(value, parentId, ownerId, root, tx, parentRecord);
  }

  if (typeof value.type === "function") {
    const componentOwner = nodeRegistry.createOwner(root.rootId, ownerId);
    const state: ComponentState = {
      nodeId: 0,
      rootId: root.rootId,
      ownerId: componentOwner,
      type: value.type,
      props: value.props,
      hooks: [],
      cursor: 0,
      rendering: false,
      disposed: false
    };
    const nodeId = tx.createBoundary(componentOwner, "zui:component", "/zui:component", value.key);
    state.nodeId = nodeId;
    nodeRegistry.updateNode(nodeId, { type: value.type, key: value.key, props: value.props, value, payload: state });
    tx.attachCleanup(nodeId, () => disposeComponent(state));
    tx.insert(nodeId, parentId, null, undefined, parentRecord);
    renderComponent(nodeId, value.props, tx);
    return nodeId;
  }

  const isCustomElement = typeof value.type === "string" && (value.type.includes("-") || Boolean(value.props?.is));
  const nodeId = tx.createElement(ownerId, value.type, value.type, value.key, value.props, value, parentId);
  const record = nodeRegistry.getNode(nodeId);
  const assembleDetached = !isCustomElement;
  if (!assembleDetached) tx.insert(nodeId, parentId, null, record, parentRecord);
  tx.patchInitialProps(nodeId, value.props, record);
  const rawChildren = value.props?.children;
  if (typeof rawChildren === "string" || typeof rawChildren === "number") {
    const text = typeof rawChildren === "string" ? rawChildren : String(rawChildren);
    const textId = tx.createText(ownerId, text);
    if (typeof rawChildren !== "string") tx.setMeta(textId, { value: rawChildren });
    tx.insert(textId, nodeId, null, undefined, record);
  } else if (rawChildren != null && typeof rawChildren !== "boolean") {
    reconcileChildren(nodeId, rawChildren as Child, ownerId, root, tx, record);
  }
  if (assembleDetached) {
    tx.insert(nodeId, parentId, null, record, parentRecord);
  }
  return nodeId;
}

export function renderComponent(nodeId: NodeId, props: Record<string, any>, tx: PatchTransaction): void {
  const record = nodeRegistry.getNode(nodeId);
  const state = record.payload;
  if (!isComponentState(state)) throw new Error("ZUI_COMPONENT_STATE");
  if (state.rendering) throw new Error("ZUI_RENDER_PHASE_UPDATE");

  if (state.type === ErrorBoundary) {
    renderErrorBoundary(nodeId, state, props as ErrorBoundaryProps, tx, record);
    return;
  }

  snapshotComponent(state);
  const previous = setActive(state);
  state.parentComponent = previous;
  state.props = props;
  state.cursor = 0;
  state.rendering = true;
  incrementRenderingDepth();
  let result: Child;
  try {
    result = state.type(props);
    if (state.hookCount === undefined) state.hookCount = state.cursor;
    else if (state.cursor !== state.hookCount) throw new Error("ZUI_HOOK_ORDER");
    if (record.props !== props) tx.setMeta(nodeId, { props });
    reconcileChildren(nodeId, result, state.ownerId, rootForId(state.rootId), tx, record);
  } catch (error) {
    if (!getLastFailedState()) setLastFailedState(state);
    throw error;
  } finally {
    decrementRenderingDepth();
    setActive(previous);
    state.rendering = false;
  }
}

export function reconcile(
  oldId: NodeId | undefined,
  value: Child,
  parentId: NodeId,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction,
  parentRecord?: FlatNode
): NodeId {
  if (oldId === undefined) return mountValue(value, parentId, ownerId, root, tx, parentRecord);
  const old = nodeRegistry.getNode(oldId);
  if (canReuseNode(old, value)) {
    reconcileMatched(oldId, old, value, root, tx);
    return oldId;
  }

  const fresh = mountValue(value, parentId, ownerId, root, tx, parentRecord);
  return fresh;
}

export function reconcileMatched(
  oldId: NodeId,
  old: FlatNode,
  value: Child,
  root: FlatRoot,
  tx: PatchTransaction
): void {
  if (!isVNode(value)) {
    const text = typeof value === "string" ? value : value == null ? "" : String(value);
    const previous = typeof old.value === "string" ? old.value : (old.domStart as CharacterData).data;
    if (previous !== text) {
      tx.setText(oldId, text, old);
      if (typeof value !== "string") tx.setMeta(oldId, { value });
    } else if (!Object.is(old.value, value)) tx.setMeta(oldId, { value });
    return;
  }

  if (value.type === PORTAL_TYPE) {
    reconcilePortal(oldId, old, value, root, tx);
    return;
  }

  if (typeof value.type === "function") {
    renderComponent(oldId, value.props, tx);
  }
  else {
    const nextChildren = value.props.children as Child;
    const childrenAreUnchangedPrimitive =
      Object.is(old.props.children, nextChildren) &&
      (nextChildren === null || typeof nextChildren !== "object");
    tx.patchProps(oldId, old.props, value.props);
    if (!childrenAreUnchangedPrimitive) reconcileChildren(oldId, nextChildren, old.ownerId, root, tx, old);
  }
}

export function reconcileChildren(
  parentId: NodeId,
  input: Child,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction,
  parentRecord?: FlatNode
): void {
  const parent = parentRecord ?? nodeRegistry.getNode(parentId);
  if (!Array.isArray(input)) {
    if (input === null || input === undefined || typeof input === "boolean") {
      let oldId = parent.firstChild;
      while (oldId !== null) {
        const nextId = nodeRegistry.getNode(oldId).nextSibling;
        tx.remove(oldId);
        oldId = nextId;
      }
      return;
    }

    const onlyChildId = parent.firstChild;
    if (onlyChildId === null) {
      mountValue(input, parentId, ownerId, root, tx, parent);
      return;
    }
    const onlyChild = nodeRegistry.getNode(onlyChildId);
    if (onlyChild.nextSibling === null) {
      if (canReuseNode(onlyChild, input)) reconcileMatched(onlyChildId, onlyChild, input, root, tx);
      else {
        mountValue(input, parentId, ownerId, root, tx, parent);
        tx.remove(onlyChildId);
      }
      return;
    }
  }

  const values = normalize(input);
  if (reconcileOrderedChildren(parentId, values, ownerId, root, tx, parent)) return;
  if (reconcileSingleStepRotation(parentId, values, root, tx)) return;
  if (reconcileReversedChildren(parentId, values, root, tx)) return;

  const oldRecords = nodeRegistry.childRecords(parentId);
  const oldIds = new Array<NodeId>(oldRecords.length);
  const keyed = new Map<Key, number>();
  const unkeyed: number[] = [];
  for (let index = 0; index < oldRecords.length; index++) {
    const record = oldRecords[index]!;
    oldIds[index] = record.id;
    if (record.key === undefined) unkeyed.push(index);
    else keyed.set(record.key, index);
  }

  const seen = new Set<Key>();
  const nextIds = new Array<NodeId>(values.length);
  const oldIndexByNextIndex = new Array<number>(values.length).fill(0);
  const usedOldIndexes = new Uint8Array(oldIds.length);
  let allChildrenReused = oldIds.length === values.length;
  let unkeyedCursor = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    const key = isVNode(value) ? value.key : undefined;
    if (key !== undefined) {
      if (seen.has(key)) throw new Error("ZUI_DUPLICATE_KEY");
      seen.add(key);
    }
    const oldIndex = key === undefined ? unkeyed[unkeyedCursor++] ?? -1 : keyed.get(key) ?? -1;
    const prior = oldIndex < 0 ? undefined : oldIds[oldIndex];
    const nextId = reconcile(prior, value, parentId, ownerId, root, tx, parent);
    nextIds[index] = nextId;
    if (prior !== undefined && nextId === prior) {
      oldIndexByNextIndex[index] = oldIndex + 1;
      usedOldIndexes[oldIndex] = 1;
    } else allChildrenReused = false;
  }

  for (let index = 0; index < oldIds.length; index++) {
    if (usedOldIndexes[index] === 0) tx.remove(oldIds[index]!);
  }

  const stationaryIndexes = longestIncreasingSubsequencePositions(oldIndexByNextIndex);
  const plan = planStationaryMoves(nextIds, stationaryIndexes, index => oldIndexByNextIndex[index] !== 0);
  if (allChildrenReused) {
    tx.moveMany(parentId, oldIds, nextIds, plan.movingIds, plan.beforeIds);
    return;
  }
  for (let index = 0; index < plan.movingIds.length; index++) {
    tx.move(plan.movingIds[index]!, parentId, plan.beforeIds[index]!);
  }
}

function reconcileOrderedChildren(
  parentId: NodeId,
  values: Child[],
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction,
  parentRecord?: FlatNode
): boolean {
  const parent = parentRecord ?? nodeRegistry.getNode(parentId);
  const initialFirstId = parent.firstChild;
  if (initialFirstId === null) {
    let seenKeys: Set<Key> | undefined;
    for (let index = 0; index < values.length; index++) {
      const value = values[index]!;
      if (isVNode(value) && value.key !== undefined) {
        (seenKeys ??= new Set<Key>());
        if (seenKeys.has(value.key)) throw new Error("ZUI_DUPLICATE_KEY");
        seenKeys.add(value.key);
      }
      mountValue(value, parentId, ownerId, root, tx, parent);
    }
    return true;
  }

  let oldId: NodeId | null = initialFirstId;
  let hasAppendedNodes = false;
  const matchedRecords: FlatNode[] = [];
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (oldId === null) {
      hasAppendedNodes = true;
      continue;
    }
    const record = nodeRegistry.getNode(oldId);
    if (!canReuseNode(record, value)) return false;
    matchedRecords.push(record);
    oldId = record.nextSibling;
  }

  if (hasAppendedNodes) {
    const seenKeys = new Set<Key>();
    for (let index = 0; index < values.length; index++) {
      const value = values[index]!;
      if (!isVNode(value) || value.key === undefined) continue;
      if (seenKeys.has(value.key)) throw new Error("ZUI_DUPLICATE_KEY");
      seenKeys.add(value.key);
    }
  }

  for (let index = 0; index < matchedRecords.length; index++) {
    const record = matchedRecords[index]!;
    reconcileMatched(record.id, record, values[index]!, root, tx);
  }
  for (let index = matchedRecords.length; index < values.length; index++) {
    mountValue(values[index]!, parentId, ownerId, root, tx, parent);
  }
  while (oldId !== null) {
    const nextId = nodeRegistry.getNode(oldId).nextSibling;
    tx.remove(oldId);
    oldId = nextId;
  }
  return true;
}

function reconcileSingleStepRotation(
  parentId: NodeId,
  values: Child[],
  root: FlatRoot,
  tx: PatchTransaction
): boolean {
  const parent = nodeRegistry.getNode(parentId);
  const firstId = parent.firstChild;
  const lastId = parent.lastChild;
  if (firstId === null || lastId === null || values.length < 2 || firstId === lastId) return false;
  for (const value of values) if (!isVNode(value) || value.key === undefined) return false;

  const first = nodeRegistry.getNode(firstId);
  const secondId = first.nextSibling;
  if (secondId === null) return false;

  let cursor: NodeId | null = secondId;
  let leftRotation = true;
  for (let index = 0; index < values.length - 1; index++) {
    if (cursor === null) {
      leftRotation = false;
      break;
    }
    const current = nodeRegistry.getNode(cursor);
    if (!canReuseNode(current, values[index]!)) {
      leftRotation = false;
      break;
    }
    cursor = current.nextSibling;
  }
  if (cursor !== null || !canReuseNode(first, values[values.length - 1]!)) leftRotation = false;

  if (leftRotation) {
    cursor = secondId;
    for (let index = 0; index < values.length - 1; index++) {
      const currentId = cursor!;
      const current = nodeRegistry.getNode(currentId);
      cursor = current.nextSibling;
      reconcileMatched(currentId, current, values[index]!, root, tx);
    }
    reconcileMatched(firstId, first, values[values.length - 1]!, root, tx);
    tx.move(firstId, parentId, null);
    return true;
  }

  const last = nodeRegistry.getNode(lastId);
  if (!canReuseNode(last, values[0]!)) return false;
  cursor = firstId;
  for (let index = 1; index < values.length; index++) {
    if (cursor === null) return false;
    const current = nodeRegistry.getNode(cursor);
    if (!canReuseNode(current, values[index]!)) return false;
    cursor = current.nextSibling;
  }
  if (cursor !== lastId) return false;

  cursor = firstId;
  for (let index = 1; index < values.length; index++) {
    const currentId = cursor!;
    const current = nodeRegistry.getNode(currentId);
    cursor = current.nextSibling;
    reconcileMatched(currentId, current, values[index]!, root, tx);
  }
  reconcileMatched(lastId, last, values[0]!, root, tx);
  tx.move(lastId, parentId, firstId);
  return true;
}

function reconcileReversedChildren(
  parentId: NodeId,
  values: Child[],
  root: FlatRoot,
  tx: PatchTransaction
): boolean {
  const parent = nodeRegistry.getNode(parentId);
  const firstId = parent.firstChild;
  const lastId = parent.lastChild;
  if (firstId === null || lastId === null || values.length < 2 || firstId === lastId) return false;
  for (const value of values) if (!isVNode(value) || value.key === undefined) return false;

  const oldRecords = nodeRegistry.childRecords(parentId);
  const count = oldRecords.length;
  if (count !== values.length) return false;

  for (let i = 0; i < count; i++) {
    const record = oldRecords[count - 1 - i]!;
    if (!canReuseNode(record, values[i]!)) return false;
  }

  const oldIds = new Array<NodeId>(count);
  const nextIds = new Array<NodeId>(count);
  for (let i = 0; i < count; i++) {
    oldIds[i] = oldRecords[i]!.id;
    nextIds[i] = oldRecords[count - 1 - i]!.id;
  }

  for (let i = 0; i < count; i++) {
    const id = nextIds[i]!;
    const record = oldRecords[count - 1 - i]!;
    reconcileMatched(id, record, values[i]!, root, tx);
  }

  const movingIds = new Array<NodeId>(count - 1);
  const beforeIds = new Array<NodeId | null>(count - 1);
  let anchor: NodeId | null = nextIds[count - 1]!;
  let moveIdx = 0;
  for (let i = count - 2; i >= 0; i--) {
    const id = nextIds[i]!;
    movingIds[moveIdx] = id;
    beforeIds[moveIdx] = anchor;
    anchor = id;
    moveIdx++;
  }

  tx.moveMany(parentId, oldIds, nextIds, movingIds, beforeIds);
  return true;
}

// Public surface compat: the shared implementation lives in flat/lis.ts.
export { longestIncreasingSubsequencePositions } from "../flat.js";

export function updateComponent(nodeId: NodeId): void {
  const record = nodeRegistry.getNode(nodeId);
  const state = record.payload;
  if (!isComponentState(state) || state.disposed) return;
  const root = rootForId(state.rootId);
  try {
    renderTransaction(root.rootId, tx => renderComponent(nodeId, state.props, tx));
    flushEffects();
  } catch (error) {
    const failingState = getLastFailedState() ?? state;
    setLastFailedState(undefined);
    const boundaryId = findNearestErrorBoundary(nodeId, true);
    if (boundaryId !== null) {
      const boundaryRecord = nodeRegistry.getNode(boundaryId);
      const boundaryState = boundaryRecord.payload as ComponentState | undefined;
      if (boundaryState && !boundaryState.disposed) {
        const err = error instanceof Error ? error : new Error(String(error));
        boundaryState.boundaryState ??= {
          error: null,
          reset: () => {
            if (boundaryState.disposed) return;
            boundaryState.boundaryState!.error = null;
            updateComponent(boundaryId);
          }
        };
        boundaryState.boundaryState.error = err;
        try {
          (boundaryState.props as ErrorBoundaryProps).onError?.(err, {
            componentStack: formatComponentStack(failingState)
          });
        } catch {
          // Ignore onError errors
        }
        updateComponent(boundaryId);
        return;
      }
    }
    throw error;
  }
}

// Wire the updater into state module
setComponentUpdater(updateComponent);
