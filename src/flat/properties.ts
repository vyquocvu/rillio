/**
 * HTML, SVG, and Custom Element property and attribute application.
 */

import type { FlatNode } from "./types.js";
import { validateProperty } from "./security.js";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

export const svgTags = new Set([
  "circle", "ellipse", "line", "path", "polygon", "polyline", "rect",
  "g", "defs", "symbol", "use", "animate", "animateMotion", "animateTransform",
  "clipPath", "desc", "feBlend", "feColorMatrix", "feComponentTransfer",
  "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap",
  "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG",
  "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode",
  "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
  "feSpotLight", "feTile", "feTurbulence", "filter", "foreignObject",
  "linearGradient", "marker", "mask", "metadata", "mpath", "pattern",
  "radialGradient", "stop", "switch", "textPath", "tspan", "view"
]);

export function isKnownSVGTag(tag: string): boolean {
  return svgTags.has(tag) || svgTags.has(tag.toLowerCase());
}

export const xlinkAttributes: Record<string, string> = {
  "xlink:href": "xlink:href",
  "xlinkHref": "xlink:href",
  "xlink:title": "xlink:title",
  "xlinkTitle": "xlink:title",
  "xlink:show": "xlink:show",
  "xlinkShow": "xlink:show",
  "xlink:actuate": "xlink:actuate",
  "xlinkActuate": "xlink:actuate",
  "xlink:role": "xlink:role",
  "xlinkRole": "xlink:role",
  "xlink:arcrole": "xlink:arcrole",
  "xlinkArcrole": "xlink:arcrole",
  "xlink:type": "xlink:type",
  "xlinkType": "xlink:type"
};

export const xmlAttributes: Record<string, string> = {
  "xml:space": "xml:space",
  "xmlSpace": "xml:space",
  "xml:lang": "xml:lang",
  "xmlLang": "xml:lang"
};

export const svgHyphenatedAttributes: Record<string, string> = {
  strokeWidth: "stroke-width",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  fillRule: "fill-rule",
  fillOpacity: "fill-opacity",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  vectorEffect: "vector-effect",
  fontFamily: "font-family",
  fontSize: "font-size",
  textAnchor: "text-anchor",
  dominantBaseline: "dominant-baseline",
  shapeRendering: "shape-rendering",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  lightingColor: "lighting-color",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity"
};

export const svgCamelCaseAttributes: Record<string, string> = {
  viewbox: "viewBox",
  viewBox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  preserveAspectRatio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradientUnits: "gradientUnits",
  gradienttransform: "gradientTransform",
  gradientTransform: "gradientTransform",
  clippathunits: "clipPathUnits",
  clipPathUnits: "clipPathUnits",
  maskunits: "maskUnits",
  maskUnits: "maskUnits",
  maskcontentunits: "maskContentUnits",
  maskContentUnits: "maskContentUnits",
  patternunits: "patternUnits",
  patternUnits: "patternUnits",
  patterncontentunits: "patternContentUnits",
  patternContentUnits: "patternContentUnits",
  patterntransform: "patternTransform",
  patternTransform: "patternTransform",
  spreadmethod: "spreadMethod",
  spreadMethod: "spreadMethod",
  markerunits: "markerUnits",
  markerUnits: "markerUnits",
  markerwidth: "markerWidth",
  markerWidth: "markerWidth",
  markerheight: "markerHeight",
  markerHeight: "markerHeight",
  refx: "refX",
  refX: "refX",
  refy: "refY",
  refY: "refY",
  tablevalues: "tableValues",
  tableValues: "tableValues",
  stddeviation: "stdDeviation",
  stdDeviation: "stdDeviation",
  basefrequency: "baseFrequency",
  baseFrequency: "baseFrequency",
  numoctaves: "numOctaves",
  numOctaves: "numOctaves",
  stitchtiles: "stitchTiles",
  stitchTiles: "stitchTiles",
  surfacescale: "surfaceScale",
  surfaceScale: "surfaceScale",
  specularconstant: "specularConstant",
  specularConstant: "specularConstant",
  specularexponent: "specularExponent",
  specularExponent: "specularExponent",
  kernelmatrix: "kernelMatrix",
  kernelMatrix: "kernelMatrix",
  kernelunitlength: "kernelUnitLength",
  kernelUnitLength: "kernelUnitLength",
  targetx: "targetX",
  targetX: "targetX",
  targety: "targetY",
  targetY: "targetY",
  edgemode: "edgeMode",
  edgeMode: "edgeMode",
  limitingconeangle: "limitingConeAngle",
  limitingConeAngle: "limitingConeAngle",
  pointsatx: "pointsAtX",
  pointsAtX: "pointsAtX",
  pointsaty: "pointsAtY",
  pointsAtY: "pointsAtY",
  pointsatz: "pointsAtZ",
  pointsAtZ: "pointsAtZ",
  diffuseconstant: "diffuseConstant",
  diffuseConstant: "diffuseConstant",
  xchannelselector: "xChannelSelector",
  xChannelSelector: "xChannelSelector",
  ychannelselector: "yChannelSelector",
  yChannelSelector: "yChannelSelector"
};

