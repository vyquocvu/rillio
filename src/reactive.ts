/**
 * ZUI Spike 0: one observable contract, two invalidation strategies.
 * Scan visits every active effect per state commit.
 * Graph tracks dependencies and schedules only affected effects.
 * Effects observe settled computed values, never intermediary diamond values.
 */
import type { OwnerHost, OwnerId, RootId } from "./flat.js";

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

export type ResourceStatus = "idle" | "pending" | "success" | "error";

export interface ResourceState<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: Error | undefined;
  readonly status: ResourceStatus;
}

export interface Resource<T, S = unknown> {
  readonly data: Store<T | undefined>;
  readonly loading: Store<boolean>;
  readonly error: Store<Error | undefined>;
  readonly status: Store<ResourceStatus>;
  get(): ResourceState<T>;
  refetch(): Promise<T | undefined>;
  mutate(next: T | undefined | ((previous: T | undefined) => T | undefined)): void;
  dispose(): void;
}

export type ResourceFetcher<T, S = unknown> = (
  source: S,
  info: { refetching: boolean; previous: T | undefined }
) => Promise<T> | T;

export interface ResourceOptions<T, S = unknown> {
  initialValue?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
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
  ownerId: OwnerId | undefined;
  cleanup: Dispose | undefined;
}

interface EngineOptions {
  maxRounds?: number;
  ownerHost?: OwnerHost;
  ownerRootId?: RootId;
}

interface MemoryOwner {
  id: OwnerId;
  rootId: RootId;
  parentId: OwnerId | null;
  children: Set<OwnerId>;
  disposed: boolean;
}

class MemoryOwnerHost implements OwnerHost {
  private nextId = 1;
  private readonly owners = new Map<OwnerId, MemoryOwner>();

  createOwner(rootId: RootId, parentId: OwnerId | null = null): OwnerId {
    if (parentId !== null && this.get(parentId).rootId !== rootId) throw new Error("ZUI_OWNER_ROOT_MISMATCH");
    const id = this.nextId++;
    const owner: MemoryOwner = { id, rootId, parentId, children: new Set(), disposed: false };
    this.owners.set(id, owner);
    if (parentId !== null) this.get(parentId).children.add(id);
    return id;
  }

  ownerParent(ownerId: OwnerId): OwnerId | null {
    return this.get(ownerId).parentId;
  }

  ownerChildren(ownerId: OwnerId): readonly OwnerId[] {
    return [...this.get(ownerId).children];
  }

  disposeOwner(ownerId: OwnerId): void {
    const owner = this.get(ownerId);
    if (owner.disposed) return;
    owner.disposed = true;
    for (const child of [...owner.children]) this.disposeOwner(child);
    if (owner.parentId !== null) this.get(owner.parentId).children.delete(ownerId);
    owner.children.clear();
  }

  private get(ownerId: OwnerId): MemoryOwner {
    const owner = this.owners.get(ownerId);
    if (!owner) throw new Error("ZUI_UNKNOWN_OWNER");
    return owner;
  }
}

export class ReactiveEngine {
  private readonly all = new Set<Computation>();
  private readonly effects = new Set<Computation>();
  private readonly dirtyEffects = new Set<Computation>();
  private current: Computation | undefined;
  private ownerId: OwnerId | undefined;
  private readonly ownerHost: OwnerHost;
  private readonly ownerRootId: RootId;
  private readonly computationsByOwner = new Map<OwnerId, Set<Computation>>();
  private readonly cleanupsByOwner = new Map<OwnerId, Set<Dispose>>();
  private readonly disposingOwners = new Set<OwnerId>();
  private batchDepth = 0;
  private flushing = false;
  private pending = false;
  private visits = 0;
  private evaluations = 0;
  private readonly maxRounds: number;

