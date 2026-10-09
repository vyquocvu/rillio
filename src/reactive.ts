/**
 * ZUI Spike 0: one observable contract, two invalidation strategies.
 * Scan visits every active effect per state commit.
 * Graph tracks dependencies and schedules only affected effects.
 * Effects observe settled computed values, never intermediary diamond values.
 */
export type Dispose = () => void;
export type Mode = "scan" | "graph";
export interface Store<T> { get(): T; set(value: T | ((previous: T) => T)): void }
export interface Computed<T> { get(): T }
export interface Diagnostics {
  activeComputations: number;
  visitedComputations: number;
  selectorEvaluations: number;
  dependencyEdges: number;
}

interface Source { observers: Set<Computation> }
interface Computation extends Source {
  kind: "computed" | "effect";
  run: () => unknown;
  dependencies: Set<Source>;
  dirty: boolean;
  disposed: boolean;
  evaluating: boolean;
  value: unknown;
  initialized: boolean;
  owner: Owner | undefined;
  cleanup: Dispose | undefined;
}
interface Owner {
  parent: Owner | undefined;
  children: Set<Owner>;
  computations: Set<Computation>;
  cleanups: Set<Dispose>;
  disposed: boolean;
}

export class ReactiveEngine {
  private readonly all = new Set<Computation>();
  private readonly effects = new Set<Computation>();
  private current: Computation | undefined;
  private owner: Owner | undefined;
  private batchDepth = 0;
  private flushing = false;
  private pending = false;
  private visits = 0;
  private evaluations = 0;
  private readonly maxRounds: number;

  constructor(readonly mode: Mode, options: { maxRounds?: number } = {}) {
    this.maxRounds = options.maxRounds ?? 100;
  }

  private track(source: Source): void {
    const active = this.current;
    if (!active || active.disposed) return;
    source.observers.add(active);
    active.dependencies.add(source);
  }

  private invalidate(source: Source, seen = new Set<Computation>()): void {
    for (const observer of [...source.observers]) {
      if (observer.disposed || seen.has(observer)) continue;
      seen.add(observer);
      observer.dirty = true;
      if (observer.kind === "computed") this.invalidate(observer, seen);
    }
  }

  private evaluate(node: Computation): unknown {
    if (node.disposed) return node.value;
    if (node.evaluating) throw new Error("ZUI_REACTIVE_CYCLE");
    if (node.kind === "computed" && node.initialized && !node.dirty) {
      return node.value;
    }
    node.evaluating = true;
    // Capture the next dependencies separately. A failed evaluation must not
    // leave a half-subscribed computation in the graph.
    const oldDeps = node.dependencies;
    node.dependencies = new Set();
    const previous = this.current;
    this.current = node;
    try {
      this.evaluations++;
      const next = node.run();
      for (const dep of oldDeps) {
        if (!node.dependencies.has(dep)) dep.observers.delete(node);
      }
      node.value = next;
      node.initialized = true;
      node.dirty = false;
      return next;
    } catch (error) {
      for (const dep of node.dependencies) {
        if (!oldDeps.has(dep)) dep.observers.delete(node);
      }
      node.dependencies = oldDeps;
      node.dirty = true;
      throw error;
    } finally {
      this.current = previous;
      node.evaluating = false;
    }
  }

  createStore<T>(initial: T): Store<T> {
    const source: Source = { observers: new Set() };
    let value = initial;
    return {
      get: () => { this.track(source); return value; },
      set: (update) => {
        const next = typeof update === "function"
          ? (update as (previous: T) => T)(value) : update;
        if (Object.is(value, next)) return;
        value = next;
        this.pending = true;
        if (this.mode === "graph") this.invalidate(source);
        else for (const computation of this.all)
          if (computation.kind === "computed") computation.dirty = true;
        if (!this.batchDepth && !this.flushing && !this.current) this.flush();
      }
    };
  }

