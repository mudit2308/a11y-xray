// Screen reader view: the page as a screen reader user hears it, in order,
// with roles and names, plus read-aloud. Classic script; exposes window.__xrayReader.

(function (root) {
  "use strict";
  const A = root.__xrayAudit;

  const LANDMARKS = { HEADER: "banner", NAV: "navigation", MAIN: "main", FOOTER: "content info", ASIDE: "complementary", FORM: "form" };
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "HEAD"]);
  const MAX_ITEMS = 400;

  function fieldRole(el) {
    if (el.tagName === "SELECT") return "combo box";
    if (el.tagName === "TEXTAREA") return "edit text";
    const t = (el.getAttribute("type") || "text").toLowerCase();
    return { checkbox: "check box", radio: "radio button", range: "slider", search: "search field" }[t] || "edit text";
  }

  /** Walk the page in reading order and describe what a screen reader would announce. */
  function readingOrder(scope) {
    const doc = scope.ownerDocument;
    const start = scope === doc.documentElement ? doc.body : scope;
    const items = [];
    const push = (item) => items.length < MAX_ITEMS && items.push(item);

    function visit(el) {
      if (items.length >= MAX_ITEMS || el.nodeType !== 1 || SKIP.has(el.tagName.toUpperCase())) return;
      if (el.closest("[data-xray-ui]") || !A.isVisible(el)) return;
      const tag = el.tagName;
      const role = el.getAttribute("role");

      if (/^H[1-6]$/.test(tag) || role === "heading") {
        const level = el.getAttribute("aria-level") || tag.slice(1) || "2";
        const name = A.accessibleName(el);
        push({ el, role: `heading level ${level}`, name: name || "empty heading", problem: !name });
        return;
      }
      if (tag === "IMG" || role === "img") {
        if (el.getAttribute("alt") === "" || role === "presentation") return; // decorative: skipped, as it should be
        const name = A.accessibleName(el);
        push({ el, role: "image", name: name || "unlabeled image", problem: !name });
        return;
      }
      if ((tag === "A" && el.hasAttribute("href")) || role === "link") {
        const name = A.accessibleName(el);
        push({ el, role: "link", name: name || "unlabeled link", problem: !name });
        return;
      }
      if (tag === "BUTTON" || role === "button" || (tag === "INPUT" && ["submit", "button", "reset", "image"].includes(el.type))) {
        const name = A.accessibleName(el);
        push({ el, role: "button", name: name || "unlabeled button", problem: !name });
        return;
      }
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        if (el.type === "hidden") return;
        const name = A.accessibleName(el);
        push({ el, role: fieldRole(el), name: name || "unlabeled", problem: !name });
        return;
      }

      const landmark = LANDMARKS[tag] || (role && ["banner", "navigation", "main", "contentinfo", "complementary", "search"].includes(role) ? role : null);
      if (landmark) push({ el, role: "landmark", name: landmark, problem: false });
      if (tag === "UL" || tag === "OL") push({ el, role: "list", name: `${el.querySelectorAll(":scope > li").length} items`, problem: false });

      // Text that belongs directly to this element
      let text = "";
      for (const child of el.childNodes) {
        if (child.nodeType === 3) text += child.textContent;
        else if (child.nodeType === 1) {
          if (text.trim()) push({ el, role: "text", name: text.replace(/\s+/g, " ").trim(), problem: false });
          text = "";
          visit(child);
        }
      }
      if (text.trim()) push({ el, role: "text", name: text.replace(/\s+/g, " ").trim(), problem: false });
    }

    visit(start);
    return items;
  }

  const spoken = (item) => (item.role === "text" ? item.name : item.role === "landmark" ? `${item.name} landmark` : `${item.name}, ${item.role}`);

  // -------------------------------------------------------------------------
  // The side panel (in a shadow root so the page's CSS can't touch it)
  // -------------------------------------------------------------------------

  const PANEL_CSS = `
    :host { all: initial; }
    .panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 340px; max-width: calc(100vw - 24px); z-index: 2147483647;
      display: flex; flex-direction: column; background: #0f1220; color: #e8eaf3; border-radius: 16px; overflow: hidden;
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: 0 24px 60px rgba(0,0,0,.45); border: 1px solid #2a2f45;
      animation: slide .35s cubic-bezier(.2,.8,.2,1); }
    @keyframes slide { from { transform: translateX(24px); opacity: 0; } }
    header { padding: 14px 16px 10px; border-bottom: 1px solid #23283c; }
    h2 { margin: 0 0 2px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
    h2 .dot { width: 8px; height: 8px; border-radius: 50%; background: #7c8cff; box-shadow: 0 0 0 4px rgba(124,140,255,.2); }
    header p { margin: 0; color: #9aa0b8; font-size: 12.5px; }
    .stats { display: flex; gap: 8px; margin-top: 10px; font-size: 12px; }
    .stats span { background: #1a1f33; border-radius: 999px; padding: 3px 9px; color: #c4c8db; }
    .stats .bad { background: rgba(255,107,107,.15); color: #ff9b9b; }
    .controls { display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #23283c; flex-wrap: wrap; }
    button { font: inherit; font-size: 12.5px; border: 1px solid #2f3550; background: #1a1f33; color: #e8eaf3; border-radius: 9px; padding: 6px 10px; cursor: pointer; }
    button:hover { border-color: #7c8cff; }
    button.primary { background: #5b6cff; border-color: #5b6cff; color: #fff; font-weight: 600; }
    label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #c4c8db; margin-left: auto; cursor: pointer; }
    ol { list-style: none; margin: 0; padding: 6px 8px 12px; overflow-y: auto; flex: 1; }
    li { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: baseline; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
    li:hover { background: #171c2e; }
    li.current { background: #232a48; box-shadow: inset 3px 0 0 #7c8cff; }
    .role { font: 600 10.5px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .04em; color: #8b93b3; white-space: nowrap; }
    .name { color: #e8eaf3; word-break: break-word; }
    li.problem .name { color: #ff9b9b; font-weight: 600; }
    li.problem .role { color: #ff9b9b; }
    li.text .name { color: #b9bdd0; }
    footer { padding: 8px 16px; border-top: 1px solid #23283c; color: #7e859f; font-size: 11.5px; }
  `;

  function createReaderPanel(scope, onClose) {
    const doc = scope.ownerDocument;
    const win = doc.defaultView;
    const items = readingOrder(scope);
    let index = -1;
    let speaking = false;
    let blackout = null;

    const hostEl = doc.createElement("div");
    hostEl.setAttribute("data-xray-ui", "");
    const shadow = hostEl.attachShadow({ mode: "open" });
    const problems = items.filter((i) => i.problem).length;
    shadow.innerHTML = `
      <style>${PANEL_CSS}</style>
      <section class="panel" role="dialog" aria-label="Screen reader view">
        <header>
          <h2><span class="dot"></span>Screen reader view</h2>
          <p>This is the page as a screen reader announces it: one thing at a time, in order.</p>
          <div class="stats"><span>${items.length} items</span>${problems ? `<span class="bad">${problems} unlabeled</span>` : `<span>no unlabeled items</span>`}</div>
        </header>
        <div class="controls">
          <button class="primary" data-act="play">▶ Read aloud</button>
          <button data-act="prev" aria-label="Previous item">◀</button>
          <button data-act="next" aria-label="Next item">▶</button>
          <label><input type="checkbox" data-act="blackout"> Hide the screen</label>
        </div>
        <ol></ol>
        <footer>Tip: unlabeled items in red are what blind users hit as dead ends.</footer>
      </section>`;
    const list = shadow.querySelector("ol");
    items.forEach((item, i) => {
      const li = doc.createElement("li");
      li.className = `${item.problem ? "problem" : ""} ${item.role === "text" ? "text" : ""}`;
      li.innerHTML = `<span class="role"></span><span class="name"></span>`;
      li.querySelector(".role").textContent = item.role === "text" ? "text" : item.role;
      li.querySelector(".name").textContent = item.name.length > 160 ? item.name.slice(0, 157) + "…" : item.name;
      li.addEventListener("click", () => {
        stop();
        go(i, true);
      });
      list.appendChild(li);
    });
    (doc.documentElement).appendChild(hostEl);

    // Outline the element currently being read.
    const ring = doc.createElement("div");
    ring.setAttribute("data-xray-ui", "");
    ring.style.cssText = "position:absolute;pointer-events:none;z-index:2147483645;border:3px solid #5b6cff;border-radius:6px;box-shadow:0 0 0 4px rgba(91,108,255,.25);transition:all .2s ease;display:none";
    doc.documentElement.appendChild(ring);

    function placeRing(el) {
      const r = el.getBoundingClientRect();
      ring.style.display = "block";
      ring.style.left = `${r.left + win.scrollX - 4}px`;
      ring.style.top = `${r.top + win.scrollY - 4}px`;
      ring.style.width = `${r.width + 8}px`;
      ring.style.height = `${r.height + 8}px`;
    }

    function go(i, speakIt) {
      if (i < 0 || i >= items.length) return false;
      index = i;
      [...list.children].forEach((li, j) => li.classList.toggle("current", j === i));
      list.children[i].scrollIntoView({ block: "nearest" });
      const el = items[i].el;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => placeRing(el), 250);
      if (speakIt) speak(items[i]);
      return true;
    }

    function speak(item, onEnd) {
      if (!("speechSynthesis" in win)) return onEnd && onEnd();
      win.speechSynthesis.cancel();
      const u = new win.SpeechSynthesisUtterance(spoken(item));
      u.rate = 1.05;
      if (onEnd) u.onend = onEnd;
      win.speechSynthesis.speak(u);
    }

    const playBtn = shadow.querySelector('[data-act="play"]');
    function play() {
      speaking = true;
      playBtn.textContent = "■ Stop";
      const step = () => {
        if (!speaking) return;
        if (!go(index + 1, false)) return stop();
        speak(items[index], step);
      };
      step();
    }
    function stop() {
      speaking = false;
      playBtn.textContent = "▶ Read aloud";
      if ("speechSynthesis" in win) win.speechSynthesis.cancel();
    }

    shadow.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "play") speaking ? stop() : play();
      if (act === "next") stop(), go(index + 1, true);
      if (act === "prev") stop(), go(Math.max(0, index - 1), true);
    });
    shadow.querySelector('[data-act="blackout"]').addEventListener("change", (e) => setBlackout(e.target.checked));

    function setBlackout(on) {
      if (on && !blackout) {
        blackout = doc.createElement("div");
        blackout.setAttribute("data-xray-ui", "");
        blackout.style.cssText = "position:fixed;inset:0;background:#000;z-index:2147483644;display:grid;place-items:center;color:#555;font:600 15px system-ui";
        blackout.textContent = "The screen is hidden. Use the panel to explore the page by ear.";
        doc.documentElement.appendChild(blackout);
      } else if (!on && blackout) {
        blackout.remove();
        blackout = null;
      }
    }

    function destroy() {
      stop();
      setBlackout(false);
      ring.remove();
      hostEl.remove();
      onClose && onClose();
    }

    return { destroy, items, setBlackout };
  }

  root.__xrayReader = { readingOrder, spoken, createReaderPanel };
})(window);