  constructor(readonly mode: Mode, options: EngineOptions = {}) {
    this.maxRounds = options.maxRounds ?? 100;
    this.ownerHost = options.ownerHost ?? new MemoryOwnerHost();
    this.ownerRootId = options.ownerRootId ?? 0;
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
      else this.dirtyEffects.add(observer);
    }
  }

  private evaluate(node: Computation): unknown {
    if (node.disposed) return node.value;
    if (node.evaluating) throw new Error("ZUI_REACTIVE_CYCLE");
    if (node.kind === "computed" && node.initialized && !node.dirty) {
      return node.value;
    }
    node.evaluating = true;
    node.dirty = false; // re-invalidation during execution must survive
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

  /** Read without subscribing the currently executing computation. */
  untrack<T>(fn: () => T): T {
    const previous = this.current;
    this.current = undefined;
    try { return fn(); }
    finally { this.current = previous; }
  }

  createStore<T>(initial: T): Store<T> {
    const source: Source = { observers: new Set() };
    let value = initial;
    return {
      get: () => { this.track(source); return value; },
      set: (update) => {
        if (this.current?.kind === "computed") {
          throw new Error("ZUI_COMPUTED_WRITE");
        }
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
      // Cleanup is not reactive: reads inside cleanup must never become
      // dependencies of the next effect execution.
      if (node.cleanup) {
        const cleanup = node.cleanup;
        node.cleanup = undefined;
        const active = this.current;
        this.current = undefined;
        try { cleanup(); }
        finally { this.current = active; }
      }
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
      value: undefined, initialized: false, ownerId: this.ownerId, cleanup: undefined
    };
    this.all.add(node);
    if (node.ownerId !== undefined) {
      let computations = this.computationsByOwner.get(node.ownerId);
      if (!computations) this.computationsByOwner.set(node.ownerId, computations = new Set());
      computations.add(node);
    }
    return node;
  }

  private disposeComputation(node: Computation): void {
    if (node.disposed) return;
    node.disposed = true;
    const cleanup = node.cleanup;
    node.cleanup = undefined;
    let failure: unknown;
    if (cleanup) {
      try { this.untrack(cleanup); }
      catch (error) { failure = error; }
    }
    for (const dep of node.dependencies) dep.observers.delete(node);
    node.dependencies.clear();
    for (const observer of node.observers) {
      observer.dependencies.delete(node);
      observer.dirty = true;
    }
    node.observers.clear();
    if (node.ownerId !== undefined) this.computationsByOwner.get(node.ownerId)?.delete(node);
    this.effects.delete(node);
    this.dirtyEffects.delete(node);
    this.all.delete(node);
    if (failure) throw failure;
  }

  createOwner<T>(fn: () => T, options: { ownerId?: OwnerId; rootId?: RootId } = {}): { value: T; ownerId: OwnerId; dispose: Dispose } {
    const parentId = this.ownerId ?? null;
    const ownerId = options.ownerId ?? this.ownerHost.createOwner(options.rootId ?? this.ownerRootId, parentId);
    if (options.ownerId !== undefined && parentId !== null && this.ownerHost.ownerParent(ownerId) !== parentId) {
      throw new Error("ZUI_OWNER_PARENT_MISMATCH");
    }
    this.ownerId = ownerId;
    let value: T;
    try { value = fn(); }
    catch (error) { this.disposeOwner(ownerId); throw error; }
    finally { this.ownerId = parentId === null ? undefined : parentId; }
    return { value, ownerId, dispose: () => this.disposeOwner(ownerId) };
  }

  onCleanup(fn: Dispose): void {
    if (this.ownerId === undefined) throw new Error("ZUI_NO_OWNER");
    let cleanups = this.cleanupsByOwner.get(this.ownerId);
    if (!cleanups) this.cleanupsByOwner.set(this.ownerId, cleanups = new Set());
    cleanups.add(fn);
  }

  private disposeOwner(ownerId: OwnerId): void {
    if (this.disposingOwners.has(ownerId)) return;
    this.disposingOwners.add(ownerId);
    let failure: unknown;
    const capture = (fn: () => void): void => {
      try { fn(); }
      catch (error) { failure ??= error; }
    };
    try {
      for (const child of this.ownerHost.ownerChildren(ownerId)) capture(() => this.disposeOwner(child));
      for (const computation of [...(this.computationsByOwner.get(ownerId) ?? [])]) capture(() => this.disposeComputation(computation));
      for (const cleanup of this.cleanupsByOwner.get(ownerId) ?? []) capture(() => this.untrack(cleanup));
      this.computationsByOwner.delete(ownerId);
      this.cleanupsByOwner.delete(ownerId);
      this.ownerHost.disposeOwner(ownerId);
      if (failure) throw failure;
    } finally {
      this.disposingOwners.delete(ownerId);
    }
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
        // Scan visits every active effect. Graph dequeues only invalidated
        // effects, preserving a stable snapshot for each flush round.
        const work = this.mode === "scan"
          ? [...this.effects] : [...this.dirtyEffects];
        if (this.mode === "graph") this.dirtyEffects.clear();
        for (const node of work) {
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

  resource<T>(
    fetcher: ResourceFetcher<T, void>,
    options?: ResourceOptions<T, void>
  ): Resource<T, void>;
  resource<T, S>(
    source: Store<S> | (() => S),
    fetcher: ResourceFetcher<T, S>,
    options?: ResourceOptions<T, S>
  ): Resource<T, S>;
  resource<T, S>(
    arg1: (Store<S> | (() => S)) | ResourceFetcher<T, void>,
    arg2?: ResourceFetcher<T, S> | ResourceOptions<T, void>,
    arg3?: ResourceOptions<T, S>
  ): Resource<T, S> {
    return createResource(this, arg1 as any, arg2 as any, arg3 as any);
  }
}

export function createEngine(mode: Mode, options?: EngineOptions): ReactiveEngine {
  return new ReactiveEngine(mode, options);
}

export function createResource<T>(
  engine: ReactiveEngine,
  fetcher: ResourceFetcher<T, void>,
  options?: ResourceOptions<T, void>
): Resource<T, void>;
export function createResource<T, S>(
  engine: ReactiveEngine,
  source: Store<S> | (() => S),
  fetcher: ResourceFetcher<T, S>,
  options?: ResourceOptions<T, S>
): Resource<T, S>;
export function createResource<T, S>(
  engine: ReactiveEngine,
  arg1: (Store<S> | (() => S)) | ResourceFetcher<T, void>,
  arg2?: ResourceFetcher<T, S> | ResourceOptions<T, void>,
  arg3?: ResourceOptions<T, S>
): Resource<T, S> {
  const hasSource = typeof arg2 === "function";
  const source = hasSource ? (arg1 as Store<S> | (() => S)) : undefined;
  const fetcher = hasSource
    ? (arg2 as ResourceFetcher<T, S>)
    : (arg1 as ResourceFetcher<T, void>);
  const options = hasSource
    ? arg3
    : (arg2 as ResourceOptions<T, void> | undefined);

  const initialVal = options?.initialValue;
  const dataStore = engine.createStore<T | undefined>(initialVal);
  const loadingStore = engine.createStore<boolean>(false);
  const errorStore = engine.createStore<Error | undefined>(undefined);
  const statusStore = engine.createStore<ResourceStatus>("idle");

  let currentRequestId = 0;
  let disposed = false;
  let lastSourceValue: S | undefined;

  const runFetch = (sourceVal: any, isRefetch = false): Promise<T | undefined> => {
    if (disposed) return Promise.resolve(undefined);
    lastSourceValue = sourceVal;
    const requestId = ++currentRequestId;

    engine.batch(() => {
      loadingStore.set(true);
      statusStore.set("pending");
    });

    const previous = dataStore.get();
    let resultPromise: Promise<T> | T;
    try {
      resultPromise = fetcher(sourceVal, { refetching: isRefetch, previous });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (requestId === currentRequestId && !disposed) {
        engine.batch(() => {
          errorStore.set(error);
          loadingStore.set(false);
          statusStore.set("error");
        });
        options?.onError?.(error);
      }
      return Promise.reject(error);
    }

    if (resultPromise instanceof Promise) {
      return resultPromise.then(
        data => {
          if (requestId === currentRequestId && !disposed) {
            engine.batch(() => {
              dataStore.set(data);
              errorStore.set(undefined);
              loadingStore.set(false);
              statusStore.set("success");
            });
            options?.onSuccess?.(data);
          }
          return data;
        },
        err => {
          const error = err instanceof Error ? err : new Error(String(err));
          if (requestId === currentRequestId && !disposed) {
            engine.batch(() => {
              errorStore.set(error);
              loadingStore.set(false);
              statusStore.set("error");
            });
            options?.onError?.(error);
          }
          return undefined;
        }
      );
    } else {
      const data = resultPromise;
      if (requestId === currentRequestId && !disposed) {
        engine.batch(() => {
          dataStore.set(data);
          errorStore.set(undefined);
          loadingStore.set(false);
          statusStore.set("success");
        });
        options?.onSuccess?.(data);
      }
      return Promise.resolve(data);
    }
  };

  let stopEffect: Dispose | undefined;

  if (hasSource && source) {
    let initial = true;
    stopEffect = engine.effect(() => {
      const sourceVal =
        typeof source === "function"
          ? (source as () => S)()
          : (source as Store<S>).get();
      engine.untrack(() => {
        runFetch(sourceVal, !initial);
      });
      initial = false;
    });
  } else {
    runFetch(undefined as any, false);
  }

  const res: Resource<T, S> = {
    data: dataStore,
    loading: loadingStore,
    error: errorStore,
    status: statusStore,
    get() {
      return {
        data: dataStore.get(),
        loading: loadingStore.get(),
        error: errorStore.get(),
        status: statusStore.get(),
      };
    },
    refetch() {
      // Imperative call: a tracking caller must not subscribe to the source
      // or to the resource internals that runFetch reads.
      return engine.untrack(() => {
        const sourceVal = hasSource
          ? typeof source === "function"
            ? (source as () => S)()
            : (source as Store<S>).get()
          : lastSourceValue;
        return runFetch(sourceVal, true);
      });
    },
    mutate(next) {
      if (disposed) return;
      currentRequestId++;
      engine.untrack(() => {
        const prev = dataStore.get();
        const nextVal =
          typeof next === "function"
            ? (next as (prev: T | undefined) => T | undefined)(prev)
            : next;
        engine.batch(() => {
          dataStore.set(nextVal);
          errorStore.set(undefined);
          loadingStore.set(false);
          statusStore.set("success");
        });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      currentRequestId++;
      if (stopEffect) {
        stopEffect();
        stopEffect = undefined;
      }
    },
  };

  try {
    engine.onCleanup(() => {
      res.dispose();
    });
  } catch {
    // No active owner
  }

  return res;
}