  computed<T>(calculate: () => T): Computed<T> {
    const node = this.createComputation("computed", calculate);
    return {
      get: () => {
        // Do not create a self-edge on recursive computed reads.
        if (node.evaluating) throw new Error("ZUI_REACTIVE_CYCLE");
        const value = this.evaluate(node) as T;
        this.track(node);
        return value;
      }
    };
  }

  effect(run: () => void | Dispose): Dispose {
    const node = this.createComputation("effect", () => {
      node.cleanup?.();
      node.cleanup = undefined;
      const result = run();
      if (typeof result === "function") node.cleanup = result;
    });
    this.effects.add(node);
    try { this.evaluate(node); }
    catch (error) { this.disposeComputation(node); throw error; }
    // A write inside the initial effect execution is deferred until the
    // effect leaves the evaluation stack; otherwise it recursively executes.
    if (!this.batchDepth && !this.flushing) this.flush();
    return () => this.disposeComputation(node);
  }

  private createComputation(kind: Computation["kind"], run: () => unknown): Computation {
    const node: Computation = {
      kind, run, dependencies: new Set(), observers: new Set(),
      dirty: true, disposed: false, evaluating: false,
      value: undefined, initialized: false, owner: this.owner, cleanup: undefined
    };
    this.all.add(node);
    this.owner?.computations.add(node);
    return node;
  }

  private disposeComputation(node: Computation): void {
    if (node.disposed) return;
    node.disposed = true;
    node.cleanup?.();
    for (const dep of node.dependencies) dep.observers.delete(node);
    node.dependencies.clear();
    for (const observer of node.observers) {
      observer.dependencies.delete(node);
      observer.dirty = true;
    }
    node.observers.clear();
    node.owner?.computations.delete(node);
    this.effects.delete(node);
    this.all.delete(node);
  }

  createOwner<T>(fn: () => T): { value: T; dispose: Dispose } {
    const parent = this.owner;
    const scope: Owner = {
      parent, children: new Set(), computations: new Set(),
      cleanups: new Set(), disposed: false
    };
    parent?.children.add(scope);
    this.owner = scope;
    let value: T;
    try { value = fn(); }
    catch (error) { this.disposeOwner(scope); throw error; }
    finally { this.owner = parent; }
    return { value, dispose: () => this.disposeOwner(scope) };
  }

  onCleanup(fn: Dispose): void {
    if (!this.owner) throw new Error("ZUI_NO_OWNER");
    this.owner.cleanups.add(fn);
  }

  private disposeOwner(owner: Owner): void {
    if (owner.disposed) return;
    owner.disposed = true;
    for (const child of [...owner.children]) this.disposeOwner(child);
    for (const computation of [...owner.computations]) this.disposeComputation(computation);
    for (const cleanup of owner.cleanups) cleanup();
    owner.parent?.children.delete(owner);
    owner.children.clear();
    owner.cleanups.clear();
  }

  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try { return fn(); }
    finally {
      this.batchDepth--;
      if (!this.batchDepth && !this.flushing) this.flush();
    }
  }

  flush(): void {
    if (this.flushing || this.batchDepth || !this.pending) return;
    this.flushing = true;
    let rounds = 0;
    try {
      while (this.pending) {
        if (++rounds > this.maxRounds) {
          this.pending = false;
          throw new Error("ZUI_MAX_FLUSH_ROUNDS");
        }
        this.pending = false;
        // Snapshot effects first; owners disposed while flushing are skipped.
        for (const node of [...this.effects]) {
          if (node.disposed) continue;
          this.visits++;
          if (this.mode === "scan" || node.dirty) this.evaluate(node);
        }
      }
    } finally { this.flushing = false; }
  }

  diagnostics(): Diagnostics {
    let edges = 0;
    for (const node of this.all) edges += node.dependencies.size;
    return {
      activeComputations: this.all.size,
      visitedComputations: this.visits,
      selectorEvaluations: this.evaluations,
      dependencyEdges: edges
    };
  }
}

export function createEngine(mode: Mode, options?: { maxRounds?: number }): ReactiveEngine {
  return new ReactiveEngine(mode, options);
}
