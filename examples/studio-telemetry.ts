export interface DOMNodeSnapshot {
  id: string;
  tag: string;
  key?: string | number;
  text?: string;
  childCount: number;
  children: DOMNodeSnapshot[];
}

export interface PatchTelemetryEvent {
  id: string;
  timestamp: number;
  type: "mount" | "update" | "reorder" | "remove";
  targetTag: string;
  detail: string;
}

/**
 * Traverses a mounted DOM element to construct a clean tree snapshot for the Inspector.
 */
export function captureDOMSnapshot(rootEl: Element | null): DOMNodeSnapshot | null {
  if (!rootEl) return null;

  function traverse(el: Element, depth: number = 0): DOMNodeSnapshot {
    const childrenSnapshots: DOMNodeSnapshot[] = [];
    for (let i = 0; i < el.children.length; i++) {
      childrenSnapshots.push(traverse(el.children[i], depth + 1));
    }

    const textContent = el.children.length === 0 ? el.textContent?.trim().slice(0, 30) : undefined;
    const keyAttr = el.getAttribute("key") || el.getAttribute("data-key") || undefined;

    return {
      id: `node-${depth}-${Math.random().toString(36).slice(2, 7)}`,
      tag: el.tagName.toLowerCase(),
      key: keyAttr,
      text: textContent || undefined,
      childCount: el.children.length,
      children: childrenSnapshots,
    };
  }

  return traverse(rootEl);
}

/**
 * Formats a patch transaction log entry into human-readable text.
 */
export function formatTelemetryLog(event: PatchTelemetryEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  return `[${time}] ${event.type.toUpperCase()}: <${event.targetTag}> — ${event.detail}`;
}
