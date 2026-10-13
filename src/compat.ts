/**
 * Addressable DOM JSX runtime.
 *
 * JSX syntax is intentionally familiar, but rendering is not React's virtual
 * tree. The flat registry is the source of truth for identity and structure;
 * PatchEngine is the only path that writes to the browser DOM.
 */
import {
  NodeRegistry,
  PatchEngine,
  type FlatNode,
  type Key,
  type NodeId,
  type RootHandle,
  type OwnerId,
  type PatchTransaction
} from "./flat.js";

export type { Key, NodeId, OwnerId } from "./flat.js";
export type Child = VNode | string | number | boolean | null | undefined | Child[];
export type Component<P = any> = (props: P) => Child;
export interface VNode {
  type: string | Component;
  props: Record<string, any>;
  key?: Key;
}

export const Fragment: Component<{ children?: Child }> = props => props.children ?? null;

export function jsx(type: VNode["type"], props: Record<string, any> | null, key?: Key): VNode {
  const p = props ?? {};
  return { type, props: p, key: key ?? p.key };
}

export const jsxs = jsx;
export const jsxDEV = jsx;

interface Hook {
  value?: any;
  deps?: readonly unknown[];
  cleanup?: () => void;
  effect?: () => void | (() => void);
  disposed?: boolean;
  ownerNodeId?: NodeId;
}

interface ComponentState {
  nodeId: NodeId;
  rootId: number;
  ownerId: OwnerId;
  type: Component;
  props: Record<string, any>;
  hooks: Hook[];
  cursor: number;
  hookCount?: number;
  rendering: boolean;
  disposed: boolean;
}

export const nodeRegistry = new NodeRegistry();
export const patchEngine = new PatchEngine(nodeRegistry);

let active: ComponentState | undefined;
let renderingDepth = 0;
const pendingEffects = new Set<Hook>();
const roots = new WeakMap<Element, RootController>();
let flushingEffects = false;

interface ComponentSnapshot {
  state: ComponentState;
  props: Record<string, any>;
  cursor: number;
  hookCount: number | undefined;
  hooks: Array<{ slot: Hook; value: Hook }>;
}

interface RenderTransactionSnapshot {
  readonly components: Map<ComponentState, ComponentSnapshot>;
  readonly pendingEffects: Set<Hook>;
}

let renderTransactionSnapshot: RenderTransactionSnapshot | undefined;

interface FlatRoot extends RootHandle {
  disposed: boolean;
}

interface RootController extends Root {
  handle: FlatRoot;
}

const equalDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

function hook(): Hook {
  if (!active) throw new Error("ZUI_INVALID_HOOK_CALL");
  const slot = active.hooks[active.cursor] ??= {};
  slot.ownerNodeId = active.nodeId;
  active.cursor++;
  return slot;
}

export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const owner = active;
  const slot = hook();
  if (!("value" in slot)) slot.value = typeof initial === "function" ? (initial as () => T)() : initial;
  return [slot.value as T, next => {
    if (!owner || owner.disposed) return;
    if (renderingDepth > 0) throw new Error("ZUI_RENDER_PHASE_UPDATE");
    const previous = slot.value as T;
    const value = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    try { updateComponent(owner.nodeId); }
    catch (error) {
      slot.value = previous;
      throw error;
    }
  }];
}

export function useRef<T>(initial: T): { current: T } {
  const slot = hook();
  return slot.value ??= { current: initial };
}

export function useMemo<T>(calculate: () => T, deps?: readonly unknown[]): T {
  const slot = hook();
  if (!("value" in slot) || !equalDeps(slot.deps, deps)) {
    slot.value = calculate();
    slot.deps = deps;
  }
  return slot.value as T;
}

export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: readonly unknown[]): T {
  return useMemo(() => fn, deps);
}

export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void {
  const slot = hook();
  if (!slot.effect || !equalDeps(slot.deps, deps)) {
    slot.effect = effect;
    slot.deps = deps;
    pendingEffects.add(slot);
  }
}

function flushEffects(): void {
  if (flushingEffects) return;
  flushingEffects = true;
  try {
    while (pendingEffects.size) {
      const slot = pendingEffects.values().next().value as Hook;
      pendingEffects.delete(slot);
      if (slot.disposed) continue;
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      cleanup?.();
      if (slot.disposed || pendingEffects.has(slot)) continue;
      const result = slot.effect?.();
      if (!slot.disposed && typeof result === "function") slot.cleanup = result;
    }
  } finally {
    flushingEffects = false;
  }
}

