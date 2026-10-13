/**
 * Small, dependency-free UI primitives for ZUI applications.
 *
 * The runtime stays unopinionated; this module is the opinionated layer: a
 * token set, accessible defaults and composable primitives that can be used
 * directly from JSX without pulling in a second rendering system.
 */

import { jsx, useEffect, useRef, type Child, type VNode } from "./compat.js";

export type UIStyle = Record<string, string | number | undefined>;

export const tokens = {
  color: {
    ink: "#172033",
    muted: "#718096",
    subtle: "#98a2b3",
    line: "#e4e8ef",
    surface: "#ffffff",
    canvas: "#f7f8fc",
    primary: "#6d3bd8",
    primaryHover: "#7c3aed",
    primarySoft: "#f0eaff",
    success: "#138a59",
    successSoft: "#eaf9f2",
    warning: "#ae6b13",
    warningSoft: "#fff6df",
    danger: "#c2475d",
    dangerSoft: "#fff0f2",
  },
  radius: { sm: "7px", md: "9px", lg: "14px", xl: "17px", pill: "999px" },
  shadow: { sm: "0 5px 18px rgba(30, 42, 67, .05)", md: "0 14px 38px rgba(30, 42, 67, .12)" },
  space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" },
} as const;

export const uiStyles = String.raw`
  :root { --zui-ink: #172033; --zui-muted: #718096; --zui-line: #e4e8ef; --zui-surface: #fff; --zui-canvas: #f7f8fc; --zui-primary: #6d3bd8; --zui-primary-hover: #7c3aed; --zui-primary-soft: #f0eaff; --zui-radius-sm: 7px; --zui-radius-md: 9px; --zui-radius-lg: 14px; --zui-shadow-sm: 0 5px 18px rgba(30, 42, 67, .05); --zui-shadow-md: 0 14px 38px rgba(30, 42, 67, .12); }
  .zui-button, .zui-icon-button, .zui-badge, .zui-card, .zui-field, .zui-input, .zui-progress, .zui-modal__backdrop, .zui-empty, .zui-stack, .zui-inline { color: var(--zui-ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .zui-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 13px; border: 1px solid transparent; border-radius: var(--zui-radius-md); font: inherit; font-size: 12px; font-weight: 750; line-height: 1; cursor: pointer; transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease; }
  .zui-button:hover:not(:disabled) { transform: translateY(-1px); }
  .zui-button:focus-visible, .zui-icon-button:focus-visible, .zui-input:focus-visible, .zui-modal__close:focus-visible { outline: 3px solid rgba(124, 58, 237, .22); outline-offset: 2px; }
  .zui-button:disabled { cursor: not-allowed; opacity: .55; }
  .zui-button--sm { min-height: 30px; padding: 0 10px; border-radius: var(--zui-radius-sm); font-size: 11px; }
  .zui-button--lg { min-height: 42px; padding: 0 16px; border-radius: 10px; font-size: 13px; }
  .zui-button--solid { color: #fff; background: var(--zui-primary); box-shadow: 0 7px 16px rgba(109, 59, 216, .2); }
  .zui-button--solid:hover:not(:disabled) { background: var(--zui-primary-hover); box-shadow: 0 9px 20px rgba(109, 59, 216, .28); }
  .zui-button--soft { color: var(--zui-primary); background: var(--zui-primary-soft); }
  .zui-button--soft:hover:not(:disabled) { background: #e7dcff; }
  .zui-button--outline { border-color: var(--zui-line); color: #526078; background: #fff; }
  .zui-button--outline:hover:not(:disabled) { border-color: #c9d0dd; background: #fbfcfe; }
  .zui-button--ghost { color: #657289; background: transparent; }
  .zui-button--ghost:hover:not(:disabled) { color: var(--zui-primary); background: #f6f3ff; }
  .zui-button--danger { color: #c2475d; background: #fff0f2; }
  .zui-button--danger:hover:not(:disabled) { background: #ffe2e7; }
  .zui-icon-button { display: inline-grid; width: 36px; height: 36px; padding: 0; place-items: center; border: 1px solid var(--zui-line); border-radius: var(--zui-radius-md); color: #718096; background: #fff; cursor: pointer; }
  .zui-icon-button:hover:not(:disabled) { border-color: #d8cafa; color: var(--zui-primary); background: #fbfaff; }
  .zui-icon-button--sm { width: 30px; height: 30px; border-radius: var(--zui-radius-sm); }
  .zui-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: var(--zui-radius-pill); font-size: 10px; font-weight: 750; line-height: 1; }
  .zui-badge::before { width: 5px; height: 5px; border-radius: 50%; background: currentColor; content: ""; }
  .zui-badge--neutral { color: #667389; background: #f0f2f6; }
  .zui-badge--primary { color: #7041d6; background: var(--zui-primary-soft); }
  .zui-badge--success { color: #138a59; background: #eaf9f2; }
  .zui-badge--warning { color: #ae6b13; background: #fff6df; }
  .zui-badge--danger { color: #c2475d; background: #fff0f2; }
  .zui-avatar { display: inline-grid; flex: 0 0 32px; width: 32px; height: 32px; overflow: hidden; place-items: center; border-radius: 10px; color: #fff; background: #6366f1; font-size: 10px; font-weight: 800; line-height: 1; }
  .zui-avatar > img { width: 100%; height: 100%; object-fit: cover; }
  .zui-avatar--sm { flex-basis: 26px; width: 26px; height: 26px; border-radius: 8px; font-size: 9px; }
  .zui-avatar--lg { flex-basis: 44px; width: 44px; height: 44px; border-radius: 13px; font-size: 13px; }
  .zui-card { border: 1px solid var(--zui-line); border-radius: var(--zui-radius-lg); background: var(--zui-surface); box-shadow: var(--zui-shadow-sm); }
  .zui-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 21px 0; }
  .zui-card__title { margin: 0; color: #27334a; font-size: 14px; font-weight: 780; letter-spacing: -.01em; }
  .zui-card__description { margin: 5px 0 0; color: #929bad; font-size: 11px; line-height: 1.5; }
  .zui-card__body { padding: 20px 21px; }
  .zui-card__body:first-child { padding-top: 21px; }
  .zui-field { display: grid; gap: 6px; }
  .zui-field__label { color: #536078; font-size: 11px; font-weight: 750; }
  .zui-field__hint { color: #929bad; font-size: 10px; line-height: 1.45; }
  .zui-field__error { color: #c2475d; font-size: 10px; line-height: 1.45; }
  .zui-input { width: 100%; height: 38px; padding: 0 10px; border: 1px solid #dfe4ed; border-radius: var(--zui-radius-md); outline: 0; color: #2b3850; background: #fbfcfe; font: inherit; font-size: 11px; transition: border-color .15s ease, box-shadow .15s ease; }
  .zui-input::placeholder { color: #a0a8b7; }
  .zui-input:focus { border-color: #9d7be9; box-shadow: 0 0 0 3px rgba(124, 58, 237, .1); }
  .zui-input[aria-invalid="true"] { border-color: #df8494; }
  .zui-progress { height: 6px; overflow: hidden; border-radius: var(--zui-radius-pill); background: #f0f1f5; }
  .zui-progress__bar { height: 100%; border-radius: inherit; background: var(--zui-primary); transition: width .25s ease; }
  .zui-progress__bar--success { background: #20a66d; }
  .zui-progress__bar--warning { background: #f09a37; }
  .zui-progress__bar--danger { background: #dd5b72; }
  .zui-modal__backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(17, 24, 39, .48); backdrop-filter: blur(4px); z-index: 100; }
  .zui-modal { width: min(100%, 520px); max-height: calc(100vh - 40px); overflow: auto; border: 1px solid rgba(255,255,255,.7); border-radius: 17px; background: #fff; box-shadow: var(--zui-shadow-md); }
  .zui-modal:focus-visible { outline: 3px solid rgba(124, 58, 237, .28); outline-offset: 3px; }
  .zui-modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 23px 23px 0; }
  .zui-modal__title { margin: 0; color: #202c43; font-size: 18px; letter-spacing: -.03em; }
  .zui-modal__description { margin: 6px 0 0; color: #929bad; font-size: 11px; line-height: 1.5; }
  .zui-modal__close { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 8px; color: #96a0b2; background: #f7f8fb; cursor: pointer; }
  .zui-modal__close:hover { color: #35415a; background: #eef0f5; }
  .zui-modal__body { padding: 20px 23px 23px; }
  .zui-modal__footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 20px; }
  .zui-empty { display: grid; place-items: center; padding: 32px 20px; border: 1px dashed #dfe4ed; border-radius: var(--zui-radius-lg); color: #7b879c; text-align: center; }
  .zui-empty__icon { display: grid; width: 38px; height: 38px; margin-bottom: 11px; place-items: center; border-radius: 12px; color: var(--zui-primary); background: var(--zui-primary-soft); }
  .zui-empty__title { margin: 0; color: #35415a; font-size: 13px; font-weight: 780; }
  .zui-empty__description { max-width: 320px; margin: 6px 0 0; color: #929bad; font-size: 10px; line-height: 1.5; }
  .zui-stack { display: flex; flex-direction: column; }
  .zui-inline { display: flex; align-items: center; }
  @media (max-width: 620px) { .zui-card__header, .zui-card__body { padding-left: 16px; padding-right: 16px; } .zui-modal__header, .zui-modal__body { padding-left: 17px; padding-right: 17px; } }
`;

