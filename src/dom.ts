import { createEngine, type Store, type Dispose } from "./reactive.js";

/** Default graph engine powers the standalone frontend runtime. */
export const engine = createEngine("graph");
export const createStore = <T>(initial: T): Store<T> => engine.createStore(initial);
/** React-familiar naming; unlike React useState, returns a live Store (not a snapshot). */
export const useStore = createStore;
export const computed = <T>(fn: () => T) => engine.computed(fn);
export const batch = <T>(fn: () => T) => engine.batch(fn);
export const untrack = <T>(fn: () => T): T => engine.untrack(fn);

const BINDING = Symbol("zui.binding");
export interface Binding<T> {
  readonly [BINDING]: true;
  readonly read: () => T;
}
export function select<S, T>(store: Store<S>, selector: (state: S) => T): Binding<T> {
  return { [BINDING]: true, read: () => selector(store.get()) };
}
export function derive<T>(read: () => T): Binding<T> {
  return { [BINDING]: true, read };
}
function isStore(value: unknown): value is Store<unknown> {
  return typeof value === "object" && value !== null &&
    typeof (value as Store<unknown>).get === "function" &&
    typeof (value as Store<unknown>).set === "function";
}
function isBinding(value: unknown): value is Binding<unknown> {
  return typeof value === "object" && value !== null && BINDING in value;
}
export type Child = VNode | Store<any> | (() => Child) | Binding<unknown> | Conditional | Repetition<any> | string | number | boolean | null | undefined | Child[];
export interface VNode {
  readonly type: string | ((props: any) => any);
  readonly props: Record<string, any>;
  readonly key?: string | number;
}
export function jsx(type: VNode["type"], props: Record<string, any> | null, key?: string | number): VNode {
  return { type, props: props ?? {}, key };
}
export const jsxs = jsx;
export const Fragment = (props: { children?: Child }): Child => props.children;

