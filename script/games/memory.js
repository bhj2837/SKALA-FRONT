/*
   script/games/memory.js
   카드 뒤집기 (신경쇠약).
   다녀온 도시를 카드 짝으로 만들었습니다.

   외부 API : window.HJ.memory.mount(host)
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var store = (global.HJ && global.HJ.store) || { get: function (k, f) { return f; }, set: function () {} };
  var ui = (global.HJ && global.HJ.ui) || {};

  /* 카드 짝 — 이모지 / 도시 / 한 줄 메모 */
  var PAIRS = [
    { e: "🏯", n: "경주", d: "자전거로 하루 종일 돌았던 곳" },
    { e: "🌉", n: "부산", d: "바다 보러 갔다가 먹기만 한 곳" },
    { e: "🌋", n: "제주도", d: "버스로만 다녀 본 화산섬" },
    { e: "☕", n: "강릉", d: "파도만 한 시간 본 커피 거리" },
    { e: "🍜", n: "오사카", d: "첫 끼도 마지막 끼도 라멘" },
    { e: "⛩️", n: "교토", d: "끝까지 올라가면 조용해지는 도리이" },
    { e: "🏮", n: "타이베이", d: "밤마다 야시장에 갔던 도시" },
    { e: "⛴️", n: "가오슝", d: "항구의 노을이 제일 좋았던 곳" }
  ];

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function mount(host) {
    if (!host) return null;

    host.innerHTML = [
      '<div class="mem">',
      '  <div class="mem__foot">',
      '    <span class="chip">뒤집기 <b data-flips>0</b></span>',
      '    <span class="chip">맞춘 짝 <b data-found>0</b> / ' + PAIRS.length + '</span>',
      '    <span class="chip">최소 기록 <b data-best>—</b></span>',
      '    <button class="btn btn--sm btn--ghost" type="button" data-new>↻ 새 판</button>',
      '  </div>',
      '  <div class="mem__grid" data-grid></div>',
      '  <p class="mem__note" data-note>같은 도시를 찾으면 그때의 짧은 메모가 뜹니다.</p>',
      '</div>'
    ].join("");

    var grid = host.querySelector("[data-grid]");
    var flipsEl = host.querySelector("[data-flips]");
    var foundEl = host.querySelector("[data-found]");
    var bestEl = host.querySelector("[data-best]");
    var noteEl = host.querySelector("[data-note]");

    var flips = 0, found = 0, lock = false, first = null;
    var best = store.get("memory:best", null);
    if (best) bestEl.textContent = best + "회";

    function deal() {
      flips = 0; found = 0; lock = false; first = null;
      flipsEl.textContent = "0";
      foundEl.textContent = "0";
      noteEl.textContent = "같은 짝을 찾으면 그 개념이 무엇인지 알려 줍니다.";

      var deck = shuffle(PAIRS.concat(PAIRS).map(function (p, i) {
        return { p: p, key: i };
      }));

      grid.innerHTML = deck.map(function (c, i) {
        return [
          '<button class="mem__card" type="button" data-i="' + i + '"',
          '        data-pair="' + PAIRS.indexOf(c.p) + '" aria-label="카드 ' + (i + 1) + '">',
          '  <span class="mem__face mem__face--back">?</span>',
          '  <span class="mem__face mem__face--front">' + c.p.e + '</span>',
          '</button>'
        ].join("");
      }).join("");
    }

    grid.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".mem__card") : null;
      if (!card || lock) return;
      if (card.getAttribute("data-open") === "true") return;
      if (card.getAttribute("data-done") === "true") return;

      card.setAttribute("data-open", "true");
      flips++;
      flipsEl.textContent = flips;

      if (!first) { first = card; return; }

      var a = first.getAttribute("data-pair");
      var b = card.getAttribute("data-pair");

      if (a === b) {
        // 짝을 맞췄다
        first.setAttribute("data-done", "true");
        card.setAttribute("data-done", "true");
        var info = PAIRS[Number(a)];
        noteEl.innerHTML = "<b>" + info.e + " " +
          info.n.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</b> — " + info.d;
        first = null;
        found++;
        foundEl.textContent = found;

        if (found === PAIRS.length) {
          if (!best || flips < best) {
            best = flips;
            store.set("memory:best", best);
            bestEl.textContent = best + "회";
            if (ui.toast) ui.toast("최소 기록 갱신! " + flips + "회", "ok");
          } else if (ui.toast) {
            ui.toast("완료! " + flips + "회 만에 성공", "ok");
          }
          noteEl.innerHTML = "<b>완료</b> — " + flips + "회 만에 8쌍을 모두 찾았습니다.";
        }
        return;
      }

      // 틀렸다 — 잠깐 보여 주고 되돌린다
      lock = true;
      var prev = first;
      first = null;
      global.setTimeout(function () {
        prev.removeAttribute("data-open");
        card.removeAttribute("data-open");
        lock = false;
      }, 780);
    });

    host.querySelector("[data-new]").addEventListener("click", deal);
    deal();

    return { deal: deal };
  }

  function bind() {
    var hosts = doc.querySelectorAll("[data-memory]");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  global.HJ = global.HJ || {};
  global.HJ.memory = { mount: mount };
})(window);
