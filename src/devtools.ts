/**
 * Rillio DevTools & Live Flat Index Inspector.
 *
 * Real-time inspection utility and browser HUD leveraging NodeRegistry diagnostics,
 * addressable nodes, and PatchEngine transaction telemetry.
 */

import { nodeRegistry, patchEngine } from "./compat/state.js";
export { nodeRegistry, patchEngine } from "./compat/state.js";
export { assertAddressableRoot, getAddressableRoot } from "./compat/root.js";
import type {
  Key,
  NodeId,
  NodeKind,
  NodeRegistry,
  OwnerId,
  PatchEngine,
  RegistryDiagnostics,
  RootHandle,
  RootId,
  TransactionCommitInfo,
} from "./flat.js";

export interface NodeRecordSnapshot {
  id: NodeId;
  rootId: RootId;
  ownerId: OwnerId;
  kind: NodeKind;
  version: number;
  tagOrType: string;
  key?: Key;
  parentId: NodeId | null;
  isSvg: boolean;
  props: Record<string, any>;
  hasCleanup: boolean;
  disposed: boolean;
  children: NodeRecordSnapshot[];
}

export interface RootSnapshot {
  rootId: RootId;
  rootNodeId: NodeId;
  ownerId: OwnerId;
  container: Element;
  tree: NodeRecordSnapshot;
  totalNodes: number;
  diagnostics: RegistryDiagnostics;
}

export interface TransactionTracker {
  getHistory(): readonly TransactionCommitInfo[];
  clear(): void;
  dispose(): void;
}

export interface InspectorOverlayOptions {
  container?: Element;
  targetRoot?: Element | RootHandle;
  position?: "top-right" | "bottom-right" | "bottom-left" | "top-left";
  registry?: NodeRegistry;
  engine?: PatchEngine;
  refreshIntervalMs?: number;
}

export interface InspectorOverlayHandle {
  readonly element: HTMLElement;
  update(): void;
  dispose(): void;
}

/**
 * Creates an in-memory snapshot of an addressable node and its metadata.
 */
export function inspectNode(
  nodeId: NodeId,
  registry: NodeRegistry = nodeRegistry
): NodeRecordSnapshot {
  const node = registry.getNode(nodeId);
  const childIds = registry.children(nodeId);

  let tagOrType = "#unknown";
  if (node.kind === "root") tagOrType = "#root";
  else if (node.kind === "text") tagOrType = "#text";
  else if (node.kind === "comment") tagOrType = "#comment";
  else if (node.kind === "boundary") {
    tagOrType =
      typeof node.type === "function"
        ? node.type.name || "AnonymousComponent"
        : String(node.type ?? "boundary");
  } else if (node.kind === "element") {
    tagOrType =
      typeof node.type === "string"
        ? node.type
        : (node.domStart as Element)?.tagName?.toLowerCase() ?? "element";
  }

  const propsSnapshot: Record<string, any> = {};
  if (node.props && typeof node.props === "object") {
    for (const [k, v] of Object.entries(node.props)) {
      if (k === "children") continue;
      if (typeof v === "function") propsSnapshot[k] = `[Function: ${v.name || "anonymous"}]`;
      else if (typeof v === "object" && v !== null) {
        try {
          propsSnapshot[k] = JSON.parse(JSON.stringify(v));
        } catch {
          propsSnapshot[k] = "[Complex Object]";
        }
      } else {
        propsSnapshot[k] = v;
      }
    }
  }

  const children: NodeRecordSnapshot[] = [];
  for (const childId of childIds) {
    try {
      children.push(inspectNode(childId, registry));
    } catch {
      // Skip broken or tombstoned nodes
    }
  }

  return {
    id: node.id,
    rootId: node.rootId,
    ownerId: node.ownerId,
    kind: node.kind,
    version: node.version,
    tagOrType,
    key: node.key,
    parentId: node.parentId,
    isSvg: Boolean(node.isSvg),
    props: propsSnapshot,
    hasCleanup: Boolean(node.cleanup),
    disposed: node.disposed,
    children,
  };
}

/**
 * Traverses and serializes the entire addressable subtree for a root container.
 */
export function inspectRoot(
  target: Element | RootHandle | RootId,
  registry: NodeRegistry = nodeRegistry
): RootSnapshot {
  let root: RootHandle | undefined;

  if (typeof target === "number") {
    root = registry.getRoot(target);
  } else if ("rootId" in target && "container" in target) {
    root = target as RootHandle;
  } else if (target instanceof Element) {
    root = registry.rootFor(target);
  }

  if (!root) throw new Error("RILLIO_ROOT_NOT_FOUND");

  const tree = inspectNode(root.nodeId, registry);

  const countNodes = (n: NodeRecordSnapshot): number =>
    1 + n.children.reduce((acc, c) => acc + countNodes(c), 0);

  return {
    rootId: root.rootId,
    rootNodeId: root.nodeId,
    ownerId: root.ownerId,
    container: root.container,
    tree,
    totalNodes: countNodes(tree),
    diagnostics: registry.diagnostics(),
  };
}

