/**
 * Execution context and shared state for the compat runtime.
 */

import {
  NodeRegistry,
  PatchEngine,
  type PatchTransaction,
  type NodeId
} from "../flat.js";
import type {
  ComponentState,
  ComponentSnapshot,
  RenderTransactionSnapshot,
  FlatRoot,
  RootController,
  Hook
} from "./types.js";

export const nodeRegistry = new NodeRegistry();
export const patchEngine = new PatchEngine(nodeRegistry);

export let active: ComponentState | undefined;
export function setActive(state: ComponentState | undefined): ComponentState | undefined {
  const previous = active;
  active = state;
  return previous;
}

export let renderingDepth = 0;
export function incrementRenderingDepth(): number {
  return ++renderingDepth;
}
export function decrementRenderingDepth(): number {
  return --renderingDepth;
}

export const pendingEffects = new Set<Hook>();
export const roots = new WeakMap<Element, RootController>();
export let flushingEffects = false;
export let lastFailedState: ComponentState | undefined;

export function getLastFailedState(): ComponentState | undefined {
  return lastFailedState;
}

export function setLastFailedState(state: ComponentState | undefined): void {
  lastFailedState = state;
}

export let renderTransactionSnapshot: RenderTransactionSnapshot | undefined;

export function getRenderTransactionSnapshot(): RenderTransactionSnapshot | undefined {
  return renderTransactionSnapshot;
}

export function setRenderTransactionSnapshot(snapshot: RenderTransactionSnapshot | undefined): void {
  renderTransactionSnapshot = snapshot;
}

export function rootForId(rootId: number): FlatRoot {
  return nodeRegistry.getRoot(rootId) as FlatRoot;
}

let componentUpdater: ((nodeId: NodeId) => void) | undefined;

export function setComponentUpdater(updater: (nodeId: NodeId) => void): void {
  componentUpdater = updater;
}

export function triggerComponentUpdate(nodeId: NodeId): void {
  if (componentUpdater) componentUpdater(nodeId);
}

export function flushEffects(): void {
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

export function snapshotComponent(state: ComponentState): void {
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
    hooks: state.hooks.map(slot => ({ slot, value: { ...slot } })),
    boundaryError: state.boundaryState ? state.boundaryState.error : undefined
  });
}

export function restoreComponentSnapshot(snapshot: ComponentSnapshot): void {
  const { state } = snapshot;
  state.props = snapshot.props;
  state.cursor = snapshot.cursor;
  state.hookCount = snapshot.hookCount;
  state.hooks.length = snapshot.hooks.length;
  for (const { slot, value } of snapshot.hooks) {
    for (const key of Object.keys(slot) as Array<keyof Hook>) delete slot[key];
    Object.assign(slot, value);
  }
  if (state.boundaryState && "boundaryError" in snapshot) {
    state.boundaryState.error = snapshot.boundaryError ?? null;
  }
}

export function renderTransaction<T>(rootId: number, work: (tx: PatchTransaction) => T): T {
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
