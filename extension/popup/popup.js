// Popup UI. Talks to the page through chrome.scripting: it injects the content
// scripts once, then calls window.__a11yXray in the page.

const FILES = ["content/color.js", "content/audit.js", "content/simulate.js", "content/reader.js", "content/xray.js"];
const $ = (sel) => document.querySelector(sel);

const SEVERITY = {
  critical: { label: "Critical", color: "var(--critical)" },
  serious: { label: "Serious", color: "var(--serious)" },
  moderate: { label: "Moderate", color: "var(--moderate)" },
  minor: { label: "Minor", color: "var(--minor)" },
};

const WCAG_SLUG = {
  "1.1.1": "non-text-content",
  "1.3.1": "info-and-relationships",
  "1.4.2": "audio-control",
  "1.4.3": "contrast-minimum",
  "1.4.4": "resize-text",
  "2.4.2": "page-titled",
  "2.4.3": "focus-order",
  "2.4.4": "link-purpose-in-context",
  "2.5.8": "target-size-minimum",
  "3.1.1": "language-of-page",
  "3.3.2": "labels-or-instructions",
  "4.1.2": "name-role-value",
};
const wcagUrl = (sc) =>
  WCAG_SLUG[sc] ? `https://www.w3.org/WAI/WCAG22/Understanding/${WCAG_SLUG[sc]}.html` : "https://www.w3.org/WAI/WCAG21/Understanding/parsing.html";

const VISION_FACTS = {
  none: "About 1 in 12 men and 1 in 200 women have some form of color blindness.",
  protanopia: "Protanopia: reds look dark and muddy. Red-only error messages can disappear.",
  deuteranopia: "Deuteranopia, the most common type: red and green look alike. Avoid red/green-only status colors.",
  tritanopia: "Tritanopia (rare): blue and yellow get confused, blues look greenish.",
  achromatopsia: "No color at all. Anything that relies on color alone is lost.",
};

let tabId = null;
let pageUrl = "";
let blocked = false;

// ---------------------------------------------------------------------------
// Talking to the page
// ---------------------------------------------------------------------------

async function inject() {
  await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
}

async function call(func, ...args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res?.result;
}

const pageApply = (s) => window.__a11yXray.apply(s);
const pageState = () => window.__a11yXray.getState();
const pageReset = () => window.__a11yXray.reset();
const pageAudit = () => window.__a11yXray.audit();
const pageHighlight = (i) => window.__a11yXray.highlight(i);
const pageShowAll = (on) => window.__a11yXray.showAll(on);
const pageHasAudit = () => Boolean(window.__a11yXray?.hasAudit());

// ---------------------------------------------------------------------------
// Simulate tab
// ---------------------------------------------------------------------------

function readForm() {
  return {
    vision: document.querySelector('input[name="vision"]:checked').value,
    blur: Number($("#blur").value),
    contrast: Number($("#contrast").value),
    tunnel: $("#tunnel").checked,
    tremor: Number(document.querySelector('input[name="tremor"]:checked').value),
    dyslexia: $("#dyslexia").checked,
    screenReader: $("#screenReader").checked,
  };
}

function writeForm(s) {
  document.querySelector(`input[name="vision"][value="${s.vision || "none"}"]`).checked = true;
  $("#blur").value = s.blur || 0;
  $("#contrast").value = s.contrast || 0;
  $("#tunnel").checked = Boolean(s.tunnel);
  document.querySelector(`input[name="tremor"][value="${s.tremor || 0}"]`).checked = true;
  $("#dyslexia").checked = Boolean(s.dyslexia);
  $("#screenReader").checked = Boolean(s.screenReader);
  updateLabels();
}

function updateLabels() {
  const blur = Number($("#blur").value);
  const contrast = Number($("#contrast").value);
  $("#blur-out").textContent = blur === 0 ? "Off" : blur <= 2 ? "Mild" : blur <= 5 ? "Moderate" : "Severe";
  $("#contrast-out").textContent = contrast === 0 ? "Off" : `${contrast}%`;
  $("#vision-fact").textContent = VISION_FACTS[document.querySelector('input[name="vision"]:checked').value];
}

