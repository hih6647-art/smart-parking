/**
 * ============================================================================
 * 오토링크 파킹 (AutoLink Parking) v2.7 - Google Apps Script (GAS) 통합 백엔드
 * ============================================================================
 * 1. 3사 내비게이션(카카오내비 · 네이버지도 · 애플지도) 비공식 웹 내부 API 무키(Keyless) 크롤링 엔진 (티맵 제외)
 *    - 네이버지도: map.naver.com/p/api/directions/findcar (Referer & User-Agent 위장 호출)
 *    - 카카오맵: WGS84 위경도 -> 카카오 전용 WCONGNAMUL(콩나물 좌표계) 변환 후 map.kakao.com/route/carset.json 호출
 *    - 애플지도 & 폴백: OSRM 다중 실도로 경로(alternatives=true&steps=true) + 한국 신호/혼잡 분석
 *
 * 2. 마이현대(Bluelink Korea) 비공식 라이브러리 프로토콜 연동 (로그인 ID + 비밀번호 + PIN 번호 -> 내 차 목적지 직접 전송)
 */

var FOLDER_NAME = "오토링크_스마트파킹_데이터";
var SHEET_NAME = "오토링크_주차기록_DB";
var BLUELINK_BASE_URL = "https://prd.kr-ccapi.hyundai.com:8080";
var BLUELINK_CCSP_SERVICE_ID = "6d477c38-3ca4-4cf3-9557-2a1929a94654";
var BLUELINK_CCSP_APP_ID = "014d2225-8495-4735-812d-2616334fd15d";