function snapshotComponent(state: ComponentState): void {
  const transaction = renderTransactionSnapshot;
  if (!transaction || transaction.components.has(state)) return;
  // Newly-created component boundaries are discarded wholesale on rollback;
  // only snapshot state that belongs to a previously committed tree.
  if (nodeRegistry.getNode(state.nodeId).parentId === null) return;
  transaction.components.set(state, {
    state,
    props: state.props,
    cursor: state.cursor,
    hookCount: state.hookCount,
    hooks: state.hooks.map(slot => ({ slot, value: { ...slot } }))
  });
}

function restoreComponentSnapshot(snapshot: ComponentSnapshot): void {
  const { state } = snapshot;
  state.props = snapshot.props;
  state.cursor = snapshot.cursor;
  state.hookCount = snapshot.hookCount;
  state.hooks.length = snapshot.hooks.length;
  for (const { slot, value } of snapshot.hooks) {
    for (const key of Object.keys(slot) as Array<keyof Hook>) delete slot[key];
    Object.assign(slot, value);
  }
}

function renderTransaction<T>(rootId: number, work: (tx: PatchTransaction) => T): T {
  if (renderTransactionSnapshot) return patchEngine.transaction(rootId, work);
  const snapshot: RenderTransactionSnapshot = {
    components: new Map(),
    pendingEffects: new Set(pendingEffects)
  };
  renderTransactionSnapshot = snapshot;
  try {
    return patchEngine.transaction(rootId, work);
  } catch (error) {
    for (const component of [...snapshot.components.values()].reverse()) {
      if (!component.state.disposed) restoreComponentSnapshot(component);
    }
    pendingEffects.clear();
    for (const effect of snapshot.pendingEffects) pendingEffects.add(effect);
    throw error;
  } finally {
    renderTransactionSnapshot = undefined;
  }
}

function normalize(value: Child): Child[] {
  if (!Array.isArray(value)) {
    return value !== null && value !== undefined && typeof value !== "boolean" ? [value] : [];
  }
  if (value.every(entry => !Array.isArray(entry) && entry !== null && entry !== undefined && typeof entry !== "boolean")) {
    return value;
  }
  const out: Child[] = [];
  const walk = (entry: Child): void => {
    if (Array.isArray(entry)) entry.forEach(walk);
    else if (entry !== null && entry !== undefined && typeof entry !== "boolean") out.push(entry);
  };
  walk(value);
  return out;
}

function isVNode(value: Child): value is VNode {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value;
}

function isComponentState(value: unknown): value is ComponentState {
  return typeof value === "object" && value !== null && "nodeId" in value && "hooks" in value;
}

function isSameVNode(record: FlatNode, value: VNode): boolean {
  return record.value !== undefined && record.type === value.type && record.key === value.key;
}

function mountValue(
  value: Child,
  parentId: NodeId,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction
): NodeId {
  if (!isVNode(value)) {
    const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
    const nodeId = tx.createText(ownerId, text);
    if (typeof value !== "string") tx.setMeta(nodeId, { value });
    tx.insert(nodeId, parentId);
    return nodeId;
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
    // The renderer needs the component payload while the transaction is still
    // being planned. This is index metadata, not a DOM mutation; rollback can
    // discard the newly-created record if render planning fails.
    nodeRegistry.updateNode(nodeId, { type: value.type, key: value.key, props: value.props, value, payload: state });
    tx.attachCleanup(nodeId, () => disposeComponent(state));
    tx.insert(nodeId, parentId);
    renderComponent(nodeId, value.props, tx);
    return nodeId;
  }

  const isCustomElement = typeof value.type === "string" && (value.type.includes("-") || Boolean(value.props?.is));
  const nodeId = tx.createElement(ownerId, value.type, value.type, value.key, value.props, value, parentId);
  const assembleDetached = !isCustomElement;
  // Custom-element attribute callbacks are user code. Preserve their connected
  // mount timing; only native host elements use the detached-subtree path.
  if (!assembleDetached) tx.insert(nodeId, parentId);
  tx.patchInitialProps(nodeId, value.props);
  reconcileChildren(nodeId, value.props.children as Child, ownerId, root, tx);
  if (assembleDetached) {
    // Assemble a fresh host subtree while it is detached, then attach its root
    // once. This keeps large initial mounts from incrementally mutating a live
    // ancestor as every descendant is reconciled.
    tx.insert(nodeId, parentId);
  }
  return nodeId;
}

function renderComponent(nodeId: NodeId, props: Record<string, any>, tx: PatchTransaction): void {
  const record = nodeRegistry.getNode(nodeId);
  const state = record.payload;
  if (!isComponentState(state)) throw new Error("ZUI_COMPONENT_STATE");
  if (state.rendering) throw new Error("ZUI_RENDER_PHASE_UPDATE");
  snapshotComponent(state);
  const previous = active;
  active = state;
  state.props = props;
  state.cursor = 0;
  state.rendering = true;
  renderingDepth++;
  let result: Child;
  try {
    result = state.type(props);
    if (state.hookCount === undefined) state.hookCount = state.cursor;
    else if (state.cursor !== state.hookCount) throw new Error("ZUI_HOOK_ORDER");
    if (record.props !== props) tx.setMeta(nodeId, { props });
    reconcileChildren(nodeId, result, state.ownerId, rootForId(state.rootId), tx, record);
  } finally {
    renderingDepth--;
    active = previous;
    state.rendering = false;
  }
}

