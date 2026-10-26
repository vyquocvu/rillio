/**
 * Zustand-compatible external-store hook and store creator for Rillio components.
 *
 * This adapter accepts Zustand's vanilla/bound Store API structurally. It does
 * not import Zustand or React, so applications keep one renderer and can use
 * Zustand middleware and actions without wrapping the store in another state
 * layer.
 */
import { shallowEqual } from "./flat.js";
import { useEffect, useRef, useState } from "./compat.js";

export interface ZustandStore<State> {
  getState(): State;
  subscribe(listener: (state: State, previousState: State) => void): () => void;
  setState?: any;
  getInitialState?: () => State;
}

export type EqualityFn<Value> = (previous: Value, next: Value) => boolean;

const identity = <State>(state: State): State => state;

/**
 * Compares two values for shallow equality (supports primitives, objects, and arrays).
 */
export function shallow<T>(a: T, b: T): boolean {
  return shallowEqual(a, b);
}

/**
 * Wraps a selector to return a cached reference if the newly computed object or array
 * is shallowly equal to the previous selection. Matches Zustand v5 `useShallow`.
 */
export function useShallow<State, Selection>(
  selector: (state: State) => Selection
): (state: State) => Selection {
  const prevRef = useRef<Selection | undefined>(undefined);
  return (state: State): Selection => {
    const next = selector(state);
    if (prevRef.current !== undefined && shallow(prevRef.current, next)) {
      return prevRef.current;
    }
    prevRef.current = next;
    return next;
  };
}

/**
 * Select a value from a Zustand vanilla or bound store inside a Rillio component.
 * The component updates only when the selected value fails `equalityFn`.
 */
export function useStore<State, Selection = State>(
  store: ZustandStore<State>,
  selector: (state: State) => Selection = identity as (state: State) => Selection,
  equalityFn: EqualityFn<Selection> = Object.is
): Selection {
  const [, setRevision] = useState(0);
  const selection = selector(store.getState());
  const selectionRef = useRef(selection);
  const selectorRef = useRef(selector);
  const equalityRef = useRef(equalityFn);

  // Keep these refs current without resubscribing when callers inline selectors.
  selectionRef.current = selection;
  selectorRef.current = selector;
  equalityRef.current = equalityFn;

  useEffect(() => {
    const notify = (state: State): void => {
      const nextSelection = selectorRef.current(state);
      if (equalityRef.current(selectionRef.current, nextSelection)) return;
      selectionRef.current = nextSelection;
      setRevision(revision => revision + 1);
    };

    const unsubscribe = store.subscribe(notify);
    // Recheck after subscribing so an update between render and effect cannot
    // leave the component showing a stale snapshot.
    notify(store.getState());
    return unsubscribe;
  }, [store]);

  return selection;
}

export type StateCreator<State> = (
  set: (
    partial: State | Partial<State> | ((state: State) => State | Partial<State>),
    replace?: boolean
  ) => void,
  get: () => State,
  store: ZustandStore<State>
) => State;

export type BoundStore<State> = {
  (): State;
  <Selection>(selector: (state: State) => Selection, equalityFn?: EqualityFn<Selection>): Selection;
} & ZustandStore<State> & {
  setState(
    partial: State | Partial<State> | ((state: State) => State | Partial<State>),
    replace?: boolean
  ): void;
  getInitialState(): State;
};

/**
 * Creates a lightweight Zustand-compatible vanilla store without React dependencies.
 */
export function createStore<State>(initializer: StateCreator<State>): ZustandStore<State> & {
  setState(
    partial: State | Partial<State> | ((state: State) => State | Partial<State>),
    replace?: boolean
  ): void;
  getInitialState(): State;
} {
  let state: State;
  const listeners = new Set<(state: State, prevState: State) => void>();

  const setState = (
    partial: State | Partial<State> | ((state: State) => State | Partial<State>),
    replace?: boolean
  ): void => {
    const nextState = typeof partial === "function" ? (partial as (state: State) => State | Partial<State>)(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace ?? (typeof nextState !== "object" || nextState === null))
        ? (nextState as State)
        : Object.assign({}, state, nextState);
      for (const listener of listeners) {
        listener(state, previousState);
      }
    }
  };

  const getState = (): State => state;
  const subscribe = (listener: (state: State, prevState: State) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const store = {
    getState,
    setState,
    getInitialState: () => initialState,
    subscribe
  };
  const initialState = (state = initializer(setState, getState, store));
  return store;
}

/**
 * Creates a bound store hook with full Zustand API (getState, setState, subscribe)
 * for Rillio components. Can take a state initializer or wrap an existing vanilla store.
 */
export function create<State>(initializer: StateCreator<State>): BoundStore<State>;
export function create<Store extends ZustandStore<any>>(
  store: Store
): {
  (): Store extends ZustandStore<infer S> ? S : never;
  <Selection>(
    selector: (state: Store extends ZustandStore<infer S> ? S : never) => Selection,
    equalityFn?: EqualityFn<Selection>
  ): Selection;
} & Store;
export function create(initializerOrStore: any): any {
  const store = typeof initializerOrStore === "function" ? createStore(initializerOrStore) : initializerOrStore;
  const useBoundStore = (selector?: any, equalityFn?: any) => useStore(store, selector, equalityFn);
  Object.assign(useBoundStore, store);
  return useBoundStore;
}