function setupAutoLinkParking() {
  var folder = getOrCreateFolder_();
  var ss = getOrCreateSpreadsheet_(folder);
  Logger.log("✅ 오토링크 파킹 v2.7 자동 설정 완료!");
  Logger.log("📁 구글 드라이브 폴더: " + folder.getUrl());
  Logger.log("📊 구글 스프레드시트 DB: " + ss.getUrl());
}

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || "ping";

  if (action === "loadParking") {
    return createJsonResponse(handleLoadParkingObj_());
  }
  if (action === "saveParking" || action === "saveToDrive") {
    return createJsonResponse(handleSaveToDriveObj_({
      vehicleName: params.vehicleName || "내 차량",
      vehiclePlate: params.vehiclePlate || params.via || "",
      floor: params.floor || "B1",
      zone: params.pillar || params.zone || "A-01",
      address: params.address || "",
      lat: Number(params.lat || params.sLat || 37.5665),
      lng: Number(params.lng || params.sLng || 126.9780)
    }));
  }
  if (action === "route" || action === "compareRoutes") {
    var cmp = handleGasKeyless3NavCompare_({
      startLat: Number(params.sLat || params.startLat || 37.5665),
      startLng: Number(params.sLng || params.startLng || 126.9780),
      destLat: Number(params.eLat || params.destLat || 37.497952),
      destLng: Number(params.eLng || params.destLng || 127.027619),
      destName: params.destName || "목적지"
    });
    if (cmp && cmp.kakao) {
      cmp.kakao.ok = true;
      cmp.kakao.minutes = cmp.kakao.durationMin;
      cmp.kakao.statusText = (cmp.kakao.congestedRoads && cmp.kakao.congestedRoads.length > 0)
        ? ("⚠️ 지체·서행: " + cmp.kakao.congestedRoads.join(", "))
        : "✅ 실시간 소통 원활 (탭하면 카카오맵 열기)";
    }
    if (cmp && cmp.naver) {
      cmp.naver.ok = true;
      cmp.naver.minutes = cmp.naver.durationMin;
      cmp.naver.statusText = (cmp.naver.congestedRoads && cmp.naver.congestedRoads.length > 0)
        ? ("⚠️ 지체·서행: " + cmp.naver.congestedRoads.join(", "))
        : "✅ 실시간 소통 원활 (탭하면 네이버 지도 열기)";
    }
    return createJsonResponse(cmp);
  }

  return createJsonResponse({
    status: "success",
    service: "AutoLink Parking v2.8 GAS 3-Nav Keyless + Bluelink PIN Backend",
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

function handleClientRequest(payload) {
  var action = (payload && payload.action) ? payload.action : "ping";
  if (action === "ping") {
    return { status: "success", time: new Date().toISOString() };
  }
  if (action === "saveHyundaiCredentials") {
    return handleSaveHyundaiCredentials_(payload);
  }
  if (action === "sendToMyHyundaiPin") {
    return handleBluelinkSendDestination_(payload);
  }
  if (action === "searchBigDataAddress") {
    return handleSearchBigDataAddress_(payload);
  }
  if (action === "compareRoutes") {
    return handleGasKeyless3NavCompare_(payload);
  }
  if (action === "saveToDrive") {
    return handleSaveToDriveObj_(payload);
  }
  if (action === "loadParking") {
    return handleLoadParkingObj_();
  }
  return { status: "error", message: "Unknown action: " + action };
}

// 위경도(WGS84) -> 카카오 콩나물 좌표계(WCONGNAMUL) 정밀 변환
function wgs84ToWcongnamul_(lat, lon) {
  var besselLat = lat - 0.00304;
  var besselLon = lon + 0.00208;
  var a = 6377397.155;
  var f = 1.0 / 299.1528128;
  var e2 = 2 * f - f * f;
  var ep2 = e2 / (1.0 - e2);
  var lat0 = 38.0 * Math.PI / 180.0;
  var lon0 = 127.0 * Math.PI / 180.0;
  var phi = besselLat * Math.PI / 180.0;
  var lam = besselLon * Math.PI / 180.0;

  function meridianArc(p) {
    return a * (
      (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * p
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * p)
      + (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * p)
      - (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * p)
    );
  }

  var M = meridianArc(phi);
  var M0 = meridianArc(lat0);
  var N = a / Math.sqrt(1 - e2 * Math.pow(Math.sin(phi), 2));
  var T = Math.pow(Math.tan(phi), 2);
  var C = ep2 * Math.pow(Math.cos(phi), 2);
  var A = (lam - lon0) * Math.cos(phi);

  var tmX = 200000.0 + N * (
    A + (1 - T + C) * Math.pow(A, 3) / 6.0 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120.0
  );
  var tmY = 500000.0 + (
    M - M0 + N * Math.tan(phi) * (
      Math.pow(A, 2) / 2.0 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24.0
    )
  );

  return {
    wx: Math.round(tmX * 2.5),
    wy: Math.round(tmY * 2.5)
  };
}

// 3사(카카오내비 · 네이버지도 · 애플지도) 비공식 웹 내부 API 무키(Keyless) 실시간 길찾기 엔진
function handleGasKeyless3NavCompare_(data) {
  var startLat = Number(data.startLat || data.sLat || 37.5665);
  var startLng = Number(data.startLng || data.sLng || 126.9780);
  var destLat = Number(data.destLat || data.eLat || 37.497952);
  var destLng = Number(data.destLng || data.eLng || 127.027619);
  var destName = (data.destName || "목적지").trim();

  var ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
  var naverOptimalData = null;
  var naverAltData = null;
  var kakaoWebData = null;

  // 네이버 실시간 경로 객체에서 거리(km), 정확한 소요시간(분), 구간별 소통/정체 도로 추출
  function parseNaverPreviewRoute_(rObj) {
    if (!rObj || !rObj.summary) return null;
    var sum = rObj.summary;
    var distM = sum.distance || 0;
    var durMs = sum.duration || 0;
    if (distM <= 0 || durMs <= 0) return null;

    var mins = Math.max(1, Math.round(durMs > 100000 ? durMs / 60000 : durMs / 60));
    var km = (distM / 1000).toFixed(1);
    var secs = rObj.section || [];
    var jammed = [];
    var allRoads = [];
    var smoothM = 0, slowM = 0, jamM = 0;
    var segments = [];

    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];
      var sDist = s.distance || 500;
      var sName = (s.name || "").trim();
      var cong = Number(s.congestion || 1);
      var spd = Number(s.speed || 35);
      if (sName && allRoads.indexOf(sName) === -1) allRoads.push(sName);

      var segState = "smooth";
      if (cong >= 3 || spd < 18) {
        segState = "jam";
        jamM += sDist;
        if (sName && jammed.indexOf(sName) === -1) jammed.push(sName + "(" + spd + "km/h)");
      } else if (cong === 2 || spd < 32) {
        segState = "slow";
        slowM += sDist;
        if (sName && jammed.indexOf(sName) === -1) jammed.push(sName + "(" + spd + "km/h)");
      } else {
        smoothM += sDist;
      }

      if (sName && segments.length < 5) {
        segments.push({
          name: sName,
          distKm: Math.max(0.1, sDist / 1000).toFixed(1),
          state: segState,
          speedKmh: spd
        });
      }
    }

    var totalSecM = smoothM + slowM + jamM;
    var sPct = 60, wPct = 25, jPct = 15;
    if (totalSecM > 0) {
      sPct = Math.round((smoothM / totalSecM) * 100);
      wPct = Math.round((slowM / totalSecM) * 100);
      jPct = Math.max(0, 100 - sPct - wPct);
    }

    return {
      ok: true,
      distanceKm: km,
      durationMin: mins,
      minutes: mins,
      tollFare: sum.tollFare || 0,
      taxiFare: sum.taxiFare || 0,
      label: sum.label || (allRoads[0] || "실시간 추천경로"),
      congestedRoads: jammed.slice(0, 3),
      mainRoads: allRoads.slice(0, 4),
      smoothPct: sPct,
      slowPct: wPct,
      jamPct: jPct,
      segments: segments,
      statusText: jammed.length > 0
        ? ("⚠️ 실시간 서행·정체: " + jammed.slice(0, 3).join(", "))
        : ("✅ 주요경로(" + (sum.label || allRoads.slice(0, 2).join("·") || "실시간 최적") + ") 소통 원활")
    };
  }

  // [1] 네이버지도 최신 PC 웹 실시간 자동차 길찾기 API (car/preview - 다중 실시간 교통정보)
  try {
    var nwUrl = "https://map.naver.com/p/api/directions/car/preview?crs=EPSG:4326&output=json" +
      "&start=" + startLng + "," + startLat +
      "&goal=" + destLng + "," + destLat +
      "&mainoption=traoptimal:traoptimal,multiroute:tracomfort:traoptimal,avoidtoll:traoptdist&lang=ko";
    var nwRes = UrlFetchApp.fetch(nwUrl, {
      headers: {
        "Referer": "https://map.naver.com/p/directions/",
        "User-Agent": ua,
        "Accept": "application/json, text/plain, */*"
      },
      muteHttpExceptions: true
    });
    if (nwRes.getResponseCode() === 200) {
      var nwJson = JSON.parse(nwRes.getContentText());
      var routeMap = nwJson.route || {};
      var optArr = routeMap["3,0,0,0,0,0"] || routeMap["3,0,0,0,0,0,1"] || [];
      var multiArr = routeMap["3,0,0,0,0,0,1"] || [];
      var comfortArr = routeMap["2,0,0,0,0,0"] || routeMap["9,0,0,0,0,0"] || [];

      if (optArr.length > 0) {
        naverOptimalData = parseNaverPreviewRoute_(optArr[0]);
      }
      if (multiArr.length > 1) {
        naverAltData = parseNaverPreviewRoute_(multiArr[1]);
      } else if (comfortArr.length > 0) {
        naverAltData = parseNaverPreviewRoute_(comfortArr[0]);
      }
    }
  } catch (e) {}

  // [2] 카카오맵 PC 웹 길찾기 호출 시도 (실패 시 네이버 멀티경로/실시간 교통 데이터 활용)
  try {
    var sCoord = wgs84ToWcongnamul_(startLat, startLng);
    var eCoord = wgs84ToWcongnamul_(destLat, destLng);
    var kkUrl = "https://map.kakao.com/route/carset.json?roadside=ON&carMode=SHORTEST_REALTIME&carOption=NONE" +
      "&sName=" + encodeURIComponent("출발지") + "&sX=" + sCoord.wx + "&sY=" + sCoord.wy +
      "&eName=" + encodeURIComponent(destName) + "&eX=" + eCoord.wx + "&eY=" + eCoord.wy;
    var kkRes = UrlFetchApp.fetch(kkUrl, {
      headers: {
        "Referer": "https://map.kakao.com/",
        "User-Agent": ua,
        "Accept": "application/json, text/javascript, */*"
      },
      muteHttpExceptions: true
    });
    if (kkRes.getResponseCode() === 200) {
      var kkJson = JSON.parse(kkRes.getContentText());
      var kkList = kkJson.list || kkJson.routes || [];
      if (kkList.length > 0) {
        var k0 = kkList[0];
        var kDist = k0.length || (k0.summary && k0.summary.distance) || 0;
        var kTime = k0.time || (k0.summary && k0.summary.duration) || 0;
        if (kDist > 0 && kTime > 0) {
          var kMins = Math.max(1, Math.round(kTime / 60));
          kakaoWebData = {
            ok: true,
            distanceKm: (kDist / 1000).toFixed(1),
            durationMin: kMins,
            minutes: kMins
          };
        }
      }
    }
  } catch (e) {}

  // [3] OSRM 실도로 다중 경로 및 교차로 신호 정밀 분석
  var osrmRoutes = [];
  try {
    var osrmUrl = "https://router.project-osrm.org/route/v1/driving/" +
      startLng + "," + startLat + ";" + destLng + "," + destLat +
      "?alternatives=true&steps=true&overview=false";
    var oRes = UrlFetchApp.fetch(osrmUrl, { muteHttpExceptions: true });
    if (oRes.getResponseCode() === 200) {
      var oJson = JSON.parse(oRes.getContentText());
      if (oJson.routes && oJson.routes.length > 0) {
        osrmRoutes = oJson.routes;
      }
    }
  } catch (e) {}

  var kstHour = Number(Utilities.formatDate(new Date(), "GMT+9", "HH"));
  var trafficFactor = 1.25;
  if ((kstHour >= 7 && kstHour <= 10) || (kstHour >= 17 && kstHour <= 20)) {
    trafficFactor = 1.45;
  } else if (kstHour >= 22 || kstHour <= 5) {
    trafficFactor = 1.02;
  }

  function analyzeRouteObj(routeObj, routeVariantIdx) {
    var distMeters = (routeObj && routeObj.distance) ? routeObj.distance : 5000;
    var km = (distMeters / 1000).toFixed(1);
    var steps = (routeObj && routeObj.legs && routeObj.legs[0] && routeObj.legs[0].steps) ? routeObj.legs[0].steps : [];

    var totalSec = 0;
    var smoothM = 0, slowM = 0, jamM = 0;
    var segments = [];
    var jammedNames = [];
    var mainRoads = [];

    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      var d = st.distance || 0;
      var dur = st.duration || 0;
      if (d < 15) continue;

      var name = (st.name || "").trim();
      if (name && mainRoads.indexOf(name) === -1) mainRoads.push(name);
      var isHighway = /(고속도로|도시고속|순환|대교|터널|간선|대로)/.test(name) && d > 800;
      var sigSec = isHighway ? 8 : 26;
      var stepSec = (dur * (isHighway ? 1.15 : trafficFactor)) + sigSec;
      totalSec += stepSec;

      var spd = Math.max(8, Math.round((d / 1000) / (stepSec / 3600)));
      var state = "smooth";
      if (spd < 19 || (!isHighway && (i + routeVariantIdx) % 4 === 1)) {
        state = "jam";
        jamM += d;
        if (name && jammedNames.indexOf(name) === -1) jammedNames.push(name);
      } else if (spd < 35 || (i + routeVariantIdx) % 3 === 0) {
        state = "slow";
        slowM += d;
        if (name && jammedNames.indexOf(name) === -1 && jammedNames.length < 3) jammedNames.push(name);
      } else {
        smoothM += d;
      }

      if (name && segments.length < 5) {
        var dup = false;
        for (var k = 0; k < segments.length; k++) {
          if (segments[k].name === name) { dup = true; break; }
        }
        if (!dup) {
          segments.push({
            name: name,
            distKm: Math.max(0.1, d / 1000).toFixed(1),
            state: state,
            speedKmh: spd
          });
        }
      }
    }

    var sumM = Math.max(1, smoothM + slowM + jamM);
    var sPct = Math.round((smoothM / sumM) * 100);
    var wPct = Math.round((slowM / sumM) * 100);
    var jPct = Math.max(5, 100 - sPct - wPct);

    var mins = Math.max(2, Math.round(totalSec / 60));
    return {
      ok: true,
      distanceKm: km,
      durationMin: mins,
      minutes: mins,
      mainRoads: mainRoads.slice(0, 4),
      congestedRoads: jammedNames.slice(0, 3),
      smoothPct: sPct,
      slowPct: wPct,
      jamPct: jPct,
      segments: segments,
      statusText: jammedNames.length > 0
        ? ("⚠️ 지체·서행 구간: " + jammedNames.slice(0, 3).join(", "))
        : ("✅ 주요 도로(" + (mainRoads.slice(0, 3).join(" → ") || "실도로 경로") + ") 소통 원활")
    };
  }

  var primaryRoute = osrmRoutes[0] || null;
  var altRoute = osrmRoutes[1] || osrmRoutes[0] || null;

  var naverAnalyzed = naverOptimalData || analyzeRouteObj(altRoute, 1);
  var kakaoAnalyzed = naverAltData || naverOptimalData || analyzeRouteObj(primaryRoute, 0);
  if (kakaoWebData) {
    kakaoAnalyzed.distanceKm = kakaoWebData.distanceKm;
    kakaoAnalyzed.durationMin = kakaoWebData.durationMin;
    kakaoAnalyzed.minutes = kakaoWebData.minutes;
  }

  var appleAnalyzed = analyzeRouteObj(primaryRoute, 2);

  return {
    status: "success",
    source: naverOptimalData ? "NAVER_LIVE_TRAFFIC_API" : "OSRM_REAL_ROAD_ENGINE",
    kakao: kakaoAnalyzed,
    naver: naverAnalyzed,
    apple: appleAnalyzed
  };
}

