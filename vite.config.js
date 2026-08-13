import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 一般模式:npx vite build              → dist/(部署用，相對路徑)
// 單檔模式:npx vite build --mode singlefile → 全部內聯成一個 index.html(可直接雙擊開啟)

/**
 * 單檔模式會把所有 JS 內聯成 <script>…</script>,而 index.html 的 CSP 是 script-src 'self',
 * 內聯腳本會整支被擋掉、頁面完全不會動。單檔版是拿來用 file:// 雙擊開啟的離線副本，
 * 'self' 在 file:// 下本來就沒有意義，所以這個模式直接把 CSP meta 拿掉。
 * (部署到網站用的一般模式仍然帶著 CSP。)
 */
const stripCspForSingleFile = () => ({
  name: 'strip-csp-for-singlefile',
  transformIndexHtml(html) {
    return html.replace(/\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '');
  },
});

/**
 * index.html 的 connect-src 帶著 ws: wss:,那是給 Vite 開發模式的 HMR 用的。
 * 正式站不需要任何 WebSocket——這個站沒有後端，排盤全在瀏覽器內完成。
 * 留著等於白白替 XSS 保留一條可用的資料外送通道（生辰資料就在同一個頁面裡），
 * 所以打包時直接拿掉，開發時仍然保留。原始碼裡的註解已寫明可以拿掉，這裡把它自動化。
 */
const tightenCspForBuild = () => ({
  name: 'tighten-csp-for-build',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace("connect-src 'self' ws: wss:", "connect-src 'self'");
  },
});

/**
 * 這裡曾經有一個 dropUnusedIztroLocales 外掛：iztro 的 i18n 進入點會靜態 require
 * 六個語系，四個本站用不到的跟著進了關鍵路徑上的 ziwei chunk,看起來是白白多背的重量，
 * 於是把它們換成空物件，省下 gzip 8.3 kB。
 *
 * 那是錯的，而且錯得很難發現。iztro 的 kot()（把翻譯後的字串反查回內部 key）
 * 實作是掃過 resources 裡「每一個語系」的每一組 key/value 去比對：
 *
 *   for (const [, item] of Object.entries(resources))
 *     for (const [transKey, trans] of Object.entries(item.translation))
 *       if (trans === value) return transKey;
 *
 * 語系被換成空物件之後 item.translation 是 undefined,這個迴圈直接爆掉或回傳原值，
 * 於是安星時查不到正確的 key,輔星與雜曜整批安錯宮。
 *
 * 使用者的回報是「紫微斗數的輔星全部錯亂」,而且用無痕視窗仍然錯——
 * 我一開始還以為是他的瀏覽器快取。真正的原因是：整套測試都跑原始碼，
 * 沒有一支跑建置產物，所以 npm run smoke 全綠、正式站卻是壞的。
 *
 * 現在補了 tests/build-output.mjs 直接對 dist 的 chunk 排一張盤比對。
 * gzip 8.3 kB 不值得為這種風險再試一次，所以這個外掛不會回來。
 */

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'singlefile'
    ? [viteSingleFile(), stripCspForSingleFile()]
    : [tightenCspForBuild()],
  build: {
    chunkSizeWarningLimit: 1200, // iztro + lunar-javascript 本體較大
  },
}));
