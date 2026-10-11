/** Addressable DOM public frontend API. JSX syntax is familiar; semantics are ZUI-owned. */
export * from "./compat.js";
export { NodeRegistry, PatchEngine } from "./flat.js";
export type { FlatNode, FlatOwner, RootHandle, OwnerHost, NodeKind } from "./flat.js";
