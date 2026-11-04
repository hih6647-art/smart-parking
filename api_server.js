/**
 * AutoLink SmartParking v2.3 - Node.js API Server
 * Zero external dependencies (uses native Node.js http/https)
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon'
};

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. 4-Company Navigation Compare API
  if (pathname === '/api/routes/compare' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { startLat, startLng, destLat, destLng, kakaoKey, tmapKey, naverId, naverSecret } = payload;

        const result = {
          status: 'success',
          timestamp: new Date().toISOString(),
          apple: null,
          kakao: null,
          tmap: null,
          naver: null
        };

        // OSRM
        try {
          const osrm = await httpsRequest({
            hostname: 'router.project-osrm.org',
            path: `/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=false&steps=true`,
            method: 'GET',
            headers: { 'User-Agent': 'AutoLink-Parking/2.3' }
          });
          if (osrm.body && osrm.body.routes && osrm.body.routes[0]) {
            const r = osrm.body.routes[0];
            const steps = (r.legs?.[0]?.steps || [])
              .map(s => s.name)
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .slice(0, 4);
            result.apple = {
              configured: true,
              distanceKm: (r.distance / 1000).toFixed(1),
              durationMin: Math.max(1, Math.round(r.duration / 60)),
              roads: steps
            };
          }
        } catch (e) {
          result.apple = { configured: true, error: e.message };
        }

        // Kakao
        if (kakaoKey) {
          try {
            const kRes = await httpsRequest({
              hostname: 'apis-navi.kakaomobility.com',
              path: `/v1/directions?origin=${startLng},${startLat}&destination=${destLng},${destLat}`,
              method: 'GET',
              headers: { 'Authorization': `KakaoAK ${kakaoKey}` }
            });
            if (kRes.body?.routes?.[0]) {
              const sum = kRes.body.routes[0].summary;
              const jammed = [];
              (kRes.body.routes[0].sections || []).forEach(sec => {
                (sec.roads || []).forEach(rd => {
                  if ((rd.traffic_state === 1 || rd.traffic_state === 2) && rd.name && !jammed.includes(rd.name)) {
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
          } catch (e) {
            result.kakao = { configured: true, error: e.message };
          }
        } else {
          result.kakao = { configured: false };
        }

        // TMAP
        if (tmapKey) {
          try {
            const tBody = JSON.stringify({
              startX: startLng,
              startY: startLat,
              endX: destLng,
              endY: destLat,
              reqCoordType: 'WGS84GEO',
              resCoordType: 'WGS84GEO'
            });
            const tRes = await httpsRequest({
              hostname: 'apis.openapi.sk.com',
              path: '/tmap/routes?version=1&format=json',
              method: 'POST',
              headers: {
                'appKey': tmapKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(tBody)
              }
            }, tBody);
            if (tRes.body?.features) {
              let dist = 0, time = 0;
              const jammed = [];
              tRes.body.features.forEach(f => {
                const p = f.properties || {};
                if (p.totalDistance) dist = p.totalDistance;
                if (p.totalTime) time = p.totalTime;
                if ((p.congestion === 3 || p.congestion === 4) && p.name && !jammed.includes(p.name)) {
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
          } catch (e) {
            result.tmap = { configured: true, error: e.message };
          }
        } else {
          result.tmap = { configured: false };
        }

        // Naver
        if (naverId && naverSecret) {
          try {
            const nRes = await httpsRequest({
              hostname: 'naveropenapi.apigw.ntruss.com',
              path: `/map-direction/v1/driving?start=${startLng},${startLat}&goal=${destLng},${destLat}`,
              method: 'GET',
              headers: {
                'X-NCP-APIGW-API-KEY-ID': naverId,
                'X-NCP-APIGW-API-KEY': naverSecret
              }
            });
            if (nRes.body?.route?.traoptimal?.[0]) {
              const opt = nRes.body.route.traoptimal[0];
              const sum = opt.summary;
              const jammed = [];
              (opt.section || []).forEach(sec => {
                if (sec.congestion >= 2 && sec.name && !jammed.includes(sec.name)) {
                  jammed.push(sec.name);
                }
              });
              result.naver = {
                configured: true,
                distanceKm: (sum.distance / 1000).toFixed(1),
                durationMin: Math.round(sum.duration / 60000),
                congestedRoads: jammed.slice(0, 4)
              };
            }
          } catch (e) {
            result.naver = { configured: true, error: e.message };
          }
        } else {
          result.naver = { configured: false };
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // 2. Static File Serving
  let relPath = pathname.replace(/^\/+/, '');
  if (!relPath) relPath = 'index.html';
  const filePath = path.join(ROOT_DIR, relPath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`AutoLink Parking API Server running at http://localhost:${PORT}/`);
});
