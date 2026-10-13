import type { Child } from "./dom.js";

export interface CSSProperties {
  [property: string]: string | number | undefined;
}

interface AccessibilityProps {
  [attribute: `aria-${string}`]: string | number | boolean | undefined;
  [attribute: `data-${string}`]: string | number | boolean | undefined;
}

interface CommonHTMLProps extends AccessibilityProps {
  key?: string | number;
  children?: Child;
  id?: string;
  class?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  role?: string;
  tabIndex?: number;
  hidden?: boolean;
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  accessKey?: string;
  contentEditable?: boolean | "inherit" | "true" | "false";
  draggable?: boolean;
  spellCheck?: boolean;
  translate?: "yes" | "no";
  slot?: string;
  part?: string;
  ref?: ((element: Element | null) => void) | { current: Element | null };
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onInput?: (event: InputEvent) => void;
  onChange?: (event: Event) => void;
  onSubmit?: (event: SubmitEvent) => void;
  onReset?: (event: Event) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onError?: (event: Event) => void;
  onLoad?: (event: Event) => void;
}

export interface HTMLProps extends CommonHTMLProps {
  href?: string;
  target?: string;
  rel?: string;
  download?: boolean | string;
  src?: string;
  srcSet?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
  type?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  multiple?: boolean;
  selected?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  rows?: number;
  cols?: number;
  wrap?: "hard" | "soft";
  htmlFor?: string;
  for?: string;
  action?: string;
  method?: string;
  encType?: string;
  accept?: string;
  form?: string;
  formAction?: string;
  formMethod?: string;
  formNoValidate?: boolean;
  noValidate?: boolean;
  colSpan?: number;
  rowSpan?: number;
  scope?: string;
  open?: boolean;
  start?: number;
  cite?: string;
  dateTime?: string;
}

export interface SVGProps extends CommonHTMLProps {
  xmlns?: string;
  viewBox?: string;
  preserveAspectRatio?: string;
  x?: number | string;
  y?: number | string;
  x1?: number | string;
  x2?: number | string;
  y1?: number | string;
  y2?: number | string;
  cx?: number | string;
  cy?: number | string;
  r?: number | string;
  rx?: number | string;
  ry?: number | string;
  d?: string;
  points?: string;
  width?: number | string;
  height?: number | string;
  fill?: string;
  fillRule?: "nonzero" | "evenodd";
  stroke?: string;
  strokeWidth?: number | string;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "arcs" | "bevel" | "miter" | "miter-clip" | "round";
  strokeDasharray?: string | number;
  strokeDashoffset?: string | number;
  opacity?: number | string;
  offset?: number | string;
  stopColor?: string;
  stopOpacity?: number | string;
  gradientUnits?: "objectBoundingBox" | "userSpaceOnUse";
  gradientTransform?: string;
  vectorEffect?: string;
}

type Targeted<E extends Event, Target extends Element> = E & { currentTarget: Target };

type DOMEventProps<Target extends Element> = {
  onClick?: (event: Targeted<MouseEvent, Target>) => void;
  onDoubleClick?: (event: Targeted<MouseEvent, Target>) => void;
  onInput?: (event: Targeted<InputEvent, Target>) => void;
  onChange?: (event: Targeted<Event, Target>) => void;
  onSubmit?: (event: Targeted<SubmitEvent, Target>) => void;
  onReset?: (event: Targeted<Event, Target>) => void;
  onKeyDown?: (event: Targeted<KeyboardEvent, Target>) => void;
  onKeyUp?: (event: Targeted<KeyboardEvent, Target>) => void;
  onFocus?: (event: Targeted<FocusEvent, Target>) => void;
  onBlur?: (event: Targeted<FocusEvent, Target>) => void;
  onMouseEnter?: (event: Targeted<MouseEvent, Target>) => void;
  onMouseLeave?: (event: Targeted<MouseEvent, Target>) => void;
  onPointerDown?: (event: Targeted<PointerEvent, Target>) => void;
  onPointerUp?: (event: Targeted<PointerEvent, Target>) => void;
  onError?: (event: Targeted<Event, Target>) => void;
  onLoad?: (event: Targeted<Event, Target>) => void;
};

type DOMEventNames = keyof DOMEventProps<Element>;

export type JSXIntrinsicElements = {
  [Tag in keyof HTMLElementTagNameMap]: Omit<HTMLProps, DOMEventNames> & DOMEventProps<HTMLElementTagNameMap[Tag]>;
} & {
  [Tag in keyof SVGElementTagNameMap]: Omit<SVGProps, DOMEventNames> & DOMEventProps<SVGElementTagNameMap[Tag]>;
};
