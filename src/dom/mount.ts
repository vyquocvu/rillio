import type { Dispose, Store } from "../reactive.js";
import { longestIncreasingSubsequencePositions, planStationaryMoves } from "../flat.js";
import type { Key, NodeId, OwnerId, PatchTransaction, RootHandle } from "../flat.js";
import type { Scope, Child, Conditional, Repetition, VNode, Binding } from "./types.js";
import {
  registry,
  patches,
  engine,
  createStore,
  isBinding,
  isStore,
  readReactive,
  stringify,
  evaluate,
  resolveChild,
} from "./bindings.js";
import { isConditional, isRepetition } from "./control-flow.js";

export function createScope<T>(rootId: number, parentOwnerId: OwnerId, fn: (ownerId: OwnerId) => T): Scope<T> {
  const ownerId = registry.createOwner(rootId, parentOwnerId);
  try {
    const scope = engine.untrack(() =>
      engine.createOwner(
        () => {
          const value = fn(ownerId);
          engine.onCleanup(() => registry.disposeOwner(ownerId));
          return value;
        },
        { ownerId }
      )
    );
    let disposed = false;
    return {
      ownerId,
      value: scope.value,
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          scope.dispose();
        } finally {
          registry.disposeOwner(ownerId);
        }
      },
    };
  } catch (error) {
    registry.disposeOwner(ownerId);
    throw error;
  }
}

export function attachScope(tx: PatchTransaction, nodeId: NodeId, scope: Scope<unknown>): void {
  tx.attachCleanup(nodeId, scope.dispose);
}

export function renderProps(
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
      patches.update(root.rootId, update => {
        update.patchProps(nodeId, { [name]: previous }, { [name]: next });
      });
      previous = next;
    });
  }
}

export function renderChild(
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
        patches.update(root.rootId, update => update.setText(nodeId, next));
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
        patches.update(root.rootId, update => {
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
        patches.update(root.rootId, update => {
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
    const nodeId = tx.createElement(ownerId, vnodeType, vnodeType, vnode.key, vnode.props, vnode, parentId);
    tx.setMeta(nodeId, { type: vnodeType, key: vnode.key, props: vnode.props, value: vnode });
    tx.insert(nodeId, parentId);
    renderProps(nodeId, vnode.props, root, tx);
    renderChild(vnode.props.children as Child, nodeId, ownerId, root, tx);
    return nodeId;
  });
  attachScope(tx, scope.value, scope);
  return [scope.value];
}

export function renderList<T>(
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
      const oldIds = registry.children(regionId);
      const oldIndexById = new Map(oldIds.map((id, index) => [id, index] as const));
      patches.update(root.rootId, update => {
        for (const [key, entry] of entries) if (!unique.has(key)) update.remove(entry.nodeId);
        const reordered = new Map<Key, Entry>();
        for (let i = 0; i < next.length; i++) {
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
          reordered.set(key, entry);
        }

        const nextIds = keys.map(key => reordered.get(key)!.nodeId);
        const encoded = new Array<number>(nextIds.length).fill(0);
        for (let index = 0; index < nextIds.length; index++) {
          const oldIndex = oldIndexById.get(nextIds[index]!);
          if (oldIndex !== undefined) encoded[index] = oldIndex + 1;
        }
        const stationary = longestIncreasingSubsequencePositions(encoded);
        const plan = planStationaryMoves(nextIds, stationary, index => encoded[index] !== 0);
        for (let index = 0; index < plan.movingIds.length; index++) {
          update.move(plan.movingIds[index]!, regionId, plan.beforeIds[index]!);
        }
        entries = reordered;
      });
    });
    return regionId;
  });
  attachScope(tx, scope.value, scope);
  return [scope.value];
}

/** Stationary-id set adapter over the shared LIS in `flat/lis.ts`. */
export function longestIncreasingIds(
  nextIds: readonly NodeId[],
  oldIndexById: ReadonlyMap<NodeId, number>
): Set<NodeId> {
  const encoded = new Array<number>(nextIds.length).fill(0);
  for (let index = 0; index < nextIds.length; index++) {
    const oldIndex = oldIndexById.get(nextIds[index]!);
    if (oldIndex !== undefined) encoded[index] = oldIndex + 1;
  }
  const stationary = longestIncreasingSubsequencePositions(encoded);
  const result = new Set<NodeId>();
  for (let index = 0; index < nextIds.length; index++) {
    if (stationary[index] === 1) result.add(nextIds[index]!);
  }
  return result;
}

/** Mount a reactive subtree and return its lifecycle disposer. */
export function mount(component: (() => Child) | Child, target: Element): Dispose {
  if (registry.rootFor(target)) throw new Error("ZUI_ROOT_OCCUPIED");
  const root = registry.createRoot(target);
  let disposed = false;
  let rootScope: { dispose(): void } | undefined;
  try {
    const scope = engine.untrack(() =>
      engine.createOwner(
        () => {
          const nodes = patches.transaction(root.rootId, tx => {
            const value = typeof component === "function" ? (component as () => Child)() : component;
            return renderChild(value, root.nodeId, root.ownerId, root, tx);
          });
          engine.onCleanup(() => registry.disposeOwner(root.ownerId));
          return nodes;
        },
        { ownerId: root.ownerId }
      )
    );
    rootScope = scope;
  } catch (error) {
    registry.disposeRoot(root.rootId);
    throw error;
  }

  return () => {
    if (disposed) return;
    disposed = true;
    let failure: unknown;
    try {
      const children = registry.children(root.nodeId);
      if (children.length) {
        patches.transaction(root.rootId, tx => {
          for (const childId of children) tx.remove(childId);
        });
      }
    } catch (error) {
      failure = error;
    }
    let empty = false;
    try {
      empty = registry.children(root.nodeId).length === 0;
    } catch (error) {
      failure ??= error;
    }
    if (!empty) {
      disposed = false;
      if (failure) throw failure;
      return;
    }
    try {
      rootScope?.dispose();
    } catch (error) {
      failure ??= error;
    }
    try {
      registry.disposeRoot(root.rootId);
    } catch (error) {
      failure ??= error;
    }
    if (failure) throw failure;
  };
}