interface Conditional {
  kind: "show";
  when: boolean | Binding<unknown>;
  fallback?: Child | (() => Child);
  children: Child | (() => Child);
}
interface Repetition<T> {
  kind: "for";
  each: readonly T[] | Binding<readonly T[]>;
  by: (item: T) => string | number;
  children: (item: T, current: () => T) => Child;
}
export function Show(props: { when: boolean | Binding<unknown>; fallback?: Child | (() => Child); children: Child | (() => Child) }): Conditional {
  return { kind: "show", ...props };
}
export function For<T>(props: { each: readonly T[] | Binding<readonly T[]>; by: (item: T) => string | number; children: (item: T, current: () => T) => Child }): Repetition<T> {
  return { kind: "for", ...props };
}
function isConditional(value: unknown): value is Conditional {
  return typeof value === "object" && value !== null && (value as Conditional).kind === "show";
}
function isRepetition(value: unknown): value is Repetition<unknown> {
  return typeof value === "object" && value !== null && (value as Repetition<unknown>).kind === "for";
}
function evaluate<T>(input: T | Binding<T>): T {
  return isBinding(input) ? input.read() as T : input;
}
function stringify(value: unknown): string {
  return value == null || typeof value === "boolean" ? "" : String(value);
}
function eventName(name: string): string {
  if (name === "onChange") return "change";
  if (name === "onDoubleClick") return "dblclick";
  return name.slice(2).toLowerCase();
}
function withOwner(fn: () => Dispose, onError: Dispose = () => {}): Dispose {
  try {
    // Creating a nested subtree must not subscribe its parent region effect.
    const scope = engine.untrack(() => engine.createOwner(() => {
      const cleanup = fn();
      let cleaned = false;
      const ownedCleanup = () => {
        if (cleaned) return;
        cleaned = true;
        cleanup();
      };
      engine.onCleanup(ownedCleanup);
      return ownedCleanup;
    }));
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      scope.dispose();
      scope.value();
    };
  } catch (error) {
    onError();
    throw error;
  }
}
function createRegion(parent: Node, before: Node | null) {
  const start = document.createComment("zui:start");
  const end = document.createComment("zui:end");
  parent.insertBefore(start, before);
  parent.insertBefore(end, before);
  return { start, end };
}
function clearRange(start: Node, end: Node): void {
  while (start.nextSibling && start.nextSibling !== end) {
    start.parentNode?.removeChild(start.nextSibling);
  }
}
function renderChild(value: Child | Conditional | Repetition<unknown>, parent: Node, before: Node | null): Dispose {
  if (Array.isArray(value)) {
    const disposers = value.map(v => renderChild(v, parent, before));
    return () => { for (const dispose of disposers.reverse()) dispose(); };
  }
  if (value == null || typeof value === "boolean") return () => {};
  if (isBinding(value) || isStore(value)) {
    const read = isBinding(value) ? () => value.read() : () => value.get();
    const text = document.createTextNode("");
    parent.insertBefore(text, before);
    return withOwner(() => {
      engine.effect(() => { text.data = stringify(read()); });
      return () => text.remove();
    }, () => text.remove());
  }
  if (typeof value === "function") {
    // Function children are reactive regions. Their result is mounted anew when
    // tracked stores change; keyed list reconciliation remains a separate API.
    const { start, end } = createRegion(parent, before);
    return withOwner(() => {
      let disposeCurrent: Dispose = () => {};
      engine.effect(() => {
        const child = (value as () => Child)();
        disposeCurrent();
        clearRange(start, end);
        disposeCurrent = withOwner(() => renderChild(child, parent, end));
      });
      return () => { disposeCurrent(); clearRange(start, end); start.remove(); end.remove(); };
    }, () => { clearRange(start, end); start.remove(); end.remove(); });
  }
  if (typeof value === "string" || typeof value === "number") {
    const text = document.createTextNode(String(value));
    parent.insertBefore(text, before);
    return () => text.remove();
  }
  if (isConditional(value)) {
    const { start, end } = createRegion(parent, before);
    return withOwner(() => {
      let present: boolean | undefined;
      let disposeCurrent: Dispose = () => {};
      engine.effect(() => {
        const visible = Boolean(evaluate(value.when));
        if (visible === present) return;
        present = visible;
        disposeCurrent();
        clearRange(start, end);
        // Ownership for the currently mounted branch is reset on replacement.
        disposeCurrent = withOwner(() =>
          renderChild(resolveChild(visible ? value.children : value.fallback), parent, end));
      });
      return () => { disposeCurrent(); clearRange(start, end); start.remove(); end.remove(); };
    }, () => { clearRange(start, end); start.remove(); end.remove(); });
  }
  if (isRepetition(value)) return renderList(value, parent, before);
  const node = value as VNode;
  const tag = node.type;
  if (typeof tag === "function") {
    return withOwner(() => renderChild(tag({ ...node.props, key: node.key }), parent, before));
  }
  const element = document.createElement(tag);
  parent.insertBefore(element, before);
  return withOwner(() => {
    const cleanups: Dispose[] = [];
    for (const [key, val] of Object.entries(node.props)) {
      if (key === "children" || key === "key") continue;
      if (key === "ref") {
        if (typeof val === "function") { val(element); cleanups.push(() => val(null)); }
        else if (val && typeof val === "object") { val.current = element; cleanups.push(() => { val.current = null; }); }
        continue;
      }
      if (key.startsWith("on") && typeof val === "function") {
        const event = eventName(key);
        element.addEventListener(event, val as EventListener);
        cleanups.push(() => element.removeEventListener(event, val as EventListener));
      } else if (isBinding(val) || isStore(val)) {
        engine.effect(() => setProperty(element, key, isBinding(val) ? val.read() : val.get()));
      } else setProperty(element, key, val);
    }
    const childDispose = renderChild(node.props.children as Child, element, null);
    return () => { childDispose(); cleanups.forEach(fn => fn()); element.remove(); };
  }, () => element.remove());
}
function resolveChild(value: unknown): Child {
  return typeof value === "function" ? (value as () => Child)() : value as Child;
}
const previousStyles = new WeakMap<HTMLElement, Record<string, unknown>>();
function setProperty(element: HTMLElement, name: string, value: unknown): void {
  if (name === "className" || name === "class") { element.className = stringify(value); return; }
  if (name === "style") {
    const next = value && typeof value === "object"
      ? value as Record<string, unknown> : {};
    const previous = previousStyles.get(element) ?? {};
    for (const prop of Object.keys(previous)) {
      if (prop in next) continue;
      if (prop.startsWith("--")) element.style.removeProperty(prop);
      else (element.style as any)[prop] = "";
    }
    for (const [prop, entry] of Object.entries(next)) {
      if (Object.is(previous[prop], entry)) continue;
      if (prop.startsWith("--")) element.style.setProperty(prop, stringify(entry));
      else (element.style as any)[prop] = entry ?? "";
    }
    previousStyles.set(element, { ...next });
    return;
  }
  if (name === "value" || name === "checked" || name === "disabled") {
    const normalized = value ?? (name === "value" ? "" : false);
    if ((element as any)[name] !== normalized) (element as any)[name] = normalized;
    return;
  }
  if (value == null || value === false) element.removeAttribute(name);
  else if (value === true) element.setAttribute(name, "");
  else element.setAttribute(name, String(value));
}
function renderList<T>(spec: Repetition<T>, parent: Node, before: Node | null): Dispose {
  const { start, end } = createRegion(parent, before);
  type Item = { start: Comment; end: Comment; dispose: Dispose; value: T; state: Store<T> };
  return withOwner(() => {
    let items = new Map<string | number, Item>();
    engine.effect(() => {
      const next = evaluate(spec.each);
      const nextKeys = new Set<string | number>();
      for (const item of next) {
        const key = spec.by(item);
        if (nextKeys.has(key)) throw new Error("ZUI_DUPLICATE_KEY");
        nextKeys.add(key);
      }
      for (const [key, item] of items) {
        if (!nextKeys.has(key)) {
          item.dispose();
          clearRange(item.start, item.end);
          item.start.remove(); item.end.remove();
          items.delete(key);
        }
      }
      const reordered = new Map<string | number, Item>();
      // Walk backwards so every item can be inserted or moved before its successor.
      let anchor: Node = end;
      for (let i = next.length - 1; i >= 0; i--) {
        const value = next[i]!;
        const key = spec.by(value);
        let entry = items.get(key);
        if (!entry) {
          const region = createRegion(parent, anchor);
          const state = createStore<T>(value);
          entry = {
            ...region, value, state,
            dispose: withOwner(() => renderChild(spec.children(value, () => state.get()), parent, region.end))
          };
        } else {
          // Keyed content stays mounted; current() reflects replacement data.
          if (!Object.is(entry.value, value)) {
            entry.value = value;
            entry.state.set(value);
          }
          const fragment = document.createDocumentFragment();
          let node: Node | null = entry.start;
          while (node) {
            const after: Node | null = node.nextSibling;
            fragment.appendChild(node);
            if (node === entry.end) break;
            node = after;
          }
          parent.insertBefore(fragment, anchor);
        }
        if (!entry) throw new Error("ZUI_LIST_ENTRY");
        reordered.set(key, entry);
        anchor = entry.start;
      }
      items = reordered;
    });
    return () => {
      for (const item of items.values()) {
        item.dispose();
        clearRange(item.start, item.end);
        item.start.remove(); item.end.remove();
      }
      items.clear();
      start.remove(); end.remove();
    };
  }, () => { clearRange(start, end); start.remove(); end.remove(); });
}
/** Mount the root once. Reactive bindings handle all subsequent data changes. */
export function mount(component: (() => Child) | Child, target: Element): Dispose {
  const existing = new Set(Array.from(target.childNodes));
  const dispose = withOwner(() => renderChild(
    typeof component === "function" ? (component as () => Child)() : component,
    target,
    null
  ), () => {
    for (const node of Array.from(target.childNodes)) if (!existing.has(node)) node.remove();
  });
  return dispose;
}
