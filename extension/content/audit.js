// Accessibility audit: finds common WCAG problems on a page.
// Classic script; exposes window.__xrayAudit = { accessibleName, isVisible, runAudit, scoreFor }.

(function (root) {
  "use strict";
  const C = root.__xrayColor;

  const OWN_UI = "[data-xray-ui]";

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function isVisible(el) {
    if (!el || el.closest(OWN_UI)) return false;
    if (el.closest("[hidden], [aria-hidden='true']")) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    return el.getClientRects().length > 0;
  }

  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  /** Text an element "says": text, image alts, SVG titles and aria-labels of its children. */
  function subtreeText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) out += node.textContent;
      else if (node.nodeType === 1) {
        if (node.getAttribute("aria-hidden") === "true" || node.hidden) continue;
        const tag = node.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") continue;
        if (node.getAttribute("aria-label")) out += " " + node.getAttribute("aria-label") + " ";
        else if (tag === "IMG") out += " " + (node.getAttribute("alt") || "") + " ";
        else if (tag.toLowerCase() === "svg") out += " " + clean(node.querySelector("title")?.textContent) + " ";
        else out += " " + subtreeText(node) + " ";
      }
    }
    return clean(out);
  }

  /** A simplified version of the accessible name computation (accname 1.2). */
  function accessibleName(el) {
    const doc = el.ownerDocument;
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const text = clean(labelledby.split(/\s+/).map((id) => doc.getElementById(id)).filter(Boolean).map((n) => subtreeText(n)).join(" "));
      if (text) return text;
    }
    const aria = clean(el.getAttribute("aria-label"));
    if (aria) return aria;
    const tag = el.tagName;
    if (tag === "IMG" || tag === "AREA" || (tag === "INPUT" && el.type === "image")) {
      const alt = el.getAttribute("alt");
      if (alt !== null) return clean(alt);
    }
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      if (tag === "INPUT" && ["submit", "reset", "button"].includes(el.type)) {
        return clean(el.value) || (el.type === "submit" ? "Submit" : el.type === "reset" ? "Reset" : "");
      }
      if (el.id) {
        const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && clean(subtreeText(label))) return clean(subtreeText(label));
      }
      const wrap = el.closest("label");
      if (wrap) {
        const text = clean(subtreeText(wrap));
        if (text) return text;
      }
      return clean(el.getAttribute("title"));
    }
    if (tag === "IFRAME") return clean(el.getAttribute("title"));
    const text = subtreeText(el);
    if (text) return text;
    return clean(el.getAttribute("title"));
  }

  /** Short human-readable description of an element, like <button class="icon">. */
  function describe(el) {
    let s = "<" + el.tagName.toLowerCase();
    if (el.id) s += ` id="${el.id}"`;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ") : "";
    if (cls) s += ` class="${cls}"`;
    if (el.tagName === "IMG") s += ` src="${(el.getAttribute("src") || "").split("/").pop().slice(0, 40)}"`;
    if (el.tagName === "A" && el.getAttribute("href")) s += ` href="${el.getAttribute("href").slice(0, 40)}"`;
    return s + ">";
  }

  function effectiveBackground(el) {
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== "none") return null; // can't know what's behind the text
      const color = C.parseColor(style.backgroundColor);
      if (color && color.a > 0) {
        layers.push(color);
        if (color.a >= 1) break;
      }
    }
    for (let i = layers.length - 1; i >= 0; i--) bg = C.blend(layers[i], bg);
    return bg;
  }

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  const RULES = {
    "image-alt": { severity: "critical", title: "Images without alt text", wcag: "1.1.1", help: "Add alt text that describes the image, or alt=\"\" if it's purely decorative. Screen readers announce these as just \"image\"." },
    "button-name": { severity: "critical", title: "Buttons without a name", wcag: "4.1.2", help: "Icon-only buttons need an aria-label, e.g. aria-label=\"Close\". Screen readers otherwise just say \"button\"." },
    "label": { severity: "critical", title: "Form fields without labels", wcag: "1.3.1", help: "Connect a <label for=\"…\"> to each field, or add aria-label. Without it, people don't know what to type." },
    "link-name": { severity: "serious", title: "Links without text", wcag: "2.4.4", help: "Give the link visible text, or an aria-label if it only contains an icon." },
    "color-contrast": { severity: "serious", title: "Low contrast text", wcag: "1.4.3", help: "Text needs a contrast ratio of at least 4.5:1 (3:1 for large text) against its background." },
    "html-lang": { severity: "serious", title: "Page language not set", wcag: "3.1.1", help: "Add lang to <html>, e.g. <html lang=\"en\">, so screen readers use the right pronunciation." },
    "document-title": { severity: "serious", title: "Page has no title", wcag: "2.4.2", help: "Add a descriptive <title> so people know which tab or page they're on." },
    "iframe-title": { severity: "serious", title: "Frames without a title", wcag: "4.1.2", help: "Add a title attribute describing what the iframe contains." },
    "zoom-disabled": { severity: "serious", title: "Zoom is disabled", wcag: "1.4.4", help: "Remove user-scalable=no and maximum-scale from the viewport meta tag. Many people need to zoom." },
    "tabindex": { severity: "serious", title: "Positive tabindex", wcag: "2.4.3", help: "tabindex values above 0 break the natural keyboard order. Use 0 or -1 instead." },
    "autoplay": { severity: "moderate", title: "Media that plays automatically", wcag: "1.4.2", help: "Don't autoplay sound. If you must, mute it and give people an obvious pause button." },
    "label-placeholder": { severity: "moderate", title: "Placeholder used as the only label", wcag: "3.3.2", help: "Placeholders disappear when people type and often have low contrast. Add a real label." },
    "heading-order": { severity: "moderate", title: "Skipped heading levels", wcag: "1.3.1", help: "Don't jump from h2 to h4. Screen reader users navigate by headings like a table of contents." },
    "page-has-h1": { severity: "moderate", title: "No main heading (h1)", wcag: "1.3.1", help: "Give the page one <h1> describing its main content." },
    "empty-heading": { severity: "moderate", title: "Empty headings", wcag: "1.3.1", help: "Headings should contain text. Remove empty ones or add content." },
    "landmark-main": { severity: "moderate", title: "No main landmark", wcag: "1.3.1", help: "Wrap the main content in <main> so keyboard and screen reader users can jump straight to it." },
    "target-size": { severity: "moderate", title: "Tiny click targets", wcag: "2.5.8", help: "Make buttons and controls at least 24×24 px so people with tremors or on touch screens can hit them." },
    "link-purpose": { severity: "minor", title: "Vague link text", wcag: "2.4.4", help: "\"Click here\" and \"Read more\" mean nothing out of context. Say where the link goes." },
    "duplicate-id": { severity: "minor", title: "Duplicate IDs", wcag: "4.1.1", help: "IDs must be unique, otherwise labels and ARIA references can point to the wrong element." },
  };

  const WEIGHT = { critical: 10, serious: 6, moderate: 3, minor: 1 };
  const MAX_ITEMS = 40;

  function runAudit(scope) {
    const doc = (scope && scope.ownerDocument) || document;
    const rootEl = scope || doc.documentElement;
    const isWholePage = rootEl === doc.documentElement;
    const found = {};
    const elements = [];

    function add(rule, el, note) {
      found[rule] = found[rule] || [];
      if (found[rule].length >= MAX_ITEMS) {
        found[rule].overflow = (found[rule].overflow || 0) + 1;
        return;
      }
      let index = null;
      if (el) {
        index = elements.length;
        elements.push(el);
      }
      found[rule].push({ index, element: el ? describe(el) : null, note: note || null });
    }

    const all = (sel) => [...rootEl.querySelectorAll(sel)].filter((el) => !el.closest(OWN_UI));

    // Page-level checks
    if (isWholePage) {
      if (!clean(doc.documentElement.getAttribute("lang"))) add("html-lang", null, "<html> has no lang attribute");
      if (!clean(doc.title)) add("document-title", null, "The <title> is missing or empty");
      const vp = doc.querySelector('meta[name="viewport"]');
      const content = vp ? vp.getAttribute("content") || "" : "";
      const max = content.match(/maximum-scale\s*=\s*([\d.]+)/i);
      if (/user-scalable\s*=\s*(no|0)/i.test(content) || (max && parseFloat(max[1]) < 2)) add("zoom-disabled", null, `viewport: "${content}"`);
      if (!doc.querySelector("main, [role='main']")) add("landmark-main", null, "No <main> element found");
    }

    for (const img of all("img")) {
      if (!isVisible(img)) continue;
      if (img.getAttribute("role") === "presentation" || img.getAttribute("role") === "none") continue;
      if (!img.hasAttribute("alt") && !img.getAttribute("aria-label") && !img.getAttribute("aria-labelledby")) add("image-alt", img);
    }
    for (const el of all("[role='img']")) if (isVisible(el) && !accessibleName(el)) add("image-alt", el);

    for (const btn of all("button, [role='button'], input[type='button'], input[type='submit'], input[type='reset'], input[type='image']")) {
      if (isVisible(btn) && !accessibleName(btn)) add("button-name", btn);
    }

    for (const a of all("a[href]")) {
      if (!isVisible(a)) continue;
      const name = accessibleName(a);
      if (!name) add("link-name", a);
      else if (/^(click here|here|read more|more|learn more|link|this)\.?$/i.test(name)) add("link-purpose", a, `Link text: "${name}"`);
    }

    for (const field of all("input, select, textarea")) {
      if (!isVisible(field)) continue;
      const type = (field.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "submit", "reset", "button", "image"].includes(type)) continue;
      if (accessibleName(field)) continue;
      if (clean(field.getAttribute("placeholder"))) add("label-placeholder", field, `Only a placeholder: "${clean(field.getAttribute("placeholder"))}"`);
      else add("label", field);
    }

    for (const frame of all("iframe")) if (isVisible(frame) && !accessibleName(frame)) add("iframe-title", frame);

    for (const el of all("[tabindex]")) if (parseInt(el.getAttribute("tabindex"), 10) > 0) add("tabindex", el, `tabindex="${el.getAttribute("tabindex")}"`);

    for (const media of all("video[autoplay], audio[autoplay]")) if (!media.muted && !media.hasAttribute("muted")) add("autoplay", media);

    // Headings
    const headings = all("h1, h2, h3, h4, h5, h6, [role='heading']").filter(isVisible);
    let prev = 0;
    for (const h of headings) {
      const level = h.getAttribute("aria-level") ? parseInt(h.getAttribute("aria-level"), 10) : parseInt(h.tagName.slice(1), 10) || 2;
      if (!accessibleName(h)) add("empty-heading", h);
      if (prev && level > prev + 1) add("heading-order", h, `h${prev} → h${level}`);
      prev = level;
    }
    if (isWholePage && !headings.some((h) => h.tagName === "H1" || h.getAttribute("aria-level") === "1")) add("page-has-h1", null, "No <h1> on the page");

    // Duplicate ids
    const seen = new Map();
    for (const el of all("[id]")) {
      const id = el.id;
      if (!id) continue;
      if (seen.has(id)) {
        if (seen.get(id) === 1) add("duplicate-id", el, `id="${id}" is used more than once`);
        seen.set(id, seen.get(id) + 1);
      } else seen.set(id, 1);
    }

    // Small targets (WCAG 2.5.8). Exempt: inline links inside sentences, and the
    // "spacing" exception: a 24px circle centred on the target touches no other target.
    const targets = all("button, [role='button'], input[type='checkbox'], input[type='radio'], a[href]")
      .filter(isVisible)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((t) => t.rect.width > 0 && t.rect.height > 0);
    const distanceToRect = (x, y, r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    for (const { el, rect } of targets) {
      if (rect.width >= 24 && rect.height >= 24) continue;
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && clean(el.parentElement?.textContent).length > clean(el.textContent).length + 10) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const crowded = targets.some((o) => o.el !== el && !o.el.contains(el) && !el.contains(o.el) && distanceToRect(cx, cy, o.rect) < 12);
      if (!crowded) continue;
      add("target-size", el, `${Math.round(rect.width)}×${Math.round(rect.height)} px, too close to another control`);
    }

    // Contrast: every visible element that directly contains text
    let checked = 0;
    for (const el of all("*")) {
      if (checked > 2500) break;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TITLE", "OPTION"].includes(el.tagName)) continue;
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!ownText || !isVisible(el)) continue;
      checked++;
      const style = getComputedStyle(el);
      const fg = C.parseColor(style.color);
      const bg = effectiveBackground(el);
      if (!fg || !bg) continue;
      const text = C.blend(fg, bg);
      const ratio = C.contrastRatio(text, bg);
      const large = C.isLargeText(parseFloat(style.fontSize), style.fontWeight);
      const need = C.requiredRatio(large);
      if (ratio < need) add("color-contrast", el, `${ratio.toFixed(2)}:1 (needs ${need}:1) · ${C.toHex(text)} on ${C.toHex(bg)}`);
    }

    const rules = Object.entries(found)
      .map(([rule, items]) => ({ rule, ...RULES[rule], count: items.length + (items.overflow || 0), items: items.slice() }))
      .sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity] || b.count - a.count);

    return { ...scoreFor(rules), rules, elements };
  }

  /** 100 minus a penalty per rule that grows slowly with the number of occurrences. */
  function scoreFor(rules) {
    const penalty = rules.reduce((sum, r) => sum + WEIGHT[r.severity] * (1 + Math.log2(r.count)), 0);
    const score = Math.max(0, Math.round(100 - penalty));
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const r of rules) counts[r.severity] += r.count;
    const label = score >= 90 ? "Great" : score >= 75 ? "Good" : score >= 50 ? "Needs work" : "Poor";
    return { score, label, counts };
  }

  root.__xrayAudit = { accessibleName, isVisible, runAudit, scoreFor, RULES };
})(window);
