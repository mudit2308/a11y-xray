// Entry point injected into the page. Ties simulations, the screen reader view
// and the audit together behind one small API: window.__a11yXray.
// Safe to inject more than once; later injections reuse the existing instance.

(function (root) {
  "use strict";
  if (root.__a11yXray) return;

  const doc = root.document;
  const SEVERITY_COLOR = { critical: "#e5484d", serious: "#f76b15", moderate: "#d5a10b", minor: "#7c8cff" };

  const simulator = root.__xraySimulate.createSimulator(doc.documentElement);
  let reader = null;
  let state = { ...root.__xraySimulate.DEFAULTS, screenReader: false };
  let lastAudit = null;

  // ---- Simulations ------------------------------------------------------------
  function apply(next) {
    state = { ...state, ...next };
    simulator.apply(state);
    if (state.screenReader && !reader) {
      reader = root.__xrayReader.createReaderPanel(doc.documentElement, () => {
        reader = null;
        state.screenReader = false;
      });
    } else if (!state.screenReader && reader) {
      reader.destroy();
      reader = null;
    }
    return getState();
  }

  const getState = () => ({ ...state, screenReader: Boolean(reader) });

  function reset() {
    clearHighlights();
    return apply({ ...root.__xraySimulate.DEFAULTS, screenReader: false });
  }

  // ---- Audit and highlights ----------------------------------------------------
  let layer = null;
  function getLayer() {
    if (!layer || !layer.isConnected) {
      layer = doc.createElement("div");
      layer.setAttribute("data-xray-ui", "");
      layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483645;pointer-events:none";
      doc.documentElement.appendChild(layer);
    }
    return layer;
  }

  function box(el, label, color, pulse, compact) {
    const r = el.getBoundingClientRect();
    const b = doc.createElement("div");
    b.style.cssText = `position:absolute;left:${r.left + root.scrollX - 3}px;top:${r.top + root.scrollY - 3}px;width:${Math.max(r.width, 8) + 6}px;height:${Math.max(r.height, 8) + 6}px;
      border:2.5px solid ${color};border-radius:6px;background:${color}1a;box-sizing:border-box;${pulse ? "animation:xray-pulse 1.2s ease-out 2;" : ""}`;
    const tag = doc.createElement("span");
    tag.textContent = label;
    tag.style.cssText = compact
      ? `position:absolute;left:-10px;top:-10px;min-width:18px;height:18px;display:grid;place-items:center;background:${color};color:#fff;font:700 10.5px/1 system-ui,sans-serif;padding:0 4px;border-radius:9px;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)`
      : `position:absolute;left:-2.5px;bottom:100%;margin-bottom:3px;background:${color};color:#fff;font:600 11px/1.3 system-ui,sans-serif;padding:2px 6px;border-radius:5px;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis`;
    b.appendChild(tag);
    getLayer().appendChild(b);
    return b;
  }

  function ensureKeyframes() {
    if (doc.getElementById("xray-keyframes")) return;
    const s = doc.createElement("style");
    s.id = "xray-keyframes";
    s.setAttribute("data-xray-ui", "");
    s.textContent = "@keyframes xray-pulse{0%{box-shadow:0 0 0 0 rgba(91,108,255,.55)}100%{box-shadow:0 0 0 14px rgba(91,108,255,0)}}";
    doc.head.appendChild(s);
  }

  function clearHighlights() {
    if (layer) layer.replaceChildren();
  }

  function audit() {
    clearHighlights();
    const result = root.__xrayAudit.runAudit(doc.documentElement);
    // Number every on-page issue so the popup list and the page badges match.
    let n = 0;
    for (const rule of result.rules) for (const item of rule.items) if (item.index !== null) item.n = ++n;
    lastAudit = result;
    // Elements can't leave the page; the popup refers to them by index.
    const { elements, ...serializable } = result;
    return { ...serializable, url: root.location.href, title: doc.title, scannedAt: new Date().toISOString() };
  }

  function ruleOf(index) {
    return lastAudit?.rules.find((r) => r.items.some((i) => i.index === index));
  }

  function highlight(index) {
    const el = lastAudit?.elements[index];
    if (!el || !el.isConnected) return false;
    ensureKeyframes();
    clearHighlights();
    const rule = ruleOf(index);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const item = rule?.items.find((i) => i.index === index);
    setTimeout(() => box(el, `${item?.n ? `#${item.n} · ` : ""}${rule ? rule.title : "Issue"}`, SEVERITY_COLOR[rule?.severity] || "#5b6cff", true), 350);
    return true;
  }

  function showAll(on) {
    clearHighlights();
    if (!on || !lastAudit) return 0;
    let n = 0;
    for (const rule of lastAudit.rules) {
      for (const item of rule.items) {
        const el = lastAudit.elements[item.index];
        if (item.index === null || !el || !el.isConnected) continue;
        box(el, String(item.n), SEVERITY_COLOR[rule.severity], false, true);
        n++;
      }
    }
    return n;
  }

  root.addEventListener("resize", () => clearHighlights());

  root.__a11yXray = { version: "1.0.0", apply, getState, reset, audit, highlight, showAll, clearHighlights, hasAudit: () => Boolean(lastAudit) };
})(window);