export type ButtonVariant = "solid" | "soft" | "outline" | "ghost" | "danger";
export type ControlSize = "sm" | "md" | "lg";
export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";
export type ProgressTone = "primary" | "success" | "warning" | "danger";

export interface BaseProps {
  className?: string;
  style?: UIStyle;
  children?: Child;
}

export interface ButtonProps extends BaseProps {
  variant?: ButtonVariant;
  size?: ControlSize;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  leading?: Child;
  trailing?: Child;
  onClick?: (event: Event) => void;
}

export interface IconButtonProps extends BaseProps {
  label: string;
  size?: ControlSize;
  disabled?: boolean;
  onClick?: (event: Event) => void;
}

export interface CardProps extends BaseProps {
  title?: Child;
  description?: Child;
  action?: Child;
}

export interface FieldProps extends BaseProps {
  label?: Child;
  hint?: Child;
  error?: Child;
  htmlFor?: string;
  hintId?: string;
  errorId?: string;
}

export interface InputProps extends BaseProps {
  label?: Child;
  hint?: Child;
  error?: Child;
  id?: string;
  name?: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  onInput?: (event: Event) => void;
  onChange?: (event: Event) => void;
}

export interface ModalProps extends BaseProps {
  open: boolean;
  title: Child;
  description?: Child;
  footer?: Child;
  onClose: () => void;
}

