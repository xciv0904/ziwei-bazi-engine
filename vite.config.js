import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 一般模式:npx vite build              → dist/(部署用,相對路徑)
// 單檔模式:npx vite build --mode singlefile → 全部內聯成一個 index.html(可直接雙擊開啟)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'singlefile' ? [viteSingleFile()] : [],
  build: {
    chunkSizeWarningLimit: 1200, // iztro + lunar-javascript 本體較大
  },
}));
