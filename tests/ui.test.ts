// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, jsx, useState } from "../src/compat.js";
import { Avatar, Badge, Button, Card, EmptyState, Input, Modal, Progress, StyleSheet } from "../src/ui.js";

describe("ZUI UI primitives", () => {
  it("renders composable controls with accessible state", () => {
    const container = document.createElement("div");
    let clicked = 0;
    const root = createRoot(container);
    root.render(jsx("main", {
      children: [
        StyleSheet(),
        Card({ title: "Account", description: "Profile details", children: Input({ label: "Email", id: "email", value: "hello@zui.dev" }) }),
        Button({ children: "Save", leading: Badge({ children: "New", tone: "primary" }), onClick: () => clicked++ }),
        Avatar({ initials: "Z", color: "#7c3aed", size: "lg" }),
        Progress({ value: 42, label: "Upload progress" }),
        EmptyState({ title: "Nothing here", children: Button({ children: "Create one" }) })
      ]
    }));

    expect(container.querySelector("style[data-zui-ui]")).not.toBeNull();
    expect(container.querySelector(".zui-card__title")?.textContent).toBe("Account");
    expect(container.querySelector("label")?.textContent).toBe("Email");
    expect(container.querySelector("input")?.value).toBe("hello@zui.dev");
    expect(container.querySelector(".zui-progress")?.getAttribute("aria-valuenow")).toBe("42");
    expect(container.querySelector(".zui-progress__bar")?.getAttribute("style")).toContain("width: 42%");
    expect(container.querySelector(".zui-empty .zui-button")?.textContent).toBe("Create one");
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(clicked).toBe(1);
    root.unmount();
  });

  it("does not mount a closed modal", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(jsx("div", { children: Modal({ open: false, title: "Hidden", onClose: () => undefined }) }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    root.unmount();
  });

  it("associates generated Input labels and descriptions and clamps progress ARIA values", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(jsx("main", {
      children: [
        Input({ label: "Workspace name", hint: "Visible to teammates", error: "Required" }),
        Progress({ value: 150, max: 100, label: "Upload progress" })
      ]
    }));

    const input = container.querySelector<HTMLInputElement>("input")!;
    expect(input.id).toBeTruthy();
    expect(container.querySelector("label")?.htmlFor).toBe(input.id);
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual([
      `${input.id}-hint`, `${input.id}-error`
    ]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(`#${input.id}-hint`)?.textContent).toBe("Visible to teammates");
    expect(container.querySelector(`#${input.id}-error`)?.textContent).toBe("Required");

    const progress = container.querySelector('[role="progressbar"]')!;
    expect(progress.getAttribute("aria-label")).toBe("Upload progress");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.getAttribute("aria-valuenow")).toBe("100");
    expect(container.querySelector<HTMLElement>(".zui-progress__bar")?.style.width).toBe("100%");
    root.unmount();
  });

  it("requires a non-empty accessible name for progress indicators", () => {
    expect(() => Progress({ value: 0, label: "   " })).toThrow("ZUI_PROGRESS_LABEL_REQUIRED");
  });

  it("gives dialogs unique labels and manages focus, Escape, and focus restoration", () => {
    const container = document.createElement("div");
    document.body.append(container);
    let closeCalls = 0;

    let backgroundCloseCalls = 0;
    let topCloseCalls = 0;
    const duplicates = createRoot(container);
    duplicates.render(jsx("div", {
      children: [
        Modal({ open: true, title: "One", onClose: () => { backgroundCloseCalls++; } }),
        Modal({ open: true, title: "Two", onClose: () => { topCloseCalls++; } })
      ]
    }));
    const duplicateDialogs = [...container.querySelectorAll<HTMLElement>('[role="dialog"]')];
    const duplicateTitleIds = duplicateDialogs.map(dialog => dialog.getAttribute("aria-labelledby"));
    expect(new Set(duplicateTitleIds).size).toBe(2);
    for (const dialog of duplicateDialogs) {
      expect(dialog.querySelector(`#${dialog.getAttribute("aria-labelledby")}`)).not.toBeNull();
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(topCloseCalls).toBe(1);
    expect(backgroundCloseCalls).toBe(0);
    duplicates.unmount();

    let setOpen!: (next: boolean) => void;
    function App() {
      const [open, updateOpen] = useState(false);
      setOpen = updateOpen;
      return jsx("div", {
        children: [
          jsx("button", { id: "modal-opener", children: "Open" }),
          Modal({
            open,
            title: "Preferences",
            description: "Manage workspace preferences.",
            onClose: () => { closeCalls++; setOpen(false); },
            children: jsx("button", { children: "Save" })
          })
        ]
      });
    }

    const root = createRoot(container);
    root.render(jsx(App, {}));

    const opener = container.querySelector<HTMLButtonElement>("#modal-opener")!;
    opener.focus();
    setOpen(true);
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const closeButton = dialog.querySelector<HTMLButtonElement>(".zui-modal__close")!;
    expect(dialog.querySelector(`#${dialog.getAttribute("aria-describedby")}`)?.textContent)
      .toBe("Manage workspace preferences.");
    expect(document.activeElement).toBe(closeButton);
    closeButton.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(dialog.querySelector(".zui-modal__body button"));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(closeCalls).toBe(1);
    expect(document.activeElement).toBe(opener);

    setOpen(true);
    const backdrop = container.querySelector<HTMLElement>(".zui-modal__backdrop")!;
    backdrop.querySelector(".zui-modal")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(closeCalls).toBe(1);
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(closeCalls).toBe(2);
    expect(document.activeElement).toBe(opener);

    root.unmount();
    container.remove();
  });
});