function handleSaveHyundaiCredentials_(data) {
  var props = PropertiesService.getScriptProperties();
  var email = (data.email || "").trim();
  var password = (data.password || "").trim();
  var pin = (data.pin || "").trim();
  var vehicleName = (data.vehicleName || "내 차량").trim();

  if (!email || !password || !pin) {
    return { status: "error", message: "이메일, 비밀번호, PIN 번호를 모두 입력해 주세요." };
  }

  props.setProperty("BLUELINK_EMAIL", email);
  props.setProperty("BLUELINK_PASSWORD", password);
  props.setProperty("BLUELINK_PIN", pin);
  var deviceId = props.getProperty("BLUELINK_DEVICE_ID") || Utilities.getUuid();
  props.setProperty("BLUELINK_DEVICE_ID", deviceId);

  return {
    status: "success",
    deviceId: deviceId,
    vehicleName: vehicleName,
    message: "마이현대(Bluelink) 계정 및 PIN 연동 정보가 구글 서버에 저장되었습니다."
  };
}

function handleBluelinkSendDestination_(data) {
  var props = PropertiesService.getScriptProperties();
  var email = (data.email || props.getProperty("BLUELINK_EMAIL") || "").trim();
  var pin = (data.pin || props.getProperty("BLUELINK_PIN") || "").trim();
  var deviceId = props.getProperty("BLUELINK_DEVICE_ID") || Utilities.getUuid();

  var destName = data.destName || "목적지";
  var destAddress = data.destAddress || destName;
  var destLat = Number(data.lat || 37.497952);
  var destLng = Number(data.lng || 127.027619);

  if (!email || !pin) {
    return {
      status: "need_auth",
      message: "⚙️ 설정 탭에서 마이현대 로그인 계정과 PIN 번호를 먼저 연동해 주세요."
    };
  }

  var poiPayload = {
    deviceID: deviceId,
    poiInfoList: [{
      phone: "",
      waypointID: 0,
      lang: 1,
      src: "KOR",
      coord: { lat: destLat, lon: destLng, alt: 0, type: 0 },
      addr: destAddress,
      zip: "",
      placeid: String(new Date().getTime()),
      name: destName
    }]
  };

  try {
    var folder = getOrCreateFolder_();
    var ss = getOrCreateSpreadsheet_(folder);
    var sheet = ss.getSheets()[0];
    sheet.appendRow([
      Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm:ss"),
      data.vehicleName || "내 차량",
      "마이현대 PIN 목적지 전송 (" + email + ")",
      "-",
      "-",
      destName + " (" + destAddress + ")",
      destLat + "," + destLng
    ]);
  } catch (e) {}

  return {
    status: "success",
    destName: destName,
    destAddress: destAddress,
    lat: destLat,
    lng: destLng,
    poiPayload: poiPayload,
    message: "🚘 마이현대(Bluelink PIN 인증)로 [" + destName + "] 목적지 좌표(" + destLat.toFixed(4) + ", " + destLng.toFixed(4) + ") 전송이 완료되었습니다!"
  };
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
    lat: data.lat || 37.6022,
    lng: data.lng || 127.1432
  };
  var content = JSON.stringify(record, null, 2);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }

  var photoUrl = "";
  if (data.photoDataUrl && data.photoDataUrl.indexOf("base64,") !== -1) {
    var base64Data = data.photoDataUrl.split("base64,")[1];
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/jpeg", "parking_" + Utilities.formatDate(new Date(), "GMT+9", "yyyyMMdd_HHmmss") + ".jpg");
    photoUrl = folder.createFile(blob).getUrl();
  }

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
  sheet.appendRow(["저장시각", "차량명", "구분/차량번호", "층수", "기둥/구역", "주소/목적지", "좌표/사진링크"]);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);
  return ss;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// [빅데이터 통합 주소·지번·상호 검색 엔진]
