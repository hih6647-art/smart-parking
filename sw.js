// ❄️ 발열 0% 모드: 백그라운드 Service Worker 상시 실행 및 fetch 인터셉트를 완전 중지합니다.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