export function stringify(value: unknown): string {
  return value == null || typeof value === "boolean" ? "" : String(value);
}

export function eventName(name: string): string {
  if (name === "onChange") return "change";
  if (name === "onDoubleClick") return "dblclick";
  return name.slice(2).toLowerCase();
}

export function setAttribute(element: Element, name: string, value: unknown): void {
  if (name.startsWith("aria-")) {
    if (typeof value === "boolean") {
      element.setAttribute(name, value ? "true" : "false");
      return;
    }
    if (value == null) {
      element.removeAttribute(name);
      return;
    }
    element.setAttribute(name, String(value));
    return;
  }
  if (name === "role") {
    if (value == null || value === false) element.removeAttribute("role");
    else element.setAttribute("role", String(value));
    return;
  }
  if (value == null || value === false) element.removeAttribute(name);
  else if (value === true) element.setAttribute(name, "");
  else element.setAttribute(name, String(value));
}

export function applyStyle(node: FlatNode, element: ElementCSSInlineStyle, value: unknown): void {
  const next = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const previous = node.styleSnapshot;
  const style = element.style;
  for (const prop of Object.keys(previous ?? {})) {
    if (prop in next) continue;
    if (prop.startsWith("--")) style.removeProperty(prop);
    else (style as any)[prop] = "";
  }
  for (const [prop, entry] of Object.entries(next)) {
    if (Object.is(previous?.[prop], entry)) continue;
    if (prop.startsWith("--")) style.setProperty(prop, stringify(entry));
    else (style as any)[prop] = entry ?? "";
  }
  node.styleSnapshot = Object.keys(next).length > 0 ? { ...next } : undefined;
}

export function setSvgProperty(node: FlatNode, element: SVGElement, name: string, value: unknown): void {
  if (name === "className" || name === "class") {
    setAttribute(element, "class", value);
    return;
  }
  if (name === "style") {
    applyStyle(node, element, value);
    return;
  }
  if (name in xlinkAttributes) {
    const qualified = xlinkAttributes[name]!;
    const local = qualified.slice(6);
    if (value == null || value === false) {
      element.removeAttributeNS(XLINK_NAMESPACE, local);
      element.removeAttribute(qualified);
    } else {
      element.setAttributeNS(XLINK_NAMESPACE, qualified, String(value));
    }
    return;
  }
  if (name in xmlAttributes) {
    const qualified = xmlAttributes[name]!;
    const local = qualified.slice(4);
    if (value == null || value === false) {
      element.removeAttributeNS(XML_NAMESPACE, local);
      element.removeAttribute(qualified);
    } else {
      element.setAttributeNS(XML_NAMESPACE, qualified, String(value));
    }
    return;
  }
  if (name === "xmlns:xlink" || name === "xmlnsXlink") {
    if (value == null || value === false) {
      element.removeAttributeNS(XMLNS_NAMESPACE, "xlink");
      element.removeAttribute("xmlns:xlink");
    } else {
      element.setAttributeNS(XMLNS_NAMESPACE, "xmlns:xlink", String(value));
    }
    return;
  }
  const attrName = svgHyphenatedAttributes[name] ?? svgCamelCaseAttributes[name] ?? name;
  setAttribute(element, attrName, value);
}

export function setCustomElementProperty(node: FlatNode, element: Element, name: string, value: unknown): void {
  if (name === "className" || name === "class") {
    element.className = stringify(value);
    return;
  }
  if (name === "style") {
    applyStyle(node, element as unknown as ElementCSSInlineStyle, value);
    return;
  }
  if (name === "role") {
    if (value == null || value === false) {
      element.removeAttribute("role");
      if ("role" in element) try { (element as any).role = null; } catch {}
    } else {
      element.setAttribute("role", String(value));
      if ("role" in element) try { (element as any).role = String(value); } catch {}
    }
    return;
  }
  if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
    (element as any)[name] = value;
  } else if (typeof value === "boolean") {
    (element as any)[name] = value;
    if (value) element.setAttribute(name, "");
    else element.removeAttribute(name);
  } else {
    if (name in element) {
      try { (element as any)[name] = value; } catch {}
    }
    setAttribute(element, name, value);
  }
}

