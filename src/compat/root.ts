/**
 * Application root mounting, lifecycle management, and addressable root inspection.
 */

import type { RootHandle } from "../flat/types.js";
import type { Child, FlatRoot, Root, RootController } from "./types.js";
import {
  nodeRegistry,
  patchEngine,
  roots,
  renderTransaction,
  flushEffects
} from "./state.js";
import { reconcileChildren } from "./reconcile.js";

export function createRoot(container: Element): Root {
  roots.get(container)?.unmount();
  const handle = nodeRegistry.createRoot(container) as FlatRoot;
  handle.disposed = false;

  const root: RootController = {
    handle,
    render(value: Child) {
      if (handle.disposed) throw new Error("RILLIO_ROOT_UNMOUNTED");
      renderTransaction(handle.rootId, tx => {
        const rootNode = nodeRegistry.getNode(handle.nodeId);
        reconcileChildren(handle.nodeId, value, handle.ownerId, handle, tx, rootNode);
      });
      flushEffects();
    },
    unmount() {
      if (handle.disposed) return;
      handle.disposed = true;
      let failure: unknown;
      try {
        const children = nodeRegistry.children(handle.nodeId);
        if (children.length) {
          patchEngine.transaction(handle.rootId, tx => {
            for (const childId of children) tx.remove(childId);
          });
        }
      } catch (error) {
        failure = error;
      }
      let empty = false;
      try {
        empty = nodeRegistry.children(handle.nodeId).length === 0;
      } catch (error) {
        failure ??= error;
      }
      if (empty) {
        try {
          nodeRegistry.disposeRoot(handle.rootId);
        } catch (error) {
          failure ??= error;
        }
        if (roots.get(container) === root) roots.delete(container);
      } else {
        handle.disposed = false;
      }
      if (failure) throw failure;
    }
  };
  roots.set(container, root);
  return root;
}

export function render(value: Child, container: Element): void {
  const root = roots.get(container) ?? createRoot(container);
  root.render(value);
}

export function getAddressableRoot(container: Element): RootHandle | undefined {
  return roots.get(container)?.handle;
}

export function assertAddressableRoot(container: Element): void {
  const root = roots.get(container)?.handle;
  if (root) nodeRegistry.assertConsistent(root.rootId);
}
