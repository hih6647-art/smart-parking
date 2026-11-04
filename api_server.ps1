# ==============================================================================
# AutoLink SmartParking v2.3 - 통합 초경량 로컬 API 서버
# (Windows 기본 탑재 PowerShell로 추가 설치 없이 즉시 실행 가능)
# ==============================================================================
param(
    [int]$Port = 8080
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = $PSScriptRoot
if (-not $root) { $root = "C:\Users\hih05\.gemini\antigravity\scratch\JuchaPing" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host " [오토링크 스마트파킹 v2.3] API & 웹 통합 서버 가동 완료!" -ForegroundColor Green
    Write-Host " - 웹앱 접속:  http://localhost:$Port/" -ForegroundColor Yellow
    Write-Host " - 4사 내비 API 엔드포인트:  http://localhost:$Port/api/routes/compare" -ForegroundColor Yellow
    Write-Host " - AI 비서 엔드포인트:        http://localhost:$Port/api/ai/briefing" -ForegroundColor Yellow
    Write-Host " - 종료하려면 터미널에서 Ctrl+C 를 누르세요." -ForegroundColor DarkGray
    Write-Host "==================================================================" -ForegroundColor Cyan
} catch {
    Write-Host "[오류] 포트 $Port 를 시작할 수 없습니다: $_" -ForegroundColor Red
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".svg"  = "image/svg+xml"
    ".css"  = "text/css; charset=utf-8"
    ".ico"  = "image/x-icon"
}

function Send-JsonResponse($response, $data, [int]$statusCode = 200) {
    $json = ConvertTo-Json -InputObject $data -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $urlPath = $request.Url.LocalPath

        # CORS 사전 요청(OPTIONS) 처리
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Close()
            continue
        }

        # 1. 4사 내비게이션 실시간 경로 및 정체 구간 비교 API
        if ($urlPath -eq "/api/routes/compare" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $payload = ConvertFrom-Json $body

            $startLat = [double]$payload.startLat
            $startLng = [double]$payload.startLng
            $destLat = [double]$payload.destLat
            $destLng = [double]$payload.destLng

            $kakaoKey = [string]$payload.kakaoKey
            $tmapKey = [string]$payload.tmapKey
            $naverId = [string]$payload.naverId
            $naverSecret = [string]$payload.naverSecret

            $result = @{
                status = "success"
                timestamp = (Get-Date).ToString("o")
                apple = $null
                kakao = $null
                tmap = $null
                naver = $null
            }

            # 1) 기본 OSRM (애플 지도 대응)
            try {
                $osrmUrl = "https://router.project-osrm.org/route/v1/driving/$($startLng),$($startLat);$($destLng),$($destLat)?overview=false&steps=true"
                $osrmRes = Invoke-RestMethod -Uri $osrmUrl -Method Get -TimeoutSec 5 -UserAgent "AutoLink-Parking/2.3"
                if ($osrmRes.routes -and $osrmRes.routes.Count -gt 0) {
                    $r = $osrmRes.routes[0]
                    $steps = @()
                    if ($r.legs -and $r.legs[0].steps) {
                        foreach ($st in $r.legs[0].steps) {
                            if ($st.name -and $steps -notcontains $st.name) {
                                $steps += $st.name
                            }
                        }
                    }
                    $result.apple = @{
                        distanceKm = [math]::Round(($r.distance / 1000), 1)
                        durationMin = [math]::Max(1, [int][math]::Round($r.duration / 60))
                        roads = $steps[0..3]
                        configured = $true
                    }
                }
            } catch {
                $result.apple = @{ configured = $true; error = $_.Exception.Message }
            }

            # 2) 카카오내비 REST API 연동
            if ($kakaoKey) {
                try {
                    $kUrl = "https://apis-navi.kakaomobility.com/v1/directions?origin=$($startLng),$($startLat)&destination=$($destLng),$($destLat)"
                    $kHeaders = @{ "Authorization" = "KakaoAK $kakaoKey" }
                    $kRes = Invoke-RestMethod -Uri $kUrl -Headers $kHeaders -Method Get -TimeoutSec 6
                    if ($kRes.routes -and $kRes.routes.Count -gt 0) {
                        $sum = $kRes.routes[0].summary
                        $jammed = @()
                        if ($kRes.routes[0].sections) {
                            foreach ($sec in $kRes.routes[0].sections) {
                                if ($sec.roads) {
                                    foreach ($rd in $sec.roads) {
                                        if (($rd.traffic_state -eq 1 -or $rd.traffic_state -eq 2) -and $rd.name -and $jammed -notcontains $rd.name) {
                                            $jammed += $rd.name
                                        }
                                    }
                                }
                            }
                        }
                        $result.kakao = @{
                            configured = $true
                            distanceKm = [math]::Round(($sum.distance / 1000), 1)
                            durationMin = [int][math]::Round($sum.duration / 60)
                            congestedRoads = $jammed[0..3]
                        }
                    }
                } catch {
                    $result.kakao = @{ configured = $true; error = $_.Exception.Message }
                }
            } else {
                $result.kakao = @{ configured = $false }
            }

            # 3) 티맵 (TMAP) REST API 연동
            if ($tmapKey) {
                try {
                    $tUrl = "https://apis.openapi.sk.com/tmap/routes?version=1&format=json"
                    $tHeaders = @{
                        "appKey" = $tmapKey
                        "Content-Type" = "application/json"
                    }
                    $tBody = @{
                        startX = $startLng
                        startY = $startLat
                        endX = $destLng
                        endY = $destLat
                        reqCoordType = "WGS84GEO"
                        resCoordType = "WGS84GEO"
                    } | ConvertTo-Json
                    $tRes = Invoke-RestMethod -Uri $tUrl -Headers $tHeaders -Method Post -Body $tBody -TimeoutSec 6
                    if ($tRes.features) {
                        $dist = 0; $time = 0; $jammed = @()
                        foreach ($f in $tRes.features) {
                            $p = $f.properties
                            if ($p.totalDistance) { $dist = $p.totalDistance }
                            if ($p.totalTime) { $time = $p.totalTime }
                            if (($p.congestion -eq 3 -or $p.congestion -eq 4) -and $p.name -and $jammed -notcontains $p.name) {
                                $jammed += $p.name
                            }
                        }
                        $result.tmap = @{
                            configured = $true
                            distanceKm = [math]::Round(($dist / 1000), 1)
                            durationMin = [int][math]::Round($time / 60)
                            congestedRoads = $jammed[0..3]
                        }
                    }
                } catch {
                    $result.tmap = @{ configured = $true; error = $_.Exception.Message }
                }
            } else {
                $result.tmap = @{ configured = $false }
            }

            # 4) 네이버지도 Driving API 연동
            if ($naverId -and $naverSecret) {
                try {
                    $nUrl = "https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=$($startLng),$($startLat)&goal=$($destLng),$($destLat)"
                    $nHeaders = @{
                        "X-NCP-APIGW-API-KEY-ID" = $naverId
                        "X-NCP-APIGW-API-KEY" = $naverSecret
                    }
                    $nRes = Invoke-RestMethod -Uri $nUrl -Headers $nHeaders -Method Get -TimeoutSec 6
                    if ($nRes.route -and $nRes.route.traoptimal) {
                        $opt = $nRes.route.traoptimal[0]
                        $sum = $opt.summary
                        $jammed = @()
                        if ($opt.section) {
                            foreach ($sec in $opt.section) {
                                if (($sec.congestion -ge 2) -and $sec.name -and $jammed -notcontains $sec.name) {
                                    $jammed += $sec.name
                                }
                            }
                        }
                        $result.naver = @{
                            configured = $true
                            distanceKm = [math]::Round(($sum.distance / 1000), 1)
                            durationMin = [int][math]::Round($sum.duration / 60000)
                            congestedRoads = $jammed[0..3]
                        }
                    }
                } catch {
                    $result.naver = @{ configured = $true; error = $_.Exception.Message }
                }
            } else {
                $result.naver = @{ configured = $false }
            }

            Send-JsonResponse $response $result 200
            continue
        }

        # 2. AI 스마트 주차 비서 복귀 브리핑 프록시 API
        if ($urlPath -eq "/api/ai/briefing" -and $request.HttpMethod -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $payload = ConvertFrom-Json $body

            $geminiKey = [string]$payload.geminiKey
            $parkingContext = [string]$payload.context

            if (-not $geminiKey) {
                $defaultReply = @{
                    status = "success"
                    briefing = "지하 주차장 복귀 시 엘리베이터 홀 위치를 꼭 확인하시고, 출차 전 상가/건물 주차 할인 등록을 잊지 마세요!"
                }
                Send-JsonResponse $response $defaultReply 200
                continue
            }

            try {
                $gUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$geminiKey"
                $prompt = "당신은 차량 자동 주차 관리 솔루션 '오토링크 파킹'의 AI 비서입니다. 다음 주차 정보를 바탕으로 운전자가 차량으로 복귀할 때 헷갈리지 않도록 2~3문장으로 간결하고 친절한 복귀 안내와 출차 체크 팁을 작성해주세요:`n$parkingContext"
                
                $gBody = @{
                    contents = @(
                        @{
                            parts = @(
                                @{ text = $prompt }
                            )
                        }
                    )
                } | ConvertTo-Json -Depth 5

                $gRes = Invoke-RestMethod -Uri $gUrl -Method Post -Body $gBody -ContentType "application/json" -TimeoutSec 10
                $aiText = $gRes.candidates[0].content.parts[0].text
                Send-JsonResponse $response @{ status = "success"; briefing = $aiText } 200
            } catch {
                Send-JsonResponse $response @{ status = "error"; message = $_.Exception.Message } 500
            }
            continue
        }

        # 3. 정적 파일 호스팅 (웹 PWA 서빙)
        $relPath = $urlPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($relPath)) {
            $relPath = "index.html"
        }

        $filePath = Join-Path $root $relPath
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $mime
            $response.AddHeader("Access-Control-Allow-Origin", "*")

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
            $response.Close()
        }
    } catch {
        # 예외 발생 시 다음 요청 계속 청취
    }
}
