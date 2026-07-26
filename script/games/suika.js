/*
   script/games/suika.js
   수박게임 — 물리엔진까지 직접 만든 버전.

   Matter.js 같은 물리 라이브러리를 쓰지 않았습니다.
   원과 원의 충돌만 필요하므로, 필요한 만큼만 직접 구현했습니다.

   · 반고정 시간 적분 (substep) — 프레임이 흔들려도 결과가 같다
   · 위치 기반 충돌 해소 + 반발 임펄스 (relaxation 반복)
   · 같은 등급끼리 닿으면 다음 등급으로 합쳐지는 병합 규칙
   · 합쳐질 때 파티클, WebAudio 로 만든 효과음 (음원 파일 없음)
   · 데드라인 위에 일정 시간 머물면 게임 오버
   · 최고 점수는 store.js 에 저장

   외부 API : window.HJ.suika.mount(hostElement)
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var store = (global.HJ && global.HJ.store) || { get: function (k, f) { return f; }, set: function () {} };
  var ui = (global.HJ && global.HJ.ui) || {};

  /* 0. 상수 */
  var W = 340;              // 논리 좌표계 너비
  var H = 520;              // 논리 좌표계 높이
  var WALL = 8;             // 벽 두께
  var LINE_Y = 92;          // 데드라인
  var G = 1500;             // 중력 (px/s²)
  var SUBSTEPS = 3;         // 한 프레임당 적분 횟수
  var ITER = 6;             // 충돌 해소 반복 횟수
  var REST = 0.06;          // 반발 계수 (거의 튀지 않게)
  var FRICTION = 0.992;     // 속도 감쇠
  var DROP_COOLDOWN = 380;  // 연속 투하 방지 (ms)
  var OVER_DELAY = 1400;    // 데드라인 초과 유예 (ms)
  var MAX_V = 1800;         // 속도 상한 — 겹친 과일이 튕겨 날아가는 것 방지 (px/s)

  /* 과일 등급표 — 반지름 / 색 / 이모지 / 이름 */
  var FRUITS = [
    { r: 13, c1: "#ff8fa3", c2: "#e01e37", e: "🍒", n: "체리" },
    { r: 17, c1: "#ff9ebb", c2: "#d90429", e: "🍓", n: "딸기" },
    { r: 22, c1: "#c084fc", c2: "#7c3aed", e: "🍇", n: "포도" },
    { r: 27, c1: "#fdba74", c2: "#ea580c", e: "🍊", n: "귤" },
    { r: 33, c1: "#fca5a5", c2: "#dc2626", e: "🍎", n: "사과" },
    { r: 39, c1: "#fde68a", c2: "#d97706", e: "🍐", n: "배" },
    { r: 46, c1: "#fecdd3", c2: "#f43f5e", e: "🍑", n: "복숭아" },
    { r: 54, c1: "#fef08a", c2: "#ca8a04", e: "🍍", n: "파인애플" },
    { r: 62, c1: "#bbf7d0", c2: "#16a34a", e: "🥥", n: "코코넛" },
    { r: 71, c1: "#d9f99d", c2: "#65a30d", e: "🍈", n: "멜론" },
    { r: 82, c1: "#86efac", c2: "#15803d", e: "🍉", n: "수박" }
  ];

  /* 합쳐서 t등급이 될 때 얻는 점수 — 삼각수 */
  function mergeScore(t) { return (t * (t + 1)) / 2 + t; }

  /* 처음 떨어뜨릴 수 있는 등급은 0~4 까지만 */
  function randomTier() { return (Math.random() * 5) | 0; }

  /* 1. 아주 작은 효과음 신디사이저 (음원 파일 불필요) */
  var Sound = {
    ctx: null,
    on: store.get("suika:sound", true),

    ensure: function () {
      if (this.ctx) return this.ctx;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    blip: function (freq, dur, type, vol) {
      if (!this.on) return;
      var ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.7, ctx.currentTime + (dur || 0.16));
      gain.gain.setValueAtTime(vol || 0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.16));
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (dur || 0.16) + 0.02);
    },

    merge: function (tier) {
      // 등급이 높을수록 낮고 굵은 소리
      this.blip(320 + (10 - tier) * 46, 0.18, "triangle", 0.1);
    },
    drop: function () { this.blip(180, 0.08, "sine", 0.05); },
    over: function () {
      this.blip(220, 0.5, "sawtooth", 0.07);
      var self = this;
      global.setTimeout(function () { self.blip(150, 0.7, "sawtooth", 0.06); }, 160);
    },
    toggle: function () {
      this.on = !this.on;
      store.set("suika:sound", this.on);
      if (this.on) this.blip(660, 0.1, "sine", 0.07);
      return this.on;
    }
  };

  /* 2. 게임 본체 */
  function mount(host) {
    if (!host) return null;

    /* ---------- 2-1. DOM ---------- */
    host.innerHTML = [
      '<div class="suika">',
      '  <div class="suika__stage">',
      '    <canvas class="suika__canvas" width="' + W + '" height="' + H + '"',
      '            role="img" aria-label="수박게임 화면"></canvas>',
      '    <div class="suika__overlay" data-over hidden>',
      // 게임이 끝난 순간 화면을 못 보는 사람에게도 결과를 읽어 준다
      '      <div class="suika__overlay-inner" role="status" aria-live="polite">',
      '        <p class="eyebrow">GAME OVER</p>',
      '        <h3 data-over-title>과일이 넘쳤습니다</h3>',
      '        <p class="mono" data-over-score>0 점</p>',
      '        <button class="btn btn--primary btn--sm" type="button" data-restart>다시 시작</button>',
      '      </div>',
      '    </div>',
      '  </div>',

      '  <div class="suika__panel">',
      '    <div class="suika__score">',
      '      <span class="suika__score-num" data-score>0</span>',
      '      <span class="suika__score-label">SCORE</span>',
      '    </div>',

      '    <div class="suika__next">',
      '      <span class="suika__next-label">NEXT</span>',
      '      <span class="suika__next-ball" data-next>🍒</span>',
      '    </div>',

      '    <dl class="suika__meta">',
      '      <div><dt>최고</dt><dd data-best>0</dd></div>',
      '      <div><dt>합체</dt><dd data-merges>0</dd></div>',
      '      <div><dt>최고 과일</dt><dd data-top>체리</dd></div>',
      '    </dl>',

      '    <div class="suika__controls">',
      '      <button class="btn btn--sm btn--ghost" type="button" data-sound aria-pressed="true">🔊 소리</button>',
      '      <button class="btn btn--sm btn--ghost" type="button" data-reset>↻ 새 게임</button>',
      '    </div>',

      '    <ol class="suika__chain" data-chain></ol>',
      '    <p class="hint">마우스를 움직여 위치를 잡고 클릭하면 떨어집니다. ← → 이동, Space 투하.</p>',
      '  </div>',
      '</div>'
    ].join("");

    var canvas = host.querySelector(".suika__canvas");
    // Canvas 2D 를 못 쓰는 아주 오래된 환경이면 조용히 안내만 남기고 멈춘다
    var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) {
      host.innerHTML = '<div class="note note--warn">' +
        '<span class="note__icon" aria-hidden="true">⚠️</span>' +
        '<span>이 브라우저는 Canvas 2D 를 지원하지 않아 수박게임을 실행할 수 없습니다.</span></div>';
      return null;
    }
    var stage = host.querySelector(".suika__stage");
    var overlay = host.querySelector("[data-over]");
    var scoreEl = host.querySelector("[data-score]");
    var bestEl = host.querySelector("[data-best]");
    var mergeEl = host.querySelector("[data-merges]");
    var topEl = host.querySelector("[data-top]");
    var nextEl = host.querySelector("[data-next]");

    /* 진화 사슬 표시 */
    host.querySelector("[data-chain]").innerHTML = FRUITS.map(function (f, i) {
      return '<li title="' + f.n + '" data-tier="' + i + '"><span>' + f.e + "</span></li>";
    }).join("");
    var chainItems = Array.prototype.slice.call(host.querySelectorAll("[data-chain] li"));

    /* ---------- 2-2. 상태 ---------- */
    var bodies = [];
    var particles = [];
    var score = 0;
    var merges = 0;
    var topTier = 0;
    var best = store.get("suika:best", 0) || 0;
    var curTier = randomTier();
    var nextTier = randomTier();
    var aimX = W / 2;
    var lastDrop = 0;
    var overSince = 0;
    var gameOver = false;
    var running = true;
    var uid = 0;

    bestEl.textContent = best;

    /* ---------- 2-3. 물리 ---------- */
    function spawn(x, y, tier, vx, vy) {
      var f = FRUITS[tier];
      bodies.push({
        id: ++uid,
        x: x, y: y,
        vx: vx || 0, vy: vy || 0,
        r: f.r,
        m: f.r * f.r,
        tier: tier,
        angle: 0,
        born: performance.now(),
        markY: y,                    // 정지 판정용 표본 (checkOver 참고)
        markAt: performance.now(),
        landed: false,               // 한 번이라도 멈춘 적이 있으면 '쌓인 과일'
        merged: false,
        pop: 0            // 합쳐진 직후 살짝 커지는 연출용
      });
    }

    function integrate(dt) {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        b.vy += G * dt;
        b.vx *= FRICTION;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.vx * dt / b.r;      // 굴러가는 느낌
        if (b.pop > 0) b.pop = Math.max(0, b.pop - dt * 4);
      }
    }

    function solveWalls() {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        var left = WALL + b.r;
        var right = W - WALL - b.r;
        var bottom = H - WALL - b.r;

        if (b.x < left) { b.x = left; if (b.vx < 0) b.vx *= -REST; }
        if (b.x > right) { b.x = right; if (b.vx > 0) b.vx *= -REST; }
        if (b.y > bottom) {
          b.y = bottom;
          if (b.vy > 0) b.vy *= -REST;
          b.vx *= 0.86;                  // 바닥 마찰
        }
        /*
           천장 — 가득 찼을 때 과일이 화면 밖으로 솟아오르지 않도록.
           절반쯤은 데드라인 위로 삐져나와 넘친 게 눈에 보이게 둔다.
        */
        if (b.y < 0) { b.y = 0; if (b.vy < 0) b.vy = 0; }
      }
    }

    var pendingMerges = [];

    function solvePairs() {
      for (var i = 0; i < bodies.length; i++) {
        var a = bodies[i];
        for (var j = i + 1; j < bodies.length; j++) {
          var b = bodies[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var minD = a.r + b.r;
          if (Math.abs(dx) > minD || Math.abs(dy) > minD) continue;

          var d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 === 0) continue;

          var d = Math.sqrt(d2);

          /* --- 같은 등급이면 합친다 --- */
          if (a.tier === b.tier && !a.merged && !b.merged && a.tier < FRUITS.length - 1) {
            a.merged = b.merged = true;
            pendingMerges.push([a, b]);
            continue;
          }

          /* --- 아니면 밀어낸다 --- */
          var nx = dx / d, ny = dy / d;
          var overlap = minD - d;
          var totalM = a.m + b.m;
          var push = overlap * 0.62;      // relaxation 계수

          a.x -= nx * push * (b.m / totalM);
          a.y -= ny * push * (b.m / totalM);
          b.x += nx * push * (a.m / totalM);
          b.y += ny * push * (a.m / totalM);

          // 접근 중일 때만 반발 임펄스
          var rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rvn < 0) {
            var jimp = -(1 + REST) * rvn / (1 / a.m + 1 / b.m);
            a.vx -= nx * jimp / a.m;
            a.vy -= ny * jimp / a.m;
            b.vx += nx * jimp / b.m;
            b.vy += ny * jimp / b.m;
          }
        }
      }
    }

    function applyMerges() {
      if (!pendingMerges.length) return;

      for (var k = 0; k < pendingMerges.length; k++) {
        var a = pendingMerges[k][0];
        var b = pendingMerges[k][1];
        var tier = Math.min(a.tier + 1, FRUITS.length - 1);
        var mx = (a.x + b.x) / 2;
        var my = (a.y + b.y) / 2;
        var vx = (a.vx + b.vx) / 2;
        var vy = (a.vy + b.vy) / 2 - 60;      // 살짝 튀어오르게

        remove(a); remove(b);
        spawn(mx, my, tier, vx, vy);
        bodies[bodies.length - 1].pop = 1;

        burst(mx, my, FRUITS[tier].c1, tier);
        Sound.merge(tier);

        score += mergeScore(tier);
        merges++;
        if (tier > topTier) {
          topTier = tier;
          if (tier === FRUITS.length - 1) {
            if (ui.toast) ui.toast("수박 완성! 🍉", "ok");
            Sound.blip(880, 0.4, "triangle", 0.12);
          }
        }
      }
      pendingMerges.length = 0;
      paintHud();
    }

    function remove(body) {
      var i = bodies.indexOf(body);
      if (i >= 0) bodies.splice(i, 1);
    }

    function step(dt) {
      var h = dt / SUBSTEPS;
      if (h <= 0) return;

      for (var s = 0; s < SUBSTEPS; s++) {
        // 보정 전 위치를 기억해 둔다
        for (var i = 0; i < bodies.length; i++) {
          bodies[i].px = bodies[i].x;
          bodies[i].py = bodies[i].y;
        }

        integrate(h);
        for (var it = 0; it < ITER; it++) {
          solvePairs();
          solveWalls();
        }

        /*
           위치 보정이 끝난 뒤, 실제로 움직인 거리로 속도를 다시 계산한다.
           이렇게 하지 않으면 쌓여서 멈춘 과일에도 중력이 계속 누적돼
           속도만 끝없이 커진다 (멈춰 있는데 vy 가 300 이 되는 식).
        */
        for (var k = 0; k < bodies.length; k++) {
          var b = bodies[k];
          if (b.px === undefined) continue;
          b.vx = (b.x - b.px) / h;
          b.vy = (b.y - b.py) / h;

          /*
             과일이 깊게 겹친 상태에서 풀리면 보정량이 커져 속도가 폭주한다.
             화면 밖으로 쏘아 올리지 않도록 상한을 둔다.
          */
          var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          if (sp > MAX_V) {
            b.vx = b.vx / sp * MAX_V;
            b.vy = b.vy / sp * MAX_V;
          }
        }

        applyMerges();
      }
    }

    /* ---------- 2-4. 파티클 ---------- */
    function burst(x, y, color, tier) {
      var n = 10 + tier * 2;
      for (var i = 0; i < n; i++) {
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        var sp = 90 + Math.random() * 190 + tier * 12;
        particles.push({
          x: x, y: y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 40,
          life: 1,
          size: 2 + Math.random() * 3.4,
          color: color
        });
      }
    }

    function stepParticles(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.7;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    /* ---------- 2-5. 게임 오버 판정 ---------- */
    function checkOver(now) {
      if (gameOver) return;

      /*
         260ms 마다 각 과일이 실제로 얼마나 움직였는지 표본을 뜬다.
         쌓여서 멈춘 과일도 위치 보정 때문에 속도가 완전히 0 이 되지는 않아서,
         속도가 아니라 '실제 이동량' 으로 판단해야 한다.
         한 번이라도 멈췄으면 더미의 일부로 보고 계속 landed 로 둔다.
      */
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        if (now - b.markAt < 260) continue;
        if (Math.abs(b.y - b.markY) <= 10) b.landed = true;
        b.markY = b.y;
        b.markAt = now;
      }

      var danger = false;
      for (var j = 0; j < bodies.length; j++) {
        var c = bodies[j];
        if (!c.landed) continue;            // 아직 떨어지는 중이면 봐준다
        if (now - c.born < 700) continue;   // 막 떨어뜨린 과일도 봐준다
        if (c.y - c.r < LINE_Y) { danger = true; break; }
      }

      if (!danger) { overSince = 0; return; }
      if (!overSince) { overSince = now; return; }
      if (now - overSince > OVER_DELAY) endGame();
    }

    function endGame() {
      gameOver = true;
      Sound.over();
      if (score > best) {
        best = score;
        store.set("suika:best", best);
        bestEl.textContent = best;
        if (ui.toast) ui.toast("최고 점수 갱신! " + best + "점", "ok");
      }
      host.querySelector("[data-over-score]").textContent = score + " 점 · 합체 " + merges + "회";
      host.querySelector("[data-over-title]").textContent =
        topTier >= FRUITS.length - 1 ? "수박까지 갔습니다!" : FRUITS[topTier].n + "까지 갔습니다";
      overlay.hidden = false;
    }

    function reset() {
      bodies.length = 0;
      particles.length = 0;
      pendingMerges.length = 0;
      score = 0; merges = 0; topTier = 0;
      overSince = 0; gameOver = false;
      curTier = randomTier();
      nextTier = randomTier();
      overlay.hidden = true;
      paintHud();
    }

    /* ---------- 2-6. HUD ---------- */
    function paintHud() {
      scoreEl.textContent = score;
      mergeEl.textContent = merges;
      topEl.textContent = FRUITS[topTier].n;
      nextEl.textContent = FRUITS[nextTier].e;
      for (var i = 0; i < chainItems.length; i++) {
        chainItems[i].setAttribute("data-reached", String(i <= topTier));
      }
    }

    /* ---------- 2-7. 렌더 ---------- */
    function drawFruit(b, alpha) {
      var f = FRUITS[b.tier];
      var r = b.r * (1 + b.pop * 0.14);

      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.translate(b.x, b.y);

      // 몸통
      var g = ctx.createRadialGradient(-r * 0.32, -r * 0.36, r * 0.15, 0, 0, r);
      g.addColorStop(0, f.c1);
      g.addColorStop(1, f.c2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // 테두리
      ctx.strokeStyle = "rgba(0,0,0,.22)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 하이라이트
      ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.5;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;

      // 이모지 (굴러가는 각도 반영)
      ctx.rotate(b.angle);
      ctx.font = (r * 1.05) + "px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.e, 0, r * 0.06);

      ctx.restore();
    }

    function render(now) {
      ctx.clearRect(0, 0, W, H);

      // 통 배경
      var bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "rgba(255,255,255,.04)");
      bg.addColorStop(1, "rgba(255,255,255,.10)");
      ctx.fillStyle = bg;
      roundRect(WALL / 2, WALL / 2, W - WALL, H - WALL, 18);
      ctx.fill();

      // 벽
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = WALL;
      roundRect(WALL / 2, WALL / 2, W - WALL, H - WALL, 18);
      ctx.stroke();

      // 데드라인
      var pulse = overSince ? 0.35 + Math.sin(now / 90) * 0.3 : 0.18;
      ctx.save();
      ctx.setLineDash([7, 7]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = overSince ? "rgba(251,113,133," + pulse + ")" : "rgba(255,255,255,.2)";
      ctx.beginPath();
      ctx.moveTo(WALL, LINE_Y);
      ctx.lineTo(W - WALL, LINE_Y);
      ctx.stroke();
      ctx.restore();

      // 조준선 + 대기 중인 과일
      if (!gameOver) {
        var cr = FRUITS[curTier].r;
        var cx = Math.max(WALL + cr, Math.min(W - WALL - cr, aimX));

        ctx.save();
        ctx.setLineDash([3, 8]);
        ctx.strokeStyle = "rgba(34,211,238,.35)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, 46 + cr);
        ctx.lineTo(cx, H - WALL);
        ctx.stroke();
        ctx.restore();

        drawFruit({ x: cx, y: 46, r: cr, tier: curTier, angle: 0, pop: 0 }, 0.94);
      }

      // 과일들
      for (var i = 0; i < bodies.length; i++) drawFruit(bodies[i]);

      // 파티클
      for (var p, k = 0; k < particles.length; k++) {
        p = particles[k];
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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

    /* ---------- 2-8. 루프 ---------- */
    var last = performance.now();

    function loop(now) {
      if (!running) return;
      var dt = Math.min((now - last) / 1000, 1 / 30);   // 탭 전환 대비 상한
      last = now;

      if (!gameOver) {
        step(dt);
        checkOver(now);
      }
      stepParticles(dt);
      render(now);

      global.requestAnimationFrame(loop);
    }
    global.requestAnimationFrame(loop);

    /* ---------- 2-9. 입력 ---------- */
    function toLocalX(clientX) {
      var rect = canvas.getBoundingClientRect();
      return (clientX - rect.left) / rect.width * W;
    }

    function drop() {
      var now = performance.now();
      if (gameOver || now - lastDrop < DROP_COOLDOWN) return;
      lastDrop = now;

      var r = FRUITS[curTier].r;
      var x = Math.max(WALL + r, Math.min(W - WALL - r, aimX));
      spawn(x, 46, curTier, 0, 30);
      Sound.drop();

      curTier = nextTier;
      nextTier = randomTier();
      paintHud();
    }

    stage.addEventListener("pointermove", function (e) {
      aimX = toLocalX(e.clientX);
    });
    stage.addEventListener("pointerdown", function (e) {
      aimX = toLocalX(e.clientX);
      // 오버레이 위 클릭은 무시
      if (!overlay.hidden) return;
      drop();
    });

    // 키보드 조작 — 접근성
    canvas.setAttribute("tabindex", "0");
    stage.addEventListener("keydown", function (e) {
      var r = FRUITS[curTier].r;
      if (e.key === "ArrowLeft") { aimX = Math.max(WALL + r, aimX - 14); e.preventDefault(); }
      else if (e.key === "ArrowRight") { aimX = Math.min(W - WALL - r, aimX + 14); e.preventDefault(); }
      else if (e.key === " " || e.key === "Enter") { drop(); e.preventDefault(); }
    });

    host.querySelector("[data-reset]").addEventListener("click", reset);
    host.querySelector("[data-restart]").addEventListener("click", reset);

    var soundBtn = host.querySelector("[data-sound]");
    soundBtn.setAttribute("aria-pressed", String(Sound.on));
    soundBtn.textContent = Sound.on ? "🔊 소리" : "🔇 소리";
    soundBtn.addEventListener("click", function () {
      var on = Sound.toggle();
      soundBtn.setAttribute("aria-pressed", String(on));
      soundBtn.textContent = on ? "🔊 소리" : "🔇 소리";
    });

    // 화면 밖으로 나가면 잠시 멈춘다 (배터리 절약)
    if ("IntersectionObserver" in global) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !running) {
            running = true; last = performance.now();
            global.requestAnimationFrame(loop);
          } else if (!en.isIntersecting) {
            running = false;
          }
        });
      }, { threshold: 0.05 }).observe(host);
    }

    paintHud();

    return { reset: reset, bodies: bodies };
  }

  /* 3. 자동 배선 */
  function bind() {
    var hosts = doc.querySelectorAll("[data-suika]");
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  global.HJ = global.HJ || {};
  global.HJ.suika = { mount: mount, FRUITS: FRUITS };
})(window);
