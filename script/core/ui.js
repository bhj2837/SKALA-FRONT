/*
   script/core/ui.js
   모든 페이지에서 공통으로 쓰는 UI 엔진.

   · 테마 토글 (다크 ⇄ 라이트, 저장 + OS 설정 감지)
   · 모바일 내비게이션 드로어
   · 스크롤 진행 바
   · 스크롤 등장 애니메이션 (IntersectionObserver)
   · 커스텀 커서 (dot + lag ring)
   · 마그네틱 hover / 3D 틸트 카드
   · 숫자 카운트업
   · 모달 · 토스트 · 콘솔 로거 유틸
   · 현재 페이지 내비게이션 자동 활성화

   전역 API : window.HJ.ui
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var store = (global.HJ && global.HJ.store) || {
    get: function (k, f) { return f; }, set: function () {}, remove: function () {}
  };

  var reduceMotion = global.matchMedia &&
    global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isTouch = global.matchMedia &&
    global.matchMedia("(hover: none), (pointer: coarse)").matches;

  /* ---------------------------------------------------------------- 헬퍼 */
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function on(el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt || false); }
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 1. THEME — 다크 ⇄ 라이트 */
  var Theme = {
    init: function () {
      var saved = store.get("theme", null);
      var prefersLight = global.matchMedia &&
        global.matchMedia("(prefers-color-scheme: light)").matches;
      this.apply(saved || (prefersLight ? "light" : "dark"), false);

      $$("[data-theme-toggle]").forEach(function (btn) {
        on(btn, "click", function () { Theme.toggle(); });
      });
    },

    apply: function (mode, animate) {
      var root = doc.documentElement;
      if (animate !== false) {
        root.style.transition = "background-color .5s ease, color .5s ease";
        global.setTimeout(function () { root.style.transition = ""; }, 520);
      }
      root.setAttribute("data-theme", mode);
      $$("[data-theme-toggle]").forEach(function (b) {
        b.setAttribute("aria-label", mode === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
      });
      store.set("theme", mode);
      doc.dispatchEvent(new CustomEvent("hj:theme", { detail: { mode: mode } }));
    },

    current: function () {
      return doc.documentElement.getAttribute("data-theme") || "dark";
    },

    toggle: function () {
      this.apply(this.current() === "dark" ? "light" : "dark");
    }
  };

  /* 2. NAV — 모바일 드로어 + 현재 페이지 표시 */
  var Nav = {
    init: function () {
      var toggle = $("[data-nav-toggle]");
      var nav = $("[data-nav]");

      if (toggle && nav) {
        on(toggle, "click", function () {
          var open = nav.getAttribute("data-open") === "true";
          nav.setAttribute("data-open", String(!open));
          toggle.setAttribute("aria-expanded", String(!open));
        });
        // 링크 클릭 시 닫기
        $$("a", nav).forEach(function (a) {
          on(a, "click", function () {
            nav.setAttribute("data-open", "false");
            toggle.setAttribute("aria-expanded", "false");
          });
        });
        // ESC로 닫기
        on(doc, "keydown", function (e) {
          if (e.key === "Escape" && nav.getAttribute("data-open") === "true") {
            nav.setAttribute("data-open", "false");
            toggle.setAttribute("aria-expanded", "false");
          }
        });
      }

      // 현재 파일명과 일치하는 내비 링크에 aria-current 부여
      var here = (global.location.pathname.split("/").pop() || "index.html").toLowerCase();
      $$(".nav-link").forEach(function (a) {
        var target = (a.getAttribute("href") || "").split("/").pop().toLowerCase();
        if (target && target === here) a.setAttribute("aria-current", "page");
      });
    }
  };

  /* 3. SCROLL PROGRESS */
  var Progress = {
    init: function () {
      var bar = $("[data-scroll-progress]");
      if (!bar) return;
      var raf = null;
      function paint() {
        var h = doc.documentElement.scrollHeight - global.innerHeight;
        var p = h > 0 ? clamp(global.scrollY / h, 0, 1) : 0;
        bar.style.transform = "scaleX(" + p + ")";
        raf = null;
      }
      on(global, "scroll", function () { if (!raf) raf = global.requestAnimationFrame(paint); }, { passive: true });
      paint();
    }
  };

  /* 4. REVEAL — 스크롤 진입 시 등장 */
  var Reveal = {
    init: function () {
      var targets = $$(".reveal, .reveal-stagger");
      if (!targets.length) return;

      if (reduceMotion || !("IntersectionObserver" in global)) {
        targets.forEach(function (el) { el.classList.add("is-in"); });
        return;
      }

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });

      targets.forEach(function (el, i) {
        // data-delay="120" → 120ms 지연
        var d = el.getAttribute("data-delay");
        if (d) el.style.setProperty("--reveal-delay", (parseInt(d, 10) / 1000) + "s");
        io.observe(el);
        void i;
      });
    }
  };

  /* 5. CURSOR — 점 + 관성이 있는 링 */
  var Cursor = {
    init: function () {
      if (isTouch || reduceMotion) return;

      var dot = doc.createElement("div");
      var ring = doc.createElement("div");
      dot.className = "cursor-dot";
      ring.className = "cursor-ring";
      dot.setAttribute("aria-hidden", "true");
      ring.setAttribute("aria-hidden", "true");
      doc.body.appendChild(dot);
      doc.body.appendChild(ring);

      var mx = global.innerWidth / 2, my = global.innerHeight / 2;
      var rx = mx, ry = my;

      on(global, "mousemove", function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });

      (function loop() {
        rx = lerp(rx, mx, 0.16);
        ry = lerp(ry, my, 0.16);
        dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
        ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
        global.requestAnimationFrame(loop);
      })();

      // 인터랙티브 요소 위에서 링 확대
      var hoverSel = "a, button, input, select, textarea, label.choice, .trip-card, .hub-card, [data-cursor-hover]";
      on(doc, "mouseover", function (e) {
        if (e.target.closest && e.target.closest(hoverSel)) doc.body.setAttribute("data-cursor", "hover");
      });
      on(doc, "mouseout", function (e) {
        if (e.target.closest && e.target.closest(hoverSel)) doc.body.removeAttribute("data-cursor");
      });
    }
  };

  /* 6. MAGNETIC — 마우스를 살짝 따라오는 요소 */
  var Magnetic = {
    init: function () {
      if (isTouch || reduceMotion) return;
      $$(".magnetic").forEach(function (el) {
        var strength = parseFloat(el.getAttribute("data-magnet") || "0.28");
        on(el, "mousemove", function (e) {
          var r = el.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) * strength;
          var dy = (e.clientY - (r.top + r.height / 2)) * strength;
          el.style.setProperty("--mx", dx.toFixed(2) + "px");
          el.style.setProperty("--my", dy.toFixed(2) + "px");
        });
        on(el, "mouseleave", function () {
          el.style.setProperty("--mx", "0px");
          el.style.setProperty("--my", "0px");
        });
      });
    }
  };

  /* 7. TILT — 마우스 위치에 따라 기울어지는 3D 카드 */
  var Tilt = {
    init: function () {
      if (isTouch || reduceMotion) return;
      $$(".tilt").forEach(function (el) {
        var max = parseFloat(el.getAttribute("data-tilt") || "7");
        on(el, "mouseenter", function () { el.classList.add("is-tilting"); });
        on(el, "mousemove", function (e) {
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          el.style.setProperty("--ry", (px * max * 2).toFixed(2) + "deg");
          el.style.setProperty("--rx", (-py * max * 2).toFixed(2) + "deg");
        });
        on(el, "mouseleave", function () {
          el.classList.remove("is-tilting");
          el.style.setProperty("--rx", "0deg");
          el.style.setProperty("--ry", "0deg");
        });
      });
    }
  };

  /* 8. COUNTUP — 숫자가 올라가는 애니메이션 */
  var CountUp = {
    init: function () {
      var els = $$("[data-count]");
      if (!els.length) return;

      function run(el) {
        var target = parseFloat(el.getAttribute("data-count"));
        var dur = parseInt(el.getAttribute("data-count-dur") || "1400", 10);
        var suffix = el.getAttribute("data-count-suffix") || "";
        var decimals = (String(target).split(".")[1] || "").length;
        if (reduceMotion) { el.textContent = target.toFixed(decimals) + suffix; return; }
        var t0 = performance.now();
        (function step(now) {
          var p = clamp((now - t0) / dur, 0, 1);
          var eased = 1 - Math.pow(1 - p, 3);       // easeOutCubic
          el.textContent = (target * eased).toFixed(decimals) + suffix;
          if (p < 1) global.requestAnimationFrame(step);
        })(t0);
      }

      if (!("IntersectionObserver" in global)) { els.forEach(run); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          run(en.target);
          io.unobserve(en.target);
        });
      }, { threshold: 0.4 });
      els.forEach(function (el) { io.observe(el); });
    }
  };

  /* 9. MODAL */
  var Modal = {
    open: function (id) {
      var m = typeof id === "string" ? doc.getElementById(id) : id;
      if (!m) return;
      m.setAttribute("data-open", "true");
      doc.body.style.overflow = "hidden";
      var focusable = $(".modal__close", m);
      if (focusable) focusable.focus();
    },
    close: function (id) {
      var m = typeof id === "string" ? doc.getElementById(id) : id;
      if (!m) return;
      m.setAttribute("data-open", "false");
      doc.body.style.overflow = "";
    },
    init: function () {
      $$(".modal").forEach(function (m) {
        on(m, "click", function (e) {
          if (e.target === m || (e.target.closest && e.target.closest("[data-modal-close]"))) {
            Modal.close(m);
          }
        });
      });
      on(doc, "keydown", function (e) {
        if (e.key !== "Escape") return;
        $$('.modal[data-open="true"]').forEach(function (m) { Modal.close(m); });
      });
      $$("[data-modal-open]").forEach(function (btn) {
        on(btn, "click", function () { Modal.open(btn.getAttribute("data-modal-open")); });
      });
    }
  };

  /* 10. CONSOLE LOGGER — 실행 결과를 화면에 출력 */
  function logger(selector) {
    var box = typeof selector === "string" ? $(selector) : selector;
    return {
      el: box,
      clear: function () { if (box) box.innerHTML = ""; return this; },
      write: function (msg, kind) {
        if (!box) return this;
        var line = doc.createElement("span");
        line.className = "console__line" + (kind ? " console__line--" + kind : "");
        line.textContent = msg;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
        return this;
      },
      ok:  function (m) { return this.write(m, "ok"); },
      bad: function (m) { return this.write(m, "bad"); },
      dim: function (m) { return this.write(m, "dim"); }
    };
  }

  /* 11. TOAST */
  function toast(msg, kind) {
    var host = $("#toast-host");
    if (!host) {
      host = doc.createElement("div");
      host.id = "toast-host";
      host.style.cssText = "position:fixed;left:50%;bottom:1.6rem;transform:translateX(-50%);" +
        "z-index:500;display:flex;flex-direction:column;gap:.5rem;align-items:center;pointer-events:none";
      doc.body.appendChild(host);
    }
    var t = doc.createElement("div");
    var color = kind === "bad" ? "var(--c-bad)" : kind === "ok" ? "var(--c-ok)" : "var(--c1)";
    t.textContent = msg;
    t.style.cssText = "padding:.7rem 1.2rem;border-radius:999px;font-size:.85rem;font-weight:500;" +
      "border:1px solid " + color + ";background:var(--surface-solid);color:var(--text);" +
      "box-shadow:var(--sh);opacity:0;transform:translateY(10px);transition:all .3s cubic-bezier(.22,1,.36,1)";
    host.appendChild(t);
    global.requestAnimationFrame(function () { t.style.opacity = "1"; t.style.transform = "none"; });
    global.setTimeout(function () {
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      global.setTimeout(function () { t.remove(); }, 320);
    }, 2600);
  }

  /* 12. 이미지 폴백 — media 파일이 아직 없을 때 플레이스홀더 노출 */
  var MediaFallback = {
    init: function () {
      $$("img[data-fallback]").forEach(function (img) {
        function fail() {
          img.style.display = "none";
          var ph = img.parentElement && img.parentElement.querySelector(".media-ph");
          if (ph) ph.style.display = "grid";
        }
        on(img, "error", fail);
        // 이미 로드 실패한 상태로 스크립트가 붙은 경우
        if (img.complete && img.naturalWidth === 0) fail();
      });
    }
  };

  /* BOOT */
  function boot() {
    Theme.init();
    Nav.init();
    Progress.init();
    Reveal.init();
    Cursor.init();
    Magnetic.init();
    Tilt.init();
    CountUp.init();
    Modal.init();
    MediaFallback.init();
    doc.documentElement.setAttribute("data-ready", "true");
  }

  global.HJ = global.HJ || {};
  global.HJ.ui = {
    theme: Theme,
    modal: Modal,
    logger: logger,
    toast: toast,
    reduceMotion: reduceMotion,
    isTouch: isTouch,
    $: $, $$: $$, on: on, clamp: clamp, lerp: lerp
  };

  if (doc.readyState === "loading") on(doc, "DOMContentLoaded", boot);
  else boot();
})(window);
