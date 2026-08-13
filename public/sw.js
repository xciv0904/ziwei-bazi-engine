// Service Worker — 離線支援
// 策略:hashed assets(內容雜湊檔名，永不變)快取優先；其餘（index.html 等）網路優先、離線退回快取。
// 版本號：改動這支檔案或想強制淘汰舊快取時要一起改（activate 會刪掉所有非本版本的快取）。
// v4 → v5：這一版把「有新版本」的提示接上（見 main.js 的 serviceWorker.register），
// 起因是使用者回報排盤結果錯誤，實際上是分頁開著沒關、手上是舊的 bundle。
const CACHE = 'zwbz-v5';

// install 階段先把 app shell 抓進快取。
// 之前完全不預快取，「離線可用」實際上是「你剛好造訪過的那幾頁才可用」——
// 第一次進站就沒網路的人會看到白畫面，加入主畫面後首次開啟也一樣。
// 這裡只列不含 hash 的固定路徑；帶 hash 的 assets 仍交給 fetch 事件在首次載入時順手快取
// (檔名每次建置都會變，寫死在這裡反而會在部署後立刻失效)。
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icons.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // 個別 add,任何一支 404 都不該讓整個 SW 安裝失敗（例如日後刪掉某個圖示卻忘了改這份清單）
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // 帶查詢字串的網址（分享連結 ?date=...&name=...）不要進快取：
  // 每組生辰都會產生一支不同的 URL,照單全收會讓快取無限膨脹，而且回應內容其實是同一份 index.html。
  // 導覽請求一律以「不含查詢字串的頁面」作為快取鍵，離線時才有東西可退回。
  const isNavigate = event.request.mode === 'navigate';
  const cacheKey = isNavigate ? new Request(url.origin + url.pathname) : event.request;

  if (url.pathname.includes('/assets/')) {
    // 快取優先（檔名含 hash,內容不會變）
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(cacheKey, res.clone());
        return res;
      }),
    );
  } else {
    // 網路優先（部署新版後重新整理即可拿到），離線時退回快取
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(cacheKey)) ?? (await caches.match('./index.html'))),
    );
  }
});