/**
 * Tracks and logs PatchEngine transaction telemetry in a circular buffer.
 */
export function trackTransactions(
  engine: PatchEngine = patchEngine,
  maxEntries = 50
): TransactionTracker {
  const history: TransactionCommitInfo[] = [];

  const unsubscribe = engine.onCommit(info => {
    history.push(info);
    if (history.length > maxEntries) history.shift();
  });

  return {
    getHistory: () => history.slice(),
    clear: () => {
      history.length = 0;
    },
    dispose: unsubscribe,
  };
}

/**
 * Highlights an addressable node's actual browser DOM element or range with a temporary bounding box.
 */
export function highlightNode(
  nodeId: NodeId,
  registry: NodeRegistry = nodeRegistry,
  options: { durationMs?: number; color?: string; outline?: string } = {}
): HTMLElement | null {
  if (typeof document === "undefined") return null;

  try {
    const node = registry.getNode(nodeId);
    const first = node.domStart;
    const last = node.domEnd;
    if (!first || !last) return null;

    const range = document.createRange();
    range.setStartBefore(first);
    range.setEndAfter(last);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) return null;

    const overlay = document.createElement("div");
    const duration = options.durationMs ?? 1500;
    const bg = options.color ?? "rgba(56, 189, 248, 0.25)";
    const border = options.outline ?? "2px solid #0284c7";

    Object.assign(overlay.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      backgroundColor: bg,
      border: border,
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "2147483647",
      transition: `opacity ${duration}ms ease-out`,
      boxSizing: "border-box",
    });

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, duration);
    });

    return overlay;
  } catch {
    return null;
  }
}

/**
 * In-browser real-time diagnostic overlay HUD.
 */
