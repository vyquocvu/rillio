/**
 * Portal primitive for addressable DOM rendering into external containers.
 */

import type { Child, Component, VNode, PortalState } from "./types.js";
import type { Key } from "../flat/types.js";
import { nodeRegistry, patchEngine } from "./state.js";

export const PORTAL_TYPE: Component<{ children?: Child; container: Element }> = () => null;

export function createPortal(children: Child, container: Element, key?: Key): VNode {
  if (!container || typeof container !== "object" || (container as any).nodeType !== 1) {
    throw new Error("RILLIO_INVALID_PORTAL_CONTAINER");
  }
  return {
    type: PORTAL_TYPE,
    props: { children, container },
    key
  };
}

export function disposePortal(state: PortalState): void {
  if (state.disposed) return;
  state.disposed = true;
  let failure: unknown;
  try {
    patchEngine.removeSubtree(state.portalBoundaryId);
  } catch (error) {
    failure = error;
  }
  try {
    nodeRegistry.disposeOwner(state.ownerId);
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw failure;
}
