/**
 * Hook primitives and component lifecycle disposal.
 */

import type { Hook, ComponentState } from "./types.js";
import {
  active,
  renderingDepth,
  pendingEffects,
  nodeRegistry,
  triggerComponentUpdate
} from "./state.js";

const equalDeps = (a?: readonly unknown[], b?: readonly unknown[]): boolean =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

function hook(): Hook {
  if (!active) throw new Error("RILLIO_INVALID_HOOK_CALL");
  const slot = (active.hooks[active.cursor] ??= {});
  slot.ownerNodeId = active.nodeId;
  active.cursor++;
  return slot;
}

export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const owner = active;
  const slot = hook();
  if (!("value" in slot)) slot.value = typeof initial === "function" ? (initial as () => T)() : initial;
  return [
    slot.value as T,
    next => {
      if (!owner || owner.disposed) return;
      if (renderingDepth > 0) throw new Error("RILLIO_RENDER_PHASE_UPDATE");
      const previous = slot.value as T;
      const value = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      try {
        triggerComponentUpdate(owner.nodeId);
      } catch (error) {
        slot.value = previous;
        throw error;
      }
    }
  ];
}

export function useRef<T>(initial: T): { current: T } {
  const slot = hook();
  return (slot.value ??= { current: initial });
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

export function disposeComponent(state: ComponentState): void {
  if (state.disposed) return;
  state.disposed = true;
  let failure: unknown;
  for (const slot of state.hooks) {
    slot.disposed = true;
    pendingEffects.delete(slot);
    const cleanup = slot.cleanup;
    slot.cleanup = undefined;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        failure ??= error;
      }
    }
  }
  try {
    nodeRegistry.disposeOwner(state.ownerId);
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw failure;
}