let nextModalTitleId = 1;
let nextInputId = 1;
const openModalDialogs: HTMLDivElement[] = [];

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function children(...values: Array<Child | undefined>): Child[] {
  return values.filter((value): value is Child => value !== undefined && value !== null && value !== false);
}

/** Mount once near the application root to opt into the ZUI visual language. */
export function StyleSheet(): VNode {
  return jsx("style", { "data-zui-ui": "true", children: uiStyles });
}

export function Button({ children: content, variant = "solid", size = "md", type = "button", disabled, leading, trailing, onClick, className, style }: ButtonProps): VNode {
  return jsx("button", { type, disabled, onClick, class: cx("zui-button", `zui-button--${variant}`, size !== "md" && `zui-button--${size}`, className), style, children: children(leading, content, trailing) });
}

export function IconButton({ children: content, label, size = "md", disabled, onClick, className, style }: IconButtonProps): VNode {
  return jsx("button", { type: "button", disabled, onClick, "aria-label": label, class: cx("zui-icon-button", size !== "md" && `zui-icon-button--${size}`, className), style, children: content });
}

export function Badge({ children: content, tone = "neutral", className, style }: BaseProps & { tone?: BadgeTone }): VNode {
  return jsx("span", { class: cx("zui-badge", `zui-badge--${tone}`, className), style, children: content });
}

export function Avatar({ initials, src, alt = "", size = "md", color = "#6366f1", className, style }: { initials?: string; src?: string; alt?: string; size?: ControlSize; color?: string; className?: string; style?: UIStyle }): VNode {
  return jsx("span", { class: cx("zui-avatar", size !== "md" && `zui-avatar--${size}`, className), style: { background: color, ...style }, children: src ? jsx("img", { src, alt }) : initials });
}

export function Card({ title, description, action, children: content, className, style }: CardProps): VNode {
  const header = title !== undefined || description !== undefined || action !== undefined
    ? jsx("div", { class: "zui-card__header", children: [jsx("div", { children: [title !== undefined ? jsx("h2", { class: "zui-card__title", children: title }) : null, description !== undefined ? jsx("p", { class: "zui-card__description", children: description }) : null] }), action] })
    : undefined;
  return jsx("section", { class: cx("zui-card", className), style, children: [header, jsx("div", { class: "zui-card__body", children: content })] });
}

export function Field({ label, hint, error, htmlFor, hintId, errorId, children: content, className, style }: FieldProps): VNode {
  return jsx("div", {
    class: cx("zui-field", className),
    style,
    children: [
      label !== undefined ? jsx("label", { class: "zui-field__label", for: htmlFor, children: label }) : null,
      content,
      hint !== undefined ? jsx("span", { id: hintId, class: "zui-field__hint", children: hint }) : null,
      error !== undefined ? jsx("span", { id: errorId, class: "zui-field__error", role: "alert", children: error }) : null
    ]
  });
}

