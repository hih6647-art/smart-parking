# 🚗 오토링크 파킹 (AutoLink Parking) v2.4

> **스마트 주차 위치 기록 · 구글 드라이브 클라우드 동기화 · 4사 실시간 내비 비교 (PWA)**  
> 모바일 브라우저 및 웹앱으로 어디서나 바로 사용할 수 있는 올인원 주차 & 내비게이션 플랫폼입니다.

🌐 **실시간 웹앱 바로가기 (GitHub Pages)**:  
👉 **[https://hih6647-art.github.io/smart-parking/](https://hih6647-art.github.io/smart-parking/)**

---

## 🌟 핵심 기능 요약 (v2.4)

### 1. 🅿️ 스마트 주차 관리 & 주소 중첩 학습
- 원터치 대형 층수 선택: `1F ~ B6`
- 기둥 번호 빠른 지정 및 자동 기억 (`A-01` 등)
- 주차 현장 사진 촬영/첨부 기능 (`📷 사진`)
- **주소별 중첩 학습 알고리즘**: 동일 장소 반복 방문 시 방문 횟수 및 층수/기둥 인식 확률(최대 99%) 누적 학습

### 2. 🧭 4사 내비 실시간 경로 & 정체 비교 (산뜻한 컬러 UI)
- 🍎 **애플 지도**: 실도로 최적 경로 거리, 소요 시간, 주요 경유 도로 분석
- 🚕 **카카오내비**: 실시간 경로 및 실제 정체/지체 도로명(`⚠️ 막히는 곳: ...`) 실시간 추출
- 🧭 **티맵 (TMAP)**: 산뜻한 인디고 블루 카드 적용, SK Open API 연동 정체 구간 실시간 분석
- 🟢 **네이버지도**: Naver Cloud Directions API 연동 정체 구간 분석
- **원클릭 하이브리드 길안내**: 모바일에서는 네이티브 내비 앱(카카오맵, TMAP, 네이버 지도)으로, PC에서는 웹 길찾기로 즉시 목적지 좌표가 찍혀 열립니다.

### 3. 🏢 전국 모든 아파트명 · 세부건물명 정밀 검색 & 추천 드롭다운
- **실시간 추천 예시창**: 검색창에 한 글자만 입력해도 아래에 `올림픽파크포레온`, `헬리오시티`, `반포자이`, `마래푸`, `코엑스`, `더현대 서울` 등 주요 거점 예시가 즉시 펼쳐집니다.
- **아파트·상세주소 정밀 검색창 팝업**: 카카오/다음 공식 주소 검색 모달 연동으로 전국 모든 신축 아파트 단지명, 건물명, 상호명을 100% 오타 없이 검색 가능합니다.

### 4. ☁️ 구글 드라이브 클라우드 백엔드 (`Code.gs`)
- 개인 PC 로컬 서버 없이 **구글 서버(Google Apps Script)**에서 24시간 365일 완전 무료 구동
- **구글 드라이브(Google Drive) 자동 백업**: 주차 위치, 층수, 기둥 번호, 사진이 `내 드라이브 > 오토링크_스마트파킹_데이터` 폴더 및 스프레드시트에 실시간 자동 저장
- **CORS 완전 해결**: 카카오, 티맵, 네이버 등 브라우저 CORS 제약이 있는 내비 API를 구글 서버가 중간 프록시로 안전하게 중계

---

## ☁️ 구글 서버(Google Drive 백엔드) 설정

현재 기본 설정으로 구글 앱스 스크립트 웹앱이 연결되어 있습니다:  
`https://script.google.com/macros/s/AKfycbzSKHFN5EFWWzHnwkYl0GMfpdWDHVTT1Ss2qto4irPRmgyyo77vgaIbqEwWZ3O72Qj4Ag/exec`

**[Google Apps Script 연동 팁]**
1. [내 Google Apps Script 에디터](https://script.google.com/d/1NAoDFzfPOIXKwDpp7ONei34qtvolcER_o0HBOYfh0xDeo86qfcITPZnV/edit)에 접속합니다.
2. 본 저장소의 `Code.gs` 전체 내용을 복사하여 붙여넣고 저장(`Ctrl + S`)합니다.
3. 상단 **[배포] -> [배포 관리] -> [새 버전(New Version)]**으로 배포를 완료하면 구글 드라이브 24시간 자동 저장이 활성화됩니다.

---

## 📂 프로젝트 구조

```text
├── index.html                   # 오토링크 파킹 v2.4 메인 PWA 단일 페이지 앱
├── Code.gs                      # 구글 드라이브 연동 및 4사 내비 중계 Google Apps Script
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
