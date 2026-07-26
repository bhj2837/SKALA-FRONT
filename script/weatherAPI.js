/*
   script/weatherAPI.js
   실시간 날씨 - 모듈분리 (데이터 담당)
   화면(DOM)은 전혀 건드리지 않는다. 오직 "데이터를 가져오는 책임"만 진다.
   Open-Meteo 무료 API 사용 — 인증 키가 필요 없다.
   https://open-meteo.com/en/docs
*/

/* * API 엔드포인트 */
const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/* * 요청할 현재 관측 항목 */
const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "weather_code",
  "wind_speed_10m",
  "is_day"
].join(",");

/*
   * 도시 목록 — myTrip.html의 여행지와 좌표를 공유한다.
   * (여행 지도와 날씨 위젯이 같은 데이터를 쓰도록 한 곳에서 관리)
*/
export const CITIES = [
  { id: "seoul",     name: "서울",     country: "🇰🇷 한국",   lat: 37.5665, lon: 126.9780 },
  { id: "gangneung", name: "강릉",     country: "🇰🇷 한국",   lat: 37.7519, lon: 128.8761 },
  { id: "gyeongju",  name: "경주",     country: "🇰🇷 한국",   lat: 35.8562, lon: 129.2247 },
  { id: "busan",     name: "부산",     country: "🇰🇷 한국",   lat: 35.1796, lon: 129.0756 },
  { id: "jeju",      name: "제주도",   country: "🇰🇷 한국",   lat: 33.4996, lon: 126.5312 },
  { id: "taipei",    name: "타이베이", country: "🇹🇼 대만",   lat: 25.0330, lon: 121.5654 },
  { id: "kaohsiung", name: "가오슝",   country: "🇹🇼 대만",   lat: 22.6273, lon: 120.3014 },
  { id: "osaka",     name: "오사카",   country: "🇯🇵 일본",   lat: 34.6937, lon: 135.5023 },
  { id: "kyoto",     name: "교토",     country: "🇯🇵 일본",   lat: 35.0116, lon: 135.7681 }
];

/* * id로 도시 찾기 */
export function findCity(id) {
  return CITIES.find((c) => c.id === id) || null;
}

/*
   * WMO Weather interpretation code → 한국어 설명 + 이모지
   * https://open-meteo.com/en/docs 의 Weather variable documentation 참고
*/
const WMO = {
  0:  ["맑음", "☀️", "🌙"],
  1:  ["대체로 맑음", "🌤️", "🌙"],
  2:  ["구름 조금", "⛅", "☁️"],
  3:  ["흐림", "☁️", "☁️"],
  45: ["안개", "🌫️", "🌫️"],
  48: ["착빙성 안개", "🌫️", "🌫️"],
  51: ["약한 이슬비", "🌦️", "🌦️"],
  53: ["이슬비", "🌦️", "🌦️"],
  55: ["강한 이슬비", "🌧️", "🌧️"],
  56: ["약한 언 비", "🌧️", "🌧️"],
  57: ["언 비", "🌧️", "🌧️"],
  61: ["약한 비", "🌦️", "🌦️"],
  63: ["비", "🌧️", "🌧️"],
  65: ["강한 비", "⛈️", "⛈️"],
  66: ["약한 우박비", "🌧️", "🌧️"],
  67: ["우박비", "🌧️", "🌧️"],
  71: ["약한 눈", "🌨️", "🌨️"],
  73: ["눈", "❄️", "❄️"],
  75: ["폭설", "❄️", "❄️"],
  77: ["가루눈", "🌨️", "🌨️"],
  80: ["약한 소나기", "🌦️", "🌦️"],
  81: ["소나기", "🌧️", "🌧️"],
  82: ["강한 소나기", "⛈️", "⛈️"],
  85: ["약한 눈 소나기", "🌨️", "🌨️"],
  86: ["눈 소나기", "❄️", "❄️"],
  95: ["천둥번개", "⛈️", "⛈️"],
  96: ["천둥번개·우박", "⛈️", "⛈️"],
  99: ["강한 천둥번개·우박", "⛈️", "⛈️"]
};

