/** Public reactive API shared by the DOM planner and application stores. */
export * from "./reactive.js";

import { nodeRegistry } from "./compat.js";
import { createEngine } from "./reactive.js";

/**
 * Shared graph engine for stores used by the explicit DOM API.
 * Keeping one engine lets DOM effects subscribe to these stores and lets
 * owner cleanup dispose their computations together with DOM scopes.
 */
export const engine = createEngine("graph", { ownerHost: nodeRegistry });

export const createStore = <T>(initial: T) => engine.createStore(initial);
export const computed = <T>(fn: () => T) => engine.computed(fn);
export const batch = <T>(fn: () => T): T => engine.batch(fn);
export const untrack = <T>(fn: () => T): T => engine.untrack(fn);
