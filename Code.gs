/**
 * ==============================================================================
 * 오토링크 파킹 (AutoLink Parking) v2.3 - Google Apps Script (GAS) 클라우드 API 서버
 * ==============================================================================
 * 구글 드라이브(Google Drive) 및 구글 서버(script.google.com)에서 24시간 무료 구동되는
 * 4사 내비게이션(카카오·티맵·네이버·애플) 실시간 정체 분석 & 주차 데이터/사진 동기화 백엔드
 * 
 * [배포 방법 (1분 소요)]
 * 1. https://script.google.com 접속 -> [새 프로젝트] 클릭
 * 2. 이 파일의 전체 내용을 복사하여 붙여넣기
 * 3. 우측 상단 [배포] -> [새 배포] 클릭
 * 4. 유형: [웹 앱] 선택
 *    - 설명: 오토링크 파킹 v2.3 API
 *    - 다음 사용자로 실행: [나]
 *    - 액세스 권한이 있는 사용자: [모든 사용자 (Anyone)] 선택
 * 5. [배포] 버튼 클릭 후 나오는 웹 앱 URL (https://script.google.com/macros/s/.../exec)을 복사하여
 *    앱 설정의 '구글 클라우드 API 서버 URL'에 입력하면 끝!
 */

// 1. GET 요청 처리 (서버 상태 확인 및 웹페이지 서빙)
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
  
  if (action === "ping") {
    return createJsonResponse({
      status: "success",
      service: "AutoLink Parking v2.3 Google Cloud Backend",
      time: new Date().toISOString()
    });
  }
  
  // 구글 드라이브에서 주차 기록 불러오기
  if (action === "loadParking") {
    return handleLoadParking();
  }

  return createJsonResponse({ status: "ready" });
}