async function pushSettings() {
  updateLabels();
  if (blocked) return;
  try {
    await call(pageApply, readForm());
  } catch (e) {
    toast("Couldn't update this page. Try reloading it.");
  }
}

// ---------------------------------------------------------------------------
// Audit tab
// ---------------------------------------------------------------------------

const auditKey = () => `audit:${tabId}`;

async function scan() {
  if (blocked) return;
  $("#audit-empty").classList.add("scanning");
  $("#scan").disabled = true;
  $("#scan").textContent = "Scanning…";
  try {
    const started = performance.now();
    const result = await call(pageAudit);
    // A short beat so the scan feels like something happened.
    await new Promise((r) => setTimeout(r, Math.max(0, 500 - (performance.now() - started))));
    await chrome.storage.session.set({ [auditKey()]: result });
    renderAudit(result);
  } catch (e) {
    toast("Scan failed on this page.");
  } finally {
    $("#audit-empty").classList.remove("scanning");
    $("#scan").disabled = false;
    $("#scan").textContent = "Scan this page";
  }
}

function renderAudit(r) {
  $("#audit-empty").hidden = true;
  $("#audit-results").hidden = false;
  $("#show-all").checked = false;

  const ring = $("#ring");
  ring.style.setProperty("--ring-color", r.score >= 90 ? "var(--ok)" : r.score >= 75 ? "var(--brand)" : r.score >= 50 ? "var(--moderate)" : "var(--critical)");
  requestAnimationFrame(() => ring.style.setProperty("--p", r.score));
  countUp($("#score"), r.score);
  $("#score-label").textContent = r.label;
  const total = r.rules.reduce((n, rule) => n + rule.count, 0);
  $("#score-sub").textContent = total ? `${total} issue${total === 1 ? "" : "s"} in ${r.rules.length} categor${r.rules.length === 1 ? "y" : "ies"}` : "No issues found. Nice work!";
  // Fixed order: chrome.storage can return object keys sorted alphabetically.
  $("#sev-row").innerHTML = ["critical", "serious", "moderate", "minor"]
    .map((sev) => [sev, r.counts[sev] || 0])
    .filter(([, n]) => n)
    .map(([sev, n]) => `<span class="sev" style="--c:${SEVERITY[sev].color}">${n} ${SEVERITY[sev].label.toLowerCase()}</span>`)
    .join("");

  const list = $("#rules");
  list.replaceChildren();
  r.rules.forEach((rule, i) => {
    const li = document.createElement("li");
    li.className = "rule";
    li.style.animationDelay = `${i * 40}ms`;
    li.style.setProperty("--c", SEVERITY[rule.severity].color);
    const details = document.createElement("details");
    details.innerHTML = `
      <summary><span class="dot"></span><span class="rule-title"></span><span class="count"></span></summary>
      <div class="rule-body">
        <p class="help"></p>
        <a class="wcag" target="_blank" rel="noopener"></a>
        <ul class="items"></ul>
      </div>`;
    details.querySelector(".rule-title").textContent = rule.title;
    details.querySelector(".count").textContent = rule.count;
    details.querySelector(".help").textContent = rule.help;
    const link = details.querySelector(".wcag");
    link.href = wcagUrl(rule.wcag);
    link.textContent = `${SEVERITY[rule.severity].label} · WCAG ${rule.wcag} ↗`;
    const items = details.querySelector(".items");
    for (const item of rule.items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item";
      btn.innerHTML = `<span class="num"></span><span><code></code><small></small></span>`;
      btn.querySelector(".num").textContent = item.n ? `#${item.n}` : "page";
      btn.querySelector("code").textContent = item.element || "Whole page";
      btn.querySelector("small").textContent = item.note || (item.index !== null ? "Click to show it on the page" : "");
      if (item.index === null) btn.disabled = true;
      else btn.addEventListener("click", () => highlight(item.index));
      const wrap = document.createElement("li");
      wrap.appendChild(btn);
      items.appendChild(wrap);
    }
    if (rule.count > rule.items.length) {
      const more = document.createElement("li");
      more.className = "more";
      more.textContent = `+ ${rule.count - rule.items.length} more`;
      items.appendChild(more);
    }
    li.appendChild(details);
    list.appendChild(li);
  });
  if (list.firstChild) list.firstChild.querySelector("details").open = true;
  lastResult = r;
}
let lastResult = null;

