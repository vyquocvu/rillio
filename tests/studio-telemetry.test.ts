// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { captureDOMSnapshot, formatTelemetryLog, PatchTelemetryEvent } from "../examples/studio-telemetry";

describe("Studio Telemetry & DOM Tree Inspector", () => {
  it("formats telemetry log entries cleanly", () => {
    const event: PatchTelemetryEvent = {
      id: "ev-1",
      timestamp: 1729960000000,
      type: "reorder",
      targetTag: "li",
      detail: "Moved from index 3 to 1 via LIS",
    };
    const log = formatTelemetryLog(event);
    expect(log).toContain("REORDER");
    expect(log).toContain("<li>");
    expect(log).toContain("LIS");
  });

  it("captures empty snapshot when element is null", () => {
    expect(captureDOMSnapshot(null)).toBeNull();
  });

  it("traverses DOM structure into snapshot tree", () => {
    const container = document.createElement("div");
    container.innerHTML = `<ul data-key="list-root"><li data-key="item-1">Item 1</li><li data-key="item-2">Item 2</li></ul>`;

    const snapshot = captureDOMSnapshot(container);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.tag).toBe("div");
    expect(snapshot?.children.length).toBe(1);

    const ulNode = snapshot?.children[0];
    expect(ulNode?.tag).toBe("ul");
    expect(ulNode?.key).toBe("list-root");
    expect(ulNode?.children.length).toBe(2);
    expect(ulNode?.children[0].text).toBe("Item 1");
  });
});
