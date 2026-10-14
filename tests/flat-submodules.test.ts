// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  blockedHTMLProperties,
  urlProperties,
  classifyProperty,
  isEventProperty,
  isUnsafeUrlProperty,
  validateProperty
} from "../src/flat/security.js";
import {
  SVG_NAMESPACE,
  XLINK_NAMESPACE,
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  isKnownSVGTag,
  xlinkAttributes,
  xmlAttributes,
  svgHyphenatedAttributes,
  setProperty,
  setAttribute
} from "../src/flat/properties.js";
import {
  captureFocus,
  captureFocusInRecords,
  restoreFocus
} from "../src/flat/focus.js";
import {
  parentDom,
  parentAnchor,
  extractRange,
  appendRange
} from "../src/flat/dom.js";
import { NodeRegistry } from "../src/flat/registry.js";

describe("src/flat submodules isolated tests", () => {
  describe("security.ts", () => {
    it("classifies event properties, HTML sinks, and URL properties", () => {
      expect(isEventProperty("onClick")).toBe(true);
      expect(isEventProperty("onMouseDown")).toBe(true);
      expect(isEventProperty("open")).toBe(false);
      expect(isEventProperty("on")).toBe(false);

      const clickClass = classifyProperty("onClick");
      expect(clickClass.event).toBe(true);
      expect(clickClass.blockedHTML).toBe(false);

      const htmlClass = classifyProperty("innerHTML");
      expect(htmlClass.blockedHTML).toBe(true);

      const hrefClass = classifyProperty("href");
      expect(hrefClass.url).toBe(true);
    });

    it("detects unsafe URL schemes via isUnsafeUrlProperty", () => {
      expect(isUnsafeUrlProperty("href", "javascript:alert(1)")).toBe(true);
      expect(isUnsafeUrlProperty("href", "JAVASCRIPT:alert(1)")).toBe(true);
      expect(isUnsafeUrlProperty("src", "vbscript:msgbox()")).toBe(true);
      expect(isUnsafeUrlProperty("href", "data:text/html;base64,PHNjcmlwdD4=")).toBe(true);

      expect(isUnsafeUrlProperty("href", "https://example.com")).toBe(false);
      expect(isUnsafeUrlProperty("href", "/relative/path")).toBe(false);
      expect(isUnsafeUrlProperty("src", "data:image/png;base64,iVBORw0KGgoAAA==")).toBe(false);
    });

    it("rejects forbidden HTML injection sinks and executable URLs with precise error codes", () => {
      expect(() => validateProperty("innerHTML", "<b>hi</b>")).toThrow("ZUI_UNSAFE_HTML_PROP");
      expect(() => validateProperty("outerHTML", "<b>hi</b>")).toThrow("ZUI_UNSAFE_HTML_PROP");
      expect(() => validateProperty("srcdoc", "<b>hi</b>")).toThrow("ZUI_UNSAFE_HTML_PROP");
      expect(() => validateProperty("href", "javascript:void(0)")).toThrow("ZUI_UNSAFE_URL_PROP");
      expect(() => validateProperty("src", "vbscript:run()")).toThrow("ZUI_UNSAFE_URL_PROP");
      expect(() => validateProperty("onClick", "alert(1)")).toThrow("ZUI_UNSAFE_EVENT_PROP");

      // Valid properties do not throw
      expect(() => validateProperty("className", "btn btn-primary")).not.toThrow();
      expect(() => validateProperty("href", "https://google.com")).not.toThrow();
      expect(() => validateProperty("onClick", () => {})).not.toThrow();
    });
  });

  describe("properties.ts", () => {
    it("exports standard XML, SVG, and XLINK namespaces", () => {
      expect(SVG_NAMESPACE).toBe("http://www.w3.org/2000/svg");
      expect(XLINK_NAMESPACE).toBe("http://www.w3.org/1999/xlink");
      expect(XML_NAMESPACE).toBe("http://www.w3.org/XML/1998/namespace");
      expect(XMLNS_NAMESPACE).toBe("http://www.w3.org/2000/xmlns/");
    });

    it("identifies known SVG tags", () => {
      expect(isKnownSVGTag("svg")).toBe(false); // root svg is handled as container
      expect(isKnownSVGTag("circle")).toBe(true);
      expect(isKnownSVGTag("path")).toBe(true);
      expect(isKnownSVGTag("linearGradient")).toBe(true);
      expect(isKnownSVGTag("div")).toBe(false);
    });

    it("provides attribute mappings for xlink, xml, and hyphenated svg attributes", () => {
      expect(xlinkAttributes["xlinkHref"]).toBe("xlink:href");
      expect(xmlAttributes["xmlSpace"]).toBe("xml:space");
      expect(svgHyphenatedAttributes["strokeWidth"]).toBe("stroke-width");
    });

    it("applies attributes and properties to elements", () => {
      const div = document.createElement("div");
      setAttribute(div, "aria-hidden", true);
      expect(div.getAttribute("aria-hidden")).toBe("true");

      setAttribute(div, "aria-hidden", false);
      expect(div.getAttribute("aria-hidden")).toBe("false");

      setAttribute(div, "data-test", "sample");
      expect(div.getAttribute("data-test")).toBe("sample");
    });
  });

  describe("focus.ts", () => {
    let registry: NodeRegistry;
    let input: HTMLInputElement;

    beforeEach(() => {
      registry = new NodeRegistry();
      input = document.createElement("input");
      input.type = "text";
      input.value = "Hello World";
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(2, 5, "forward");
    });

    it("captures and restores focus and caret selection on flat nodes", () => {
      const root = registry.createRoot(document.body);
      const inputId = registry.createNode({
        rootId: root.rootId,
        ownerId: root.ownerId,
        kind: "element",
        domStart: input
      });
      const inputNode = registry.getNode(inputId);

      const focusState = captureFocus(document, inputNode);
      expect(focusState).not.toBeNull();
      expect(focusState?.element).toBe(input);
      expect(focusState?.start).toBe(2);
      expect(focusState?.end).toBe(5);

      // Blur input
      input.blur();
      expect(document.activeElement).not.toBe(input);

      // Restore focus
      restoreFocus(focusState);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(2);
      expect(input.selectionEnd).toBe(5);

      input.remove();
    });
  });

  describe("dom.ts", () => {
    let registry: NodeRegistry;
    let container: HTMLDivElement;

    beforeEach(() => {
      registry = new NodeRegistry();
      container = document.createElement("div");
      document.body.appendChild(container);
    });

    it("resolves parentDom and parentAnchor correctly for roots, elements, and boundaries", () => {
      const root = registry.createRoot(container);
      const rootNode = registry.getNode(root.nodeId);
      expect(parentDom(rootNode)).toBe(container);
      expect(parentAnchor(rootNode)).toBeNull();

      // Boundary parent
      const boundaryStart = document.createComment("start");
      const boundaryEnd = document.createComment("end");
      container.appendChild(boundaryStart);
      container.appendChild(boundaryEnd);

      const boundaryId = registry.createNode({
        rootId: root.rootId,
        ownerId: root.ownerId,
        kind: "boundary",
        domStart: boundaryStart,
        domEnd: boundaryEnd
      });
      const boundaryNode = registry.getNode(boundaryId);

      expect(parentDom(boundaryNode)).toBe(container);
      expect(parentAnchor(boundaryNode)).toBe(boundaryEnd);

      // extractRange
      const fragment = extractRange(document, boundaryNode);
      expect(fragment.childNodes.length).toBe(2);
      expect(boundaryStart.parentNode).toBe(fragment);
      expect(boundaryEnd.parentNode).toBe(fragment);

      // appendRange
      const fragment2 = document.createDocumentFragment();
      appendRange(fragment2, boundaryNode);
      expect(fragment2.childNodes.length).toBe(2);
    });
  });
});
