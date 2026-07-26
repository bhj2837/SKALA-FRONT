/*
   script/tripMap.js
   myTrip.html 의 인터랙티브 동아시아 지도.
   외부 지도 라이브러리를 쓰지 않고, 위경도 좌표 배열 → 자체 투영 →
   Canvas 2D 렌더링까지 직접 구현했다.

   · 간략화한 해안선 폴리곤 (한반도 / 제주 / 대만 / 일본 4개 섬)
   · Point-in-Polygon 판정으로 육지를 도트 매트릭스로 채운다
   · 방문 도시를 시간순으로 잇는 애니메이션 여행 경로 (베지에 곡선)
   · 도시 핀 hover 툴팁 / click → 해당 카드로 스크롤 + 하이라이트
   · 레이더 스캔 라인, 위경도 그래티큘, 테마 대응
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var canvas = doc.getElementById("trip-map");
  if (!canvas) return;

  var stage = canvas.parentElement;
  var tooltip = doc.getElementById("map-tooltip");
  var reduceMotion = global.matchMedia &&
    global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. 지리 데이터 — [경도, 위도] 쌍의 간략화된 해안선 */
  var LANDS = {
    korea: [
      [124.4,39.8],[125.0,39.6],[125.4,38.7],[126.0,38.3],[126.6,37.8],[126.4,37.0],
      [126.5,36.5],[126.2,36.1],[126.5,35.6],[126.4,35.0],[126.7,34.4],[127.3,34.3],
      [127.8,34.9],[128.4,34.8],[129.0,35.1],[129.4,35.5],[129.4,36.0],[129.5,36.6],
      [129.4,37.3],[129.0,37.6],[128.4,38.3],[128.2,38.6],[128.6,39.2],[128.0,39.9],
      [127.5,39.8],[127.4,39.3],[126.5,39.6],[125.5,39.9]
    ],
    jeju: [
      [126.15,33.35],[126.30,33.55],[126.70,33.55],[126.95,33.45],
      [126.85,33.25],[126.50,33.18],[126.20,33.24]
    ],
    taiwan: [
      [121.00,25.30],[121.60,25.15],[121.90,24.90],[121.85,24.30],[121.50,23.50],
      [121.00,22.70],[120.80,22.00],[120.50,22.30],[120.20,22.80],[120.10,23.50],
      [120.50,24.30],[120.80,25.00]
    ],
    honshu: [
      [130.95,34.40],[131.50,34.40],[132.50,34.30],[133.50,34.50],[134.60,34.70],
      [135.40,34.70],[136.00,34.60],[136.90,34.60],[137.50,34.60],[138.30,34.60],
      [138.90,34.60],[139.60,35.00],[140.10,35.20],[140.40,35.70],[140.90,35.70],
      [140.60,36.40],[141.00,37.00],[141.00,38.30],[141.60,38.30],[141.50,39.00],
      [142.10,39.50],[141.90,40.50],[141.40,41.00],[140.80,41.50],[140.30,41.20],
      [140.30,40.50],[139.80,39.90],[140.00,39.00],[139.70,38.30],[139.00,37.90],
      [138.30,37.20],[137.30,36.80],[137.00,36.80],[136.70,37.40],[136.60,36.60],
      [136.00,36.30],[135.40,35.60],[134.60,35.60],[133.50,35.60],[132.60,35.50],
      [131.70,35.40],[131.00,34.90]
    ],
    kyushu: [
      [130.90,33.90],[131.70,33.60],[131.90,33.30],[131.50,33.00],[131.40,32.50],
      [131.30,31.60],[130.90,31.20],[130.60,31.30],[130.20,31.40],[130.20,32.00],
      [129.70,32.60],[130.00,33.00],[129.90,33.50],[130.40,33.90]
    ],
    shikoku: [
      [133.90,34.40],[134.60,34.20],[134.70,33.90],[134.20,33.60],[133.50,33.50],
      [132.90,33.00],[132.50,33.20],[132.60,33.90],[133.20,34.30]
    ],
    hokkaido: [
      [140.50,42.30],[140.60,41.80],[141.20,42.30],[141.70,42.60],[142.90,42.30],
      [143.30,42.30],[143.90,42.90],[144.40,42.90],[145.30,43.30],[145.80,43.40],
      [145.40,44.00],[144.70,43.90],[143.90,44.30],[142.60,44.70],[141.70,45.40],
      [141.60,44.70],[141.30,43.90],[140.50,43.40],[140.00,42.90],[139.80,42.60]
    ]
  };

  /*
     2. 방문지 데이터 — 여행 순서대로
     id는 myTrip.html의 [data-trip="..."] 카드와 연결된다
  */
  var PLACES = [
    { id: "gyeongju",  name: "경주",     en: "Gyeongju",  country: "KR", lat: 35.8562, lon: 129.2247, year: "2019", note: "천년 고도" },
    { id: "busan",     name: "부산",     en: "Busan",     country: "KR", lat: 35.1796, lon: 129.0756, year: "2021", note: "바다와 야경" },
    { id: "jeju",      name: "제주도",   en: "Jeju",      country: "KR", lat: 33.4996, lon: 126.5312, year: "2022", note: "화산섬" },
    { id: "gangneung", name: "강릉",     country: "KR",   en: "Gangneung", lat: 37.7519, lon: 128.8761, year: "2023", note: "동해와 커피" },
    { id: "osaka",     name: "오사카",   en: "Osaka",     country: "JP", lat: 34.6937, lon: 135.5023, year: "2024", note: "먹부림의 성지" },
    { id: "kyoto",     name: "교토",     en: "Kyoto",     country: "JP", lat: 35.0116, lon: 135.7681, year: "2024", note: "천 개의 도리이" },
    { id: "taipei",    name: "타이베이", en: "Taipei",    country: "TW", lat: 25.0330, lon: 121.5654, year: "2025", note: "야시장과 온천" },
    { id: "kaohsiung", name: "가오슝",   en: "Kaohsiung", country: "TW", lat: 22.6273, lon: 120.3014, year: "2025", note: "남국의 항구" }
  ];

  var HOME = { id: "seoul", name: "서울", en: "Seoul", country: "KR", lat: 37.5665, lon: 126.9780, home: true };

  /* 3. 투영 (Equirectangular + 경도 보정) 및 화면 맞춤 */
  var BOUNDS = { lonMin: 119.0, lonMax: 146.5, latMin: 21.0, latMax: 46.0 };
  var LON_SCALE = Math.cos(((BOUNDS.latMin + BOUNDS.latMax) / 2) * Math.PI / 180);

  var view = { w: 0, h: 0, scale: 1, offX: 0, offY: 0, dpr: 1 };

  function computeView(w, h) {
    var pad = Math.min(w, h) * 0.07;
    var gw = (BOUNDS.lonMax - BOUNDS.lonMin) * LON_SCALE;
    var gh = BOUNDS.latMax - BOUNDS.latMin;
    var scale = Math.min((w - pad * 2) / gw, (h - pad * 2) / gh);
    view.w = w; view.h = h; view.scale = scale;
    view.offX = (w - gw * scale) / 2;
    view.offY = (h - gh * scale) / 2;
  }

  function project(lon, lat) {
    return {
      x: view.offX + (lon - BOUNDS.lonMin) * LON_SCALE * view.scale,
      y: view.offY + (BOUNDS.latMax - lat) * view.scale
    };
  }

  /* 4. Point-in-Polygon (Ray casting) — 육지 판정 */
  function inPolygon(lon, lat, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1];
      var xj = poly[j][0], yj = poly[j][1];
      var intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function isLand(lon, lat) {
    for (var key in LANDS) {
      if (Object.prototype.hasOwnProperty.call(LANDS, key) && inPolygon(lon, lat, LANDS[key])) return true;
    }
    return false;
  }

  /* 육지 도트 캐시 — 리사이즈할 때만 재계산 */
  var dots = [];

  function buildDots() {
    dots = [];
    var stepPx = view.w < 620 ? 7 : 6;                    // 화면 픽셀 기준 간격
    var stepDeg = stepPx / view.scale;                     // 위도 단위 간격
    var stepLon = stepDeg / LON_SCALE;
    for (var lat = BOUNDS.latMin; lat <= BOUNDS.latMax; lat += stepDeg) {
      for (var lon = BOUNDS.lonMin; lon <= BOUNDS.lonMax; lon += stepLon) {
        if (isLand(lon, lat)) {
          var p = project(lon, lat);
          dots.push({ x: p.x, y: p.y, lat: lat, lon: lon });
        }
      }
    }
  }

  /* 5. 색상 (테마 대응) */
  function palette() {
    var light = doc.documentElement.getAttribute("data-theme") === "light";
    return light ? {
      dot: "rgba(71,85,105,.42)",
      dotHot: "rgba(79,70,229,.7)",
      coast: "rgba(71,85,105,.34)",
      grid: "rgba(100,116,139,.13)",
      route: "79,70,229",
      pin: "#4f46e5",
      pinHome: "#155e75",
      label: "rgba(30,41,59,.9)",
      scan: "rgba(79,70,229,.07)"
    } : {
      dot: "rgba(148,163,184,.3)",
      dotHot: "rgba(34,211,238,.55)",
      coast: "rgba(148,163,184,.26)",
      grid: "rgba(148,163,184,.09)",
      route: "34,211,238",
      pin: "#22d3ee",
      pinHome: "#e879f9",
      label: "rgba(238,241,247,.92)",
      scan: "rgba(34,211,238,.055)"
    };
  }

  /* 6. 렌더링 */
  // Canvas 2D 미지원이면 지도를 포기한다. 아래의 방문지 목록은 그대로 남는다.
  var ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return;

  var mouse = { x: -9999, y: -9999, inside: false };
  var hovered = null;
  var t0 = performance.now();

  function resize() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (!w || !h) return;
    view.dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = w * view.dpr;
    canvas.height = h * view.dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    computeView(w, h);
    buildDots();
  }

  /* 두 점 사이를 살짝 휘게 잇는 곡선 (비행 경로 느낌) */
  function arcPath(a, b) {
    var mx = (a.x + b.x) / 2;
    var my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    // 수직 방향으로 길이의 18% 만큼 밀어 제어점을 만든다
    var nx = -dy / (len || 1), ny = dx / (len || 1);
    return { cx: mx + nx * len * 0.18, cy: my + ny * len * 0.18 };
  }

  function draw(now) {
    global.requestAnimationFrame(draw);
    if (!view.w) return;

    var t = reduceMotion ? 0 : (now - t0) / 1000;
    var pal = palette();

    ctx.clearRect(0, 0, view.w, view.h);

    /* --- 위경도 그래티큘 --- */
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (var lat = 25; lat <= 45; lat += 5) {
      var py = project(BOUNDS.lonMin, lat).y;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(view.w, py); ctx.stroke();
    }
    for (var lon = 120; lon <= 145; lon += 5) {
      var px = project(lon, BOUNDS.latMin).x;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, view.h); ctx.stroke();
    }

    /* --- 레이더 스캔 (좌→우로 지나가는 빛) --- */
    if (!reduceMotion) {
      var sweep = ((t * 0.11) % 1.35) * view.w - view.w * 0.18;
      var grad = ctx.createLinearGradient(sweep - 130, 0, sweep + 130, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, pal.scan);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    /* --- 육지 도트 매트릭스 --- */
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      // 마우스 근처의 도트는 밝아지고 살짝 커진다
      var dx = d.x - mouse.x, dy = d.y - mouse.y;
      var dist2 = dx * dx + dy * dy;
      var near = mouse.inside && dist2 < 12000;
      var k = near ? 1 - dist2 / 12000 : 0;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.15 + k * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = near ? pal.dotHot : pal.dot;
      ctx.fill();
    }

    /* --- 해안선 --- */
    ctx.strokeStyle = pal.coast;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    for (var key in LANDS) {
      if (!Object.prototype.hasOwnProperty.call(LANDS, key)) continue;
      var poly = LANDS[key];
      ctx.beginPath();
      for (var v = 0; v < poly.length; v++) {
        var pp = project(poly[v][0], poly[v][1]);
        if (v === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    /* --- 여행 경로 (시간순, 흐르는 점선) --- */
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -t * 24;
    for (var r = 0; r < PLACES.length - 1; r++) {
      var A = project(PLACES[r].lon, PLACES[r].lat);
      var B = project(PLACES[r + 1].lon, PLACES[r + 1].lat);
      var c = arcPath(A, B);
      var alpha = 0.16 + 0.2 * (r / PLACES.length);
      ctx.strokeStyle = "rgba(" + pal.route + "," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(c.cx, c.cy, B.x, B.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* --- 도시 핀 --- */
    var all = PLACES.concat([HOME]);
    for (var m = 0; m < all.length; m++) {
      var city = all[m];
      var p = project(city.lon, city.lat);
      var isHover = hovered && hovered.id === city.id;
      var color = city.home ? pal.pinHome : pal.pin;

      // 펄스 링
      var phase = (t * 0.75 + m * 0.4) % 2;
      if (phase < 1.25 && !reduceMotion) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 + phase * 16, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(" + pal.route + "," + (0.3 * (1 - phase / 1.25)).toFixed(3) + ")";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 외곽 글로우
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHover ? 13 : 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + pal.route + ",.13)";
      ctx.fill();

      // 본체
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHover ? 6 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = doc.documentElement.getAttribute("data-theme") === "light"
        ? "rgba(255,255,255,.95)" : "rgba(4,5,7,.85)";
      ctx.stroke();

      // 라벨
      ctx.font = (isHover ? "600 " : "500 ") + (isHover ? 13 : 11.5) +
        "px 'Noto Sans KR', system-ui, sans-serif";
      ctx.fillStyle = pal.label;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      var lx = p.x + (isHover ? 12 : 9);
      // 오른쪽 여백이 부족하면 왼쪽에 그린다
      if (lx + ctx.measureText(city.name).width > view.w - 6) {
        ctx.textAlign = "right";
        lx = p.x - (isHover ? 12 : 9);
      }
      ctx.fillText(city.name, lx, p.y);
    }
  }

  /* 7. 인터랙션 */
  function hitTest(mx, my) {
    var all = PLACES.concat([HOME]);
    var best = null, bestD = 20;
    for (var i = 0; i < all.length; i++) {
      var p = project(all[i].lon, all[i].lat);
      var d = Math.sqrt(Math.pow(p.x - mx, 2) + Math.pow(p.y - my, 2));
      if (d < bestD) { bestD = d; best = all[i]; }
    }
    return best;
  }

  function showTooltip(city) {
    if (!tooltip) return;
    if (!city) { tooltip.setAttribute("data-show", "false"); return; }
    var p = project(city.lon, city.lat);
    tooltip.innerHTML = "<strong>" + city.name + "</strong>" +
      '<span class="muted">' + (city.home ? "출발지 · Home" : city.year + " · " + city.note) + "</span>";
    tooltip.style.left = p.x + "px";
    tooltip.style.top = p.y + "px";
    tooltip.setAttribute("data-show", "true");
  }

  canvas.addEventListener("mousemove", function (e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.inside = true;
    var hit = hitTest(mouse.x, mouse.y);
    if ((hit && hit.id) !== (hovered && hovered.id)) {
      hovered = hit;
      showTooltip(hit);
      canvas.style.cursor = hit ? "pointer" : "crosshair";
    }
  });

  canvas.addEventListener("mouseleave", function () {
    mouse.inside = false;
    mouse.x = mouse.y = -9999;
    hovered = null;
    showTooltip(null);
  });

  canvas.addEventListener("click", function () {
    if (!hovered || hovered.home) return;
    focusPlace(hovered.id);
  });

  /* 터치: 탭한 위치에서 가장 가까운 핀 선택 */
  canvas.addEventListener("touchstart", function (e) {
    if (!e.touches.length) return;
    var r = canvas.getBoundingClientRect();
    var tx = e.touches[0].clientX - r.left;
    var ty = e.touches[0].clientY - r.top;
    var hit = hitTest(tx, ty);
    if (hit) {
      hovered = hit;
      showTooltip(hit);
      if (!hit.home) focusPlace(hit.id);
    }
  }, { passive: true });

  /* * 해당 여행 카드로 스크롤 + 하이라이트 */
  function focusPlace(id) {
    var card = doc.querySelector('[data-trip="' + id + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    card.setAttribute("data-focus", "true");
    global.setTimeout(function () { card.removeAttribute("data-focus"); }, 1800);
    doc.dispatchEvent(new CustomEvent("trip:select", { detail: { id: id } }));
  }

  /* HUD 칩 ↔ 지도 연동 */
  Array.prototype.forEach.call(doc.querySelectorAll("[data-trip-jump]"), function (chip) {
    var id = chip.getAttribute("data-trip-jump");
    chip.addEventListener("click", function () { focusPlace(id); });
    chip.addEventListener("mouseenter", function () {
      var found = PLACES.filter(function (p) { return p.id === id; })[0];
      if (found) { hovered = found; showTooltip(found); }
    });
    chip.addEventListener("mouseleave", function () { hovered = null; showTooltip(null); });
  });

  /* BOOT */
  resize();
  if (global.ResizeObserver) new ResizeObserver(resize).observe(stage);
  global.addEventListener("resize", resize);
  global.requestAnimationFrame(draw);

  global.HJ = global.HJ || {};
  global.HJ.tripMap = { places: PLACES, focus: focusPlace, home: HOME };
})(window);
