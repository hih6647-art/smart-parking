/**
 * ====================================================================
 * 오토링크 파킹 (AutoLink Parking) v2.4 - Google Apps Script 클라우드 서버
 * ====================================================================
 * [구글 앱스 스크립트 30초 설정 가이드]
 * 1. 이 파일의 전체 내용(Ctrl + A)을 복사(Ctrl + C)합니다.
 * 2. 구글 스크립트 에디터에서 기존 내용을 지우고 붙여넣기(Ctrl + V) 후 저장(Ctrl + S)합니다.
 * 3. 상단 함수 선택창에서 `setupAutoLinkParking`을 선택하고 [실행]을 누르면 구글 드라이브 폴더가 자동 생성됩니다.
 * 4. 우측 상단 [배포] -> [새 배포] -> 유형: [웹 앱]
 *    - 실행 주체: 나(Me)
 *    - 액세스 권한: 모든 사용자 (Anyone)  <-- 필수!
 * 5. 배포 완료 후 나타나는 웹 앱 URL을 스마트폰 앱 설정창에 넣으면 끝!
 */

var FOLDER_NAME = "오토링크_스마트파킹_데이터";
var SHEET_NAME = "오토링크_주차기록_DB";

// 1클릭 초기 자동 구축 및 권한 승인 함수
function setupAutoLinkParking() {
  var folder = getOrCreateFolder_();
  var ss = getOrCreateSpreadsheet_(folder);
  Logger.log("✅ 자동 설정 완료!");
  Logger.log("📁 구글 드라이브 폴더 URL: " + folder.getUrl());
  Logger.log("📊 구글 스프레드시트 DB URL: " + ss.getUrl());
}

// GET 요청 처리 (서버 생존 확인 ping 및 데이터 조회)
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
  if (action === "loadParking") {
    return createJsonResponse(handleLoadParkingObj_());
  }
  return createJsonResponse({
    status: "success",
    service: "AutoLink Parking v2.4 Google Apps Script Backend",
    time: new Date().toISOString()
  });
}

