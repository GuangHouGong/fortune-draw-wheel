# 土城廣厚宮福德正神・玄壇財神抽獎輪盤

純前端抽獎輪盤 Web App，為土城廣厚宮活動現場與投影使用設計。專案使用 Vite、React、TypeScript 建置，不需要後端、資料庫或外部圖片服務，可直接部署到 GitHub Pages。

預期部署網址：

https://guanghougong.github.io/fortune-draw-wheel/

## 功能列表

- 預設提供 `1` 到 `120` 的抽獎編號，也支援真實姓名。
- 建議活動名單維持 `100` 人內；最多支援 `200` 人。
- 可快速產生 `1` 到指定人數的連號名單。
- 支援一行一位、逗號分隔的名單輸入；純編號也支援空白分隔。
- 大型輪盤與固定上方指針，適合手機、平板、筆電與投影畫面。
- 按下「開始抽獎」快速旋轉，再按「停止抽獎」後慢慢減速並停在中獎區塊。
- 使用 `crypto.getRandomValues` 產生隨機中獎 index。
- 中獎者大字顯示，並加入中獎紀錄。
- 預設避免重複中獎，可切換「允許重複中獎」。
- 使用 `localStorage` 儲存名單設定、重複中獎設定與中獎紀錄。
- 支援清除中獎紀錄、重設為 `1-120`、全螢幕模式、匯出 CSV。
- 內建 `favicon.svg`、`logo.svg`、`og-image.svg` 與活動主視覺素材。

## 本地開發方式

```bash
npm install
npm run dev
```

常用指令：

```bash
npm run build
npm run preview
npm run lint
```

## GitHub Pages 部署方式

`vite.config.ts` 已設定：

```ts
base: '/fortune-draw-wheel/'
```

`.github/workflows/deploy.yml` 會在推送到 `main` 時執行：

1. 安裝依賴。
2. 執行 `npm run build`。
3. 將 `dist` 發布到 GitHub Pages。

Repository 第一次使用 GitHub Pages 時，請在 GitHub 專案設定中將 Pages 來源設為 GitHub Actions。

## 使用方式

1. 開啟頁面後預設名單為 `1-120`。
2. 可在「抽獎名單」輸入自訂編號或姓名，或快速產生 `1` 到指定人數的連號名單。
3. 按「開始抽獎」啟動輪盤。
4. 再按「停止抽獎」開獎。
5. 中獎者會自動加入紀錄；預設不會再次參與下一輪。
6. 需要重複抽同一人時，開啟「允許重複中獎」。
7. 活動結束後可匯出 CSV。

## 開源授權

本專案採用 MIT License。詳見 [LICENSE](LICENSE)。
