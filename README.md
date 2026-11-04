# 🚗 오토링크 파킹 (AutoLink Parking) v2.3

> **스마트 주차 위치 기록 · 구글 드라이브 클라우드 동기화 · 4사 실시간 내비 정체 도로명 비교**  
> 모바일 브라우저 및 웹앱(PWA)으로 어디서나 바로 사용할 수 있는 올인원 주차 & 내비게이션 플랫폼입니다.

🌐 **실시간 웹앱 바로가기 (GitHub Pages)**:  
👉 **[https://hih6647-art.github.io/smart-parking/](https://hih6647-art.github.io/smart-parking/)**

---

## 🌟 핵심 기능 요약

### 1. 🔐 원클릭 모든 권한 즉시 활성화
- **[✨ 모든 권한 한 번에 즉시 허용 및 활성화]** 마스터 버튼 탑재
- `📍 GPS 고정밀 위치 추적`
- `🔔 주차 알림 / 복귀 알림`
- `🧭 모션 센서 / 나침반 방향 인식`
- `🛡️ 5km/h 주행 중 차단 가드` (주행 중 블루투스/오디오 단절 시 오작동 방지)
- `☁️ 구글 드라이브 클라우드 자동 동기화`

### 2. ☁️ 구글 드라이브 & 구글 클라우드 백엔드 (`Code.gs`)
- 개인 PC 로컬 서버를 계속 켜놓을 필요 없이, **구글 서버(Google Apps Script)**에서 24시간 365일 완전 무료 구동
- **구글 드라이브(Google Drive) 자동 백업**: 주차 위치, 층수, 기둥 번호, 주차 현장 사진이 `내 드라이브 > 오토링크_스마트파킹_데이터` 폴더에 실시간 자동 저장
- **CORS 완전 해결**: 카카오, 티맵, 네이버 등 브라우저 CORS 제약이 있는 내비 API를 구글 서버가 중간 프록시로 안전하게 중계

### 3. 🧭 4사 내비 실시간 경로 & 정체 도로명 실시간 추출 비교
- 🍎 **애플 지도 (OSRM)**: 실시간 최적 경로 거리, 소요 시간, 주요 경유 도로 분석
- 🚕 **카카오내비**: 실시간 경로 및 실제 정체/지체 도로명(`⚠️ 막히는 곳: ...`) 실시간 추출
- 🧭 **티맵 (TMAP)**: SK Open API 연동 실시간 혼잡 구간 자동 분석
- 🟢 **네이버지도**: Naver Cloud Directions API 연동 정체 구간 분석
- 각 카드 터치 시 설치된 내비게이션 앱으로 원터치 목적지 자동 안내 딥링크 지원

### 4. 🅿️ 스마트 주차 관리 & 주소 중첩 학습
- 원터치 대형 층수 선택: `1F ~ B6`
- 기둥 번호 빠른 지정 및 자동 기억 (`A-01` 등)
- **주소별 중첩 학습 알고리즘**: 동일 장소 반복 방문 시 방문 횟수 및 인식 신뢰도(최대 99%) 누적 학습
- 주차 현장 사진 첨부 및 주차 메모(예: "기둥 뒤 기계식 주차기 앞") 기능 지원

---

## ☁️ 1. 구글 서버(Google Drive 백엔드) 설정

현재 기본 설정으로 구글 앱스 스크립트 웹앱이 연결되어 있습니다:
`https://script.google.com/macros/s/AKfycbyW9yR-Vn-br7Dat1wwbIhYH2JreG0B_g0sbrA-KcwCmOhn00AQL2JG353gdGDt2jBs8w/exec`

**[Google Apps Script 연동 팁]**
1. [Google Apps Script](https://script.google.com) 프로젝트 에디터에서
2. 본 저장소의 `Code.gs` 코드를 붙여넣고 저장(`Ctrl + S`)한 뒤,
3. 상단 **[배포] -> [새 배포]** 또는 **[배포 관리]**에서 새 버전으로 배포하면 구글 드라이브와 완전 연동됩니다.

---

## 💻 2. 로컬 서버 실행 방법 (선택 사항)

개인 PC에서 로컬로 API 프록시 서버를 돌리고 싶을 때 사용합니다.

### Windows 원클릭 실행:
- `run_server.bat` 더블 클릭
- 브라우저에서 `http://localhost:8080/` 접속

### 수동 실행:
```powershell
# PowerShell 경량 서버 (무설치)
powershell -ExecutionPolicy Bypass -File .\api_server.ps1 -Port 8080
```

---

## 📂 프로젝트 구조

```text
├── index.html                   # 오토링크 파킹 v2.3 메인 PWA 단일 페이지 앱
├── Code.gs                      # 구글 드라이브 연동 및 4사 내비 중계 Google Apps Script
├── api_server.ps1               # Windows 로컬 PowerShell API 서버 (무설치)
├── api_server.js                # 로컬 Node.js API 서버
├── run_server.bat               # 로컬 서버 원클릭 실행 배치 파일
├── manifest.json                # 웹앱(PWA) 매니페스트
├── sw.js                        # 오프라인 캐싱 서비스 워커
├── apple-touch-icon.png         # iOS 홈 화면 추가 아이콘
├── icon-192.png / icon-512.png  # PWA 고해상도 앱 아이콘
├── icon.svg                     # 고화질 벡터 아이콘
└── .github/
    └── workflows/
        └── deploy-pages.yml     # GitHub Pages 자동 배포 워크플로우
```

---

## 📱 아이폰 / 안드로이드 홈 화면 추가 방법

1. Safari (iOS) 또는 Chrome (Android)에서 [https://hih6647-art.github.io/smart-parking/](https://hih6647-art.github.io/smart-parking/) 에 접속합니다.
2. **공유 버튼(네모+화살표)** 또는 브라우저 메뉴를 누릅니다.
3. **[홈 화면에 추가]**를 터치하면 일반 네이티브 앱처럼 전체화면으로 실행됩니다.
