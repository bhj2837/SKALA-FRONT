/*
   script/core/store.js
   localStorage를 감싼 아주 작은 저장소.
   file:// 프로토콜이나 시크릿 모드처럼 스토리지가 막힌 환경에서도
   에러 없이 동작하도록 메모리 저장소로 자동 폴백한다.
*/
(function (global) {
  "use strict";

  var PREFIX = "hj:";
  var memory = {};        // 폴백용 메모리 저장소
  var usable = (function () {
    try {
      var k = PREFIX + "__probe";
      global.localStorage.setItem(k, "1");
      global.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;      // 접근 거부 → 메모리 모드
    }
  })();

  var Store = {
    /* * 스토리지 사용 가능 여부 */
    persistent: usable,

    /* * 값 읽기 (없으면 fallback 반환) */
    get: function (key, fallback) {
      var raw = usable ? global.localStorage.getItem(PREFIX + key) : memory[key];
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return raw;
      }
    },

    /* * 값 쓰기 */
    set: function (key, value) {
      var raw = typeof value === "string" ? value : JSON.stringify(value);
      if (usable) {
        try { global.localStorage.setItem(PREFIX + key, raw); }
        catch (e) { memory[key] = raw; }
      } else {
        memory[key] = raw;
      }
      return value;
    },

    /* * 값 삭제 */
    remove: function (key) {
      if (usable) {
        try { global.localStorage.removeItem(PREFIX + key); } catch (e) { /* noop */ }
      }
      delete memory[key];
    }
  };

  global.HJ = global.HJ || {};
  global.HJ.store = Store;
})(window);
