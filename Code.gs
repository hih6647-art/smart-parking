/**
 * ====================================================================
 * 오토링크 파킹 (AutoLink Parking) v2.4 - Google Apps Script 자동화 서버
 * ====================================================================
 * [구글 앱스 스크립트에서 1클릭 자동 설정 방법]
 * 1. 상단 함수 선택 드롭다운에서 `setupAutoLinkParking`을 선택하고 [실행(Run)]을 한 번 누르세요.
 *    -> 구글 드라이브 폴더('오토링크_스마트파킹_데이터')와 스프레드시트('오토링크_주차기록_DB')가 자동 생성되고 모든 권한이 한 번에 승인됩니다!
 * 2. 우측 상단 [배포] -> [새 배포] -> 유형: [웹 앱] (실행 주체: 나, 액세스: 모든 사용자)로 배포 후 URL을 앱에 붙여넣으세요.
 */

var FOLDER_NAME = "오토링크_스마트파킹_데이터";
var SHEET_NAME = "오토링크_주차기록_DB";

// 1클릭 초기 자동 구축 및 모든 권한 승인 함수 (스크립트 에디터에서 [실행] 클릭)
function setupAutoLinkParking() {
  var folder = getOrCreateFolder_();
  var ss = getOrCreateSpreadsheet_(folder);
  Logger.log("✅ 자동 설정 완료!");
  Logger.log("📁 구글 드라이브 폴더 URL: " + folder.getUrl());
  Logger.log("📊 구글 스프레드시트 DB URL: " + ss.getUrl());
}

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

function doPost(e) {
  try {
    var rawData = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var payload = JSON.parse(rawData);
    var resObj = handleClientRequest(payload);
    return createJsonResponse(resObj);
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

// google.script.run 및 doPost 공용 요청 처리기
function handleClientRequest(payload) {
  var action = (payload && payload.action) ? payload.action : "ping";
  if (action === "ping") {
    return { status: "success", time: new Date().toISOString() };
  }
  if (action === "saveKeys") {
    var props = PropertiesService.getScriptProperties();
    if (payload.kakaoKey) props.setProperty("KAKAO_KEY", payload.kakaoKey);
    if (payload.tmapKey) props.setProperty("TMAP_KEY", payload.tmapKey);
    if (payload.naverId) props.setProperty("NAVER_ID", payload.naverId);
    if (payload.naverSecret) props.setProperty("NAVER_SECRET", payload.naverSecret);
    return { status: "success", message: "API 키가 구글 서버에 안전하게 저장되었습니다." };
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

function handleSaveToDriveObj_(data) {
  var folder = getOrCreateFolder_();
  var fileName = "latest_parking_status.json";
  var files = folder.getFilesByName(fileName);
  var record = {
    savedAt: Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm:ss"),
    vehicle: data.vehicleName || "내 차량",
    plate: data.vehiclePlate || "",
    floor: data.floor || "B1",
    zone: data.zone || "A-01",
    address: data.address || "",
    lat: data.lat || 37.5665,
    lng: data.lng || 126.9780
  };
  var content = JSON.stringify(record, null, 2);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }

  // 사진이 있으면 드라이브에 이미지로 저장
  var photoUrl = "";
  if (data.photoDataUrl && data.photoDataUrl.indexOf("base64,") !== -1) {
    var base64Data = data.photoDataUrl.split("base64,")[1];
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg", "parking_" + Utilities.formatDate(new Date(), "GMT+9", "yyyyMMdd_HHmmss") + ".jpg");
    photoUrl = folder.createFile(blob).getUrl();
  }

  // 구글 스프레드시트에도 이력 자동 추가
  try {
    var ss = getOrCreateSpreadsheet_(folder);
    var sheet = ss.getSheets()[0];
    sheet.appendRow([record.savedAt, record.vehicle, record.plate, record.floor, record.zone, record.address, photoUrl]);
  } catch (e) {}

  return { status: "success", folderUrl: folder.getUrl(), photoUrl: photoUrl };
}

function handleLoadParkingObj_() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (!folders.hasNext()) return { status: "not_found" };
  var folder = folders.next();
  var files = folder.getFilesByName("latest_parking_status.json");
  if (!files.hasNext()) return { status: "not_found" };
  var content = JSON.parse(files.next().getBlob().getDataAsString());
  return { status: "success", data: content };
}

function getOrCreateFolder_() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getOrCreateSpreadsheet_(folder) {
  var files = folder.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.openById(files.next().getId());
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  var sheet = ss.getSheets()[0];
  sheet.appendRow(["저장시각", "차량명", "차량번호", "층수", "기둥/구역", "주소", "사진링크"]);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);
  return ss;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
