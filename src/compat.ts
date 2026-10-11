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
    const value = typeof next === "function" ? (next as (previous: T) => T)(slot.value) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    updateComponent(owner.nodeId);
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

function normalize(value: Child): Child[] {
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
  return record.value !== undefined && isVNode(record.value as Child) &&
    record.type === value.type && record.key === value.key;
}

function ownerForNode(nodeId: NodeId): OwnerId {
  return nodeRegistry.getNode(nodeId).ownerId;
}

function mountValue(
  value: Child,
  parentId: NodeId,
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction
): NodeId {
  if (!isVNode(value)) {
    const nodeId = typeof value === "string" || typeof value === "number"
      ? tx.createText(ownerId, String(value))
      : tx.createText(ownerId, "");
    tx.setMeta(nodeId, { value });
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
    tx.setMeta(nodeId, { type: value.type, key: value.key, props: value.props, value, payload: state });
    tx.attachCleanup(nodeId, () => disposeComponent(state));
    tx.insert(nodeId, parentId);
    renderComponent(nodeId, value.props, tx);
    return nodeId;
  }

  const nodeId = tx.createElement(ownerId, value.type, value.type, value.key);
  nodeRegistry.updateNode(nodeId, { type: value.type, key: value.key, props: value.props, value });
  tx.setMeta(nodeId, { type: value.type, key: value.key, props: value.props, value });
  tx.insert(nodeId, parentId);
  tx.patchProps(nodeId, {}, value.props);
  reconcileChildren(nodeId, normalize(value.props.children), ownerId, root, tx);
  return nodeId;
}

function renderComponent(nodeId: NodeId, props: Record<string, any>, tx: PatchTransaction): void {
  const record = nodeRegistry.getNode(nodeId);
  const state = record.payload;
  if (!isComponentState(state)) throw new Error("ZUI_COMPONENT_STATE");
  if (state.rendering) throw new Error("ZUI_RENDER_PHASE_UPDATE");
  const previous = active;
  active = state;
  state.props = props;
  state.cursor = 0;
  state.rendering = true;
  renderingDepth++;
  let result: Child;
  try {
    result = state.type(props);
  } finally {
    renderingDepth--;
    active = previous;
    state.rendering = false;
  }
  if (state.hookCount === undefined) state.hookCount = state.cursor;
  else if (state.cursor !== state.hookCount) throw new Error("ZUI_HOOK_ORDER");
  tx.setMeta(nodeId, { props, value: jsx(state.type, props, record.key), payload: state });
  reconcileChildren(nodeId, normalize(result), state.ownerId, rootForId(state.rootId), tx);
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

  if (!isVNode(value) && old.kind === "text") {
    const text = value == null ? "" : String(value);
    tx.setText(oldId, text);
    tx.setMeta(oldId, { value });
    return oldId;
  }

  if (isVNode(value) && isSameVNode(old, value)) {
    if (typeof value.type === "function") renderComponent(oldId, value.props, tx);
    else {
      tx.patchProps(oldId, old.props, value.props);
      tx.setMeta(oldId, { props: value.props, value, type: value.type, key: value.key });
      reconcileChildren(oldId, normalize(value.props.children), ownerForNode(oldId), root, tx);
    }
    return oldId;
  }

  const fresh = mountValue(value, parentId, ownerId, root, tx);
  return fresh;
}

function reconcileChildren(
  parentId: NodeId,
  values: Child[],
  ownerId: OwnerId,
  root: FlatRoot,
  tx: PatchTransaction
): void {
  const oldIds = nodeRegistry.children(parentId);
  const keyed = new Map<Key, NodeId>();
  const unkeyed: NodeId[] = [];
  for (const id of oldIds) {
    const record = nodeRegistry.getNode(id);
    if (record.key === undefined) unkeyed.push(id);
    else keyed.set(record.key, id);
  }

  const seen = new Set<Key>();
  const nextIds: NodeId[] = [];
  let unkeyedCursor = 0;
  for (const value of values) {
    const key = isVNode(value) ? value.key : undefined;
    if (key !== undefined) {
      if (seen.has(key)) throw new Error("ZUI_DUPLICATE_KEY");
      seen.add(key);
    }
    const prior = key === undefined ? unkeyed[unkeyedCursor++] : keyed.get(key);
    nextIds.push(reconcile(prior, value, parentId, ownerId, root, tx));
  }

  for (const id of oldIds) if (!nextIds.includes(id)) tx.remove(id);

  let anchor: NodeId | null = null;
  for (let i = nextIds.length - 1; i >= 0; i--) {
    const id = nextIds[i]!;
    tx.move(id, parentId, anchor);
    anchor = id;
  }
}

function disposeComponent(state: ComponentState): void {
  if (state.disposed) return;
  state.disposed = true;
  for (const slot of state.hooks) {
    slot.disposed = true;
    pendingEffects.delete(slot);
    const cleanup = slot.cleanup;
    slot.cleanup = undefined;
    cleanup?.();
  }
  nodeRegistry.disposeOwner(state.ownerId);
}

function rootForId(rootId: number): FlatRoot {
  return nodeRegistry.getRoot(rootId) as FlatRoot;
}

function updateComponent(nodeId: NodeId): void {
  const record = nodeRegistry.getNode(nodeId);
  const state = record.payload;
  if (!isComponentState(state) || state.disposed) return;
  const root = rootForId(state.rootId);
  patchEngine.transaction(root.rootId, tx => renderComponent(nodeId, state.props, tx));
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
      patchEngine.transaction(handle.rootId, tx => {
        reconcileChildren(handle.nodeId, normalize(value), handle.ownerId, handle, tx);
      });
      flushEffects();
    },
    unmount() {
      if (handle.disposed) return;
      handle.disposed = true;
      const children = nodeRegistry.children(handle.nodeId);
      if (children.length) {
        patchEngine.transaction(handle.rootId, tx => {
          for (const childId of children) tx.remove(childId);
        });
      }
      nodeRegistry.disposeRoot(handle.rootId);
      if (roots.get(container) === root) roots.delete(container);
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

