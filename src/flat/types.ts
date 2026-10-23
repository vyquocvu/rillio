/**
 * Addressable DOM types and structural interfaces.
 */

export type NodeId = number;
export type RootId = number;
export type OwnerId = number;
export type Key = string | number;
export type Dispose = () => void;

export type NodeKind = "root" | "element" | "text" | "comment" | "boundary";

export interface FlatNode {
  readonly id: NodeId;
  readonly rootId: RootId;
  readonly kind: NodeKind;
  domStart: Node;
  domEnd: Node;
  ownerId: OwnerId;
  parentId: NodeId | null;
  prevSibling: NodeId | null;
  nextSibling: NodeId | null;
  firstChild: NodeId | null;
  lastChild: NodeId | null;
  version: number;
  key?: Key;
  type?: string | ((props: any) => any);
  props: Record<string, any>;
  value?: unknown;
  payload?: unknown;
  listeners?: Map<string, EventListener>;
  ref?: unknown;
  styleSnapshot?: Record<string, unknown>;
  cleanup?: Dispose;
  disposed: boolean;
  isSvg?: boolean;
}

export interface FlatOwner {
  readonly id: OwnerId;
  readonly rootId: RootId;
  readonly parentId: OwnerId | null;
  readonly children: Set<OwnerId>;
  readonly nodeIds: Set<NodeId>;
  version: number;
  disposed: boolean;
}

export interface RootHandle {
  readonly rootId: RootId;
  readonly nodeId: NodeId;
  readonly ownerId: OwnerId;
  readonly container: Element;
}

export interface OwnerHost {
  createOwner(rootId: RootId, parentId?: OwnerId | null): OwnerId;
  ownerParent(ownerId: OwnerId): OwnerId | null;
  ownerChildren(ownerId: OwnerId): readonly OwnerId[];
  disposeOwner(ownerId: OwnerId): void;
}

/** Mutable target metadata updated only when a portal operation commits. */
export interface PortalAttachment {
  container: Element;
}

export type NodeInit = {
  rootId: RootId;
  ownerId: OwnerId;
  kind: NodeKind;
  domStart: Node;
  domEnd?: Node;
  key?: Key;
  type?: string | ((props: any) => any);
  props?: Record<string, any>;
  value?: unknown;
  payload?: unknown;
  isSvg?: boolean;
};

export interface NodeRegistryOptions {
  /** Maximum total number of lightweight disposed node/owner records retained for diagnostics. */
  maxTombstones?: number;
}

export interface RegistryDiagnostics {
  readonly activeNodes: number;
  readonly tombstoneNodes: number;
  readonly totalNodes: number;
  readonly activeOwners: number;
  readonly tombstoneOwners: number;
  readonly totalOwners: number;
  readonly totalRoots: number;
  readonly maxTombstones: number;
}

export type PatchOp =
  | { kind: "insert"; nodeId: NodeId; parentId: NodeId; beforeId: NodeId | null; cachedNode?: FlatNode; cachedParent?: FlatNode }
  | { kind: "move"; nodeId: NodeId; parentId: NodeId; beforeId: NodeId | null }
  | { kind: "portal"; nodeId: NodeId; container: Element; attachment: PortalAttachment }
  | {
      kind: "move-many";
      parentId: NodeId;
      originalIds: NodeId[];
      finalIds: NodeId[];
      movingIds: NodeId[];
      beforeIds: Array<NodeId | null>;
      originalRecords?: FlatNode[];
      finalRecords?: FlatNode[];
      movingRecords?: FlatNode[];
      beforeRecords?: Array<FlatNode | null>;
    }
  | { kind: "props"; nodeId: NodeId; previous: Record<string, any>; next: Record<string, any>; changedKeys: string[] }
  | { kind: "text"; nodeId: NodeId; value: string; cachedNode?: FlatNode; previous?: string }
  | { kind: "meta"; nodeId: NodeId; patch: Partial<Pick<FlatNode, "key" | "type" | "props" | "value" | "payload">> }
  | { kind: "remove"; nodeId: NodeId };

export interface PatchEngineOptions {
  /** Run a full-root index walk after each commit. Keep disabled in production hot paths. */
  assertAfterCommit?: boolean;
}

export interface FocusState {
  element: HTMLElement;
  start: number | null;
  end: number | null;
  direction: "forward" | "backward" | "none" | null;
}

export interface TransactionSavepoint {
  readonly operationsCount: number;
  readonly createdCount: number;
  readonly cleanupChangesCount: number;
  readonly onlyTextOperations: boolean;
  readonly onlyCreatedOperations: boolean;
  readonly hasRemovals: boolean;
}

/**
 * Reports operations that crossed the irreversible commit point. The
 * finalization status distinguishes complete disposal from cleanup failure.
 * `operations` and `opCount` include operations appended by deferred refs.
 */
export interface TransactionCommitInfo {
  readonly rootId: RootId;
  readonly opCount: number;
  readonly operations?: readonly PatchOp[];
  /** Whether post-commit disposal completed without callback failures. */
  readonly finalizationStatus?: "complete" | "error";
  readonly durationMs: number;
  readonly timestamp: number;
}


