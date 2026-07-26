# 이헌준의 개인 홈페이지

늦게 일어나고, 게임을 만들고, 가끔 멀리 떠납니다.
그 조각들을 한 페이지에 모아 두었습니다.

---

## 열어 보는 법

`html/index.html`을 브라우저로 바로 열어도 대부분 동작합니다.
다만 홈의 날씨 위젯만 로컬 서버가 필요합니다.

```bash
# VS Code 라면 Live Server 확장 → index.html 우클릭 → "Open with Live Server"

# 또는 파이썬 한 줄
python -m http.server 5500
# → http://localhost:5500
```

맨 위의 `index.html`은 내용이 없는 안내판입니다.
주소 뒤에 아무것도 붙이지 않아도 `html/index.html`로 넘어가도록 넣어 두었습니다.

---

## 폴더 구조

```
├── index.html                주소 맨 위로 들어왔을 때 홈으로 넘겨 주는 안내판
│
├── html/
│   ├── index.html            홈 — 요즘 뭘 하고 지내는지
│   ├── myProfile.html        나에 대해
│   ├── myHoliday.html        아무것도 안 하는 하루
│   ├── myClass.html          주간 시간표
│   ├── myTrip.html           다녀온 여덟 도시
│   ├── playground.html       직접 만든 게임들
│   ├── signUp.html           회원가입
│   └── signUpResult.html     가입 완료 화면
│
├── css/
│   ├── style.css             디자인 · 레이아웃 · 컴포넌트
│   └── motion.css            애니메이션
│
├── script/
│   ├── core/                 저장소 · 테마 · 내비 등 공통 모듈
│   ├── hero3d.js             홈 상단 화면
│   ├── tripMap.js            여행 지도
│   ├── weatherAPI.js         날씨 데이터
│   ├── realtimeInfo.js       날씨 화면
│   ├── upDown.js             숫자 맞히기
│   ├── grade.js              점수 계산기
│   ├── bag.js                가방 인벤토리
│   ├── signUpForm.js         회원가입 폼
│   ├── signUpResult.js       가입 완료 화면
│   └── games/                수박게임 · 스네이크 · 반응 속도 · 카드 뒤집기
│
└── media/                    사진 · 영상 · 오디오 자리
```

---

## 만들면서 신경 쓴 것

다크 · 라이트 테마를 지원하고, 선택한 테마는 브라우저에 기억됩니다.
모든 페이지에 건너뛰기 링크와 랜드마크를 넣었고, 움직임을 줄이고 싶다는
시스템 설정(`prefers-reduced-motion`)을 존중해 애니메이션을 끕니다.

외부 리소스가 하나라도 실패해도 페이지 전체가 멈추지 않습니다.
글꼴을 못 받으면 시스템 글꼴로, 3D를 못 그리면 2D 화면으로,
사진이 없으면 안내 상자로 조용히 대체됩니다.

모바일에서도 그대로 씁니다. 게임은 터치로도 조작할 수 있고,
화면 밖으로 나간 게임은 알아서 멈춥니다.

---

## 사용한 외부 리소스

| 리소스 | 용도 | 실패했을 때 |
|---|---|---|
| Google Fonts | 서체 | 시스템 글꼴로 대체 |
| Three.js (CDN) | 홈 상단 화면 | 2D 화면으로 대체 |
| Open-Meteo | 날씨 (키 불필요) | 안내 문구 표시 |

물리 · 지도 · 애니메이션 · 오디오 라이브러리는 쓰지 않았습니다.



---

© 2026 이헌준