async function highlight(index) {
  const ok = await call(pageHighlight, index).catch(() => false);
  if (!ok) toast("The page changed. Rescan to update.");
}

function reportText(r) {
  const lines = [`# Accessibility report: ${r.title || r.url}`, "", `URL: ${r.url}`, `Score: ${r.score}/100 (${r.label})`, `Scanned: ${new Date(r.scannedAt).toLocaleString()}`, ""];
  for (const rule of r.rules) {
    lines.push(`## ${rule.title} (${rule.count}) · ${SEVERITY[rule.severity].label} · WCAG ${rule.wcag}`);
    lines.push(rule.help);
    for (const item of rule.items) lines.push(`- ${item.element || "Whole page"}${item.note ? ` (${item.note})` : ""}`);
    lines.push("");
  }
  lines.push("Generated with A11y X-Ray");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Little helpers
// ---------------------------------------------------------------------------

function countUp(el, to) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (el.textContent = to);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 900);
    el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

function selectTab(name) {
  $("#tab-simulate").setAttribute("aria-selected", String(name === "simulate"));
  $("#tab-audit").setAttribute("aria-selected", String(name === "audit"));
  $(".tabs").dataset.active = name;
  $("#panel-simulate").hidden = name !== "simulate";
  $("#panel-audit").hidden = name !== "audit";
  chrome.storage.local.set({ lastTab: name }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

$("#tab-simulate").addEventListener("click", () => selectTab("simulate"));
$("#tab-audit").addEventListener("click", () => selectTab("audit"));
$(".tabs").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const next = $("#tab-simulate").getAttribute("aria-selected") === "true" ? "audit" : "simulate";
    selectTab(next);
    $(`#tab-${next}`).focus();
  }
});

for (const el of document.querySelectorAll("#panel-simulate input")) {
  el.addEventListener(el.type === "range" ? "input" : "change", pushSettings);
}

$("#reset").addEventListener("click", async () => {
  if (blocked) return;
  const s = await call(pageReset).catch(() => null);
  writeForm(s || {});
  $("#show-all").checked = false;
  toast("All simulations off");
});

$("#scan").addEventListener("click", scan);
$("#rescan").addEventListener("click", scan);
$("#show-all").addEventListener("change", async (e) => {
  const n = await call(pageShowAll, e.target.checked).catch(() => 0);
  if (e.target.checked && !n) {
    e.target.checked = false;
    toast("Nothing to show. Rescan the page first.");
  }
});
$("#copy").addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(reportText(lastResult));
    toast("Report copied as Markdown");
  } catch {
    toast("Couldn't copy the report");
  }
});

async function init() {
  // Normally the active tab; ?tab=<id> lets automated tests drive a specific tab.
  const forced = Number(new URLSearchParams(location.search).get("tab"));
  const tab = forced ? await chrome.tabs.get(forced) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  tabId = tab?.id;
  pageUrl = tab?.url || "";
  try {
    $("#host").textContent = new URL(pageUrl).hostname || "this page";
  } catch {}

  const { lastTab } = await chrome.storage.local.get("lastTab").catch(() => ({}));
  selectTab(lastTab === "audit" ? "audit" : "simulate");

  try {
    await inject();
    writeForm((await call(pageState)) || {});
    const cached = (await chrome.storage.session.get(auditKey()))[auditKey()];
    if (cached && cached.url === pageUrl && (await call(pageHasAudit))) renderAudit(cached);
  } catch (e) {
    blocked = true;
    $("#blocked").hidden = false;
    document.querySelectorAll(".panel input, .panel button, #reset").forEach((el) => (el.disabled = true));
  }
}

init();
