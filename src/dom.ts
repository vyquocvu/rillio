/**
 * Explicit reactive DOM API.
 *
 * This is the mount-once surface of ZUI. It shares the addressable registry
 * and PatchEngine with the JSX runtime; it does not maintain a second DOM
 * tree or mutate browser nodes directly.
 */
import { createEngine, type Store, type Dispose } from "./reactive.js";
import { nodeRegistry, patchEngine } from "./compat.js";
import type { Key, NodeId, OwnerId, PatchTransaction, RootHandle } from "./flat.js";

export const registry = nodeRegistry;
export const patches = patchEngine;
/** Graph engine powers the explicit reactive frontend surface. */
export const engine = createEngine("graph", { ownerHost: registry });
export const createStore = <T>(initial: T): Store<T> => engine.createStore(initial);
/** React-familiar naming; unlike React useState, returns a live Store. */
export const useStore = createStore;
export const computed = <T>(fn: () => T) => engine.computed(fn);
export const batch = <T>(fn: () => T) => engine.batch(fn);
export const untrack = <T>(fn: () => T): T => engine.untrack(fn);

const BINDING = Symbol("zui.binding");
export interface Binding<T> {
  readonly [BINDING]: true;
  readonly read: () => T;
}
export function select<S, T>(store: Store<S>, selector: (state: S) => T): Binding<T> {
  return { [BINDING]: true, read: () => selector(store.get()) };
}
export function derive<T>(read: () => T): Binding<T> {
  return { [BINDING]: true, read };
}

function isStore(value: unknown): value is Store<unknown> {
  return typeof value === "object" && value !== null &&
    typeof (value as Store<unknown>).get === "function" &&
    typeof (value as Store<unknown>).set === "function";
}
function isBinding(value: unknown): value is Binding<unknown> {
  return typeof value === "object" && value !== null && BINDING in value;
}
function readReactive(value: Store<unknown> | Binding<unknown>): unknown {
  return isBinding(value) ? value.read() : value.get();
}
function stringify(value: unknown): string {
  return value == null || typeof value === "boolean" ? "" : String(value);
}

export type Child = VNode | Store<any> | (() => Child) | Binding<unknown> | Conditional | Repetition<any> | string | number | boolean | null | undefined | Child[];
export interface VNode {
  readonly type: string | ((props: any) => any);
  readonly props: Record<string, any>;
  readonly key?: Key;
}
export function jsx(type: VNode["type"], props: Record<string, any> | null, key?: Key): VNode {
  return { type, props: props ?? {}, key };
}
export const jsxs = jsx;
export const Fragment = (props: { children?: Child }): Child => props.children;

interface Conditional {
  kind: "show";
  when: boolean | Binding<unknown> | Store<unknown>;
  fallback?: Child | (() => Child);
  children: Child | (() => Child);
}
interface Repetition<T> {
  kind: "for";
  each: readonly T[] | Binding<readonly T[]> | Store<readonly T[]>;
  by: (item: T) => Key;
  children: (item: T, current: () => T) => Child;
}
export function Show(props: { when: boolean | Binding<unknown> | Store<unknown>; fallback?: Child | (() => Child); children: Child | (() => Child) }): Conditional {
  return { kind: "show", ...props };
}
export function For<T>(props: { each: readonly T[] | Binding<readonly T[]> | Store<readonly T[]>; by: (item: T) => Key; children: (item: T, current: () => T) => Child }): Repetition<T> {
  return { kind: "for", ...props };
}
function isConditional(value: unknown): value is Conditional {
  return typeof value === "object" && value !== null && (value as Conditional).kind === "show";
}
function isRepetition(value: unknown): value is Repetition<unknown> {
  return typeof value === "object" && value !== null && (value as Repetition<unknown>).kind === "for";
}
function evaluate<T>(input: T | Binding<T> | Store<T>): T {
  return (isBinding(input) || isStore(input)) ? readReactive(input) as T : input as T;
}
function resolveChild(value: unknown): Child {
  return typeof value === "function" ? (value as () => Child)() : value as Child;
}

interface Scope<T> {
  readonly ownerId: OwnerId;
  readonly value: T;
  dispose(): void;
}