// POST 요청 처리 (주차 데이터 저장, 4사 내비 비교, API 키 보관)
function doPost(e) {
  try {
    var raw = e && e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(raw);
    var resObj = handleClientRequest(payload);
    return createJsonResponse(resObj);
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// 통합 요청 처리기
function handleClientRequest(payload) {
  var action = payload.action || "ping";
  var props = PropertiesService.getScriptProperties();

  if (action === "ping") {
    return { status: "success", message: "pong", time: new Date().toISOString() };
  }
  if (action === "saveKeys") {
    if (payload.kakaoKey) props.setProperty("KAKAO_KEY", payload.kakaoKey);
    if (payload.tmapKey) props.setProperty("TMAP_KEY", payload.tmapKey);
    if (payload.naverId) props.setProperty("NAVER_ID", payload.naverId);
    if (payload.naverSecret) props.setProperty("NAVER_SECRET", payload.naverSecret);
    return { status: "success", message: "API 키가 안전하게 저장되었습니다." };
  }
  if (action === "compareRoutes") {
    return handleCompareRoutesObj_(payload);
  }
  if (action === "saveToDrive") {
    return handleSaveToDriveObj_(payload);
  }
  if (action === "loadParking") {
    return handleLoadParkingObj_();
  }
  return { status: "error", message: "Unknown action: " + action };
}

// 4사 실시간 내비 경로 비교 및 정체 도로명 분석
function handleCompareRoutesObj_(data) {
  var props = PropertiesService.getScriptProperties();
  var startLat = data.startLat;
  var startLng = data.startLng;
  var destLat = data.destLat;
  var destLng = data.destLng;

  var kakaoKey = data.kakaoKey || props.getProperty("KAKAO_KEY") || "";
  var tmapKey = data.tmapKey || props.getProperty("TMAP_KEY") || "";
  var naverId = data.naverId || props.getProperty("NAVER_ID") || "";
  var naverSecret = data.naverSecret || props.getProperty("NAVER_SECRET") || "";

  var result = { status: "success", kakao: { configured: false }, tmap: { configured: false }, naver: { configured: false } };

  if (kakaoKey) {
    try {
      var kUrl = "https://apis-navi.kakaomobility.com/v1/directions?origin=" + startLng + "," + startLat + "&destination=" + destLng + "," + destLat + "&priority=RECOMMEND";
      var kRes = UrlFetchApp.fetch(kUrl, { headers: { "Authorization": "KakaoAK " + kakaoKey }, muteHttpExceptions: true });
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
    } catch (e) {}
  }

  if (tmapKey) {
    try {
      var tUrl = "https://apis.openapi.sk.com/tmap/routes?version=1&format=json";
      var tRes = UrlFetchApp.fetch(tUrl, {
        method: "post",
        contentType: "application/json",
        headers: { "appKey": tmapKey },
        payload: JSON.stringify({ startX: startLng, startY: startLat, endX: destLng, endY: destLat, reqCoordType: "WGS84GEO", resCoordType: "WGS84GEO" }),
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
    } catch (e) {}
  }

  if (naverId && naverSecret) {
    try {
      var nUrl = "https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=" + startLng + "," + startLat + "&goal=" + destLng + "," + destLat + "&option=traoptimal";
      var nRes = UrlFetchApp.fetch(nUrl, {
        headers: { "X-NCP-APIGW-API-KEY-ID": naverId, "X-NCP-APIGW-API-KEY": naverSecret },
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
    } catch (e) {}
  }

  return result;
}

// 구글 드라이브 폴더 및 스프레드시트에 주차 위치, 사진 저장
function handleSaveToDriveObj_(data) {
  var folder = getOrCreateFolder_();
  var ss = getOrCreateSpreadsheet_(folder);
  var sheet = ss.getSheetByName("주차기록");
  var now = new Date();
  var photoUrl = "";

  if (data.photoDataUrl && data.photoDataUrl.indexOf("base64,") !== -1) {
    try {
      var parts = data.photoDataUrl.split("base64,");
      var contentType = parts[0].split(":")[1].split(";")[0];
      var decoded = Utilities.base64Decode(parts[1]);
      var fileName = "주차사진_" + Utilities.formatDate(now, "Asia/Seoul", "yyyyMMdd_HHmmss") + ".jpg";
      var file = folder.createFile(Utilities.newBlob(decoded, contentType, fileName));
      photoUrl = file.getUrl();
    } catch (e) {}
  }

  sheet.appendRow([
    now,
    data.vehicleName || "내 차량",
    data.vehiclePlate || "",
    data.floor || "",
    data.zone || "",
    data.address || "",
    data.lat || 0,
    data.lng || 0,
    photoUrl
  ]);

  var props = PropertiesService.getScriptProperties();
  props.setProperty("LAST_PARKING", JSON.stringify({
    vehicleName: data.vehicleName || "내 차량",
    vehiclePlate: data.vehiclePlate || "",
    floor: data.floor || "",
    zone: data.zone || "",
    address: data.address || "",
    lat: data.lat || 0,
    lng: data.lng || 0,
    photoUrl: photoUrl,
    timestamp: now.getTime()
  }));

  return { status: "success", message: "구글 드라이브 및 스프레드시트에 저장되었습니다.", photoUrl: photoUrl };
}

// 최근 주차 기록 불러오기
function handleLoadParkingObj_() {
  var props = PropertiesService.getScriptProperties();
  var last = props.getProperty("LAST_PARKING");
  if (last) {
    return { status: "success", data: JSON.parse(last) };
  }
  return { status: "empty", message: "저장된 기록이 없습니다." };
}

function getOrCreateFolder_() {
  var iter = DriveApp.getFoldersByName(FOLDER_NAME);
  if (iter.hasNext()) return iter.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function getOrCreateSpreadsheet_(folder) {
  var files = folder.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);
  var sheet = ss.getActiveSheet();
  sheet.setName("주차기록");
  sheet.appendRow(["기록일시", "차량명", "차량번호", "주차층수", "기둥번호", "상세주소", "위도", "경도", "현장사진URL"]);
  sheet.setFrozenRows(1);
  return ss;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
