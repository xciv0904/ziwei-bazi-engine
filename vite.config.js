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

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'singlefile' ? [viteSingleFile(), stripCspForSingleFile()] : [],
  build: {
    chunkSizeWarningLimit: 1200, // iztro + lunar-javascript 本體較大
  },
}));