function createScope<T>(rootId: number, parentOwnerId: OwnerId, fn: (ownerId: OwnerId) => T): Scope<T> {
  const ownerId = registry.createOwner(rootId, parentOwnerId);
  try {
    const scope = engine.untrack(() => engine.createOwner(() => {
      const value = fn(ownerId);
      engine.onCleanup(() => registry.disposeOwner(ownerId));
      return value;
    }, { ownerId }));
    let disposed = false;
    return {
      ownerId,
      value: scope.value,
      dispose() {
        if (disposed) return;
        disposed = true;
        try { scope.dispose(); }
        finally { registry.disposeOwner(ownerId); }
      }
    };
  } catch (error) {
    registry.disposeOwner(ownerId);
    throw error;
  }
}

function attachScope(tx: PatchTransaction, nodeId: NodeId, scope: Scope<unknown>): void {
  tx.attachCleanup(nodeId, scope.dispose);
}

function renderProps(
  nodeId: NodeId,
  props: Record<string, any>,
  root: RootHandle,
  tx: PatchTransaction
): void {
  const initial: Record<string, any> = {};
  const dynamic: Array<[string, Store<unknown> | Binding<unknown>]> = [];
  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "key") continue;
    if (isBinding(value) || isStore(value)) {
      const reactive = value as Store<unknown> | Binding<unknown>;
      initial[name] = readReactive(reactive);
      dynamic.push([name, reactive]);
    } else initial[name] = value;
  }
  tx.patchProps(nodeId, {}, initial);
  for (const [name, reactive] of dynamic) {
    let previous = initial[name];
    engine.effect(() => {
      const next = readReactive(reactive);
      if (Object.is(previous, next)) return;
      patchEngine.update(root.rootId, update => {
        update.patchProps(nodeId, { [name]: previous }, { [name]: next });
      });
      previous = next;
    });
  }
}

function renderChild(
  value: Child | Conditional | Repetition<unknown>,
  parentId: NodeId,
  parentOwnerId: OwnerId,
  root: RootHandle,
  tx: PatchTransaction
): NodeId[] {
  if (Array.isArray(value)) {
    return value.flatMap(entry => renderChild(entry, parentId, parentOwnerId, root, tx));
  }
  if (value == null || typeof value === "boolean") return [];

  if (isBinding(value) || isStore(value)) {
    const scope = createScope(root.rootId, parentOwnerId, ownerId => {
      const nodeId = tx.createText(ownerId, "");
      tx.insert(nodeId, parentId);
      engine.effect(() => {
        const next = stringify(readReactive(value));
        patchEngine.update(root.rootId, update => update.setText(nodeId, next));
      });
      return nodeId;
    });
    attachScope(tx, scope.value, scope);
    return [scope.value];
  }

  if (typeof value === "function") {
    const scope = createScope(root.rootId, parentOwnerId, ownerId => {
      const nodeId = tx.createBoundary(ownerId, "zui:start", "zui:end");
      tx.insert(nodeId, parentId);
      engine.effect(() => {
        const child = (value as () => Child)();
        patchEngine.update(root.rootId, update => {
          for (const oldId of registry.children(nodeId)) update.remove(oldId);
          renderChild(child, nodeId, ownerId, root, update);
        });
      });
      return nodeId;
    });
    attachScope(tx, scope.value, scope);
    return [scope.value];
  }

  if (typeof value === "string" || typeof value === "number") {
    const scope = createScope(root.rootId, parentOwnerId, ownerId => {
      const nodeId = tx.createText(ownerId, String(value));
      tx.insert(nodeId, parentId);
      return nodeId;
    });
    attachScope(tx, scope.value, scope);
    return [scope.value];
  }

  if (isConditional(value)) {
    const scope = createScope(root.rootId, parentOwnerId, ownerId => {
      const nodeId = tx.createBoundary(ownerId, "zui:show:start", "zui:show:end");
      tx.insert(nodeId, parentId);
      let present: boolean | undefined;
      engine.effect(() => {
        const visible = Boolean(evaluate(value.when));
        if (visible === present) return;
        present = visible;
        patchEngine.update(root.rootId, update => {
          for (const oldId of registry.children(nodeId)) update.remove(oldId);
          const child = resolveChild(visible ? value.children : value.fallback);
          renderChild(child, nodeId, ownerId, root, update);
        });
      });
      return nodeId;
    });
    attachScope(tx, scope.value, scope);
    return [scope.value];
  }

  if (isRepetition(value)) return renderList(value, parentId, parentOwnerId, root, tx);

  const vnode = value as VNode;
  const vnodeType = vnode.type;
  if (typeof vnodeType === "function") {
    const scope = createScope(root.rootId, parentOwnerId, ownerId => {
      const nodeId = tx.createBoundary(ownerId, "zui:component", "/zui:component", vnode.key);
      tx.setMeta(nodeId, { type: vnodeType, key: vnode.key, props: vnode.props, value: vnode });
      tx.insert(nodeId, parentId);
      const child = vnodeType({ ...vnode.props, key: vnode.key });
      renderChild(child, nodeId, ownerId, root, tx);
      return nodeId;
    });
    attachScope(tx, scope.value, scope);
    return [scope.value];
  }

  const scope = createScope(root.rootId, parentOwnerId, ownerId => {
    const nodeId = tx.createElement(ownerId, vnodeType, vnodeType, vnode.key);
    tx.setMeta(nodeId, { type: vnodeType, key: vnode.key, props: vnode.props, value: vnode });
    tx.insert(nodeId, parentId);
    renderProps(nodeId, vnode.props, root, tx);
    renderChild(vnode.props.children as Child, nodeId, ownerId, root, tx);
    return nodeId;
  });
  attachScope(tx, scope.value, scope);
  return [scope.value];
}

