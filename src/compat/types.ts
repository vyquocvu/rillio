/**
 * Compat types, JSX runtime interfaces, and primitives.
 */

import type {
  Key,
  NodeId,
  OwnerId,
  RootHandle,
  PatchTransaction,
  RegistryDiagnostics,
  TransactionSavepoint
} from "../flat.js";

export type { Key, NodeId, OwnerId, RegistryDiagnostics, TransactionSavepoint } from "../flat.js";

export type Child = VNode | string | number | boolean | null | undefined | Child[];
export type Component<P = any> = (props: P) => Child;

export interface VNode {
  type: string | Component;
  props: Record<string, any>;
  key?: Key;
}

export const Fragment: Component<{ children?: Child }> = props => props.children ?? null;

export function jsx(type: VNode["type"], props: Record<string, any> | null, key?: Key): VNode {
  const p = props ?? {};
  return { type, props: p, key: key ?? p.key };
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export interface Hook {
  value?: any;
  deps?: readonly unknown[];
  cleanup?: () => void;
  effect?: () => void | (() => void);
  disposed?: boolean;
  ownerNodeId?: NodeId;
}

export interface ComponentState {
  nodeId: NodeId;
  rootId: number;
  ownerId: OwnerId;
  type: Component;
  props: Record<string, any>;
  hooks: Hook[];
  cursor: number;
  hookCount?: number;
  rendering: boolean;
  disposed: boolean;
  boundaryState?: ErrorBoundaryState;
  parentComponent?: ComponentState;
}

export interface ComponentSnapshot {
  state: ComponentState;
  props: Record<string, any>;
  cursor: number;
  hookCount: number | undefined;
  hooks: Array<{ slot: Hook; value: Hook }>;
  boundaryError?: Error | null;
}

export interface RenderTransactionSnapshot {
  readonly components: Map<ComponentState, ComponentSnapshot>;
  readonly pendingEffects: Set<Hook>;
}

export interface FlatRoot extends RootHandle {
  disposed: boolean;
}

export interface Root {
  render(value: Child): void;
  unmount(): void;
}

export interface RootController extends Root {
  handle: FlatRoot;
}

export interface PortalState {
  placeholderId: NodeId;
  portalBoundaryId: NodeId;
  container: Element;
  rootId: number;
  ownerId: OwnerId;
  disposed: boolean;
}

export interface ErrorBoundaryProps {
  children?: Child;
  fallback: Child | ((error: Error, reset: () => void) => Child);
  onError?: (error: Error, info: { componentStack?: string }) => void;
}

export interface ErrorBoundaryState {
  error: Error | null;
  reset: () => void;
}
