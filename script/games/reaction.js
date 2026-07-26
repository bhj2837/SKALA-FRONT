/*
   script/games/reaction.js
   반응 속도 테스트.

   화면이 초록으로 바뀌는 순간 클릭한다. 걸린 시간을 ms 단위로 잰다.
   setTimeout · performance.now() · 상태 머신을 연습하기에 좋은 소재라
   미니게임으로 만들었습니다.

   상태 : idle → waiting(빨강) → ready(초록) → result
   waiting 중에 누르면 too-soon

   외부 API : window.HJ.reaction.mount(host)
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var store = (global.HJ && global.HJ.store) || { get: function (k, f) { return f; }, set: function () {} };
  var ui = (global.HJ && global.HJ.ui) || {};

  var ROUNDS = 5;

  function grade(ms) {
    if (ms < 180) return ["번개", "var(--c3)"];
    if (ms < 230) return ["아주 빠름", "var(--c-ok)"];
    if (ms < 290) return ["빠름", "var(--c1)"];
    if (ms < 360) return ["보통", "var(--c4)"];
    return ["느긋함", "var(--c-warn)"];
  }

  function mount(host) {
    if (!host) return null;

    host.innerHTML = [
      '<div class="rx">',
      '  <button class="rx__pad" type="button" data-pad data-state="idle">',
      // 초록으로 바뀌었다는 사실은 색만으로는 알 수 없다. 글자로도 알린다.
      '    <span class="rx__big" data-big role="status" aria-live="assertive">클릭해서 시작</span>',
      '    <span class="rx__sub" data-sub>초록색으로 바뀌는 순간 누르세요</span>',
      '  </button>',
      '  <div class="rx__foot">',
      '    <span class="chip">라운드 <b data-round>0</b> / ' + ROUNDS + '</span>',
      '    <span class="chip">평균 <b data-avg>—</b></span>',
      '    <span class="chip">최고 <b data-best>—</b></span>',
      '  </div>',
      '  <ul class="rx__runs" data-runs></ul>',
      '</div>'
    ].join("");

    var pad = host.querySelector("[data-pad]");
    var big = host.querySelector("[data-big]");
    var sub = host.querySelector("[data-sub]");
    var roundEl = host.querySelector("[data-round]");
    var avgEl = host.querySelector("[data-avg]");
    var bestEl = host.querySelector("[data-best]");
    var runsEl = host.querySelector("[data-runs]");

    var state = "idle";
    var timer = null;
    var greenAt = 0;
    var runs = [];
    var best = store.get("reaction:best", null);

    if (best) bestEl.textContent = best + "ms";

    function setState(s, title, note) {
      state = s;
      pad.setAttribute("data-state", s);
      big.textContent = title;
      sub.textContent = note;
    }

    function scheduleGreen() {
      setState("waiting", "기다리세요…", "초록으로 바뀌면 바로 클릭");
      var delay = 900 + Math.random() * 2600;
      timer = global.setTimeout(function () {
        greenAt = performance.now();
        setState("ready", "지금!", "클릭");
      }, delay);
    }

    function pushRun(ms) {
      runs.push(ms);
      var li = doc.createElement("li");
      var g = grade(ms);
      li.innerHTML = '<b>' + runs.length + '회</b>' +
        '<span class="rx__bar"><i style="width:' +
        Math.min(100, ms / 6) + '%;background:' + g[1] + '"></i></span>' +
        '<b class="mono">' + ms + 'ms</b>';
      runsEl.appendChild(li);

      roundEl.textContent = runs.length;

      var avg = Math.round(runs.reduce(function (a, b) { return a + b; }, 0) / runs.length);
      avgEl.textContent = avg + "ms";

      var fastest = Math.min.apply(null, runs);
      if (!best || fastest < best) {
        best = fastest;
        store.set("reaction:best", best);
        bestEl.textContent = best + "ms";
      }

      if (runs.length >= ROUNDS) {
        var g2 = grade(avg);
        setState("done", avg + "ms", "평균 " + avg + "ms · " + g2[0] + " · 클릭하면 처음부터");
        if (ui.toast) ui.toast("반응속도 평균 " + avg + "ms — " + g2[0], "ok");
      } else {
        setState("result", ms + "ms", grade(ms)[0] + " · 클릭해서 다음 라운드");
      }
    }

    pad.addEventListener("click", function () {
      if (state === "idle" || state === "result") {
        scheduleGreen();
        return;
      }

      if (state === "waiting") {
        global.clearTimeout(timer);
        setState("tooSoon", "너무 빨랐어요", "초록이 된 뒤에 눌러야 합니다 · 클릭해서 재시도");
        return;
      }

      if (state === "ready") {
        pushRun(Math.round(performance.now() - greenAt));
        return;
      }

      if (state === "tooSoon") { scheduleGreen(); return; }

      if (state === "done") {
        runs = [];
        runsEl.innerHTML = "";
        roundEl.textContent = "0";
        avgEl.textContent = "—";
        setState("idle", "클릭해서 시작", "초록색으로 바뀌는 순간 누르세요");
      }
    });

    return { reset: function () { runs = []; runsEl.innerHTML = ""; } };
  }

  function bind() {
    var hosts = doc.querySelectorAll("[data-reaction]");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  global.HJ = global.HJ || {};
  global.HJ.reaction = { mount: mount };
})(window);
