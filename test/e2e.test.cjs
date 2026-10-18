// End-to-end tests in a real Chromium: the audit, simulations and screen
// reader view on fixture pages. Run with: npm run test:e2e
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const SCRIPTS = ["color.js", "audit.js", "simulate.js", "reader.js", "xray.js"].map((f) => path.join(ROOT, "extension/content", f));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const f = path.join(ROOT, "test/fixtures", u.pathname);
    if (u.hostname === "fixtures.test" && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ body: fs.readFileSync(f), contentType: "text/html" });
    if (u.hostname === "fixtures.test") return route.fulfill({ body: PNG, contentType: "image/png" });
    return route.abort();
  });
});
after(() => browser?.close());

async function open(name) {
  await page.goto(`http://fixtures.test/${name}`);
  for (const s of SCRIPTS) await page.addScriptTag({ path: s });
}

test("audit finds every rule on the bad page", async () => {
  await open("bad.html");
  const r = await page.evaluate(() => window.__a11yXray.audit());
  const found = new Set(r.rules.map((x) => x.rule));
  for (const rule of ["image-alt", "button-name", "label", "link-name", "color-contrast", "html-lang", "document-title", "iframe-title", "zoom-disabled", "tabindex", "label-placeholder", "heading-order", "page-has-h1", "empty-heading", "landmark-main", "target-size", "link-purpose", "duplicate-id"]) {
    assert.ok(found.has(rule), `expected ${rule}`);
  }
  assert.equal(r.label, "Poor");
  assert.ok(r.rules.every((x) => x.items.every((i) => i.index === null || Number.isInteger(i.n))), "on-page issues are numbered");
});

test("audit gives the good page a perfect score", async () => {
  await open("good.html");
  const r = await page.evaluate(() => window.__a11yXray.audit());
  assert.deepEqual(r.rules.map((x) => x.rule), []);
  assert.equal(r.score, 100);
});

test("accessible names follow labels, aria and alt text", async () => {
  await open("good.html");
  const names = await page.evaluate(() => {
    const n = (sel) => window.__xrayAudit.accessibleName(document.querySelector(sel));
    return [n("#email"), n("label input"), n("button[aria-label]"), n("header img"), n("main button:last-of-type")];
  });
  assert.deepEqual(names, ["Email", "Destination", "Close dialog", "Acme Travel", "Search"]);
});

test("reading order matches what a screen reader announces", async () => {
  await open("good.html");
  const order = await page.evaluate(() => window.__xrayReader.readingOrder(document.documentElement).map(window.__xrayReader.spoken));
  assert.deepEqual(order.slice(0, 7), ["banner landmark", "Acme Travel, image", "navigation landmark", "Home, link", "Today's deals, link", "main landmark", "Book a trip, heading level 1"]);
  assert.ok(!order.some((x) => x.includes("divider")), "decorative images are skipped");
});

test("simulations apply and reset cleanly", async () => {
  await open("bad.html");
  const veil = () => page.evaluate(() => [...document.querySelectorAll("[data-xray-ui]")].map((n) => n.style.backdropFilter).find(Boolean) || "");
  await page.evaluate(() => window.__a11yXray.apply({ vision: "protanopia", blur: 2, contrast: 30, tunnel: true, tremor: 2, dyslexia: true, screenReader: true }));
  assert.match(await veil(), /url\("#xray-protanopia"\) blur\(2px\) contrast/);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-xray-ui]")].some((n) => n.shadowRoot)), true, "reader panel open");
  const state = await page.evaluate(() => window.__a11yXray.reset());
  assert.equal(state.vision, "none");
  assert.equal(await veil(), "");
  assert.equal(await page.evaluate(() => document.querySelector("p.faint").textContent), "This grey text is hard to read.", "dyslexia text restored");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-xray-ui]")].some((n) => n.shadowRoot)), false, "reader panel closed");
});

test("injecting twice reuses the same instance", async () => {
  await open("bad.html");
  await page.evaluate(() => (window.__a11yXray.marker = 1));
  for (const s of SCRIPTS) await page.addScriptTag({ path: s });
  assert.equal(await page.evaluate(() => window.__a11yXray.marker), 1);
});
