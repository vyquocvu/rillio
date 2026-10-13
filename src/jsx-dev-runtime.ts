export { jsxDEV, Fragment } from "./compat.js";
import type { JSXIntrinsicElements } from "./jsx-types.js";
export namespace JSX {
  export type Element = import("./compat.js").VNode;
  export type ElementType = keyof IntrinsicElements | ((props: any) => any);
  export interface IntrinsicAttributes { key?: string | number; }
  export interface ElementChildrenAttribute { children: {}; }
  export interface IntrinsicElements extends JSXIntrinsicElements {}
}