export function setHtmlProperty(node: FlatNode, element: HTMLElement, name: string, value: unknown): void {
  if (name === "className" || name === "class") {
    element.className = stringify(value);
  } else if (name === "style") {
    applyStyle(node, element, value);
  } else if (name === "value") {
    const normalized = value == null ? "" : String(value);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      if ((element as any).value !== normalized) (element as any).value = normalized;
    } else if (element instanceof HTMLOptionElement) {
      if (element.value !== normalized) element.value = normalized;
      setAttribute(element, "value", value);
    } else {
      setAttribute(element, "value", value);
    }
  } else if (name === "checked") {
    const bool = Boolean(value);
    if (element instanceof HTMLInputElement && element.checked !== bool) element.checked = bool;
    if (bool) element.setAttribute("checked", "");
    else element.removeAttribute("checked");
  } else if (name === "disabled") {
    const bool = Boolean(value);
    if ("disabled" in element && (element as any).disabled !== bool) (element as any).disabled = bool;
    if (bool) element.setAttribute("disabled", "");
    else element.removeAttribute("disabled");
  } else if (name === "selected") {
    const bool = Boolean(value);
    if (element instanceof HTMLOptionElement && element.selected !== bool) element.selected = bool;
    if (bool) element.setAttribute("selected", "");
    else element.removeAttribute("selected");
  } else if (name === "indeterminate") {
    const bool = Boolean(value);
    if (element instanceof HTMLInputElement && element.indeterminate !== bool) element.indeterminate = bool;
  } else if (name === "readOnly" || name === "readonly") {
    const bool = Boolean(value);
    if ("readOnly" in element && (element as any).readOnly !== bool) (element as any).readOnly = bool;
    if (bool) element.setAttribute("readonly", "");
    else element.removeAttribute("readonly");
  } else if (name === "required") {
    const bool = Boolean(value);
    if ("required" in element && (element as any).required !== bool) (element as any).required = bool;
    if (bool) element.setAttribute("required", "");
    else element.removeAttribute("required");
  } else if (name === "multiple") {
    const bool = Boolean(value);
    if ("multiple" in element && (element as any).multiple !== bool) (element as any).multiple = bool;
    if (bool) element.setAttribute("multiple", "");
    else element.removeAttribute("multiple");
  } else if (name === "autoFocus" || name === "autofocus") {
    const bool = Boolean(value);
    if ("autofocus" in element && (element as any).autofocus !== bool) (element as any).autofocus = bool;
    if (bool) element.setAttribute("autofocus", "");
    else element.removeAttribute("autofocus");
  } else if (name === "formNoValidate" || name === "formnovalidate") {
    const bool = Boolean(value);
    if ("formNoValidate" in element && (element as any).formNoValidate !== bool) (element as any).formNoValidate = bool;
    if (bool) element.setAttribute("formnovalidate", "");
    else element.removeAttribute("formnovalidate");
  } else if (name === "htmlFor" || name === "for") {
    if (value == null) element.removeAttribute("for");
    else element.setAttribute("for", String(value));
    if ("htmlFor" in element) (element as any).htmlFor = String(value ?? "");
  } else if (name === "tabIndex" || name === "tabindex") {
    if (value == null) {
      element.removeAttribute("tabindex");
    } else {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        if ("tabIndex" in element) (element as any).tabIndex = num;
        element.setAttribute("tabindex", String(num));
      }
    }
  } else if (name === "role") {
    if (value == null || value === false) {
      element.removeAttribute("role");
      if ("role" in element) try { (element as any).role = null; } catch {}
    } else {
      element.setAttribute("role", String(value));
      if ("role" in element) try { (element as any).role = String(value); } catch {}
    }
  } else if (name in element && !name.startsWith("aria-") && !name.startsWith("data-")) {
    try { (element as any)[name] = value ?? ""; }
    catch { setAttribute(element, name, value); }
  } else {
    setAttribute(element, name, value);
  }
}

export function setProperty(node: FlatNode, name: string, value: unknown): void {
  validateProperty(name, value);
  const element = node.domStart as Element;
  if (element.namespaceURI === SVG_NAMESPACE) {
    setSvgProperty(node, element as SVGElement, name, value);
    node.version++;
    return;
  }
  const isCustom = element.localName.includes("-") || element.hasAttribute("is") || Boolean(node.props?.is);
  if (isCustom) {
    setCustomElementProperty(node, element, name, value);
    node.version++;
    return;
  }
  setHtmlProperty(node, element as HTMLElement, name, value);
  node.version++;
}
