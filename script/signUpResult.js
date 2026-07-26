/*
   script/signUpResult.js — 회원가입 완료 화면

   가입 폼이 GET 으로 넘긴 쿼리스트링을 읽어 회원 카드와 표를 채운다.
   비밀번호는 애초에 전송되지 않지만, 주소를 직접 고쳐서 들어오는 경우를
   대비해 화면에 찍히는 값과 주소 모두에서 한 번 더 가린다.
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var ui = (global.HJ && global.HJ.ui) || {};
  var toast = ui.toast || function () {};
  var $ = function (s) { return doc.querySelector(s); };

  /* 1. 쿼리스트링 파싱 */
  var q = new URLSearchParams(global.location.search);

  // 비밀번호는 화면에 절대 그대로 노출하지 않는다
  var HIDDEN = { password: true };

  // 파라미터 → 사람이 읽는 이름 / 구분
  var META = {
    userid:    ["아이디",              "계정"],
    password:  ["비밀번호",            "계정"],
    name:      ["이름",                "회원 정보"],
    nickname:  ["닉네임",              "회원 정보"],
    email:     ["이메일",              "회원 정보"],
    phone:     ["휴대폰",              "회원 정보"],
    birth:     ["생년월일",            "회원 정보"],
    gender:    ["성별",                "회원 정보"],
    interest:  ["관심 있는 것",         "추가"],
    from:      ["가입 경로",           "추가"],
    intro:     ["한 줄 소개",          "추가"],
    terms:     ["이용약관",            "약관"],
    privacy:   ["개인정보 수집·이용",   "약관"],
    age:       ["만 14세 이상",        "약관"],
    marketing: ["소식 받기",           "약관"]
  };

  var keys = [];
  q.forEach(function (v, k) { if (keys.indexOf(k) === -1) keys.push(k); void v; });
  var hasData = keys.length > 0;

  /* 2. 값이 없을 때 — 안내 모드로 전환 */
  if (!hasData) {
    var title = $("[data-result-title]");
    var lead = $("[data-result-lead]");
    if (title) title.textContent = "아직 가입한 내용이 없습니다";
    if (lead) {
      lead.innerHTML = "이 화면은 <a href=\"signUp.html\">회원가입</a>을 마치고 나면 " +
        "채워집니다. 먼저 가입 화면을 채워 주세요.";
    }
    var note = $("[data-r-empty]");
    if (note) note.style.display = "";
    var card = $("#member-card");
    if (card) card.style.opacity = ".45";
  }

  /* 3. 멤버십 카드 채우기 */
  function text(sel, value, fallback) {
    var el = $(sel);
    if (!el) return;
    el.textContent = (value && String(value).trim()) ? value : (fallback || "—");
  }

  var displayName = (q.get("nickname") || q.get("name") || "").trim();
  var realName = (q.get("name") || "").trim();

  text("[data-r-name]", displayName, "이름 없음");

  /* 닉네임으로 크게 띄운 경우, 본명도 작게 함께 보여 준다 */
  if (realName && displayName && realName !== displayName) {
    var nameEl = $("[data-r-name]");
    if (nameEl) {
      var sub = doc.createElement("span");
      sub.className = "muted";
      sub.style.cssText = "font-size:var(--fs-sm); font-weight:500; margin-left:.5rem";
      // 앞의 빈칸은 화면 낭독기에서 두 이름이 붙어 읽히지 않게 하려는 것
      sub.textContent = " " + realName;
      nameEl.appendChild(sub);
    }
  }

  text("[data-r-email]", q.get("email"), "이메일 없음");
  text("[data-r-userid]", q.get("userid"), "—");

  /* 가입일 — 이 화면을 연 날. 서버가 없으니 그날그날이 가입일이다. */
  var now = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  text("[data-r-joined]",
    hasData ? pad(now.getMonth() + 1) + "." + pad(now.getDate()) : "",
    "—");

  /* 등급 — 채운 항목이 많을수록 성의 있다고 보고 올려 준다 */
  var GRADES = ["새싹", "일반", "성실", "열심"];
  var filled = 0;
  ["nickname", "phone", "birth", "interest", "from", "intro", "marketing"].forEach(function (k) {
    if ((q.get(k) || "").trim()) filled++;
  });
  text("[data-r-grade]", hasData ? GRADES[Math.min(GRADES.length - 1, Math.floor(filled / 2))] : "", "—");

  var intro = (q.get("intro") || "").trim();
  text("[data-r-intro]", intro, "적어 주신 소개가 없습니다.");

  var avatar = $("[data-r-avatar]");
  if (avatar) avatar.textContent = displayName ? displayName.charAt(0).toUpperCase() : "?";

  // 아이디·이메일을 섞어 회원 번호를 만든다 (같은 입력 → 같은 번호)
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }
  var seed = (q.get("userid") || realName) + "|" + (q.get("email") || "");
  var memberNo = hasData ? "#" + String(hash(seed) % 9000 + 1000) : "—";
  text("[data-r-id]", memberNo, "—");

  if (hasData && displayName) {
    doc.title = displayName + "님, 가입 완료";
    var t2 = $("[data-result-title]");
    if (t2) t2.textContent = displayName + "님, 환영합니다";
  }

  /* 4. 넘어온 값 전체 표 */
  var tbody = $("[data-r-table]");
  if (tbody && hasData) {
    var rows = "";
    var shown = 0;

    keys.forEach(function (key) {
      var values = q.getAll(key);
      var meta = META[key] || [key, "기타"];
      var label = meta[0];
      var kind = meta[1];
      var display;

      if (HIDDEN[key]) {
        display = "•".repeat(Math.min(values[0] ? values[0].length : 0, 16)) +
          "  (보안상 가림)";
      } else if (values.length > 1) {
        display = values.join(" · ");
      } else {
        display = values[0] || "(빈 값)";
      }

      shown++;
      rows += "<tr>" +
        '<th scope="row">' + escapeHtml(label) + "</th>" +
        "<td>" + escapeHtml(display) +
          (values.length > 1
            ? ' <span class="chip" style="margin-left:.4rem">' + values.length + "개</span>"
            : "") +
        "</td>" +
        '<td><span class="chip">' + escapeHtml(kind) + "</span></td>" +
        "</tr>";
    });

    tbody.innerHTML = rows;
    var cnt = $("[data-r-count]");
    if (cnt) cnt.textContent = shown;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* 5. 실제 주소 출력 + 복사 */
  var urlBox = $("[data-r-url]");
  var fullUrl = global.location.href;
  if (urlBox) {
    // 비밀번호는 화면에 찍히는 주소에서도 가린다
    var safe = fullUrl.replace(/([?&]password=)[^&]*/i, "$1••••••••");
    var parts = safe.split(/[?&]/);
    var html = '<span class="console__line">' + escapeHtml(parts[0]) + "</span>";
    for (var i = 1; i < parts.length; i++) {
      html += '<span class="console__line--dim console__line">' +
        (i === 1 ? "?" : "&") + escapeHtml(decodeURIComponent(parts[i])) + "</span>";
    }
    urlBox.innerHTML = hasData
      ? html
      : '<span class="console__line--dim console__line">쿼리스트링이 비어 있습니다.</span>';
  }

  var copyBtn = $("[data-r-copy]");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var done = function () { toast("주소를 복사했습니다", "ok"); };
      var fail = function () { toast("복사에 실패했습니다", "bad"); };

      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(fullUrl).then(done, fail);
      } else {
        // 구형 브라우저 폴백
        var ta = doc.createElement("textarea");
        ta.value = fullUrl;
        ta.style.cssText = "position:fixed;opacity:0";
        doc.body.appendChild(ta);
        ta.select();
        try { doc.execCommand("copy"); done(); } catch (e) { fail(); }
        ta.remove();
      }
    });
  }

  /* 6. 색종이 */
  (function confetti() {
    if (!hasData) return;
    if (ui.reduceMotion) return;

    var cv = doc.getElementById("confetti");
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext("2d");
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var W = 0, H = 0;

    function resize() {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    global.addEventListener("resize", resize);

    var COLORS = ["#22d3ee", "#818cf8", "#e879f9", "#fbbf24", "#34d399", "#f472b6"];
    var pieces = [];

    for (var i = 0; i < 140; i++) {
      pieces.push({
        x: Math.random() * W,
        y: -20 - Math.random() * H * 0.7,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 10,
        vy: 1.4 + Math.random() * 2.4,
        vx: (Math.random() - 0.5) * 1.5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.22,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        sway: Math.random() * Math.PI * 2
      });
    }

    var start = performance.now();
    var LIFE = 5200;   // 5초쯤 뿌리고 조용히 사라진다

    (function frame(now) {
      var age = now - start;
      if (age > LIFE) { ctx.clearRect(0, 0, W, H); return; }

      var fade = age > LIFE - 1200 ? (LIFE - age) / 1200 : 1;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = fade;

      for (var j = 0; j < pieces.length; j++) {
        var p = pieces[j];
        p.sway += 0.03;
        p.x += p.vx + Math.sin(p.sway) * 0.9;
        p.y += p.vy;
        p.rot += p.vr;

        if (p.y > H + 30) { p.y = -30; p.x = Math.random() * W; }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        // 살짝 접힌 종이처럼 보이도록 세로 스케일을 흔든다
        ctx.scale(1, Math.abs(Math.cos(p.rot * 1.4)) * 0.7 + 0.3);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      global.requestAnimationFrame(frame);
    })(start);
  })();

  /* 7. 가입 알림 */
  if (hasData) {
    global.setTimeout(function () {
      toast((displayName || "회원") + "님, 가입을 환영합니다", "ok");
    }, 500);
  }
})(window);
