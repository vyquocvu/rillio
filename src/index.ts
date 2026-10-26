/** Core JSX runtime API. Lower-level and optional APIs live on dedicated subpaths. */
export { Fragment } from "./compat/types.js";
export { useState, useEffect, useRef, useMemo, useCallback } from "./compat/hooks.js";
export { createPortal } from "./compat/portal.js";
export { ErrorBoundary } from "./compat/error-boundary.js";
export { createRoot, render } from "./compat/root.js";
export type { Child, Component, Key, VNode, Root, ErrorBoundaryProps } from "./compat/types.js";
export type { CSSProperties, HTMLProps, SVGProps, JSXIntrinsicElements } from "./jsx-types.js";
