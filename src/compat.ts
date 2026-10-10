/**
 * React/Preact-style ZUI runtime (experimental).
 * Component state is a snapshot, so state writes rerun the owning component.
 * Reconciliation preserves keyed child identity and directly patches DOM nodes.
 */
export type Key = string | number;
export type Child = VNode | string | number | boolean | null | undefined | Child[];
export type Component<P = any> = (props: P) => Child;
export interface VNode {
  type: string | Component;
  props: Record<string, any>;
  key?: Key;
}
export const Fragment: Component<{ children?: Child }> = props => props.children ?? null;
export function jsx(type: VNode["type"], props: Record<string, any> | null, key?: Key): VNode {
  const p = props ?? {};
  return { type, props: p, key: key ?? p.key };
}
export const jsxs = jsx;
export const jsxDEV = jsx;

interface Hook {
  value?: any;
  deps?: readonly unknown[];
  cleanup?: () => void;
  effect?: () => void | (() => void);
  disposed?: boolean;
}
interface Instance {
  value: Child;
  key?: Key;
  type?: VNode["type"];
  node?: Node;
  props?: Record<string, any>;
  child?: Instance | null;
  children?: Instance[];
  hooks?: Hook[];
  cursor?: number;
  hookCount?: number;
  rendering?: boolean;
  parent?: Node;
  end?: Comment;
  start?: Comment;
  disposed?: boolean;
}
let active: Instance | undefined;
let renderingDepth = 0;
const roots = new WeakMap<Element, Root>();
const equalDeps = (a?: readonly unknown[], b?: readonly unknown[]) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function hook(): Hook {
  if (!active || !active.hooks) throw new Error("ZUI_INVALID_HOOK_CALL");
  const index = active.cursor!++;
  return active.hooks[index] ??= {};
}
export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const owner = active;
  const slot = hook();
  if (!("value" in slot)) slot.value = typeof initial === "function" ? (initial as () => T)() : initial;
  return [slot.value as T, next => {
    if (!owner || owner.disposed) return;
    if (renderingDepth > 0) throw new Error("ZUI_RENDER_PHASE_UPDATE");
    const value = typeof next === "function" ? (next as (previous: T) => T)(slot.value) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    updateComponent(owner);
  }];
}
export function useRef<T>(initial: T): { current: T } {
  const slot = hook();
  return slot.value ??= { current: initial };
}
export function useMemo<T>(calculate: () => T, deps?: readonly unknown[]): T {
  const slot = hook();
  if (!("value" in slot) || !equalDeps(slot.deps, deps)) {
    slot.value = calculate();
    slot.deps = deps;
  }
  return slot.value as T;
}
export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: readonly unknown[]): T {
  return useMemo(() => fn, deps);
}
export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void {
  const slot = hook();
  if (!slot.effect || !equalDeps(slot.deps, deps)) {
    slot.effect = effect;
    slot.deps = deps;
    pendingEffects.add(slot);
  }
}
const pendingEffects = new Set<Hook>();
let flushingEffects = false;
function flushEffects(): void {
  if (flushingEffects) return;
  flushingEffects = true;
  try {
    while (pendingEffects.size) {
      const slot = pendingEffects.values().next().value as Hook;
      pendingEffects.delete(slot);
      if (slot.disposed) continue;
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      cleanup?.();
      if (slot.disposed || pendingEffects.has(slot)) continue;
      const result = slot.effect?.();
      if (!slot.disposed && typeof result === "function") slot.cleanup = result;
    }
  } finally {
    flushingEffects = false;
  }
}
function normalize(value: Child): Child[] {
  const out: Child[] = [];
  const walk = (v: Child): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && v !== undefined && typeof v !== "boolean") out.push(v);
  };
  walk(value);
  return out;
}
function isVNode(value: Child): value is VNode {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value;
}
function first(inst: Instance): Node {
  return inst.start ?? inst.node!;
}
function last(inst: Instance): Node {
  return inst.end ?? inst.node!;
}
function move(inst: Instance, parent: Node, before: Node | null): void {
  const focused = document.activeElement;
  const focusable = focused instanceof HTMLElement && inst.node instanceof Element &&
    (inst.node === focused || inst.node.contains(focused));
  const selection = focusable && "selectionStart" in focused && "selectionEnd" in focused
    ? {
      start: (focused as HTMLInputElement | HTMLTextAreaElement).selectionStart,
      end: (focused as HTMLInputElement | HTMLTextAreaElement).selectionEnd,
      direction: (focused as HTMLInputElement | HTMLTextAreaElement).selectionDirection
    }
    : undefined;
  const fragment = document.createDocumentFragment();
  let n: Node | null = first(inst);
  const end = last(inst);
  while (n) {
    const next: Node | null = n.nextSibling;
    fragment.appendChild(n);
    if (n === end) break;
    n = next;
  }
  parent.insertBefore(fragment, before);
  if (focusable && focused.isConnected) {
    (focused as HTMLElement).focus({ preventScroll: true });
    if (selection && "setSelectionRange" in focused && selection.start !== null && selection.end !== null) {
      (focused as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
    }
  }
}
function dispose(inst: Instance): void {
  if (inst.disposed) return;
  inst.disposed = true;
  inst.child && dispose(inst.child);
  inst.children?.forEach(dispose);
  for (const h of inst.hooks ?? []) {
    h.disposed = true;
    pendingEffects.delete(h);
    h.cleanup?.();
    h.cleanup = undefined;
  }
  if (inst.node && inst.props && inst.node instanceof Element) patchProps(inst.node, inst.props, {});
  const start = first(inst), end = last(inst);
  let n: Node | null = start;
  while (n) {
    const next: Node | null = n.nextSibling;
    n.parentNode?.removeChild(n);
    if (n === end) break;
    n = next;
  }
}
function eventName(name: string): string {
  if (name === "onChange") return "change";
  if (name === "onDoubleClick") return "dblclick";
  return name.slice(2).toLowerCase();
}
function patchProps(el: Element, old: Record<string, any>, next: Record<string, any>): void {
  const names = new Set([...Object.keys(old), ...Object.keys(next)]);
  for (const name of names) {
    if (name === "children" || name === "key") continue;
    const previous = old[name], value = next[name];
    if (Object.is(previous, value)) continue;
    if (name === "ref") {
      if (typeof previous === "function") previous(null);
      else if (previous && typeof previous === "object") previous.current = null;
      if (typeof value === "function") value(el);
      else if (value && typeof value === "object") value.current = el;
    } else if (/^on[A-Z]/.test(name)) {
      if (typeof previous === "function") el.removeEventListener(eventName(name), previous);
      if (typeof value === "function") el.addEventListener(eventName(name), value);
    } else if (name === "style") {
      const style = (el as HTMLElement).style;
      if (previous && typeof previous === "object") for (const k of Object.keys(previous))
        if (!(k in (value && typeof value === "object" ? value : {})))
          k.startsWith("--") ? style.removeProperty(k) : (style as any)[k] = "";
      if (value && typeof value === "object") for (const [k, v] of Object.entries(value))
        k.startsWith("--") ? style.setProperty(k, String(v ?? "")) : (style as any)[k] = v ?? "";
      else if (!value) el.removeAttribute("style");
    } else if (name === "className") {
      el.setAttribute("class", value ?? "");
    } else if (name === "value" || name === "checked" || name === "disabled") {
      const normalized = value ?? (name === "value" ? "" : false);
      if ((el as any)[name] !== normalized) (el as any)[name] = normalized;
    } else if (value == null || value === false) {
      el.removeAttribute(name);
    } else if (value === true) {
      el.setAttribute(name, "");
    } else {
      el.setAttribute(name, String(value));
    }
  }
}
function renderComponent(inst: Instance): void {
  if (inst.rendering) throw new Error("ZUI_RENDER_PHASE_UPDATE");
  const prev = active;
  active = inst;
  inst.cursor = 0;
  inst.rendering = true;
  renderingDepth++;
  let result: Child;
  try {
    result = (inst.type as Component)(inst.props!);
  } finally {
    renderingDepth--;
    active = prev;
    inst.rendering = false;
  }
  if (inst.hookCount === undefined) inst.hookCount = inst.cursor;
  else if (inst.cursor !== inst.hookCount) throw new Error("ZUI_HOOK_ORDER");
  // A component can return null, one node, a fragment or an array.
  inst.children = reconcileChildren(inst.children ?? [], normalize(result), inst.parent!, inst.end!);
}
function updateComponent(inst: Instance): void {
  if (inst.disposed) return;
  renderComponent(inst);
  flushEffects();
}
function mountValue(value: Child, parent: Node, before: Node | null): Instance {
  if (!isVNode(value)) {
    const node = document.createTextNode(String(value ?? ""));
    parent.insertBefore(node, before);
    return { value, node, parent };
  }
  if (typeof value.type === "function") {
    const start = document.createComment("zui:component");
    const end = document.createComment("/zui:component");
    parent.insertBefore(start, before);
    parent.insertBefore(end, before);
    const inst: Instance = { value, type: value.type, key: value.key, props: value.props,
      start, end, parent, hooks: [], children: [] };
    try {
      renderComponent(inst);
      return inst;
    } catch (error) {
      dispose(inst);
      throw error;
    }
  }
  const el = document.createElement(value.type);
  parent.insertBefore(el, before);
  const inst: Instance = { value, type: value.type, key: value.key, node: el,
    parent, props: value.props, children: [] };
  try {
    patchProps(el, {}, value.props);
    inst.children = reconcileChildren([], normalize(value.props.children), el, null);
    return inst;
  } catch (error) {
    dispose(inst);
    throw error;
  }
}
function reconcile(old: Instance | null, next: Child, parent: Node, before: Node | null): Instance {
  if (!old) return mountValue(next, parent, before);
  if (!isVNode(next)) {
    if (!isVNode(old.value)) {
      if (!Object.is(old.value, next)) (old.node as Text).data = String(next ?? "");
      old.value = next;
      return old;
    }
  } else if (isVNode(old.value) && old.type === next.type && old.key === next.key) {
    if (typeof next.type === "function") {
      old.value = next;
      old.props = next.props;
      renderComponent(old);
    } else {
      patchProps(old.node as Element, old.props!, next.props);
      old.children = reconcileChildren(old.children ?? [], normalize(next.props.children), old.node!, null);
      old.props = next.props;
      old.value = next;
    }
    return old;
  }
  const fresh = mountValue(next, parent, first(old));
  dispose(old);
  return fresh;
}
function reconcileChildren(old: Instance[], children: Child[], parent: Node, before: Node | null): Instance[] {
  const keyed = new Map<Key, Instance>();
  const unkeyed: Instance[] = [];
  for (const item of old) item.key === undefined ? unkeyed.push(item) : keyed.set(item.key, item);
  const seen = new Set<Key>();
  const next: Instance[] = [];
  let unkeyedCursor = 0;
  try {
    for (const value of children) {
      const key = isVNode(value) ? value.key : undefined;
      if (key !== undefined) {
        if (seen.has(key)) throw new Error("ZUI_DUPLICATE_KEY");
        seen.add(key);
      }
      const prior = key === undefined ? unkeyed[unkeyedCursor++] : keyed.get(key);
      const item = reconcile(prior ?? null, value, parent, before);
      item.key = key;
      next.push(item);
    }
    for (const item of old) if (!next.includes(item)) dispose(item);
    let anchor = before;
    for (let i = next.length - 1; i >= 0; i--) {
      const item = next[i]!;
      move(item, parent, anchor);
      anchor = first(item);
    }
    return next;
  } catch (error) {
    for (const item of next) if (!old.includes(item)) dispose(item);
    throw error;
  }
}
export interface Root { render(value: Child): void; unmount(): void }
export function createRoot(container: Element): Root {
  roots.get(container)?.unmount();
  let current: Instance[] = [];
  let disposed = false;
  let root: Root;
  const unmount = () => {
    if (disposed) return;
    disposed = true;
    current.forEach(dispose);
    current = [];
    if (roots.get(container) === root) roots.delete(container);
  };
  root = {
    render(value) {
      if (disposed) throw new Error("ZUI_ROOT_UNMOUNTED");
      current = reconcileChildren(current, normalize(value), container, null);
      flushEffects();
    },
    unmount
  };
  roots.set(container, root);
  return root;
}
export function render(value: Child, container: Element): void {
  const root = roots.get(container) ?? createRoot(container);
  root.render(value);
}