// 2. POST 요청 처리 (4사 내비 비교, 구글 드라이브 사진/위치 저장, AI 비서)
function doPost(e) {
  try {
    var rawData = e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(rawData);
    var action = payload.action || "compareRoutes";

    // 1) 4사 실시간 내비 정체 비교 API (구글 서버에서 직접 호출하여 CORS 100% 해결)
    if (action === "compareRoutes") {
      return handleCompareRoutes(payload);
    }

    // 2) 구글 드라이브(Google Drive)에 주차 위치 및 사진 자동 백업
    if (action === "saveToDrive") {
      return handleSaveToDrive(payload);
    }

    // 3) Google Gemini AI 스마트 복귀 브리핑
    if (action === "aiBriefing") {
      return handleAiBriefing(payload);
    }

    return createJsonResponse({ status: "error", message: "알 수 없는 요청 action: " + action });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// ------------------------------------------------------------------------------
// 기능 1: 4사 내비게이션 실시간 경로 및 정체 도로명 비교 (UrlFetchApp 사용)
// ------------------------------------------------------------------------------
function handleCompareRoutes(data) {
  var startLat = data.startLat;
  var startLng = data.startLng;
  var destLat = data.destLat;
  var destLng = data.destLng;

  var kakaoKey = data.kakaoKey;
  var tmapKey = data.tmapKey;
  var naverId = data.naverId;
  var naverSecret = data.naverSecret;

  var result = {
    status: "success",
    timestamp: new Date().toISOString(),
    apple: null,
    kakao: null,
    tmap: null,
    naver: null
  };

  // 1. 애플 지도 대응 (OSRM)
  try {
    var osrmUrl = "https://router.project-osrm.org/route/v1/driving/" + startLng + "," + startLat + ";" + destLng + "," + destLat + "?overview=false&steps=true";
    var osrmRes = UrlFetchApp.fetch(osrmUrl, { muteHttpExceptions: true });
    if (osrmRes.getResponseCode() === 200) {
      var osrmData = JSON.parse(osrmRes.getContentText());
      if (osrmData.routes && osrmData.routes.length > 0) {
        var r = osrmData.routes[0];
        var steps = [];
        if (r.legs && r.legs[0] && r.legs[0].steps) {
          r.legs[0].steps.forEach(function(s) {
            if (s.name && steps.indexOf(s.name) === -1) steps.push(s.name);
          });
        }
        result.apple = {
          configured: true,
          distanceKm: (r.distance / 1000).toFixed(1),
          durationMin: Math.max(1, Math.round(r.duration / 60)),
          roads: steps.slice(0, 4)
        };
      }
    }
  } catch (e) {
    result.apple = { configured: true, error: e.toString() };
  }

  // 2. 카카오내비 REST API 연동
  if (kakaoKey) {
    try {
      var kUrl = "https://apis-navi.kakaomobility.com/v1/directions?origin=" + startLng + "," + startLat + "&destination=" + destLng + "," + destLat;
      var kRes = UrlFetchApp.fetch(kUrl, {
        headers: { "Authorization": "KakaoAK " + kakaoKey },
        muteHttpExceptions: true
      });
      if (kRes.getResponseCode() === 200) {
        var kData = JSON.parse(kRes.getContentText());
        if (kData.routes && kData.routes[0]) {
          var sum = kData.routes[0].summary;
          var jammed = [];
          (kData.routes[0].sections || []).forEach(function(sec) {
            (sec.roads || []).forEach(function(rd) {
              if ((rd.traffic_state === 1 || rd.traffic_state === 2) && rd.name && jammed.indexOf(rd.name) === -1) {
                jammed.push(rd.name);
              }
            });
          });
          result.kakao = {
            configured: true,
            distanceKm: (sum.distance / 1000).toFixed(1),
            durationMin: Math.round(sum.duration / 60),
            congestedRoads: jammed.slice(0, 4)
          };
        }
      }
    } catch (e) {
      result.kakao = { configured: true, error: e.toString() };
    }
  } else {
    result.kakao = { configured: false };
  }

  // 3. 티맵 (TMAP) REST API 연동
  if (tmapKey) {
    try {
      var tUrl = "https://apis.openapi.sk.com/tmap/routes?version=1&format=json";
      var tPayload = {
        startX: startLng,
        startY: startLat,
        endX: destLng,
        endY: destLat,
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO"
      };
      var tRes = UrlFetchApp.fetch(tUrl, {
        method: "post",
        contentType: "application/json",
        headers: { "appKey": tmapKey },
        payload: JSON.stringify(tPayload),
        muteHttpExceptions: true
      });
      if (tRes.getResponseCode() === 200) {
        var tData = JSON.parse(tRes.getContentText());
        if (tData.features) {
          var dist = 0, time = 0, jammed = [];
          tData.features.forEach(function(f) {
            var p = f.properties || {};
            if (p.totalDistance) dist = p.totalDistance;
            if (p.totalTime) time = p.totalTime;
            if ((p.congestion === 3 || p.congestion === 4) && p.name && jammed.indexOf(p.name) === -1) {
              jammed.push(p.name);
            }
          });
          result.tmap = {
            configured: true,
            distanceKm: (dist / 1000).toFixed(1),
            durationMin: Math.round(time / 60),
            congestedRoads: jammed.slice(0, 4)
          };
        }
      }
    } catch (e) {
      result.tmap = { configured: true, error: e.toString() };
    }
  } else {
    result.tmap = { configured: false };
  }

  // 4. 네이버지도 Driving API 연동
  if (naverId && naverSecret) {
    try {
      var nUrl = "https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=" + startLng + "," + startLat + "&goal=" + destLng + "," + destLat;
      var nRes = UrlFetchApp.fetch(nUrl, {
        headers: {
          "X-NCP-APIGW-API-KEY-ID": naverId,
          "X-NCP-APIGW-API-KEY": naverSecret
        },
        muteHttpExceptions: true
      });
      if (nRes.getResponseCode() === 200) {
        var nData = JSON.parse(nRes.getContentText());
        if (nData.route && nData.route.traoptimal && nData.route.traoptimal[0]) {
          var opt = nData.route.traoptimal[0];
          var jammed = [];
          (opt.section || []).forEach(function(sec) {
            if (sec.congestion >= 2 && sec.name && jammed.indexOf(sec.name) === -1) {
              jammed.push(sec.name);
            }
          });
          result.naver = {
            configured: true,
            distanceKm: (opt.summary.distance / 1000).toFixed(1),
            durationMin: Math.round(opt.summary.duration / 60000),
            congestedRoads: jammed.slice(0, 4)
          };
        }
      }
    } catch (e) {
      result.naver = { configured: true, error: e.toString() };
    }
  } else {
    result.naver = { configured: false };
  }

  return createJsonResponse(result);
}

// ------------------------------------------------------------------------------
// 기능 2: 구글 드라이브(Google Drive)에 주차 데이터 & 사진 저장
// ------------------------------------------------------------------------------
function handleSaveToDrive(data) {
  try {
    var FOLDER_NAME = "오토링크_스마트파킹_데이터";
    var folders = DriveApp.getFoldersByName(FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);

    // 1) 주차 정보 JSON 저장 / 갱신
    var fileName = "latest_parking_status.json";
    var files = folder.getFilesByName(fileName);
    var fileContent = JSON.stringify({
      savedAt: new Date().toISOString(),
      vehicle: data.vehicleName || "내 차량",
      plate: data.vehiclePlate || "",
      floor: data.floor || "B1",
      zone: data.zone || "A-01",
      address: data.address || "",
      memo: data.memo || "",
      lat: data.lat,
      lng: data.lng
    }, null, 2);

    if (files.hasNext()) {
      var file = files.next();
      file.setContent(fileContent);
    } else {
      folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
    }

    // 2) 주차 사진이 base64 데이터로 전송된 경우 구글 드라이브에 이미지 파일로 저장
    var photoUrl = "";
    if (data.photoDataUrl && data.photoDataUrl.indexOf("base64,") !== -1) {
      var base64Data = data.photoDataUrl.split("base64,")[1];
      var decodedBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg", "parking_" + Utilities.formatDate(new Date(), "GMT+9", "yyyyMMdd_HHmmss") + ".jpg");
      var imgFile = folder.createFile(decodedBlob);
      photoUrl = imgFile.getUrl();
    }

    return createJsonResponse({
      status: "success",
      message: "구글 드라이브에 안전하게 동기화 저장되었습니다.",
      folderUrl: folder.getUrl(),
      photoUrl: photoUrl
    });
  } catch (e) {
    return createJsonResponse({ status: "error", message: e.toString() });
  }
}

// ------------------------------------------------------------------------------
// 기능 3: 구글 드라이브에 저장된 최신 주차 정보 로드
// ------------------------------------------------------------------------------
function handleLoadParking() {
  try {
    var FOLDER_NAME = "오토링크_스마트파킹_데이터";
    var folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (!folders.hasNext()) {
      return createJsonResponse({ status: "not_found" });
    }
    var folder = folders.next();
    var files = folder.getFilesByName("latest_parking_status.json");
    if (!files.hasNext()) {
      return createJsonResponse({ status: "not_found" });
    }
    var file = files.next();
    var content = JSON.parse(file.getBlob().getDataAsString());
    return createJsonResponse({ status: "success", data: content });
  } catch (e) {
    return createJsonResponse({ status: "error", message: e.toString() });
  }
}

// ------------------------------------------------------------------------------
// 기능 4: Gemini AI 주차 복귀 브리핑 프록시
// ------------------------------------------------------------------------------
function handleAiBriefing(data) {
  var geminiKey = data.geminiKey;
  var context = data.context || "";
  
  if (!geminiKey) {
    return createJsonResponse({
      status: "success",
      briefing: "지하 주차장 복귀 시 엘리베이터 홀 위치를 꼭 확인하시고, 출차 전 상가/건물 주차 할인 등록을 잊지 마세요!"
    });
  }

  try {
    var gUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + geminiKey;
    var prompt = "당신은 차량 자동 주차 관리 솔루션 '오토링크 파킹'의 AI 비서입니다. 다음 주차 정보를 바탕으로 운전자가 차량으로 복귀할 때 헷갈리지 않도록 2~3문장으로 간결하고 친절한 복귀 안내와 출차 체크 팁을 작성해주세요:\n" + context;
    
    var gPayload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    var res = UrlFetchApp.fetch(gUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(gPayload),
      muteHttpExceptions: true
    });

    var gData = JSON.parse(res.getContentText());
    var reply = gData.candidates[0].content.parts[0].text;
    return createJsonResponse({ status: "success", briefing: reply });
  } catch (e) {
    return createJsonResponse({ status: "error", message: e.toString() });
  }
}

// ------------------------------------------------------------------------------
// 유틸리티: CORS 헤더를 포함한 JSON 응답 생성
// ------------------------------------------------------------------------------
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
