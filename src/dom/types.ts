import type { Store } from "../reactive.js";
import type { Key, NodeId, OwnerId } from "../flat.js";

export const BINDING = Symbol("rillio.binding");

export interface Binding<T> {
  readonly [BINDING]: true;
  readonly read: () => T;
}

export interface VNode {
  readonly type: string | ((props: any) => any);
  readonly props: Record<string, any>;
  readonly key?: Key;
}

export type Child =
  | VNode
  | Store<any>
  | (() => Child)
  | Binding<unknown>
  | Conditional
  | Repetition<any>
  | string
  | number
  | boolean
  | null
  | undefined
  | Child[];

export interface Conditional {
  kind: "show";
  when: boolean | Binding<unknown> | Store<unknown>;
  fallback?: Child | (() => Child);
  children: Child | (() => Child);
}

export interface Repetition<T> {
  kind: "for";
  each: readonly T[] | Binding<readonly T[]> | Store<readonly T[]>;
  by: (item: T) => Key;
  children: (item: T, current: () => T) => Child;
}

export interface Scope<T> {
  readonly ownerId: OwnerId;
  readonly value: T;
  dispose(): void;
}
