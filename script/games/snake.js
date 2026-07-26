/*
   script/games/snake.js
   스네이크 — 캔버스 격자 게임.

   격자 좌표계, 큐(배열) 자료구조, 고정 간격 틱(tick) 루프,
   키보드·터치 입력 처리를 한 번에 연습할 수 있는 고전 게임입니다.

   · requestAnimationFrame 위에 직접 만든 고정 tick
   · 방향 전환은 "다음 틱"에 반영해 180도 즉사 방지
   · 먹을수록 빨라지는 난이도 곡선
   · 화면 밖으로 나가면 반대편에서 나오는 랩(wrap) 모드 토글

   외부 API : window.HJ.snake.mount(host)
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var store = (global.HJ && global.HJ.store) || { get: function (k, f) { return f; }, set: function () {} };
  var ui = (global.HJ && global.HJ.ui) || {};

  var COLS = 20, ROWS = 20, CELL = 17;      // 340 x 340
  var W = COLS * CELL, H = ROWS * CELL;

  function mount(host) {
    if (!host) return null;

    host.innerHTML = [
      '<div class="snk">',
      '  <div class="snk__stage">',
      '    <canvas class="snk__canvas" width="' + W + '" height="' + H + '"',
      '            tabindex="0" role="img" aria-label="스네이크 게임 화면"></canvas>',
      '    <div class="snk__overlay" data-ov>',
      // 준비·게임 오버 안내가 바뀌면 소리로도 알려 준다
      '      <div role="status" aria-live="polite">',
      '        <p class="eyebrow" data-ov-eyebrow>READY</p>',
      '        <h3 data-ov-title>화살표 키로 시작</h3>',
      '        <p class="muted" data-ov-sub>방향키 · WASD · 화면 드래그로 조작합니다.</p>',
      '        <button class="btn btn--primary btn--sm" type="button" data-start>시작</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="snk__foot">',
      '    <span class="chip">점수 <b data-score>0</b></span>',
      '    <span class="chip">최고 <b data-best>0</b></span>',
      '    <span class="chip">속도 <b data-speed>1.0x</b></span>',
      '    <label class="choice choice--inline">',
      '      <input type="checkbox" data-wrap checked>',
      '      <span class="choice__box" aria-hidden="true"></span>',
      '      <span>벽 통과</span>',
      '    </label>',
      '  </div>',
      '</div>'
    ].join("");

    var canvas = host.querySelector(".snk__canvas");
    // Canvas 2D 미지원 환경 대비 (수박게임과 동일한 방어)
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) {
      host.innerHTML = '<div class="note note--warn">' +
        '<span class="note__icon" aria-hidden="true">⚠️</span>' +
        '<span>이 브라우저는 Canvas 2D 를 지원하지 않아 스네이크를 실행할 수 없습니다.</span></div>';
      return null;
    }
    var ov = host.querySelector("[data-ov]");
    var ovTitle = host.querySelector("[data-ov-title]");
    var ovSub = host.querySelector("[data-ov-sub]");
    var ovEyebrow = host.querySelector("[data-ov-eyebrow]");
    var scoreEl = host.querySelector("[data-score]");
    var bestEl = host.querySelector("[data-best]");
    var speedEl = host.querySelector("[data-speed]");
    var wrapEl = host.querySelector("[data-wrap]");

    var snake, dir, nextDir, food, score, alive, playing, tickMs, acc, last, raf;
    var best = store.get("snake:best", 0) || 0;
    bestEl.textContent = best;

    function reset() {
      snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      score = 0;
      alive = true;
      tickMs = 130;
      acc = 0;
      placeFood();
      scoreEl.textContent = "0";
      speedEl.textContent = "1.0x";
    }

    function placeFood() {
      var free = [];
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          var hit = false;
          for (var i = 0; i < snake.length; i++) {
            if (snake[i].x === x && snake[i].y === y) { hit = true; break; }
          }
          if (!hit) free.push({ x: x, y: y });
        }
      }
      food = free.length ? free[(Math.random() * free.length) | 0] : null;
    }

    function tick() {
      dir = nextDir;

      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      if (wrapEl.checked) {
        head.x = (head.x + COLS) % COLS;
        head.y = (head.y + ROWS) % ROWS;
      } else if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        return die("벽에 부딪혔습니다");
      }

      // 자기 몸 충돌 (꼬리 끝은 이번 틱에 비워지므로 제외)
      for (var i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
          return die("자기 몸을 물었습니다");
        }
      }

      snake.unshift(head);

      if (food && head.x === food.x && head.y === food.y) {
        score += 10;
        scoreEl.textContent = score;
        tickMs = Math.max(58, tickMs - 3.2);          // 먹을수록 빨라진다
        speedEl.textContent = (130 / tickMs).toFixed(1) + "x";
        placeFood();
      } else {
        snake.pop();
      }
    }

    function die(reason) {
      alive = false;
      playing = false;
      if (score > best) {
        best = score;
        store.set("snake:best", best);
        bestEl.textContent = best;
        if (ui.toast) ui.toast("스네이크 최고 점수 " + best + "점", "ok");
      }
      ovEyebrow.textContent = "GAME OVER";
      ovTitle.textContent = score + "점";
      ovSub.textContent = reason + " · 길이 " + snake.length;
      ov.hidden = false;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // 격자
      ctx.strokeStyle = "rgba(255,255,255,.05)";
      ctx.lineWidth = 1;
      for (var g = 1; g < COLS; g++) {
        ctx.beginPath();
        ctx.moveTo(g * CELL, 0); ctx.lineTo(g * CELL, H);
        ctx.moveTo(0, g * CELL); ctx.lineTo(W, g * CELL);
        ctx.stroke();
      }

      // 먹이 — 살짝 맥동
      if (food) {
        var pulse = 0.5 + Math.sin(performance.now() / 190) * 0.5;
        var fr = CELL * 0.3 + pulse * 2;
        ctx.fillStyle = "rgba(232,121,249,.28)";
        ctx.beginPath();
        ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, fr + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e879f9";
        ctx.beginPath();
        ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, fr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 뱀 — 머리에서 꼬리로 갈수록 투명해진다
      for (var i = snake.length - 1; i >= 0; i--) {
        var s = snake[i];
        var t = 1 - i / (snake.length + 4);
        ctx.fillStyle = i === 0 ? "#22d3ee" : "rgba(129,140,248," + (0.35 + t * 0.6) + ")";
        var pad = i === 0 ? 1.5 : 2.4;
        roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 4);
        ctx.fill();
      }

      // 눈
      if (snake.length) {
        var hd = snake[0];
        ctx.fillStyle = "#05060a";
        var cx = hd.x * CELL + CELL / 2 + dir.x * 3;
        var cy = hd.y * CELL + CELL / 2 + dir.y * 3;
        ctx.beginPath();
        ctx.arc(cx - (dir.x ? 0 : 3), cy - (dir.y ? 0 : 3), 1.7, 0, Math.PI * 2);
        ctx.arc(cx + (dir.x ? 0 : 3), cy + (dir.y ? 0 : 3), 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function loop(now) {
      raf = global.requestAnimationFrame(loop);
      var dt = now - last;
      last = now;

      if (playing && alive) {
        acc += dt;
        while (acc >= tickMs) {
          acc -= tickMs;
          tick();
          if (!alive) break;
        }
      }
      draw();
    }

    function start() {
      reset();
      ov.hidden = true;
      playing = true;
      last = performance.now();
      canvas.focus();
    }

    host.querySelector("[data-start]").addEventListener("click", start);

    /* ---------- 입력 ---------- */
    var KEYS = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 }
    };

    function turn(v) {
      // 진행 방향의 정반대로는 못 꺾는다
      if (v.x === -dir.x && v.y === -dir.y) return;
      nextDir = v;
    }

    canvas.addEventListener("keydown", function (e) {
      var v = KEYS[e.key];
      if (!v) return;
      e.preventDefault();
      if (!playing) start();
      turn(v);
    });

    // 터치 · 드래그 스와이프
    var sx = 0, sy = 0, swiping = false;
    canvas.addEventListener("pointerdown", function (e) {
      sx = e.clientX; sy = e.clientY; swiping = true;
      canvas.focus();
    });
    canvas.addEventListener("pointerup", function (e) {
      if (!swiping) return;
      swiping = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (!playing) start();
      turn(Math.abs(dx) > Math.abs(dy)
        ? { x: dx > 0 ? 1 : -1, y: 0 }
        : { x: 0, y: dy > 0 ? 1 : -1 });
    });

    /* ---------- 초기화 ---------- */
    reset();
    playing = false;
    ov.hidden = false;
    last = performance.now();
    raf = global.requestAnimationFrame(loop);

    // 화면 밖이면 일시정지
    if ("IntersectionObserver" in global) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting && playing) {
            playing = false;
            ovEyebrow.textContent = "PAUSED";
            ovTitle.textContent = "일시정지";
            ovSub.textContent = "화면 밖으로 나가 잠시 멈췄습니다.";
            ov.hidden = false;
          }
        });
      }, { threshold: 0.05 }).observe(host);
    }

    void raf;
    return { start: start, reset: reset };
  }

  function bind() {
    var hosts = doc.querySelectorAll("[data-snake]");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  global.HJ = global.HJ || {};
  global.HJ.snake = { mount: mount };
})(window);
