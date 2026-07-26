/*
   script/upDown.js
   Up-Down 숫자 맞추기 게임
   ▸ startUpDown()      : 무작위 1~50, prompt / alert, 반복문
   ▸ mountUpDownArena() : 같은 로직을 DOM UI로 확장한 버전 (playground.html)
   입력 기록 · UP/DOWN 표시 · 뜨거움/차가움 온도바 · 최소 기록
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var MIN = 1, MAX = 50;

  /* 1. 팝업 버전 — prompt() / alert() / 반복문 */
  function startUpDown() {
    // 컴퓨터가 1부터 50 사이의 무작위 숫자 하나를 생성
    var computerNum = Math.floor(Math.random() * 50) + 1;
    var count = 0;
    var log = global.HJ && global.HJ.ui ? global.HJ.ui.logger("#js-console") : null;

    if (log) {
      log.dim("[upDown.js] 게임 시작 — 1~50 사이의 숫자를 맞춰보세요.");
    }

    // 사용자가 맞출 때까지 반복해서 기회를 준다 (while 반복문)
    while (true) {
      var input = global.prompt(
        "1부터 50 사이의 숫자를 입력하세요.\n(시도 " + (count + 1) + "회째 / 취소하면 종료)"
      );

      // 취소를 누르면 정답을 알려주고 종료
      if (input === null) {
        global.alert("게임을 종료합니다. 정답은 " + computerNum + " 이었습니다.");
        if (log) log.bad("포기 — 정답은 " + computerNum + " 이었습니다.");
        return;
      }

      var userNum = Number(input);

      // 숫자가 아니거나 범위를 벗어나면 다시 입력 (기회로 세지 않음)
      if (input.trim() === "" || isNaN(userNum) || userNum < MIN || userNum > MAX) {
        global.alert("1부터 50 사이의 숫자만 입력할 수 있습니다.");
        continue;
      }

      count++;

      if (userNum > computerNum) {
        global.alert("Down! ⬇️");
        if (log) log.write(count + "회: " + userNum + " → Down!");
      } else if (userNum < computerNum) {
        global.alert("Up! ⬆️");
        if (log) log.write(count + "회: " + userNum + " → Up!");
      } else {
        // 정답
        global.alert("축하합니다! " + count + "번 만에 맞추셨습니다. 🎉");
        if (log) log.ok(count + "회: " + userNum + " → 정답! 🎉");
        recordBest(count);
        break;
      }
    }
  }

  /* 최소 기록을 저장 (store 모듈이 있을 때만) */
  function recordBest(count) {
    if (!global.HJ || !global.HJ.store) return;
    var best = global.HJ.store.get("updown:best", null);
    if (best === null || count < best) {
      global.HJ.store.set("updown:best", count);
      if (global.HJ.ui) global.HJ.ui.toast("최소 기록 갱신! " + count + "회", "ok");
    }
    paintBest();
  }

  function paintBest() {
    if (!global.HJ || !global.HJ.store) return;
    var best = global.HJ.store.get("updown:best", null);
    var els = doc.querySelectorAll("[data-updown-best]");
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = best === null ? "—" : best + "회";
    }
  }

  /* 2. 확장 버전 — 같은 알고리즘을 DOM UI로 */
  function mountUpDownArena(host) {
    if (!host) return;

    var answer, tries, over;

    host.innerHTML = [
      '<div class="ud">',
      '  <div class="ud__gauge"><div class="ud__gauge-fill" data-fill></div>',
      '    <span class="ud__gauge-label" data-temp>범위 1 ~ 50</span>',
      '  </div>',
      '  <form class="ud__form" novalidate>',
      '    <input type="number" min="1" max="50" placeholder="1 ~ 50" aria-label="추측한 숫자" data-input>',
      '    <button type="submit" class="btn btn--primary">추측</button>',
      '  </form>',
      '  <p class="ud__msg" data-msg>숫자를 입력하고 추측 버튼을 눌러보세요.</p>',
      '  <ul class="ud__history" data-history></ul>',
      '  <div class="ud__foot">',
      '    <span>시도 <b data-tries>0</b>회</span>',
      '    <button type="button" class="btn btn--ghost btn--sm" data-reset>다시 시작</button>',
      '  </div>',
      '</div>'
    ].join("");

    var form    = host.querySelector("form");
    var input   = host.querySelector("[data-input]");
    var msg     = host.querySelector("[data-msg]");
    var history = host.querySelector("[data-history]");
    var triesEl = host.querySelector("[data-tries]");
    var fill    = host.querySelector("[data-fill]");
    var tempEl  = host.querySelector("[data-temp]");
    var reset   = host.querySelector("[data-reset]");

    var lo, hi;   // 논리적으로 남은 후보 범위

    /*
       focusInput=true 일 때만 입력칸으로 커서를 옮긴다.
       (페이지가 처음 열릴 때 focus 를 주면 화면이 여기로 스크롤돼 버린다)
    */
    function start(focusInput) {
      answer = Math.floor(Math.random() * 50) + 1;
      tries = 0;
      over = false;
      lo = MIN; hi = MAX;
      history.innerHTML = "";
      triesEl.textContent = "0";
      msg.textContent = "숫자를 입력하고 추측 버튼을 눌러보세요.";
      msg.className = "ud__msg";
      input.value = "";
      input.disabled = false;
      paintGauge();
      if (focusInput === true) input.focus();
    }

    function paintGauge() {
      var span = ((hi - lo + 1) / (MAX - MIN + 1)) * 100;
      fill.style.width = span + "%";
      fill.style.marginLeft = ((lo - MIN) / (MAX - MIN + 1)) * 100 + "%";
      tempEl.textContent = "남은 범위 " + lo + " ~ " + hi;
    }

    function addRow(num, verdict, tone) {
      var li = doc.createElement("li");
      li.className = "ud__row ud__row--" + tone;
      li.innerHTML = '<b>' + num + '</b><span>' + verdict + '</span>';
      history.insertBefore(li, history.firstChild);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (over) return;

      var userNum = Number(input.value);
      if (input.value === "" || isNaN(userNum) || userNum < MIN || userNum > MAX) {
        msg.textContent = "1부터 50 사이의 숫자만 입력할 수 있어요.";
        msg.className = "ud__msg is-bad";
        host.classList.add("anim-shake");
        global.setTimeout(function () { host.classList.remove("anim-shake"); }, 500);
        return;
      }

      tries++;
      triesEl.textContent = String(tries);
      input.value = "";

      var gap = Math.abs(userNum - answer);
      var heat = gap <= 2 ? "🔥 아주 가까워요" : gap <= 5 ? "😳 꽤 가까워요"
               : gap <= 12 ? "🙂 그럭저럭" : "🧊 한참 멀어요";

      if (userNum > answer) {
        lo = lo; hi = Math.min(hi, userNum - 1);
        addRow(userNum, "Down ⬇", "down");
        msg.textContent = "Down! 더 작은 수예요. " + heat;
        msg.className = "ud__msg is-down";
      } else if (userNum < answer) {
        lo = Math.max(lo, userNum + 1);
        addRow(userNum, "Up ⬆", "up");
        msg.textContent = "Up! 더 큰 수예요. " + heat;
        msg.className = "ud__msg is-up";
      } else {
        addRow(userNum, "정답 🎉", "win");
        msg.textContent = "축하합니다! " + tries + "번 만에 맞추셨습니다. 🎉";
        msg.className = "ud__msg is-win";
        over = true;
        input.disabled = true;
        lo = hi = answer;
        recordBest(tries);
      }
      paintGauge();
    });

    reset.addEventListener("click", function () { start(true); });
    start(false);
  }

  /* 자동 배선 — [data-updown-start] 버튼, [data-updown-arena] 컨테이너 */
  function bind() {
    var btns = doc.querySelectorAll("[data-updown-start]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", startUpDown);
    }
    var arenas = doc.querySelectorAll("[data-updown-arena]");
    for (var j = 0; j < arenas.length; j++) {
      mountUpDownArena(arenas[j]);
    }
    paintBest();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  /* 전역 공개 (개발자 콘솔에서 startUpDown() 으로 바로 실행 가능) */
  global.startUpDown = startUpDown;
  global.HJ = global.HJ || {};
  global.HJ.upDown = { start: startUpDown, mountArena: mountUpDownArena };
})(window);
