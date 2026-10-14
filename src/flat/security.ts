/**
 * Property sanitization, URL scheme safety, and sink protection.
 */

export const blockedHTMLProperties = new Set(["innerhtml", "outerhtml", "srcdoc"]);
export const urlProperties = new Set(["href", "xlink:href", "xlinkhref", "src", "action", "formaction", "poster", "data"]);

export interface PropertyClassification {
  readonly blockedHTML: boolean;
  readonly event: boolean;
  readonly url: boolean;
}

const propertyClassifications = new Map<string, PropertyClassification>();
const PROPERTY_CLASSIFICATION_LIMIT = 128;

export function classifyProperty(name: string): PropertyClassification {
  const cached = propertyClassifications.get(name);
  if (cached) return cached;
  const normalized = name.toLowerCase();
  const classification = {
    blockedHTML: blockedHTMLProperties.has(normalized),
    event: /^on[a-z]/i.test(name),
    url: urlProperties.has(normalized)
  };
  if (propertyClassifications.size >= PROPERTY_CLASSIFICATION_LIMIT) {
    const oldest = propertyClassifications.keys().next().value as string | undefined;
    if (oldest !== undefined) propertyClassifications.delete(oldest);
  }
  propertyClassifications.set(name, classification);
  return classification;
}

export function isEventProperty(name: string): boolean {
  return classifyProperty(name).event;
}

export function isUnsafeUrlProperty(name: string, value: unknown): boolean {
  if (!classifyProperty(name).url || typeof value !== "string") return false;
  const normalized = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();
  return /^(javascript|vbscript):/.test(normalized) || normalized.startsWith("data:text/html");
}

export function validateProperty(name: string, value: unknown): void {
  const classification = classifyProperty(name);
  if (classification.blockedHTML) throw new Error("ZUI_UNSAFE_HTML_PROP");
  if (classification.event && value != null && typeof value !== "function") {
    throw new Error("ZUI_UNSAFE_EVENT_PROP");
  }
  if (isUnsafeUrlProperty(name, value)) throw new Error("ZUI_UNSAFE_URL_PROP");
}
