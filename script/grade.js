/*
   script/grade.js
   성적 계산기
   ▸ startGrade()      : subjects 배열, total, for문, prompt, alert
   ▸ mountGradeBoard() : 같은 로직을 폼 + 게이지 UI로 확장 (playground.html)
*/
(function (global) {
  "use strict";

  var doc = global.document;

  /* 세 과목 */
  var SUBJECTS = ["HTML", "CSS", "JavaScript"];
  var PASS_LINE = 60;

  /* 평균 → 등급 */
  function toGrade(avg) {
    if (avg >= 90) return "A";
    if (avg >= 80) return "B";
    if (avg >= 70) return "C";
    if (avg >= 60) return "D";
    return "F";
  }

  function toComment(avg) {
    if (avg >= 90) return "완벽합니다. 이 페이지를 포트폴리오에 바로 올리세요.";
    if (avg >= 80) return "좋습니다. 디테일만 조금 더 다듬으면 A입니다.";
    if (avg >= 70) return "기본은 잡혔습니다. 조금만 더 해보세요.";
    if (avg >= 60) return "가까스로 통과. 복습이 필요합니다.";
    return "다시 도전! 기초부터 차근차근 쌓아봅시다.";
  }

  /* 1. 팝업 버전 */
  function startGrade() {
    // 과목 이름이 담긴 배열
    var subjects = ["HTML", "CSS", "JavaScript"];
    // 총점을 저장할 변수
    var total = 0;
    var scores = [];
    var log = global.HJ && global.HJ.ui ? global.HJ.ui.logger("#js-console") : null;

    if (log) log.dim("[grade.js] 3과목 점수를 입력받습니다.");

    // for문을 배열의 길이만큼 돌리면서 점수를 연속 입력받아 total에 더한다
    for (var i = 0; i < subjects.length; i++) {
      var raw = global.prompt(subjects[i] + " 점수를 입력하세요. (0 ~ 100)");

      if (raw === null) {
        global.alert("성적 입력을 취소했습니다.");
        if (log) log.bad("입력 취소");
        return;
      }

      var score = Number(raw);
      // 잘못된 값은 0점으로 처리하고 계속 진행
      if (raw.trim() === "" || isNaN(score) || score < 0 || score > 100) {
        global.alert("0에서 100 사이의 숫자가 아니므로 0점으로 처리합니다.");
        score = 0;
      }

      scores.push(score);
      total += score;
      if (log) log.write(subjects[i] + ": " + score + "점");
    }

    // 반복문이 끝난 후 평균 점수를 구한다
    var average = total / subjects.length;
    // 평균이 60점 이상이면 합격, 60점 미만이면 불합격
    var result = average >= PASS_LINE ? "합격입니다!" : "불합격입니다.";
    var grade = toGrade(average);

    // 결과를 alert 창으로 보여준다
    global.alert(
      "총점: " + total + "점, 평균: " + average.toFixed(1) +
      ", 등급: " + grade + ", 결과: " + result
    );

    if (log) {
      log[average >= PASS_LINE ? "ok" : "bad"](
        "총점 " + total + " / 평균 " + average.toFixed(1) + " / 등급 " + grade + " / " + result
      );
    }

    paintBoard(scores);   // 화면에도 반영
    return { subjects: subjects, scores: scores, total: total, average: average, grade: grade };
  }

  /* 2. 확장 버전 — 입력 폼 + 게이지 + 과목별 바 */
  var boardHost = null;

  function mountGradeBoard(host) {
    if (!host) return;
    boardHost = host;

    var rows = SUBJECTS.map(function (s, i) {
      return [
        '<div class="field">',
        '  <label for="gd-' + i + '">' + s + '</label>',
        '  <input type="number" id="gd-' + i + '" min="0" max="100" placeholder="0 ~ 100"',
        '         data-score="' + i + '" inputmode="numeric">',
        '</div>'
      ].join("");
    }).join("");

    host.innerHTML = [
      '<form class="gd" novalidate>',
      '  <div class="field-row" style="margin-bottom:1rem">' + rows + '</div>',
      '  <div class="form-actions">',
      '    <button type="submit" class="btn btn--primary btn--sm">채점하기</button>',
      '    <button type="button" class="btn btn--ghost btn--sm" data-random>무작위 채우기</button>',
      '    <button type="button" class="btn btn--ghost btn--sm" data-prompt>prompt 방식으로</button>',
      '  </div>',
      '</form>',
      '<div class="gd__result" data-result hidden>',
      '  <div class="gauge">',
      '    <div class="gauge__ring" data-ring><span class="gauge__val" data-avg>0</span></div>',
      '    <div class="stack-s" style="flex:1">',
      '      <div class="cluster" style="gap:.6rem">',
      '        <span class="grade-badge" data-badge>-</span>',
      '        <span class="chip" data-verdict>-</span>',
      '      </div>',
      '      <small data-comment class="muted"></small>',
      '    </div>',
      '  </div>',
      '  <ul class="score-list" data-bars></ul>',
      '</div>'
    ].join("");

    var form = host.querySelector("form");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var scores = SUBJECTS.map(function (s, i) {
        var v = Number(host.querySelector('[data-score="' + i + '"]').value);
        return isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
      });
      paintBoard(scores);
    });

    host.querySelector("[data-random]").addEventListener("click", function () {
      SUBJECTS.forEach(function (s, i) {
        host.querySelector('[data-score="' + i + '"]').value = Math.floor(Math.random() * 46) + 55;
      });
    });

    host.querySelector("[data-prompt]").addEventListener("click", startGrade);
  }

  /* 결과 그리기 (두 버전이 공유) */
  function paintBoard(scores) {
    if (!boardHost || !scores) return;

    var total = scores.reduce(function (a, b) { return a + b; }, 0);
    var avg = total / scores.length;
    var grade = toGrade(avg);
    var pass = avg >= PASS_LINE;

    var box = boardHost.querySelector("[data-result]");
    if (!box) return;
    box.hidden = false;

    // 입력창에도 값 반영 (prompt 경로로 들어온 경우)
    SUBJECTS.forEach(function (s, i) {
      var inp = boardHost.querySelector('[data-score="' + i + '"]');
      if (inp) inp.value = scores[i];
    });

    boardHost.querySelector("[data-ring]").style.setProperty("--v", avg.toFixed(1));
    boardHost.querySelector("[data-avg]").textContent = avg.toFixed(1);

    var badge = boardHost.querySelector("[data-badge]");
    badge.textContent = grade;
    badge.setAttribute("data-grade", grade);

    var verdict = boardHost.querySelector("[data-verdict]");
    verdict.textContent = (pass ? "합격 · " : "불합격 · ") + "총점 " + total + "점";
    verdict.style.color = pass ? "var(--c-ok)" : "var(--c-bad)";
    verdict.style.borderColor = pass ? "rgba(52,211,153,.35)" : "rgba(251,113,133,.35)";

    boardHost.querySelector("[data-comment]").textContent = toComment(avg);

    boardHost.querySelector("[data-bars]").innerHTML = SUBJECTS.map(function (s, i) {
      var v = scores[i];
      return [
        '<li>',
        '  <span>' + s + '</span>',
        '  <span class="bar"><span class="bar__fill" style="width:' + v + '%"></span></span>',
        '  <b>' + v + '</b>',
        '</li>'
      ].join("");
    }).join("");
  }

  /* 자동 배선 */
  function bind() {
    var btns = doc.querySelectorAll("[data-grade-start]");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", startGrade);

    var boards = doc.querySelectorAll("[data-grade-board]");
    for (var j = 0; j < boards.length; j++) mountGradeBoard(boards[j]);
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  global.startGrade = startGrade;
  global.HJ = global.HJ || {};
  global.HJ.grade = { start: startGrade, mountBoard: mountGradeBoard, toGrade: toGrade };
})(window);
