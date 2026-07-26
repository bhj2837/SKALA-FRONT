/*
   script/realtimeInfo.js
   실시간 날씨 - DOM/이벤트 + 비동기 호출 + 모듈분리 (화면 담당)
   데이터는 weatherAPI.js에서 import 하고, 이 파일은 "화면 그리는 책임"만 진다.

   동작 흐름
   1) <select>에서 도시를 바꾸면 (change 이벤트)
   2) 먼저 도시 이름 · 위도 / 경도를 innerHTML로 즉시 표시
   3) "로딩 중… ⏳" 을 띄우고 fetch + async/await 로 실시간 날씨 요청
   4) 도착하면 온도 · 습도 · 체감 · 풍속을 그린다
   5) 도시를 빠르게 여러 번 바꾸면 이전 요청은 AbortController로 취소한다

   index.html 에서는 반드시 module 로 불러야 한다:
   <script type="module" src="../script/realtimeInfo.js"></script>
*/

import { CITIES, fetchWeather, findCity, comfortLabel } from "./weatherAPI.js";

/* ---------------------------------------------------------------- 요소 참조 */
const select = document.getElementById("city-select");
const box = document.getElementById("weather-box");
const refreshBtn = document.querySelector("[data-weather-refresh]");
const stampEl = document.querySelector("[data-weather-stamp]");

/* 현재 진행 중인 요청을 취소하기 위한 컨트롤러 */
let inFlight = null;
/* 마지막으로 선택한 도시 */
let currentCity = null;
/* 자동 갱신 타이머 */
let autoTimer = null;

/* 1. select 채우기 — HTML에 옵션이 없으면 CITIES로 자동 생성 */
function ensureOptions() {
  if (!select) return;
  if (select.options.length > 0) return;

  const byCountry = CITIES.reduce((acc, city) => {
    (acc[city.country] = acc[city.country] || []).push(city);
    return acc;
  }, {});

  Object.keys(byCountry).forEach((country) => {
    const group = document.createElement("optgroup");
    group.label = country;
    byCountry[country].forEach((city) => {
      const opt = document.createElement("option");
      opt.value = city.id;
      opt.textContent = city.name;
      opt.dataset.lat = String(city.lat);
      opt.dataset.lon = String(city.lon);
      group.appendChild(opt);
    });
    select.appendChild(group);
  });
}

/* 2. 선택된 도시 정보 읽기 (option의 data-lat / data-lon 우선) */
function readSelectedCity() {
  if (!select) return null;

  const option = select.selectedOptions[0];
  if (!option) return null;

  const fromData = {
    id: option.value,
    name: option.textContent.trim(),
    country: option.parentElement && option.parentElement.label
      ? option.parentElement.label
      : "",
    lat: Number(option.dataset.lat),
    lon: Number(option.dataset.lon)
  };

  // data 속성이 비어 있으면 모듈의 CITIES에서 찾아 보완한다
  if (Number.isNaN(fromData.lat) || Number.isNaN(fromData.lon)) {
    const found = findCity(option.value);
    if (found) return found;
  }
  return fromData;
}

/* 3. 화면 렌더링 — 3단계 (좌표 → 로딩 → 완성) */

/* * 1단계: 좌표만 즉시 표시 (아직 날씨는 없음) */
function renderCoordinates(city) {
  if (!box) return;
  box.innerHTML = `
    <div class="weather-card">
      <div class="weather-card__top">
        <div>
          <div class="weather-card__city">${city.name}</div>
          <div class="weather-card__coord">${city.country}</div>
        </div>
        <div class="weather-card__icon">📍</div>
      </div>
      <div class="weather-metrics">
        <div class="weather-metric"><b>${city.lat.toFixed(4)}</b><span>위도 latitude</span></div>
        <div class="weather-metric"><b>${city.lon.toFixed(4)}</b><span>경도 longitude</span></div>
      </div>
    </div>
  `;
}

/* * 2단계: 로딩 중… ⏳ */
function renderLoading(city) {
  if (!box) return;
  box.innerHTML = `
    <div class="weather-card">
      <div class="weather-card__top">
        <div>
          <div class="weather-card__city">${city.name}</div>
          <div class="weather-card__coord">${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</div>
        </div>
        <div class="weather-card__icon">🛰️</div>
      </div>
      <div class="weather-state"><span class="spinner"></span> 로딩 중… ⏳</div>
      <div class="weather-metrics">
        <div class="weather-metric skeleton" style="height:56px"></div>
        <div class="weather-metric skeleton" style="height:56px"></div>
      </div>
    </div>
  `;
}

