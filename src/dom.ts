import { createEngine, type Store, type Dispose } from "./reactive.js";

/** Default graph engine powers the standalone frontend runtime. */
export const engine = createEngine("graph");
export const createStore = <T>(initial: T): Store<T> => engine.createStore(initial);
export const computed = <T>(fn: () => T) => engine.computed(fn);
export const batch = <T>(fn: () => T) => engine.batch(fn);

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
function isBinding(value: unknown): value is Binding<unknown> {
  return typeof value === "object" && value !== null && BINDING in value;
}
export type Child = VNode | Binding<unknown> | Conditional | Repetition<any> | string | number | boolean | null | undefined | Child[];
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
function withOwner(fn: () => Dispose): Dispose {
  const scope = engine.createOwner(fn);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    scope.dispose();
    scope.value();
  };
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
  if (isBinding(value)) {
    const text = document.createTextNode("");
    parent.insertBefore(text, before);
    return withOwner(() => {
      engine.effect(() => { text.data = stringify(value.read()); });
      return () => text.remove();
    });
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
    });
  }
  if (isRepetition(value)) return renderList(value, parent, before);
  const node = value as VNode;
  if (typeof node.type === "function") {
    return withOwner(() => renderChild(node.type({ ...node.props, key: node.key }), parent, before));
  }
  const element = document.createElement(node.type);
  parent.insertBefore(element, before);
  return withOwner(() => {
    const cleanups: Dispose[] = [];
    for (const [key, val] of Object.entries(node.props)) {
      if (key === "children" || key === "key" || key === "ref") continue;
      if (key.startsWith("on") && typeof val === "function") {
        const event = key.slice(2).toLowerCase();
        element.addEventListener(event, val as EventListener);
        cleanups.push(() => element.removeEventListener(event, val as EventListener));
      } else if (isBinding(val)) {
        engine.effect(() => setProperty(element, key, val.read()));
      } else setProperty(element, key, val);
    }
    const childDispose = renderChild(node.props.children as Child, element, null);
    return () => { childDispose(); cleanups.forEach(fn => fn()); element.remove(); };
  });
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
          const state = createStore(value);
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
  });
}
/** Mount the root once. Reactive bindings handle all subsequent data changes. */
export function mount(component: (() => Child) | Child, target: Element): Dispose {
  const dispose = withOwner(() => renderChild(
    typeof component === "function" ? (component as () => Child)() : component,
    target,
    null
  ));
  return dispose;
}
