// Color math for A11y X-Ray: parsing CSS colors, WCAG contrast, and the
// color-vision-deficiency matrices used by the simulations.
// Works as a classic browser script (window.__xrayColor) and in Node (module.exports).

(function (root) {
  "use strict";

  /** Parse "rgb()", "rgba()", "#rgb", "#rrggbb", "#rrggbbaa" or "transparent". Returns null if unknown. */
  function parseColor(input) {
    if (!input) return null;
    const s = String(input).trim().toLowerCase();
    if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) {
      let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return { r: +m[1], g: +m[2], b: +m[3], a };
    }
    m = s.match(/^#([0-9a-f]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    return null;
  }

  /** Composite a (possibly transparent) color over an opaque background. */
  function blend(fg, bg) {
    const a = fg.a === undefined ? 1 : fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }

  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  /** WCAG 2.x relative luminance. */
  function luminance({ r, g, b }) {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  /** WCAG contrast ratio between two opaque colors, from 1 to 21. */
  function contrastRatio(a, b) {
    const l1 = luminance(a);
    const l2 = luminance(b);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  }

  /** WCAG "large text": at least 24px, or at least 18.66px (14pt) and bold. */
  function isLargeText(fontSizePx, fontWeight) {
    const weight = Number(fontWeight) || (String(fontWeight) === "bold" ? 700 : 400);
    return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700);
  }

  /** Minimum contrast for WCAG AA. */
  const requiredRatio = (large) => (large ? 3 : 4.5);

  const toHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // Color vision deficiency matrices (Machado, Oliveira & Fernandes, 2009, severity 1.0).
  // They apply in linear RGB, which is what SVG feColorMatrix uses by default.
  const CVD = {
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
    achromatopsia: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
  };

  /** The 3x3 matrix as an SVG feColorMatrix "values" string (4x5). */
  function svgMatrix(name) {
    const m = CVD[name];
    if (!m) return null;
    return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0].join(" ");
  }

  /** Simulate a color for a vision type (in linear RGB, like the SVG filter). */
  function simulate(color, name) {
    const m = CVD[name];
    if (!m) return color;
    const lin = [color.r, color.g, color.b].map(channel);
    const out = [0, 1, 2].map((row) => m[row * 3] * lin[0] + m[row * 3 + 1] * lin[1] + m[row * 3 + 2] * lin[2]);
    const enc = (c) => {
      const v = Math.min(1, Math.max(0, c));
      return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    };
    return { r: Math.round(enc(out[0])), g: Math.round(enc(out[1])), b: Math.round(enc(out[2])), a: color.a ?? 1 };
  }

  const api = { parseColor, blend, luminance, contrastRatio, isLargeText, requiredRatio, toHex, CVD, svgMatrix, simulate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__xrayColor = api;
})(typeof window !== "undefined" ? window : globalThis);
