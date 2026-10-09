export { jsx, jsxs, Fragment } from "./dom.js";
export namespace JSX {
  export type Element = import("./dom.js").VNode;
  export type ElementType = keyof IntrinsicElements | ((props: any) => any);
  export interface ElementChildrenAttribute { children: {}; }
  export interface IntrinsicElements { [elementName: string]: Record<string, any>; }
}
