import type { Key } from "../flat.js";
import type { Store } from "../reactive.js";
import type { Binding, Child, Conditional, Repetition, VNode } from "./types.js";

export function jsx(type: VNode["type"], props: Record<string, any> | null, key?: Key): VNode {
  return { type, props: props ?? {}, key };
}

export const jsxs = jsx;

export const Fragment = (props: { children?: Child }): Child => props.children;

export function Show(props: {
  when: boolean | Binding<unknown> | Store<unknown>;
  fallback?: Child | (() => Child);
  children: Child | (() => Child);
}): Conditional {
  return { kind: "show", ...props };
}

export function For<T>(props: {
  each: readonly T[] | Binding<readonly T[]> | Store<readonly T[]>;
  by: (item: T) => Key;
  children: (item: T, current: () => T) => Child;
}): Repetition<T> {
  return { kind: "for", ...props };
}

export function isConditional(value: unknown): value is Conditional {
  return typeof value === "object" && value !== null && (value as Conditional).kind === "show";
}

export function isRepetition(value: unknown): value is Repetition<unknown> {
  return typeof value === "object" && value !== null && (value as Repetition<unknown>).kind === "for";
}
