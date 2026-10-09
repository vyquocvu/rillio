export { jsx, jsxs, Fragment } from "./dom.js";
export namespace JSX {
  export type Element = import("./dom.js").VNode;
  export interface ElementChildrenAttribute { children: {}; }
  export interface IntrinsicElements {
    [elementName: string]: Record<string, any>;
  }
}