/*
   * 날씨 코드를 사람이 읽을 수 있는 형태로 변환
   * @param {number} code   WMO 코드
   * @param {boolean} isDay 낮 여부 (밤이면 달 아이콘)
   * @returns {{text: string, icon: string}}
*/
export function describeCode(code, isDay = true) {
  const found = WMO[code] || ["알 수 없음", "🛰️", "🛰️"];
  return { text: found[0], icon: isDay ? found[1] : found[2] };
}

/* * 체감 온도를 한 줄 코멘트로 */
export function comfortLabel(temp) {
  if (temp >= 33) return "폭염 — 물 많이 마시세요 🥵";
  if (temp >= 28) return "덥습니다 — 반팔 추천 😎";
  if (temp >= 23) return "따뜻합니다 — 산책하기 좋아요 🙂";
  if (temp >= 17) return "선선합니다 — 얇은 겉옷 하나 🧥";
  if (temp >= 10) return "쌀쌀합니다 — 자켓 챙기세요 🍂";
  if (temp >= 3)  return "춥습니다 — 코트가 필요해요 🧣";
  return "매우 춥습니다 — 방한 필수 🥶";
}

/*
   * 실시간 날씨를 비동기로 가져온다. (fetch + async/await)

   * @param {number} lat  위도
   * @param {number} lon  경도
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<{temperature:number, humidity:number, apparent:number,
   *                    windSpeed:number, isDay:boolean, code:number,
   *                    condition:{text:string, icon:string},
   *                    observedAt:string, units:object}>}
   * @throws {Error} 네트워크 실패 · HTTP 오류 · 응답 형식 오류 시
*/
export async function fetchWeather(lat, lon, options = {}) {
  if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("좌표(위도·경도)가 올바르지 않습니다.");
  }

  const url =
    `${ENDPOINT}?latitude=${lat}&longitude=${lon}` +
    `&current=${CURRENT_FIELDS}&timezone=auto`;

  // 8초 안에 응답이 없으면 스스로 포기한다
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), 8000);

  // 외부에서 넘어온 취소 신호도 함께 반영 (도시를 빠르게 바꿀 때 이전 요청 취소)
  if (options.signal) {
    options.signal.addEventListener("abort", () => timer.abort(), { once: true });
  }

  try {
    const response = await fetch(url, { signal: timer.signal });

    if (!response.ok) {
      throw new Error(`날씨 서버가 ${response.status} 응답을 보냈습니다.`);
    }

    const data = await response.json();
    const cur = data && data.current;

    if (!cur || typeof cur.temperature_2m !== "number") {
      throw new Error("날씨 응답 형식이 예상과 다릅니다.");
    }

    const isDay = cur.is_day === 1;

    return {
      temperature: cur.temperature_2m,
      humidity: cur.relative_humidity_2m,
      apparent: cur.apparent_temperature,
      windSpeed: cur.wind_speed_10m,
      code: cur.weather_code,
      isDay,
      condition: describeCode(cur.weather_code, isDay),
      observedAt: cur.time,
      timezone: data.timezone,
      units: data.current_units || {}
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다. 네트워크를 확인해 주세요.");
    }
    // fetch 자체가 실패한 경우(오프라인 등)
    if (error instanceof TypeError) {
      throw new Error("날씨 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/* * 여러 도시를 동시에 조회 (Promise.allSettled 활용 — 하나 실패해도 나머지는 표시) */
export async function fetchManyWeather(cities, options = {}) {
  const settled = await Promise.allSettled(
    cities.map((c) => fetchWeather(c.lat, c.lon, options))
  );
  return settled.map((r, i) => ({
    city: cities[i],
    ok: r.status === "fulfilled",
    data: r.status === "fulfilled" ? r.value : null,
    error: r.status === "rejected" ? r.reason.message : null
  }));
}
