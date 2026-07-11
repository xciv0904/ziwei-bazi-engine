# 紫微斗數・八字排盤

免費線上排盤網站:輸入生辰,即得紫微斗數十二宮命盤、八字四柱,以及規則組裝生成的白話解讀報告(不呼叫任何外部 AI API)。所有計算皆在瀏覽器內完成,生辰資料不會上傳。

**線上版:https://xciv0904.github.io/ziwei-bazi-engine/**

## 功能

- **命盤總覽**:紫微 12 宮井字盤(可點宮位看小教室)、八字四柱(十神/藏干/納音/五行分布)、大限流年逐年瀏覽
- **解讀報告**:紫微六大主題 + 八字四大主題的手風琴式重點解讀
- **命盤解析**:6 段式紫微綜合報告 + 6 段式八字綜合報告(含全盤概覽、地支關係、神煞),純規則組裝生成
- **大眾版/學習版**:同一份命盤兩種文風——大眾版全白話、學習版附亮度/四化/十神/神煞術語與依據
- **分享命卡**:產生命卡圖片(可下載)、QR Code 與分享連結(帶生辰參數,開啟自動排盤)、LINE 分享
- **複製給 AI 解讀**:一鍵把排盤原始資料整理成適合貼給任何對話式 AI 的純文字

## 技術架構

- 排盤引擎:[iztro](https://github.com/SylarLong/iztro)(紫微,中州派)+ [lunar-javascript](https://github.com/6tail/lunar-javascript)(八字/曆法)
- 解讀引擎:`src/engines/` 純規則組裝(宮位×星曜文案 × 亮度 × 四化 × 雙星組合 × 空宮借星…),文案庫在 `src/data/*.json`
- 前端:Vite + vanilla JS,無框架;排盤庫動態載入(首屏僅約 110KB)
- 部署:push `main` 即觸發 GitHub Actions(先跑排盤回歸 + 交叉驗證 + UI 冒煙測試,全過才 build 部署到 GitHub Pages)

## 開發指令

```bash
npm install        # 安裝依賴
npm run dev        # 本地開發伺服器
npm test           # 排盤核心值回歸測試
npm run smoke      # headless UI 冒煙測試(happy-dom)
node cross-test.mjs        # 紫微交叉驗證(對照外部排盤網站數據)
node cross-test-bazi.mjs   # 八字交叉驗證
npx vite build     # 產出部署版 dist/
npx vite build --mode singlefile --outDir dist-single   # 單檔 HTML(可雙擊開啟)
```

## 準確性

排盤結果已與外部排盤網站交叉驗證兩張完整命盤(紫微 47 項、八字 36 項全數一致;主星亮度採七階制,與四階制網站的對照表見 `BRIGHTNESS_ALIAS`)。曆法轉換支援 1900–2100 年,農曆輸入暫不處理閏月。

## 免責聲明

本站內容僅供娛樂與傳統文化參考,不構成任何醫療、財務或人生決策建議。