function reconcile(
  oldId: NodeId | undefined,
  value: Child,
  parentId: NodeId,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction
): NodeId {
  if (oldId === undefined) return mountValue(value, parentId, ownerId, root, tx);
  const old = nodeRegistry.getNode(oldId);
  if (canReuseNode(old, value)) {
    reconcileMatched(oldId, old, value, root, tx);
    return oldId;
  }

  const fresh = mountValue(value, parentId, ownerId, root, tx);
  return fresh;
}

function reconcileMatched(
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

  if (typeof value.type === "function") renderComponent(oldId, value.props, tx);
  else {
    const nextChildren = value.props.children as Child;
    const childrenAreUnchangedPrimitive = Object.is(old.props.children, nextChildren) &&
      (nextChildren === null || typeof nextChildren !== "object");
    tx.patchProps(oldId, old.props, value.props);
    if (!childrenAreUnchangedPrimitive) reconcileChildren(oldId, nextChildren, old.ownerId, root, tx, old);
  }
}

function reconcileChildren(
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
      mountValue(input, parentId, ownerId, root, tx);
      return;
    }
    const onlyChild = nodeRegistry.getNode(onlyChildId);
    if (onlyChild.nextSibling === null) {
      if (canReuseNode(onlyChild, input)) reconcileMatched(onlyChildId, onlyChild, input, root, tx);
      else {
        mountValue(input, parentId, ownerId, root, tx);
        tx.remove(onlyChildId);
      }
      return;
    }
  }

  const values = normalize(input);
  if (reconcileOrderedChildren(parentId, values, ownerId, root, tx)) return;
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
    const nextId = reconcile(prior, value, parentId, ownerId, root, tx);
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

  // Newly-created children are initially inserted at the end in render order.
  // A new suffix is therefore already in its final position and needs no move.
  let newSuffixStart = nextIds.length;
  while (newSuffixStart > 0 && oldIndexByNextIndex[newSuffixStart - 1] === 0) newSuffixStart--;

  let anchor: NodeId | null = null;
  const movingIds: NodeId[] = [];
  const beforeIds: Array<NodeId | null> = [];
  for (let i = nextIds.length - 1; i >= 0; i--) {
    const id = nextIds[i]!;
    const isNewSuffix = i >= newSuffixStart;
    if (!isNewSuffix && stationaryIndexes[i] === 0) {
      if (allChildrenReused) {
        movingIds.push(id);
        beforeIds.push(anchor);
      } else tx.move(id, parentId, anchor);
    }
    anchor = id;
  }
  if (allChildrenReused) tx.moveMany(parentId, oldIds, nextIds, movingIds, beforeIds);
}

function canReuseNode(record: FlatNode, value: Child): boolean {
  return isVNode(value) ? isSameVNode(record, value) : record.kind === "text";
}

/** Fast path for unchanged order and tail-only insertions/removals. */
function reconcileOrderedChildren(
  parentId: NodeId,
  values: Child[],
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction
): boolean {
  const initialFirstId = nodeRegistry.getNode(parentId).firstChild;
  if (initialFirstId === null) {
    const seenKeys = new Set<Key>();
    for (const value of values) {
      if (isVNode(value) && value.key !== undefined) {
        if (seenKeys.has(value.key)) throw new Error("ZUI_DUPLICATE_KEY");
        seenKeys.add(value.key);
      }
      mountValue(value, parentId, ownerId, root, tx);
    }
    return true;
  }

  let oldId: NodeId | null = initialFirstId;
  let hasAppendedNodes = false;
  for (const value of values) {
    if (oldId === null) {
      hasAppendedNodes = true;
      continue;
    }
    const record = nodeRegistry.getNode(oldId);
    if (!canReuseNode(record, value)) return false;
    oldId = record.nextSibling;
  }

  // Existing children are already known to have unique keys. Only appended
  // keys need a full duplicate check; unchanged and tail-removal paths avoid a Set.
  if (hasAppendedNodes) {
    const seenKeys = new Set<Key>();
    for (const value of values) {
      if (!isVNode(value) || value.key === undefined) continue;
      if (seenKeys.has(value.key)) throw new Error("ZUI_DUPLICATE_KEY");
      seenKeys.add(value.key);
    }
  }

  oldId = nodeRegistry.getNode(parentId).firstChild;
  for (const value of values) {
    if (oldId === null) {
      mountValue(value, parentId, ownerId, root, tx);
      continue;
    }
    const currentId = oldId;
    const current = nodeRegistry.getNode(currentId);
    oldId = current.nextSibling;
    reconcileMatched(currentId, current, value, root, tx);
  }
  while (oldId !== null) {
    const nextId = nodeRegistry.getNode(oldId).nextSibling;
    tx.remove(oldId);
    oldId = nextId;
  }
  return true;
}