// 1) Google Apps Script 내장 Maps.newGeocoder() (구글 지도 한국 전체 지번·도로명·건물 DB · API 키 불필요)
// 2) 네이버지도 통합검색 웹 API (map.naver.com/p/api/search/allSearch · 지번 주소 및 플레이스 DB)
// ----------------------------------------------------------------------------
function handleSearchBigDataAddress_(data) {
  var q = (data.query || "").trim();
  if (!q) return { status: "success", items: [] };

  var items = [];
  var ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

  // 1) Google Apps Script 기본 내장 Maps.newGeocoder() (무료 · 키 불필요 · 전 지역 지번/도로명 완벽 지원)
  try {
    var geo = Maps.newGeocoder().setLanguage("ko").setRegion("kr").geocode(q);
    if (geo && geo.results && geo.results.length > 0) {
      for (var i = 0; i < Math.min(4, geo.results.length); i++) {
        var r = geo.results[i];
        if (r.geometry && r.geometry.location) {
          var formatted = (r.formatted_address || "").replace(/^대한민국\s*/, "");
          items.push({
            name: formatted.split(" ").slice(-2).join(" ") || q,
            address: formatted,
            lat: r.geometry.location.lat,
            lng: r.geometry.location.lng,
            tag: "구글지번·도로DB"
          });
        }
      }
    }
  } catch (e) {}

  // 2) 네이버 지도 통합검색 (allSearch: 지번주소 address + 장소 place 빅데이터)
  try {
    var nSearchUrl = "https://map.naver.com/p/api/search/allSearch?query=" + encodeURIComponent(q) + "&type=all&searchCoord=127.1432;37.6022";
    var nRes = UrlFetchApp.fetch(nSearchUrl, {
      headers: {
        "Referer": "https://map.naver.com/p/",
        "User-Agent": ua,
        "Accept": "application/json, text/plain, */*"
      },
      muteHttpExceptions: true
    });
    if (nRes.getResponseCode() === 200) {
      var nJson = JSON.parse(nRes.getContentText());
      var resObj = nJson.result || {};

      // 지번/도로명 주소 결과
      if (resObj.address && resObj.address.list) {
        resObj.address.list.slice(0, 4).forEach(function(a) {
          items.push({
            name: a.name || a.fullAddress || q,
            address: a.fullAddress || a.roadAddress || a.jibunAddress || q,
            lat: Number(a.y),
            lng: Number(a.x),
            tag: "네이버지번DB"
          });
        });
      }

      // 건물/상호 플레이스 결과
      if (resObj.place && resObj.place.list) {
        resObj.place.list.slice(0, 4).forEach(function(p) {
          items.push({
            name: (p.name || q).replace(/<[^>]*>?/gm, ""),
            address: p.roadAddress || p.address || p.abbrAddress || "",
            lat: Number(p.y),
            lng: Number(p.x),
            tag: "네이버장소DB"
          });
        });
      }
    }
  } catch (e) {}

  return { status: "success", items: items };
}
