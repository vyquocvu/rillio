/** Addressable DOM public frontend API. JSX syntax is familiar; semantics are ZUI-owned. */
export * from "./compat.js";
export * from "./ui.js";
export type { CSSProperties, HTMLProps, SVGProps, JSXIntrinsicElements } from "./jsx-types.js";

// Flat internals for advanced users who want fine-grained control
export { NodeRegistry, PatchEngine } from "./flat.js";
export type { FlatNode, FlatOwner, RootHandle, OwnerHost, NodeKind, NodeRegistryOptions, PatchEngineOptions } from "./flat.js";