/* * 3단계: 실제 날씨 */
function renderWeather(city, w) {
  if (!box) return;
  const unit = w.units.temperature_2m || "°C";

  box.innerHTML = `
    <div class="weather-card">
      <div class="weather-card__top">
        <div>
          <div class="weather-card__city">${city.name}</div>
          <div class="weather-card__coord">${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</div>
        </div>
        <div class="weather-card__icon" title="${w.condition.text}">${w.condition.icon}</div>
      </div>

      <div>
        <div class="weather-card__temp">${w.temperature.toFixed(1)}<sup>${unit}</sup></div>
        <small class="muted">${w.condition.text} · 체감 ${w.apparent.toFixed(1)}${unit}</small>
      </div>

      <div class="weather-metrics">
        <div class="weather-metric">
          <b>${w.humidity}%</b><span>습도 humidity</span>
        </div>
        <div class="weather-metric">
          <b>${w.windSpeed} ${w.units.wind_speed_10m || "km/h"}</b><span>풍속 wind</span>
        </div>
      </div>

      <small class="muted">${comfortLabel(w.apparent)}</small>
    </div>
  `;

  if (stampEl) {
    const time = w.observedAt ? w.observedAt.replace("T", " ") : "-";
    stampEl.textContent = `${time} 관측 · ${w.timezone || ""}`;
  }
}

/* * 오류 표시 */
function renderError(city, message) {
  if (!box) return;
  box.innerHTML = `
    <div class="weather-card">
      <div class="weather-card__top">
        <div>
          <div class="weather-card__city">${city ? city.name : "-"}</div>
          <div class="weather-card__coord">
            ${city ? `${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}` : ""}
          </div>
        </div>
        <div class="weather-card__icon">⚠️</div>
      </div>
      <div class="weather-state weather-state--error">${message}</div>
      <button type="button" class="btn btn--ghost btn--sm" data-weather-retry>다시 시도</button>
    </div>
  `;
  const retry = box.querySelector("[data-weather-retry]");
  if (retry) retry.addEventListener("click", () => update(true));
}

/* 4. 메인 업데이트 — async / await */
async function update(force = false) {
  const city = readSelectedCity();
  if (!city) return;

  // 같은 도시를 다시 누른 경우(force가 아니면) 그냥 통과
  if (!force && currentCity && currentCity.id === city.id) {
    // 계속 진행 — 새로고침 목적일 수 있으므로 막지 않는다
  }
  currentCity = city;

  // 이전 요청 취소
  if (inFlight) inFlight.abort();
  inFlight = new AbortController();
  const myRequest = inFlight;

  // 1단계 → 2단계
  renderCoordinates(city);
  // 좌표를 눈으로 확인할 짧은 순간을 준 뒤 로딩으로 전환
  await new Promise((r) => setTimeout(r, 180));
  if (myRequest.signal.aborted) return;
  renderLoading(city);

  try {
    const weather = await fetchWeather(city.lat, city.lon, { signal: myRequest.signal });
    if (myRequest.signal.aborted) return;      // 그 사이 도시가 바뀌었으면 버린다
    renderWeather(city, weather);
  } catch (error) {
    if (myRequest.signal.aborted) return;
    console.error("[realtimeInfo] 날씨 조회 실패:", error);
    renderError(city, error.message || "날씨를 불러오지 못했습니다.");
  } finally {
    if (inFlight === myRequest) inFlight = null;
  }
}

/* 5. 이벤트 배선 */
function init() {
  if (!select || !box) return;   // 날씨 위젯이 없는 페이지면 아무것도 하지 않는다

  ensureOptions();

  // ★ 핵심: change 이벤트
  select.addEventListener("change", () => update(true));

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshBtn.classList.add("is-spin");
      update(true).finally(() => {
        setTimeout(() => refreshBtn.classList.remove("is-spin"), 400);
      });
    });
  }

  // 첫 진입 시 한 번 조회
  update(true);

  // 10분마다 자동 갱신 (탭이 보이지 않으면 건너뛴다)
  clearInterval(autoTimer);
  autoTimer = setInterval(() => {
    if (document.visibilityState === "visible") update(true);
  }, 600000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* 디버깅 · 다른 스크립트에서 재사용할 수 있게 노출 */
window.HJ = window.HJ || {};
window.HJ.weather = { update, cities: CITIES };
