/*
   script/hero3d.js
   index.html 히어로 영역의 배경 그래픽.

   [본편] Three.js(CDN)가 도착하면 → WebGL 3D 씬
   · 와이어프레임 이코사헤드론 (회전)
   · 안쪽 코어 구체 (발광)
   · 4,000개 파티클 성단
   · 궤도를 도는 위성 큐브 3개
   · 마우스 시차(parallax) + 스크롤 반응
   · 테마 전환 시 색상 실시간 변경

   [대역] 아직 안 왔거나 끝내 안 오면 → Canvas 2D 별자리 파티클
   Three.js 는 600KB 가 넘어서 기다리는 동안 배경이 비어 보인다.
   그래서 가벼운 2D 를 먼저 깔고, 3D 가 도착하면 갈아끼운다.
   CDN 이 막힌 사내망이나 오프라인에서도 화면이 비지 않는다.
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var canvas = doc.getElementById("hero-canvas");
  if (!canvas) return;

  var reduceMotion = global.matchMedia &&
    global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 테마별 팔레트 */
  function palette() {
    var light = doc.documentElement.getAttribute("data-theme") === "light";
    return light
      ? { a: 0x155e75, b: 0x4f46e5, c: 0xa21caf, dust: 0x64748b, dustOpacity: 0.75 }
      : { a: 0x22d3ee, b: 0x818cf8, c: 0xe879f9, dust: 0xaab4d4, dustOpacity: 0.6 };
  }

  /* A. WebGL 씬 (Three.js) */
  function initThree(cv) {
    var THREE = global.THREE;
    var pal = palette();

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 0, 15);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    } catch (e) {
      return false;   // WebGL 미지원 → 폴백
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));

    /* ---- 조명 ---- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var key = new THREE.PointLight(pal.a, 2.4, 60);
    key.position.set(9, 7, 11);
    scene.add(key);
    var rim = new THREE.PointLight(pal.c, 1.9, 60);
    rim.position.set(-10, -6, 7);
    scene.add(rim);

    /* ---- 그룹 (전체를 함께 회전) ---- */
    var world = new THREE.Group();
    scene.add(world);

    /* ---- 1) 와이어프레임 다면체 ---- */
    var shellGeo = new THREE.IcosahedronGeometry(4.4, 1);
    var shell = new THREE.LineSegments(
      new THREE.WireframeGeometry(shellGeo),
      new THREE.LineBasicMaterial({ color: pal.a, transparent: true, opacity: 0.34 })
    );
    world.add(shell);

    /* ---- 2) 정점 노드 (다면체 꼭짓점에 작은 점) ---- */
    var nodes = new THREE.Points(
      shellGeo,
      new THREE.PointsMaterial({ color: pal.b, size: 0.14, transparent: true, opacity: 0.9 })
    );
    world.add(nodes);

    /* ---- 3) 안쪽 코어 ---- */
    var core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.75, 2),
      new THREE.MeshStandardMaterial({
        color: pal.b,
        emissive: pal.a,
        emissiveIntensity: 0.5,
        metalness: 0.85,
        roughness: 0.22,
        flatShading: true
      })
    );
    world.add(core);

    /* ---- 4) 파티클 성단 (구 껍질에 균일 분포) ---- */
    var COUNT = 4000;
    var pos = new Float32Array(COUNT * 3);
    for (var i = 0; i < COUNT; i++) {
      var r = 7 + Math.pow(Math.random(), 0.65) * 17;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.62;   // 살짝 납작하게 → 은하 느낌
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: pal.dust,
      size: 0.075,
      transparent: true,
      opacity: pal.dustOpacity,
      sizeAttenuation: true,
      depthWrite: false
    }));
    scene.add(dust);

    /* ---- 5) 궤도 위성 ---- */
    var sats = [];
    var satColors = [pal.a, pal.c, pal.b];
    for (var s = 0; s < 3; s++) {
      var m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({
          color: satColors[s], emissive: satColors[s], emissiveIntensity: 0.75,
          metalness: 0.6, roughness: 0.3, flatShading: true
        })
      );
      m.userData = {
        radius: 6.6 + s * 1.5,
        speed: 0.34 - s * 0.075,
        offset: (s * Math.PI * 2) / 3,
        tilt: 0.35 + s * 0.42
      };
      world.add(m);
      sats.push(m);
    }

    /* ---- 리사이즈 ---- */
    function resize() {
      var w = cv.clientWidth || cv.parentElement.clientWidth;
      var h = cv.clientHeight || cv.parentElement.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      // 좁은 화면에서는 카메라를 뒤로 빼서 오브젝트가 잘리지 않게
      camera.position.z = w < 700 ? 20 : 15;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    resize();
    if (global.ResizeObserver) new ResizeObserver(resize).observe(cv.parentElement || cv);
    global.addEventListener("resize", resize);

    /* ---- 마우스 시차 ---- */
    var mx = 0, my = 0, cx = 0, cy = 0;
    global.addEventListener("mousemove", function (e) {
      mx = (e.clientX / global.innerWidth) * 2 - 1;
      my = (e.clientY / global.innerHeight) * 2 - 1;
    }, { passive: true });

    /* ---- 스크롤에 따른 감쇠 (히어로가 화면을 벗어나면 렌더 중지) ---- */
    var visible = true;
    if ("IntersectionObserver" in global) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0 })
        .observe(cv.parentElement || cv);
    }

    /* ---- 테마 전환 시 색 교체 ---- */
    doc.addEventListener("hj:theme", function () {
      var p = palette();
      shell.material.color.setHex(p.a);
      nodes.material.color.setHex(p.b);
      core.material.color.setHex(p.b);
      core.material.emissive.setHex(p.a);
      dust.material.color.setHex(p.dust);
      dust.material.opacity = p.dustOpacity;
      key.color.setHex(p.a);
      rim.color.setHex(p.c);
      var pc = [p.a, p.c, p.b];
      sats.forEach(function (m, idx) {
        m.material.color.setHex(pc[idx]);
        m.material.emissive.setHex(pc[idx]);
      });
    });

    /* ---- 렌더 루프 ---- */
    var clock = new THREE.Clock();
    (function tick() {
      global.requestAnimationFrame(tick);
      if (!visible) return;

      var t = clock.getElapsedTime();
      var dt = reduceMotion ? 0 : 1;

      // 마우스를 부드럽게 추적
      cx += (mx - cx) * 0.045;
      cy += (my - cy) * 0.045;

      world.rotation.y = t * 0.09 * dt + cx * 0.5;
      world.rotation.x = Math.sin(t * 0.16) * 0.13 * dt + cy * 0.3;

      core.rotation.y = -t * 0.34 * dt;
      core.rotation.x = t * 0.22 * dt;
      var pulse = 1 + Math.sin(t * 1.5) * 0.05 * dt;
      core.scale.set(pulse, pulse, pulse);
      core.material.emissiveIntensity = 0.42 + Math.sin(t * 1.9) * 0.2 * dt;

      dust.rotation.y = -t * 0.022 * dt;
      dust.rotation.z = t * 0.008 * dt;

      sats.forEach(function (m) {
        var d = m.userData;
        var a = t * d.speed * dt + d.offset;
        m.position.set(
          Math.cos(a) * d.radius,
          Math.sin(a * 1.3) * d.radius * 0.3 * Math.sin(d.tilt),
          Math.sin(a) * d.radius
        );
        m.rotation.x = a * 1.6;
        m.rotation.y = a * 1.15;
      });

      camera.position.x = cx * 1.5;
      camera.position.y = -cy * 1.0;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    })();

    cv.setAttribute("data-engine", "webgl");
    return true;
  }

  /* B. Canvas 2D 폴백 — 별자리 파티클 네트워크 */
  function initFallback(cv) {
    var ctx = cv.getContext("2d");
    if (!ctx) return null;

    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var pts = [];
    var mouse = { x: -9999, y: -9999 };
    var alive = true;          // 3D 가 뒤늦게 도착하면 false 로 바뀐다

    function resize() {
      if (!alive) return;
      var host = cv.parentElement || cv;
      W = host.clientWidth;
      H = host.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = W + "px";
      cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var n = Math.round(Math.min(120, (W * H) / 12000));
      pts = [];
      for (var i = 0; i < n; i++) {
        pts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.32,
          vy: (Math.random() - 0.5) * 0.32,
          r: Math.random() * 1.7 + 0.7
        });
      }
    }
    resize();
    global.addEventListener("resize", resize);
    global.addEventListener("mousemove", function (e) {
      if (!alive) return;
      var r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    }, { passive: true });

    function colors() {
      var light = doc.documentElement.getAttribute("data-theme") === "light";
      return light
        ? { dot: "rgba(79,70,229,.75)", line: "79,70,229" }
        : { dot: "rgba(34,211,238,.8)", line: "34,211,238" };
    }

    (function frame() {
      if (!alive) return;                 // 멈추면 rAF 를 다시 걸지 않는다
      global.requestAnimationFrame(frame);
      var c = colors();
      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!reduceMotion) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;

        // 마우스가 가까우면 밀어낸다
        var dxm = p.x - mouse.x, dym = p.y - mouse.y;
        var dm = Math.sqrt(dxm * dxm + dym * dym);
        if (dm < 130 && dm > 0.1) {
          p.x += (dxm / dm) * 0.8;
          p.y += (dym / dm) * 0.8;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = c.dot;
        ctx.fill();

        for (var j = i + 1; j < pts.length; j++) {
          var q = pts[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 19000) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = "rgba(" + c.line + "," + (0.2 * (1 - d2 / 19000)).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    })();

    cv.setAttribute("data-engine", "canvas2d");

    // 3D 로 갈아탈 때 부르는 정지 스위치
    return function stop() { alive = false; };
  }

  /*
     BOOT — 가벼운 것부터 띄우고, 무거운 것은 도착하면 갈아끼운다
     Three.js 는 async 로 받는다. 페이지가 그걸 기다리지 않고 넘어가므로
     이 파일이 먼저 실행되는 경우가 대부분이다. 그때 빈 화면을 보여 주지
     않으려고, 일단 2D 배경을 깔고 시작한다.

     Three.js 가 도착하면 3D 로 바꿔 단다. 캔버스 하나에 2D 와 WebGL 을
     같이 쓸 수는 없어서, 새 캔버스를 옆에 만들어 3D 를 그린 다음 헌 것을
     서서히 지운다. 갈아타는 순간이 눈에 띄지 않게 하려는 것이다.

     아주 빠른 회선이나 캐시가 있을 때는 2D 가 한 번 깜빡이고 지나가면
     오히려 어수선하다. 그래서 0.3초는 그냥 기다려 본다.
  */
  function makeCanvas() {
    var next = doc.createElement("canvas");
    next.className = canvas.className;
    next.setAttribute("aria-hidden", "true");
    // 처음 뜰 때 쓰는 등장 애니메이션은 끈다. 겹치면 배경이 한 번 어두워진다.
    next.style.animation = "none";
    // 헌 캔버스보다 앞에 넣어 아래에 깔린다. 위에 있는 헌 것을 지우면 드러난다.
    canvas.parentNode.insertBefore(next, canvas);
    return next;
  }

  function upgrade(stop2d) {
    var next = makeCanvas();
    if (!initThree(next)) {          // WebGL 이 안 되는 기기 — 2D 를 그냥 둔다
      next.parentNode.removeChild(next);
      return;
    }
    // Three.js 가 0.3초 안에 도착한 경우. 헌 캔버스에는 아직 아무것도
    // 안 그렸으니 서서히 지울 필요 없이 바로 치우고, 첫 등장 페이드인을 살린다.
    if (!stop2d) {
      next.style.animation = "";
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      next.id = "hero-canvas";
      return;
    }

    // 2D 가 이미 돌고 있던 경우. 갈아타는 게 눈에 띄지 않게 서서히 지운다.
    stop2d();
    canvas.style.transition = "opacity .5s ease";
    canvas.style.opacity = "0";
    global.setTimeout(function () {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      next.id = "hero-canvas";
    }, 520);
  }

  if (global.THREE) {
    if (!initThree(canvas)) initFallback(canvas);
  } else {
    var handedOver = false;
    var stop2d = null;

    /* Three.js 가 왔을 때 한 번만 실행 */
    function onThree() {
      if (handedOver || !global.THREE) return;
      handedOver = true;
      upgrade(stop2d);
    }

    var tag = doc.getElementById("three-cdn");
    if (tag) {
      tag.addEventListener("load", onThree);
      // error 는 차단·404. 이 경우엔 2D 그대로 두면 되니 할 일이 없다.
    }

    global.setTimeout(function () {
      if (handedOver) return;
      if (global.THREE) { onThree(); return; }
      stop2d = initFallback(canvas);
    }, 300);
  }
})(window);
