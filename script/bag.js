/*
   script/bag.js
   내 가방 보기
   ▸ myBag       : 소지품 객체(이름, 수량)를 담은 배열
   ▸ showMyBag() : 반복문으로 소지품 객체를 출력
   ▸ renderBag() : 같은 데이터를 RPG 인벤토리 그리드 UI로 확장
*/
(function (global) {
  "use strict";

  var doc = global.document;

  /*
     데이터 — 소지품 객체 배열
     (이름 · 수량은 필수, 아이콘 · 분류 · 무게는 확장용 추가 필드)
  */
  var myBag = [
    { name: "노트북",       count: 1, icon: "💻", category: "전자기기", weight: 1400 },
    { name: "충전기",       count: 2, icon: "🔌", category: "전자기기", weight: 220 },
    { name: "무선 이어폰",  count: 1, icon: "🎧", category: "전자기기", weight: 58 },
    { name: "보조배터리",   count: 1, icon: "🔋", category: "전자기기", weight: 210 },
    { name: "텀블러",       count: 1, icon: "🥤", category: "생활",     weight: 480 },
    { name: "볼펜",         count: 3, icon: "🖊️", category: "문구",     weight: 12 },
    { name: "노트",         count: 2, icon: "📓", category: "문구",     weight: 180 },
    { name: "지갑",         count: 1, icon: "👛", category: "생활",     weight: 130 },
    { name: "우산",         count: 1, icon: "☂️", category: "생활",     weight: 340 },
    { name: "사원증",       count: 1, icon: "🪪", category: "생활",     weight: 20 },
    { name: "간식(초콜릿)", count: 4, icon: "🍫", category: "식품",     weight: 45 },
    { name: "USB 메모리",   count: 2, icon: "💾", category: "전자기기", weight: 15 }
  ];

  /* 1. 팝업 버전 — 반복문으로 소지품 객체 출력 */
  function showMyBag() {
    var lines = [];
    var totalCount = 0;
    var totalWeight = 0;
    var log = global.HJ && global.HJ.ui ? global.HJ.ui.logger("#js-console") : null;

    if (log) log.dim("[bag.js] 가방 속 소지품 " + myBag.length + "종을 확인합니다.");

    // 반복문을 통해 소지품 객체를 출력한다
    for (var i = 0; i < myBag.length; i++) {
      var item = myBag[i];
      var line = (i + 1) + ". " + item.name + " x " + item.count + "개";

      lines.push(line);
      totalCount += item.count;
      totalWeight += item.weight * item.count;

      console.log(line, item);          // 개발자 콘솔
      if (log) log.write(line);          // 화면 콘솔 패널
    }

    var summary = "종류 " + myBag.length + "종 / 총 " + totalCount + "개 / 약 " +
      (totalWeight / 1000).toFixed(2) + "kg";

    if (log) log.ok(summary);

    // 요구사항: 내용을 보여준다
    global.alert("🎒 내 가방 속 물품\n\n" + lines.join("\n") + "\n\n" + summary);

    renderBag();
    return myBag;
  }

  /* 2. 확장 버전 — 인벤토리 그리드 */
  function renderBag(host, opts) {
    var targets = host ? [host] : Array.prototype.slice.call(doc.querySelectorAll("[data-bag-grid]"));
    if (!targets.length) return;

    var filter = (opts && opts.category) || "전체";
    var items = filter === "전체" ? myBag : myBag.filter(function (it) { return it.category === filter; });

    targets.forEach(function (grid) {
      var cells = items.map(function (item, i) {
        return [
          '<li class="bag-slot" style="animation:scale-in .4s var(--e-back) ' + (i * 0.035).toFixed(3) + 's backwards"',
          '    title="' + item.name + ' · ' + item.category + ' · ' + item.weight + 'g">',
          '  <span class="bag-slot__icon">' + item.icon + '</span>',
          '  <span class="bag-slot__name">' + item.name + '</span>',
          '  <span class="bag-slot__qty">×' + item.count + '</span>',
          '</li>'
        ].join("");
      });

      // 인벤토리 느낌을 위해 빈 칸을 채워 4의 배수로 맞춘다
      var pad = (4 - (items.length % 4)) % 4;
      for (var p = 0; p < pad; p++) cells.push('<li class="bag-slot bag-slot--empty"></li>');

      grid.innerHTML = cells.join("");
    });

    // 요약 숫자 갱신
    var totalCount = myBag.reduce(function (a, b) { return a + b.count; }, 0);
    var totalWeight = myBag.reduce(function (a, b) { return a + b.weight * b.count; }, 0);
    setText("[data-bag-kinds]", myBag.length);
    setText("[data-bag-count]", totalCount);
    setText("[data-bag-weight]", (totalWeight / 1000).toFixed(2) + "kg");
  }

  function setText(sel, value) {
    var els = doc.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }

  /* 카테고리 필터 버튼 배선 */
  function bindFilters() {
    var btns = doc.querySelectorAll("[data-bag-filter]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function (e) {
        var cat = e.currentTarget.getAttribute("data-bag-filter");
        for (var j = 0; j < btns.length; j++) btns[j].removeAttribute("data-active");
        e.currentTarget.setAttribute("data-active", "true");
        renderBag(null, { category: cat });
      });
    }
  }

  /* 자동 배선 */
  function bind() {
    var btns = doc.querySelectorAll("[data-bag-show]");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", showMyBag);
    renderBag();      // 페이지 로드 시 인벤토리 먼저 그려둔다
    bindFilters();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bind);
  else bind();

  global.myBag = myBag;
  global.showMyBag = showMyBag;
  global.HJ = global.HJ || {};
  global.HJ.bag = { data: myBag, show: showMyBag, render: renderBag };
})(window);
