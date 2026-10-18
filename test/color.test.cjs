const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../extension/content/color.js");

test("parseColor handles rgb, rgba, hex and transparent", () => {
  assert.deepEqual(C.parseColor("rgb(255, 0, 10)"), { r: 255, g: 0, b: 10, a: 1 });
  assert.deepEqual(C.parseColor("rgba(0, 0, 0, 0.5)"), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(C.parseColor("rgb(10 20 30 / 50%)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(C.parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(C.parseColor("#11223380"), { r: 17, g: 34, b: 51, a: 128 / 255 });
  assert.deepEqual(C.parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(C.parseColor("hotpink"), null);
  assert.equal(C.parseColor(""), null);
});

test("contrast ratio matches WCAG reference values", () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  assert.equal(C.contrastRatio(white, black).toFixed(1), "21.0");
  assert.equal(C.contrastRatio(white, white).toFixed(1), "1.0");
  // #767676 on white is the classic "just passes AA" gray (4.54:1).
  assert.equal(C.contrastRatio(C.parseColor("#767676"), white).toFixed(2), "4.54");
  assert.ok(C.contrastRatio(C.parseColor("#777777"), white) < 4.5);
});

test("blend composites transparent text over its background", () => {
  const out = C.blend({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 });
  assert.deepEqual([out.r, out.g, out.b].map(Math.round), [128, 128, 128]);
});

test("large text thresholds and required ratios", () => {
  assert.equal(C.isLargeText(24, 400), true);
  assert.equal(C.isLargeText(19, 700), true);
  assert.equal(C.isLargeText(19, 400), false);
  assert.equal(C.isLargeText(16, "bold"), false);
  assert.equal(C.requiredRatio(true), 3);
  assert.equal(C.requiredRatio(false), 4.5);
});

test("color-blind simulation makes red and green hard to tell apart", () => {
  const red = { r: 220, g: 40, b: 40 };
  const green = { r: 40, g: 160, b: 40 };
  const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  for (const type of ["protanopia", "deuteranopia"]) {
    const before = distance(red, green);
    const after = distance(C.simulate(red, type), C.simulate(green, type));
    assert.ok(after < before * 0.6, `${type}: red/green distance shrinks (${before.toFixed(0)} -> ${after.toFixed(0)})`);
  }
  const gray = C.simulate({ r: 200, g: 30, b: 90 }, "achromatopsia");
  assert.ok(Math.abs(gray.r - gray.g) <= 1 && Math.abs(gray.g - gray.b) <= 1, "achromatopsia is grayscale");
  assert.deepEqual(C.simulate({ r: 255, g: 255, b: 255 }, "deuteranopia"), { r: 255, g: 255, b: 255, a: 1 }, "white stays white");
});

test("svgMatrix produces 20 numbers for each vision type", () => {
  for (const type of Object.keys(C.CVD)) assert.equal(C.svgMatrix(type).split(" ").length, 20);
  assert.equal(C.svgMatrix("nope"), null);
});