/** Preserve a linear keyed reconciliation path for the common one-item rotation. */
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
    if (cursor === null) { leftRotation = false; break; }
    const current = nodeRegistry.getNode(cursor);
    if (!canReuseNode(current, values[index]!)) { leftRotation = false; break; }
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

/** Fast path for exact reversed order of keyed children. */
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

/** Return a byte mask for the reused child indexes in the longest increasing run. */
function longestIncreasingSubsequencePositions(oldIndexByNextIndex: readonly number[]): Uint8Array {
  const predecessors = new Int32Array(oldIndexByNextIndex.length);
  predecessors.fill(-1);
  const tails: number[] = [];
  for (let i = 0; i < oldIndexByNextIndex.length; i++) {
    const oldIndex = oldIndexByNextIndex[i]!;
    if (oldIndex === 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (oldIndexByNextIndex[tails[middle]!]! < oldIndex) low = middle + 1;
      else high = middle;
    }
    if (low > 0) predecessors[i] = tails[low - 1]!;
    tails[low] = i;
  }

  const stationary = new Uint8Array(oldIndexByNextIndex.length);
  if (tails.length === 0) return stationary;
  let cursor = tails[tails.length - 1]!;
  while (cursor !== -1) {
    stationary[cursor] = 1;
    cursor = predecessors[cursor]!;
  }
  return stationary;
}

function disposeComponent(state: ComponentState): void {
  if (state.disposed) return;
  state.disposed = true;
  let failure: unknown;
  for (const slot of state.hooks) {
    slot.disposed = true;
    pendingEffects.delete(slot);
    const cleanup = slot.cleanup;
    slot.cleanup = undefined;
    if (cleanup) {
      try { cleanup(); } catch (error) { failure ??= error; }
    }
  }
  try { nodeRegistry.disposeOwner(state.ownerId); }
  catch (error) { failure ??= error; }
  if (failure) throw failure;
}

function rootForId(rootId: number): FlatRoot {
  return nodeRegistry.getRoot(rootId) as FlatRoot;
}

function updateComponent(nodeId: NodeId): void {
  const record = nodeRegistry.getNode(nodeId);
  const state = record.payload;
  if (!isComponentState(state) || state.disposed) return;
  const root = rootForId(state.rootId);
  renderTransaction(root.rootId, tx => renderComponent(nodeId, state.props, tx));
  flushEffects();
}

export interface Root {
  render(value: Child): void;
  unmount(): void;
}

export function createRoot(container: Element): Root {
  roots.get(container)?.unmount();
  const handle = nodeRegistry.createRoot(container) as FlatRoot;
  handle.disposed = false;

  const root: RootController = {
    handle,
    render(value) {
      if (handle.disposed) throw new Error("ZUI_ROOT_UNMOUNTED");
      renderTransaction(handle.rootId, tx => {
        reconcileChildren(handle.nodeId, value, handle.ownerId, handle, tx);
      });
      flushEffects();
    },
    unmount() {
      if (handle.disposed) return;
      handle.disposed = true;
      let failure: unknown;
      try {
        const children = nodeRegistry.children(handle.nodeId);
        if (children.length) {
          patchEngine.transaction(handle.rootId, tx => {
            for (const childId of children) tx.remove(childId);
          });
        }
      } catch (error) {
        failure = error;
      }
      let empty = false;
      try { empty = nodeRegistry.children(handle.nodeId).length === 0; }
      catch (error) { failure ??= error; }
      if (empty) {
        try { nodeRegistry.disposeRoot(handle.rootId); }
        catch (error) { failure ??= error; }
        if (roots.get(container) === root) roots.delete(container);
      } else {
        handle.disposed = false;
      }
      if (failure) throw failure;
    }
  };
  roots.set(container, root);
  return root;
}

export function render(value: Child, container: Element): void {
  const root = roots.get(container) ?? createRoot(container);
  root.render(value);
}

export function getAddressableRoot(container: Element): RootHandle | undefined {
  return roots.get(container)?.handle;
}

export function assertAddressableRoot(container: Element): void {
  const root = roots.get(container)?.handle;
  if (root) nodeRegistry.assertConsistent(root.rootId);
}