function renderList<T>(
  spec: Repetition<T>,
  parentId: NodeId,
  parentOwnerId: OwnerId,
  root: RootHandle,
  tx: PatchTransaction
): NodeId[] {
  const scope = createScope(root.rootId, parentOwnerId, ownerId => {
    const regionId = tx.createBoundary(ownerId, "zui:for:start", "zui:for:end");
    tx.insert(regionId, parentId);
    type Entry = { nodeId: NodeId; value: T; state: Store<T> };
    let entries = new Map<Key, Entry>();
    engine.effect(() => {
      const next = evaluate(spec.each);
      const keys = next.map(spec.by);
      const unique = new Set(keys);
      if (unique.size !== keys.length) throw new Error("ZUI_DUPLICATE_KEY");
      patchEngine.update(root.rootId, update => {
        for (const [key, entry] of entries) if (!unique.has(key)) update.remove(entry.nodeId);
        const reordered = new Map<Key, Entry>();
        let anchor: NodeId | null = null;
        for (let i = next.length - 1; i >= 0; i--) {
          const item = next[i]!;
          const key = keys[i]!;
          let entry = entries.get(key);
          if (!entry) {
            const itemScope = createScope(root.rootId, ownerId, itemOwnerId => {
              const itemNodeId = update.createBoundary(itemOwnerId, "zui:item:start", "zui:item:end", key);
              const state = createStore<T>(item);
              update.insert(itemNodeId, regionId);
              renderChild(spec.children(item, () => state.get()), itemNodeId, itemOwnerId, root, update);
              return { itemNodeId, state };
            });
            entry = { nodeId: itemScope.value.itemNodeId, value: item, state: itemScope.value.state };
            update.attachCleanup(entry.nodeId, itemScope.dispose);
          } else {
            if (!Object.is(entry.value, item)) {
              entry.value = item;
              entry.state.set(item);
            }
          }
          const current = entry;
          update.move(current.nodeId, regionId, anchor);
          reordered.set(key, current);
          anchor = current.nodeId;
        }
        entries = reordered;
      });
    });
    return regionId;
  });
  attachScope(tx, scope.value, scope);
  return [scope.value];
}

/** Mount a reactive subtree and return its lifecycle disposer. */
export function mount(component: (() => Child) | Child, target: Element): Dispose {
  if (registry.rootFor(target)) throw new Error("ZUI_ROOT_OCCUPIED");
  const root = registry.createRoot(target);
  let disposed = false;
  let rootScope: { dispose(): void } | undefined;
  try {
    const scope = engine.untrack(() => engine.createOwner(() => {
      const nodes = patchEngine.transaction(root.rootId, tx => {
        const value = typeof component === "function" ? (component as () => Child)() : component;
        return renderChild(value, root.nodeId, root.ownerId, root, tx);
      });
      engine.onCleanup(() => registry.disposeOwner(root.ownerId));
      return nodes;
    }, { ownerId: root.ownerId }));
    rootScope = scope;
  } catch (error) {
    registry.disposeRoot(root.rootId);
    throw error;
  }

  return () => {
    if (disposed) return;
    disposed = true;
    const children = registry.children(root.nodeId);
    if (children.length) {
      patchEngine.transaction(root.rootId, tx => {
        for (const childId of children) tx.remove(childId);
      });
    }
    rootScope?.dispose();
    registry.disposeRoot(root.rootId);
  };
}

