/**
 * ErrorBoundary primitive for declarative error handling and recovery.
 */

import type { Child, Component, ErrorBoundaryProps, ComponentState } from "./types.js";
import type { NodeId } from "../flat.js";
import { nodeRegistry } from "./state.js";

export const ErrorBoundary: Component<ErrorBoundaryProps> = props => props.children ?? null;

export function formatComponentStack(state?: ComponentState): string {
  const stack: string[] = [];
  let current: ComponentState | undefined = state;
  while (current) {
    stack.push(`    in ${current.type.name || "Component"}`);
    current = current.parentComponent;
  }
  return stack.length ? `\n${stack.join("\n")}` : "";
}

export function findNearestErrorBoundary(nodeId: NodeId, skipSelf = false): NodeId | null {
  let current: NodeId | null = skipSelf
    ? (nodeRegistry.hasNode(nodeId) ? nodeRegistry.getNode(nodeId).parentId : null)
    : nodeId;
  while (current !== null && nodeRegistry.hasNode(current)) {
    const node = nodeRegistry.getNode(current);
    if (node.type === ErrorBoundary) return current;
    current = node.parentId;
  }
  return null;
}
