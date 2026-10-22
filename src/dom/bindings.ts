import type { Store } from "../reactive.js";
import { nodeRegistry, patchEngine } from "../compat.js";
import { engine } from "../reactive-api.js";
import { BINDING, type Binding, type Child } from "./types.js";

export const registry = nodeRegistry;
export const patches = patchEngine;

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

export { engine };

export function evaluate<T>(input: T | Binding<T> | Store<T>): T {
  return isBinding(input) || isStore(input) ? (readReactive(input) as T) : (input as T);
}

export function resolveChild(value: unknown): Child {
  return typeof value === "function" ? (value as () => Child)() : (value as Child);
}
