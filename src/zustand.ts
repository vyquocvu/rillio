/**
 * Zustand-compatible external-store hook for ZUI components.
 *
 * This adapter accepts Zustand's vanilla/bound Store API structurally. It does
 * not import Zustand or React, so applications keep one renderer and can use
 * Zustand middleware and actions without wrapping the store in another state
 * layer.
 */
import { useEffect, useRef, useState } from "./compat.js";

export interface ZustandStore<State> {
  getState(): State;
  subscribe(listener: (state: State, previousState: State) => void): () => void;
}

export type EqualityFn<Value> = (previous: Value, next: Value) => boolean;

const identity = <State>(state: State): State => state;

/**
 * Select a value from a Zustand vanilla or bound store inside a ZUI component.
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
