// Visual and motor simulations. Classic script; exposes window.__xraySimulate.createSimulator(root).
// Every effect is reversible: clear() puts the page back exactly as it was.

(function (root) {
  "use strict";
  const C = root.__xrayColor;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const DEFAULTS = { vision: "none", blur: 0, contrast: 0, tunnel: false, tremor: 0, dyslexia: false };
  const TREMOR_PX = [0, 7, 15, 28];

  function ensureFilters(doc) {
    if (doc.getElementById("xray-filters")) return;
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.id = "xray-filters";
    svg.setAttribute("data-xray-ui", "");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    for (const name of Object.keys(C.CVD)) {
      const filter = doc.createElementNS(SVG_NS, "filter");
      filter.id = `xray-${name}`;
      filter.setAttribute("color-interpolation-filters", "linearRGB");
      const m = doc.createElementNS(SVG_NS, "feColorMatrix");
      m.setAttribute("type", "matrix");
      m.setAttribute("values", C.svgMatrix(name));
      filter.appendChild(m);
      svg.appendChild(filter);
    }
    (doc.body || doc.documentElement).appendChild(svg);
  }

  function createSimulator(target) {
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const whole = target === doc.documentElement;
    const host = whole ? doc.documentElement : target;
    let settings = { ...DEFAULTS };
    const original = { filter: target.style.filter, position: host.style.position };

    // ---- Filters: color vision, blur, contrast loss -------------------------
    function applyFilters() {
      const parts = [];
      if (settings.vision !== "none" && C.CVD[settings.vision]) {
        ensureFilters(doc);
        parts.push(`url(#xray-${settings.vision})`);
      }
      if (settings.blur > 0) parts.push(`blur(${settings.blur}px)`);
      if (settings.contrast > 0) {
        const keep = 1 - settings.contrast / 100;
        parts.push(`contrast(${keep.toFixed(2)})`, `brightness(${(1 + (1 - keep) * 0.35).toFixed(2)})`);
      }
      if (!whole) {
        target.style.filter = parts.length ? parts.join(" ") : original.filter;
        return;
      }
      // Whole page: filter everything *behind* a transparent full-screen veil, so
      // the extension's own UI (reader panel, highlights) stays sharp on top.
      if (parts.length) {
        if (!veil) {
          veil = doc.createElement("div");
          veil.setAttribute("data-xray-ui", "");
          veil.setAttribute("aria-hidden", "true");
          veil.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483640";
          doc.documentElement.appendChild(veil);
        }
        veil.style.backdropFilter = parts.join(" ");
        veil.style.webkitBackdropFilter = parts.join(" ");
      } else if (veil) {
        veil.remove();
        veil = null;
      }
    }
    let veil = null;

    // ---- Overlay layer (tunnel vision, tremor cursor) ------------------------
    let layer = null;
    function getLayer() {
      if (layer) return layer;
      layer = doc.createElement("div");
      layer.setAttribute("data-xray-ui", "");
      layer.setAttribute("aria-hidden", "true");
      layer.style.cssText = `${whole ? "position:fixed" : "position:absolute"};inset:0;pointer-events:none;z-index:2147483646;overflow:hidden`;
      if (!whole && getComputedStyle(host).position === "static") host.style.position = "relative";
      (whole ? doc.documentElement : host).appendChild(layer);
      return layer;
    }

    const pointer = { x: -999, y: -999, inside: false };
    function localPoint(e) {
      if (whole) return { x: e.clientX, y: e.clientY };
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onMove(e) {
      const p = localPoint(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      if (tunnel) tunnel.style.setProperty("--x", `${p.x}px`), tunnel.style.setProperty("--y", `${p.y}px`);
    }
    function onLeave() {
      pointer.inside = false;
    }

    // ---- Tunnel vision -------------------------------------------------------
    let tunnel = null;
    function applyTunnel() {
      if (settings.tunnel && !tunnel) {
        tunnel = doc.createElement("div");
        tunnel.style.cssText =
          "position:absolute;inset:0;--x:50%;--y:40%;background:radial-gradient(circle at var(--x) var(--y), transparent 0, transparent 90px, rgba(8,8,12,.9) 170px, rgba(8,8,12,.97) 260px)";
        getLayer().appendChild(tunnel);
        if (pointer.inside) tunnel.style.setProperty("--x", `${pointer.x}px`), tunnel.style.setProperty("--y", `${pointer.y}px`);
      } else if (!settings.tunnel && tunnel) {
        tunnel.remove();
        tunnel = null;
      }
    }

    // ---- Tremor: a shaky fake cursor, and clicks land where it shakes to -----
    let cursor = null;
    let cursorStyle = null;
    let raf = 0;
    const shake = { x: 0, y: 0, tx: 0, ty: 0 };
    function tremorFrame() {
      const amp = TREMOR_PX[settings.tremor] || 0;
      if (Math.random() < 0.18) {
        shake.tx = (Math.random() * 2 - 1) * amp;
        shake.ty = (Math.random() * 2 - 1) * amp;
      }
      shake.x += (shake.tx - shake.x) * 0.35;
      shake.y += (shake.ty - shake.y) * 0.35;
      if (cursor) {
        cursor.style.transform = `translate(${pointer.x + shake.x}px, ${pointer.y + shake.y}px)`;
        cursor.style.opacity = pointer.inside ? "1" : "0";
      }
      raf = win.requestAnimationFrame(tremorFrame);
    }
    function onClickCapture(e) {
      if (!settings.tremor || !e.isTrusted || e.button !== 0) return;
      if (!whole && !host.contains(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const x = e.clientX + shake.x;
      const y = e.clientY + shake.y;
      cursor && (cursor.style.display = "none");
      const hit = doc.elementFromPoint(x, y);
      cursor && (cursor.style.display = "");
      if (hit && !hit.closest("[data-xray-ui]") && (whole || host.contains(hit))) {
        hit.focus?.({ preventScroll: true });
        hit.click();
      }
    }
    function applyTremor() {
      if (settings.tremor && !cursor) {
        cursor = doc.createElement("div");
        cursor.innerHTML =
          '<svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.6 15 L17.5 15 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        cursor.style.cssText = "position:absolute;left:-2px;top:-2px;will-change:transform;opacity:0";
        getLayer().appendChild(cursor);
        cursorStyle = doc.createElement("style");
        cursorStyle.setAttribute("data-xray-ui", "");
        cursorStyle.textContent = `${whole ? "html, html *" : `[data-xray-host="${hostId}"], [data-xray-host="${hostId}"] *`} { cursor: none !important; }`;
        doc.head.appendChild(cursorStyle);
        doc.addEventListener("click", onClickCapture, true);
        raf = win.requestAnimationFrame(tremorFrame);
      } else if (!settings.tremor && cursor) {
        cursor.remove();
        cursor = null;
        cursorStyle.remove();
        cursorStyle = null;
        doc.removeEventListener("click", onClickCapture, true);
        win.cancelAnimationFrame(raf);
      }
    }
    const hostId = Math.random().toString(36).slice(2, 8);
    if (!whole) host.setAttribute("data-xray-host", hostId);

    // ---- Dyslexia: letters inside words keep shuffling -----------------------
    let dyslexia = null;
    function textNodes() {
      const out = [];
      const walker = doc.createTreeWalker(target === doc.documentElement ? doc.body : target, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || !n.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (p.closest("script, style, noscript, textarea, input, select, code, pre, [data-xray-ui], [contenteditable='true']")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode() && out.length < 3000) out.push(walker.currentNode);
      return out;
    }
    function scramble(text) {
      return text.replace(/[A-Za-z]{4,}/g, (word) => {
        if (Math.random() < 0.55) return word;
        const mid = word.slice(1, -1).split("");
        const i = Math.floor(Math.random() * (mid.length - 1));
        [mid[i], mid[i + 1]] = [mid[i + 1], mid[i]];
        return word[0] + mid.join("") + word[word.length - 1];
      });
    }
    function applyDyslexia() {
      if (settings.dyslexia && !dyslexia) {
        const nodes = textNodes();
        dyslexia = { nodes, originals: new Map(nodes.map((n) => [n, n.textContent])) };
        dyslexia.timer = win.setInterval(() => {
          for (const n of dyslexia.nodes) {
            if (!n.isConnected) continue;
            const orig = dyslexia.originals.get(n);
            n.textContent = Math.random() < 0.5 ? scramble(orig) : orig;
          }
        }, 650);
      } else if (!settings.dyslexia && dyslexia) {
        win.clearInterval(dyslexia.timer);
        for (const [n, text] of dyslexia.originals) if (n.isConnected) n.textContent = text;
        dyslexia = null;
      }
    }

    // ---- Public API -----------------------------------------------------------
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    if (whole) doc.addEventListener("pointermove", onMove, { passive: true });

    function apply(next) {
      settings = { ...DEFAULTS, ...next };
      settings.blur = Math.max(0, Math.min(10, Number(settings.blur) || 0));
      settings.contrast = Math.max(0, Math.min(90, Number(settings.contrast) || 0));
      settings.tremor = Math.max(0, Math.min(3, Number(settings.tremor) || 0));
      applyFilters();
      applyTunnel();
      applyTremor();
      applyDyslexia();
      if (layer && !layer.childElementCount) {
        layer.remove();
        layer = null;
      }
      return { ...settings };
    }

    function clear() {
      apply(DEFAULTS);
      target.style.filter = original.filter;
      if (!whole) host.style.position = original.position;
    }

    function destroy() {
      clear();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (whole) doc.removeEventListener("pointermove", onMove);
      if (!whole) host.removeAttribute("data-xray-host");
    }

    const isActive = () => JSON.stringify(settings) !== JSON.stringify(DEFAULTS);

    return { apply, clear, destroy, isActive, get settings() { return { ...settings }; } };
  }

  root.__xraySimulate = { createSimulator, ensureFilters, DEFAULTS };
})(window);