export function Input({ label, hint, error, id, name, type = "text", value, placeholder, disabled, required, onInput, onChange, className, style }: InputProps): VNode {
  const needsField = label !== undefined || hint !== undefined || error !== undefined;
  const inputId = id || (needsField ? `zui-input-${nextInputId++}` : undefined);
  const hintId = hint !== undefined && inputId ? `${inputId}-hint` : undefined;
  const errorId = error !== undefined && inputId ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const input = jsx("input", {
    id: inputId,
    name,
    type,
    value,
    placeholder,
    disabled,
    required,
    onInput,
    onChange,
    "aria-invalid": error !== undefined ? "true" : undefined,
    "aria-describedby": describedBy,
    class: cx("zui-input", className),
    style
  });
  return needsField ? Field({ label, hint, error, htmlFor: inputId, hintId, errorId, children: input }) : input;
}

export function Progress({ value, max = 100, tone = "primary", label, className, style }: { value: number; max?: number; tone?: ProgressTone; label: string; className?: string; style?: UIStyle }): VNode {
  if (!label.trim()) throw new Error("ZUI_PROGRESS_LABEL_REQUIRED");
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;
  const percentage = (safeValue / safeMax) * 100;
  return jsx("div", { class: cx("zui-progress", className), style, role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": safeMax, "aria-valuenow": safeValue, children: jsx("div", { class: cx("zui-progress__bar", tone !== "primary" && `zui-progress__bar--${tone}`), style: { width: `${percentage}%` } }) });
}

function ModalLayer({ title, description, footer, onClose, children: content }: ModalProps): VNode {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  const titleIdRef = useRef("");
  closeRef.current = onClose;
  if (!titleIdRef.current) titleIdRef.current = `zui-modal-title-${nextModalTitleId++}`;
  const descriptionId = `${titleIdRef.current}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog) openModalDialogs.push(dialog);
    const focusable = () => dialog
      ? [...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter(element => element.getAttribute("aria-hidden") !== "true")
      : [];

    (focusable()[0] ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (openModalDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (dialog && !dialog.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const stackIndex = dialog ? openModalDialogs.lastIndexOf(dialog) : -1;
      const wasTopDialog = stackIndex === openModalDialogs.length - 1;
      if (stackIndex !== -1) openModalDialogs.splice(stackIndex, 1);
      if (wasTopDialog && previousActive?.isConnected) previousActive.focus();
    };
  }, []);

  return jsx("div", {
    class: "zui-modal__backdrop",
    role: "presentation",
    onClick: (event: Event) => {
      if (event.target === event.currentTarget) closeRef.current();
    },
    children: jsx("div", {
      ref: dialogRef,
      class: "zui-modal",
      role: "dialog",
      tabIndex: -1,
      "aria-modal": "true",
      "aria-labelledby": titleIdRef.current,
      "aria-describedby": description !== undefined ? descriptionId : undefined,
      children: [
        jsx("div", {
          class: "zui-modal__header",
          children: [
            jsx("div", {
              children: [
                jsx("h2", { id: titleIdRef.current, class: "zui-modal__title", children: title }),
                description !== undefined ? jsx("p", { id: descriptionId, class: "zui-modal__description", children: description }) : null
              ]
            }),
            jsx("button", {
              type: "button",
              class: "zui-modal__close",
              "aria-label": "Close dialog",
              onClick: () => closeRef.current(),
              children: "×"
            })
          ]
        }),
        jsx("div", {
          class: "zui-modal__body",
          children: [content, footer !== undefined ? jsx("div", { class: "zui-modal__footer", children: footer }) : null]
        })
      ]
    })
  });
}

export function Modal(props: ModalProps): VNode | null {
  return props.open ? jsx(ModalLayer, props) : null;
}

export function Stack({ children: content, gap = "md", className, style }: BaseProps & { gap?: keyof typeof tokens.space }): VNode {
  return jsx("div", { class: cx("zui-stack", className), style: { gap: tokens.space[gap], ...style }, children: content });
}

export function Inline({ children: content, gap = "md", className, style }: BaseProps & { gap?: keyof typeof tokens.space }): VNode {
  return jsx("div", { class: cx("zui-inline", className), style: { gap: tokens.space[gap], ...style }, children: content });
}

export function EmptyState({ title, description, icon, action, children: content, className, style }: { title: Child; description?: Child; icon?: Child; action?: Child; children?: Child; className?: string; style?: UIStyle }): VNode {
  return jsx("div", { class: cx("zui-empty", className), style, children: [icon !== undefined ? jsx("div", { class: "zui-empty__icon", children: icon }) : null, jsx("h2", { class: "zui-empty__title", children: title }), description !== undefined ? jsx("p", { class: "zui-empty__description", children: description }) : null, action ?? content] });
}