export function createInspectorOverlay(
  options: InspectorOverlayOptions = {}
): InspectorOverlayHandle {
  if (typeof document === "undefined") {
    return {
      element: {} as HTMLElement,
      update() {},
      dispose() {},
    };
  }

  const registry = options.registry ?? nodeRegistry;
  const engine = options.engine ?? patchEngine;
  const tracker = trackTransactions(engine, 20);

  const panel = document.createElement("div");
  panel.setAttribute("data-rillio-devtools", "true");

  const pos = options.position ?? "bottom-right";
  const posStyles: Record<string, string> = {
    "bottom-right": "bottom: 12px; right: 12px;",
    "bottom-left": "bottom: 12px; left: 12px;",
    "top-right": "top: 12px; right: 12px;",
    "top-left": "top: 12px; left: 12px;",
  };

  Object.assign(panel.style, {
    position: "fixed",
    zIndex: "2147483640",
    width: "360px",
    maxHeight: "480px",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "11px",
    borderRadius: "8px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
    border: "1px solid #334155",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    userSelect: "none",
  });
  panel.style.cssText += posStyles[pos];

  let collapsed = false;

  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "8px 12px",
    backgroundColor: "#1e293b",
    borderBottom: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
  });

  const title = document.createElement("span");
  title.innerHTML = `<strong style="color: #38bdf8;">Rillio</strong> Flat Index`;
  header.appendChild(title);

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "8px";

  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = "—";
  Object.assign(toggleBtn.style, {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "12px",
  });
  controls.appendChild(toggleBtn);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, {
    background: "transparent",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "11px",
  });
  controls.appendChild(closeBtn);

  header.appendChild(controls);
  panel.appendChild(header);

  const body = document.createElement("div");
  Object.assign(body.style, {
    padding: "10px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  });
  panel.appendChild(body);

  const metricsRow = document.createElement("div");
  Object.assign(metricsRow.style, {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "6px",
    textAlign: "center",
  });
  body.appendChild(metricsRow);

  const treeContainer = document.createElement("div");
  Object.assign(treeContainer.style, {
    backgroundColor: "#020617",
    padding: "6px",
    borderRadius: "4px",
    border: "1px solid #1e293b",
    maxHeight: "180px",
    overflowY: "auto",
  });
  body.appendChild(treeContainer);

  const txContainer = document.createElement("div");
  Object.assign(txContainer.style, {
    backgroundColor: "#020617",
    padding: "6px",
    borderRadius: "4px",
    border: "1px solid #1e293b",
    maxHeight: "100px",
    overflowY: "auto",
  });
  body.appendChild(txContainer);

  function renderTreeRow(node: NodeRecordSnapshot, depth = 0): HTMLElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      padding: "2px 4px",
      paddingLeft: `${depth * 10 + 4}px`,
      cursor: "pointer",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      borderRadius: "2px",
    });

    const kindColors: Record<string, string> = {
      element: "#38bdf8",
      text: "#a7f3d0",
      boundary: "#f472b6",
      root: "#facc15",
      comment: "#64748b",
    };

    const color = kindColors[node.kind] ?? "#94a3b8";
    row.innerHTML = `<span style="color: ${color}; font-weight: bold;">[${node.kind[0]?.toUpperCase()}]</span> ` +
      `<span>${node.tagOrType}</span> ` +
      `<span style="color: #64748b;">#${node.id} v${node.version}</span>`;

    row.addEventListener("mouseenter", () => {
      row.style.backgroundColor = "#1e293b";
    });
    row.addEventListener("mouseleave", () => {
      row.style.backgroundColor = "transparent";
    });
    row.addEventListener("click", () => {
      highlightNode(node.id, registry);
    });

    return row;
  }

  function appendSubtree(node: NodeRecordSnapshot, container: HTMLElement, depth = 0) {
    container.appendChild(renderTreeRow(node, depth));
    for (const child of node.children) {
      appendSubtree(child, container, depth + 1);
    }
  }

  const update = () => {
    const diag = registry.diagnostics();

    metricsRow.innerHTML = `
      <div style="background: #1e293b; padding: 4px; border-radius: 4px;">
        <div style="color: #94a3b8; font-size: 9px;">ACTIVE</div>
        <div style="color: #38bdf8; font-weight: bold; font-size: 13px;">${diag.activeNodes}</div>
      </div>
      <div style="background: #1e293b; padding: 4px; border-radius: 4px;">
        <div style="color: #94a3b8; font-size: 9px;">OWNERS</div>
        <div style="color: #a7f3d0; font-weight: bold; font-size: 13px;">${diag.activeOwners}</div>
      </div>
      <div style="background: #1e293b; padding: 4px; border-radius: 4px;">
        <div style="color: #94a3b8; font-size: 9px;">TOMBS</div>
        <div style="color: #f87171; font-weight: bold; font-size: 13px;">${diag.tombstoneNodes}</div>
      </div>
      <div style="background: #1e293b; padding: 4px; border-radius: 4px;">
        <div style="color: #94a3b8; font-size: 9px;">ROOTS</div>
        <div style="color: #facc15; font-weight: bold; font-size: 13px;">${diag.totalRoots}</div>
      </div>
    `;

    treeContainer.innerHTML = "";
    if (options.targetRoot) {
      try {
        const rootSnap = inspectRoot(options.targetRoot, registry);
        appendSubtree(rootSnap.tree, treeContainer);
      } catch {
        treeContainer.innerHTML = `<span style="color: #64748b;">(No active root attached)</span>`;
      }
    } else {
      treeContainer.innerHTML = `<span style="color: #64748b;">(Target root not specified)</span>`;
    }

    const txs = tracker.getHistory();
    txContainer.innerHTML = `<div style="color: #94a3b8; font-size: 9px; margin-bottom: 4px;">TRANSACTIONS (${txs.length})</div>`;
    if (txs.length === 0) {
      txContainer.innerHTML += `<span style="color: #64748b;">(No recent transactions)</span>`;
    } else {
      for (let i = txs.length - 1; i >= Math.max(0, txs.length - 5); i--) {
        const tx = txs[i]!;
        const item = document.createElement("div");
        item.style.color = "#cbd5e1";
        item.style.marginBottom = "2px";
        item.textContent = `• root#${tx.rootId}: ${tx.opCount} ops in ${tx.durationMs.toFixed(2)}ms`;
        txContainer.appendChild(item);
      }
    }
  };

  toggleBtn.addEventListener("click", e => {
    e.stopPropagation();
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "flex";
    toggleBtn.textContent = collapsed ? "＋" : "—";
  });

  const dispose = () => {
    if (intervalId) clearInterval(intervalId);
    tracker.dispose();
    if (panel.parentNode) panel.parentNode.removeChild(panel);
  };

  closeBtn.addEventListener("click", e => {
    e.stopPropagation();
    dispose();
  });

  header.addEventListener("click", () => {
    update();
  });

  document.body.appendChild(panel);
  update();

  const intervalId = options.refreshIntervalMs
    ? setInterval(update, options.refreshIntervalMs)
    : undefined;

  return {
    element: panel,
    update,
    dispose,
  };
}
