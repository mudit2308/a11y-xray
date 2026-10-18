// Landing page: before/after slider, the live demo (reusing the extension's own
// content scripts on a sample page) and scroll reveals.

(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.__xraySimulate.ensureFilters(document);

  // Sticky nav gets a border once you scroll
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- Before / after comparison ----------------------------------------------
  const stageCmp = $(".compare-stage");
  const range = $("#compare-range");
  const setPos = (v) => stageCmp.style.setProperty("--pos", `${v}%`);
  range.addEventListener("input", () => setPos(range.value));
  let dragging = false;
  const fromPointer = (e) => {
    const r = stageCmp.getBoundingClientRect();
    const v = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    range.value = v;
    setPos(v);
  };
  stageCmp.addEventListener("pointerdown", (e) => {
    dragging = true;
    stageCmp.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  stageCmp.addEventListener("pointermove", (e) => dragging && fromPointer(e));
  stageCmp.addEventListener("pointerup", () => (dragging = false));
  // A gentle hint animation so people notice the slider
  if (!reduced()) {
    let t = 0;
    const hint = setInterval(() => {
      t += 0.05;
      const v = 50 + Math.sin(t * Math.PI) * 18;
      setPos(v);
      range.value = v;
      if (t >= 2) clearInterval(hint), setPos(50), (range.value = 50);
    }, 30);
    stageCmp.addEventListener("pointerdown", () => clearInterval(hint), { once: true });
    range.addEventListener("input", () => clearInterval(hint), { once: true });
  }

  // ---- Live demo ----------------------------------------------------------------
  const stage = $("#stage");
  const sim = window.__xraySimulate.createSimulator(stage);
  const read = () => ({
    vision: document.querySelector('input[name="dv"]:checked').value,
    blur: Number($("#demo-blur").value),
    contrast: Number($("#demo-contrast").value),
    tunnel: $("#demo-tunnel").checked,
    dyslexia: $("#demo-dyslexia").checked,
    tremor: Number($("#demo-tremor").value),
  });
  const update = () => sim.apply(read());
  document.querySelectorAll('.controls input, .controls select').forEach((el) => el.addEventListener(el.type === "range" ? "input" : "change", update));

  let reader = null;
  const readerBtn = $("#demo-reader");
  readerBtn.addEventListener("click", () => {
    if (reader) return reader.destroy();
    reader = window.__xrayReader.createReaderPanel(stage, () => {
      reader = null;
      readerBtn.textContent = "🔊 Screen reader view";
      readerBtn.setAttribute("aria-pressed", "false");
    });
    readerBtn.textContent = "Close screen reader view";
    readerBtn.setAttribute("aria-pressed", "true");
  });
  readerBtn.setAttribute("aria-pressed", "false");

  const COLORS = { critical: "var(--critical)", serious: "var(--serious)", moderate: "var(--moderate)", minor: "var(--minor)" };
  let audit = null;

  function mark(el) {
    stage.querySelectorAll(".xray-mark").forEach((n) => n.classList.remove("xray-mark"));
    el.classList.add("xray-mark");
    el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  }

  $("#demo-audit").addEventListener("click", () => {
    // Simulations can stay on: the audit reads the real page, not the simulated view.
    audit = window.__xrayAudit.runAudit(stage);
    const report = $("#report");
    const color = audit.score >= 90 ? "var(--mint)" : audit.score >= 75 ? "var(--brand)" : audit.score >= 50 ? "var(--moderate)" : "var(--critical)";
    const total = audit.rules.reduce((n, r) => n + r.count, 0);
    report.innerHTML = `
      <div class="score-line">
        <div class="score-num" style="--p:${audit.score};--c:${color}"><span>${audit.score}</span></div>
        <div><strong>${audit.label}</strong><small>${total} issues found on this sample</small></div>
      </div>`;
    audit.rules.forEach((rule, i) => {
      const div = document.createElement("div");
      div.className = "r-rule";
      div.style.setProperty("--c", COLORS[rule.severity]);
      div.style.animationDelay = `${i * 60}ms`;
      div.innerHTML = `<h3><span></span><em></em></h3><p></p>`;
      div.querySelector("h3 span").textContent = rule.title;
      div.querySelector("h3 em").textContent = `${rule.count} · WCAG ${rule.wcag}`;
      div.querySelector("p").textContent = rule.help;
      for (const item of rule.items) {
        if (item.index === null) continue;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "r-item";
        b.textContent = item.element;
        if (item.note) {
          const small = document.createElement("small");
          small.textContent = item.note;
          b.appendChild(small);
        }
        b.addEventListener("click", () => mark(audit.elements[item.index]));
        div.appendChild(b);
      }
      report.appendChild(div);
    });
    if (matchMedia("(max-width: 1100px)").matches) report.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  });

  $("#demo-reset").addEventListener("click", () => {
    sim.clear();
    if (reader) reader.destroy();
    document.querySelector('input[name="dv"][value="none"]').checked = true;
    $("#demo-blur").value = 0;
    $("#demo-contrast").value = 0;
    $("#demo-tunnel").checked = false;
    $("#demo-dyslexia").checked = false;
    $("#demo-tremor").value = "0";
    stage.querySelectorAll(".xray-mark").forEach((n) => n.classList.remove("xray-mark"));
  });

  // ---- Scroll reveals -------------------------------------------------------------
  const targets = document.querySelectorAll(".feature-grid li, .how-card, .steps li, .section-head");
  if (!reduced() && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) e.target.classList.add("in"), io.unobserve(e.target);
    }, { threshold: 0.15 });
    targets.forEach((el, i) => {
      el.classList.add("reveal");
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(el);
    });
  }
})();
