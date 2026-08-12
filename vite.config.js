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
 * iztro 的 i18n 進入點會靜態 require 六個語系（zh-CN / zh-TW / en-US / ja-JP / ko-KR / vi-VN）,
 * 打包器沒辦法搖掉，於是四個本站永遠用不到的語系跟著進了 ziwei chunk——
 * 而 ziwei chunk 正好在關鍵路徑上（使用者按下排盤就要等它）。
 * 本站在 ziwei.js 內固定 setLanguage('zh-TW'),繁中與簡中兩份保留（kot() 的反查會用到），
 * 其餘四個換成空物件。實測 ziwei chunk 470.11 kB → 441.65 kB（gzip 148.83 → 140.52）。
 */
const DROPPED_IZTRO_LOCALES = ['en-US', 'ja-JP', 'ko-KR', 'vi-VN'];
const dropUnusedIztroLocales = () => ({
  name: 'drop-unused-iztro-locales',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !importer.includes('iztro')) return null;
    const hit = DROPPED_IZTRO_LOCALES.some(
      (l) => source.endsWith(`locales/${l}`) || source.endsWith(`locales/${l}/index.js`),
    );
    return hit ? '\0iztro-empty-locale' : null;
  },
  load(id) {
    return id === '\0iztro-empty-locale' ? 'export default {};' : null;
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'singlefile'
    ? [dropUnusedIztroLocales(), viteSingleFile(), stripCspForSingleFile()]
    : [dropUnusedIztroLocales(), tightenCspForBuild()],
  build: {
    chunkSizeWarningLimit: 1200, // iztro + lunar-javascript 本體較大
  },
}));
