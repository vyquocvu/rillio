/**
 * Modular explicit reactive DOM API.
 *
 * This is the mount-once surface of ZUI. It shares the addressable registry
 * and PatchEngine with the JSX runtime; it does not maintain a second DOM
 * tree or mutate browser nodes directly.
 */

export * from "./types.js";
export * from "./bindings.js";
export * from "./control-flow.js";
export * from "./mount.js";
export * from "./resource.js";
