/*
   script/signUpForm.js
   signUp.html 전용 스크립트.

   · 아이디 형식 검사 + 중복확인
   · 비밀번호 강도 게이지 / 비밀번호 확인 일치 검사
   · 약관 전체 동의 체크박스
   · 필수 항목 체크리스트 + 진행률 바
   · 한 줄 소개 글자 수 카운터
   · 예시값 자동 채우기
   · 제출 직전 검증 — 통과하면 그대로 GET 전송

   폼 자체는 순수 HTML로도 동작한다. 이 파일은 편의 기능이다.

   비밀번호 두 칸에는 name 속성이 없다. 이 폼은 GET 으로 보내지기 때문에
   name 이 있으면 비밀번호가 주소창에 그대로 남는다. 값은 id 로만 읽는다.
*/
(function (global) {
  "use strict";

  var doc = global.document;
  var form = doc.getElementById("signup-form");
  if (!form) return;

  var ui = (global.HJ && global.HJ.ui) || {};
  var toast = ui.toast || function () {};
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  function field(key) {
    return form.elements.namedItem ? form.elements.namedItem(key) : form.elements[key];
  }
  function val(key) {
    var el = field(key);
    return el && typeof el.value === "string" ? el.value : "";
  }

  /* 1. 아이디 — 형식과 중복 */

  // 영문 소문자로 시작, 소문자·숫자·밑줄로 4~16자
  var ID_RE = /^[a-z][a-z0-9_]{3,15}$/;

  // 서버가 없으니 "이미 쓰이는 아이디" 목록을 직접 들고 있는다
  var TAKEN = [
    "admin", "administrator", "root", "master", "test", "guest",
    "user", "hunjun", "heonjun", "null", "undefined", "watermelon"
  ];

  // 마지막으로 중복확인을 통과한 아이디를 기억해 둔다.
  // 확인 후 아이디를 고치면 다시 확인해야 한다.
  var passedId = "";

  function setMsg(key, text, state) {
    var el = $('[data-msg="' + key + '"]');
    if (!el) return;
    el.textContent = text || "";
    if (state) el.setAttribute("data-state", state);
    else el.removeAttribute("data-state");
  }

  function checkId() {
    var id = val("userid").trim();

    if (!id) {
      setMsg("userid", "아이디를 먼저 입력해 주세요.", "bad");
      return false;
    }
    if (!ID_RE.test(id)) {
      setMsg("userid", "영문 소문자로 시작하는 4~16자여야 합니다. 숫자와 _ 는 섞어도 됩니다.", "bad");
      return false;
    }
    if (TAKEN.indexOf(id) !== -1) {
      // 그냥 막기만 하면 심심하니 대안을 하나 붙여 준다
      var alt = id + String(Math.floor(Math.random() * 90) + 10);
      setMsg("userid", "이미 누가 쓰고 있습니다. " + alt + " 은(는) 비어 있습니다.", "bad");
      return false;
    }

    passedId = id;
    setMsg("userid", "쓸 수 있는 아이디입니다.", "ok");
    return true;
  }

  var idBtn = $("[data-check-id]");
  if (idBtn) {
    idBtn.addEventListener("click", function () {
      var ok = checkId();
      refresh();
      toast(ok ? "사용할 수 있는 아이디입니다" : "다른 아이디를 골라 주세요", ok ? "ok" : "bad");
    });
  }

  /* 2. 비밀번호 — 강도와 일치 */
  function passwordScore(pw) {
    if (!pw) return 0;
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 4);
  }

  var PW_LABEL = ["—", "매우 약함", "약함", "보통", "강함", "매우 강함"];
  var PW_COLOR = [
    "var(--line)",
    "var(--c-bad)",
    "var(--c-warn)",
    "var(--c4)",
    "var(--c-ok)",
    "var(--grad-aurora)"
  ];

  function paintPassword() {
    var pw = val("password");
    var bar = $("[data-pw-bar]");
    var label = $("[data-pw-label]");
    var s = pw ? passwordScore(pw) + 1 : 0;

    if (bar) {
      bar.style.width = (s / 5 * 100) + "%";
      bar.style.background = PW_COLOR[s];
    }
    if (label) label.textContent = PW_LABEL[s];

    // 확인 칸
    var pw2 = val("password2");
    if (!pw2) setMsg("password2", "");
    else if (pw2 === pw) setMsg("password2", "비밀번호가 일치합니다.", "ok");
    else setMsg("password2", "두 칸이 서로 다릅니다.", "bad");
  }

  /* 3. 약관 — 전체 동의 체크박스 */
  var allBox = $("[data-agree-all]");
  var termBoxes = $$('.terms__list input[type="checkbox"]');
  var mustAgree = $$("[data-agree]");

  function syncAgreeAll() {
    if (!allBox) return;
    var on = termBoxes.filter(function (b) { return b.checked; }).length;
    allBox.checked = on === termBoxes.length && termBoxes.length > 0;
    allBox.indeterminate = on > 0 && on < termBoxes.length;
  }

  /*
     전체 동의를 누르면 하위 네 칸을 따라가게 한다.

     이 처리는 반드시 input 단계에서 해야 한다.
     체크박스는 input → change 순서로 이벤트를 쏘는데, form 에 걸어 둔 input
     리스너가 먼저 syncAgreeAll() 을 돌려 버리면 (하위가 아직 안 켜졌으므로)
     전체 동의가 그 자리에서 다시 꺼진다. change 에서 읽으면 이미 꺼진 값을
     읽게 되어 하위 칸이 전부 꺼지는 문제가 있었다.

     자기 자신에게 건 리스너는 form 으로 버블링되기 전에 먼저 돈다.
     change 에도 같이 걸어 두지만, 같은 값을 한 번 더 쓰는 것뿐이라 무해하다.
  */
  if (allBox) {
    var spreadAgree = function () {
      var next = allBox.checked;
      termBoxes.forEach(function (b) { b.checked = next; });
      allBox.indeterminate = false;
    };
    allBox.addEventListener("input", spreadAgree);
    allBox.addEventListener("change", function () { spreadAgree(); refresh(); });
  }

  /* 4. 검증 규칙 — 사이드바 체크리스트와 1:1로 대응 */
  var RULES = {
    userid:    function () { return ID_RE.test(val("userid").trim()); },
    unique:    function () { var id = val("userid").trim(); return !!id && id === passedId; },
    password:  function () { return val("password").length >= 8; },
    password2: function () { var p = val("password"); return p.length >= 8 && val("password2") === p; },
    name:      function () { return val("name").trim().length >= 2; },
    email:     function () { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val("email").trim()); },
    agree:     function () {
      if (!mustAgree.length) return true;
      return mustAgree.every(function (b) { return b.checked; });
    }
  };
  var RULE_KEYS = ["userid", "unique", "password", "password2", "name", "email", "agree"];

  // 실패했을 때 어디로 데려갈지
  function badTarget(key) {
    if (key === "unique") return idBtn || field("userid");
    if (key === "agree") {
      var open = mustAgree.filter(function (b) { return !b.checked; })[0];
      return open || null;
    }
    return field(key);
  }

  /* 5. 체크리스트 + 진행률 */
  var saidPassed = -1;   // 같은 말을 두 번 읽지 않도록 마지막 값을 기억한다

  function paintChecklist() {
    var passed = 0;

    RULE_KEYS.forEach(function (key) {
      var ok = RULES[key]();
      if (ok) passed++;
      var li = $('[data-check="' + key + '"]');
      if (li) li.setAttribute("data-done", String(ok));
    });

    var total = RULE_KEYS.length;
    var pct = Math.round(passed / total * 100);

    var count = $("[data-valid-count]");
    if (count) count.textContent = passed + " / " + total;

    var bar = $("[data-form-bar]");
    if (bar) {
      bar.style.width = pct + "%";
      bar.style.background = pct === 100 ? "var(--c-ok)" : "var(--grad-aurora)";
    }

    var pctEl = $("[data-form-pct]");
    if (pctEl) pctEl.textContent = pct + "%";

    var stepEl = $("[data-form-step]");
    if (stepEl) stepEl.textContent = passed + " / " + total + " 항목";

    // 글자 수가 바뀔 때마다 읽으면 시끄럽다. 통과 개수가 달라질 때만 알린다.
    if (passed !== saidPassed) {
      saidPassed = passed;
      var say = $("[data-form-say]");
      if (say) {
        say.textContent = passed === total
          ? "필수 항목 " + total + "개를 모두 채웠습니다. 가입하기를 누를 수 있습니다."
          : "필수 항목 " + total + "개 중 " + passed + "개 완료";
      }
    }

    return passed === total;
  }

  /* 6. 전체 다시 그리기 */
  function refresh() {
    // 아이디를 고쳤으면 중복확인 결과는 무효
    if (passedId && val("userid").trim() !== passedId) {
      passedId = "";
      setMsg("userid", "아이디를 바꿨습니다. 중복확인을 한 번 더 눌러 주세요.", "");
    }

    paintPassword();
    syncAgreeAll();
    paintChecklist();

    var cnt = $("[data-intro-count]");
    if (cnt) cnt.textContent = val("intro").length;
  }

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);

  // reset 은 값이 비워진 다음 프레임에 다시 그려야 한다
  form.addEventListener("reset", function () {
    global.setTimeout(function () {
      passedId = "";
      setMsg("userid", "");
      setMsg("password2", "");
      if (allBox) { allBox.checked = false; allBox.indeterminate = false; }
      refresh();
      toast("입력을 모두 지웠습니다", "");
    }, 0);
  });

  /* 7. 예시값 채우기 */
  var demoBtn = $("[data-form-demo]");
  if (demoBtn) {
    demoBtn.addEventListener("click", function () {
      var v = {
        userid: "hunjun_demo",
        password: "Demo1234!",
        password2: "Demo1234!",
        name: "이헌준",
        nickname: "hunjun.dev",
        email: "you@example.com",
        phone: "010-1234-5678",
        birth: "2000-01-01",
        intro: "늦게 자고 늦게 일어나는 사람입니다. 게임과 산책을 좋아합니다."
      };
      Object.keys(v).forEach(function (k) {
        var el = field(k);
        if (el && "value" in el) el.value = v[k];
      });

      var from = field("from");
      if (from) from.value = "수박게임";

      // 필수 약관만 켜 둔다. 광고 수신은 본인이 고르도록 남겨 둔다.
      mustAgree.forEach(function (b) { b.checked = true; });

      checkId();
      refresh();
      toast("예시값을 채웠습니다", "ok");
    });
  }

  /* 8. 제출 — 통과하면 브라우저 기본 GET 전송에 맡긴다 */
  form.addEventListener("submit", function (e) {
    var ok = paintChecklist();

    if (!ok) {
      e.preventDefault();

      var firstBad = null;
      for (var i = 0; i < RULE_KEYS.length; i++) {
        if (!RULES[RULE_KEYS[i]]()) { firstBad = RULE_KEYS[i]; break; }
      }

      var el = badTarget(firstBad);
      if (el) {
        // 체크박스는 화면에서 숨겨 두었으므로 감싸는 상자로 데려간다
        var wrap = el.closest ? (el.closest(".field") || el.closest("fieldset")) : null;
        if (el.focus) { try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); } }
        var scrollTo = wrap || el;
        if (scrollTo.scrollIntoView) scrollTo.scrollIntoView({ behavior: "smooth", block: "center" });
        if (wrap) {
          wrap.classList.add("anim-shake");
          global.setTimeout(function () { wrap.classList.remove("anim-shake"); }, 600);
        }
      }

      var WHY = {
        userid: "아이디 형식을 확인해 주세요",
        unique: "아이디 중복확인을 눌러 주세요",
        password: "비밀번호는 8자 이상입니다",
        password2: "비밀번호 확인이 일치하지 않습니다",
        name: "이름을 2자 이상 입력해 주세요",
        email: "이메일 형식을 확인해 주세요",
        agree: "필수 약관에 동의해 주세요"
      };
      toast(WHY[firstBad] || "아직 채우지 않은 항목이 있습니다", "bad");
      return;
    }

    // 마지막 가입 내용을 저장해 두면 결과 화면에서 보조 자료로 쓸 수 있다.
    // FormData 에는 name 이 없는 비밀번호 두 칸이 애초에 들어오지 않는다.
    try {
      var plain = {};
      new FormData(form).forEach(function (value, key) {
        if (plain[key] === undefined) plain[key] = value;
        else plain[key] = [].concat(plain[key], value);
      });
      if (global.HJ && global.HJ.store) global.HJ.store.set("signup:last", plain);
    } catch (err) { /* 저장 실패는 무시 */ }

    toast("가입 처리 중입니다", "ok");
    // e.preventDefault() 를 부르지 않으므로
    // 브라우저가 action="signUpResult.html" 로 GET 전송한다
  });

  /* 9. 첫 페인트 */
  refresh();
})(window);
