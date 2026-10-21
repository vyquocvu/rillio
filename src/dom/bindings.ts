import { createEngine, type Store } from "../reactive.js";
import { nodeRegistry, patchEngine } from "../compat.js";
import { BINDING, type Binding, type Child } from "./types.js";

export const registry = nodeRegistry;
export const patches = patchEngine;

/** Graph engine powers the explicit reactive frontend surface. */
export const engine = createEngine("graph", { ownerHost: registry });

export const createStore = <T>(initial: T): Store<T> => engine.createStore(initial);

/**
 * React-familiar naming; unlike React useState, returns a live Store.
 * @deprecated Prefer `createStore` directly in `zui/dom`, or `import { useStore } from "zui/external-store"` for external stores.
 */
export const useStore = createStore;

export const computed = <T>(fn: () => T) => engine.computed(fn);
export const batch = <T>(fn: () => T) => engine.batch(fn);
export const untrack = <T>(fn: () => T): T => engine.untrack(fn);

export function select<S, T>(store: Store<S>, selector: (state: S) => T): Binding<T> {
  return { [BINDING]: true, read: () => selector(store.get()) };
}

export function derive<T>(read: () => T): Binding<T> {
  return { [BINDING]: true, read };
}

export function isStore(value: unknown): value is Store<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Store<unknown>).get === "function" &&
    typeof (value as Store<unknown>).set === "function"
  );
}

export function isBinding(value: unknown): value is Binding<unknown> {
  return typeof value === "object" && value !== null && BINDING in value;
}

export function readReactive(value: Store<unknown> | Binding<unknown>): unknown {
  return isBinding(value) ? value.read() : value.get();
}

export function stringify(value: unknown): string {
  return value == null || typeof value === "boolean" ? "" : String(value);
}

export function evaluate<T>(input: T | Binding<T> | Store<T>): T {
  return isBinding(input) || isStore(input) ? (readReactive(input) as T) : (input as T);
}

export function resolveChild(value: unknown): Child {
  return typeof value === "function" ? (value as () => Child)() : (value as Child);
}
