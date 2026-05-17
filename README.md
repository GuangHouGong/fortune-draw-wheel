# 土地公功德會抽獎

![土地公功德會抽獎](public/assets/og-image.svg)

土地公功德會抽獎是一個純前端 Web App，為宮廟活動、現場投影與公開抽獎流程設計。專案使用 Vite、React、TypeScript 建置，不需要後端、不需要資料庫，可以直接部署到 GitHub Pages。

## 快速資訊

| 項目 | 內容 |
| --- | --- |
| 線上網址 | https://guanghougong.github.io/fortune-draw-wheel/ |
| Repository | `GuangHouGong/fortune-draw-wheel` |
| 技術 | Vite + React + TypeScript |
| 部署 | GitHub Actions + GitHub Pages |
| 資料儲存 | Browser `localStorage` |
| 授權 | MIT License |

## 專案特色

- 台灣廟宇活動風格，使用紅色、金色、元寶、福字與財神主題視覺。
- 大型輪盤與固定上方指針，適合手機、平板、筆電與投影畫面。
- 字體與中獎結果放大顯示，方便活動現場與長輩觀看。
- 第一次進入會顯示活動流程導覽，畫面上也可隨時重新打開使用說明。
- 完全靜態部署，所有抽獎資料只存在使用者瀏覽器。
- 使用 `crypto.getRandomValues` 產生抽獎隨機 index。
- 可匯入 Excel / CSV / TXT 名單，也可直接貼上名單。
- 支援真實姓名與編號，不限定只能使用數字。

## 功能列表

- 預設提供 `1` 到 `120` 的抽獎編號。
- 建議活動名單維持 `100` 人內；目前最多支援 `200` 人，以維持輪盤與控制面板的現場可讀性。
- 可快速產生 `1` 到指定人數的連號名單。
- 可在 textarea 直接輸入名單。
- 支援 `.xlsx`、`.csv`、`.txt` 檔案匯入。
- 首次使用導覽會說明名單準備、確認人數、開始抽獎與保存結果。
- 按下「開始抽獎」後輪盤快速旋轉。
- 再按「停止抽獎」後輪盤慢慢減速，最後停在中獎者所在區塊。
- 停下後以大字顯示中獎者。
- 中獎者會自動加入中獎紀錄。
- 預設避免重複中獎，已中獎者不再參與下一輪。
- 可切換「允許重複中獎」。
- 可清除中獎紀錄。
- 可重設名單為 `1-120`。
- 支援全螢幕模式。
- 可匯出中獎紀錄 CSV。
- 使用 `localStorage` 儲存名單、重複中獎設定與中獎紀錄。
- 內建 `favicon.svg`、`logo.svg`、`og-image.svg` 與活動主視覺素材。

## 名單格式

手動輸入支援以下格式：

```text
1
2
3
王小明
李小華
```

也支援逗號或分號分隔：

```text
1, 2, 3, 王小明, 李小華
```

純編號名單也可以使用空白分隔：

```text
1 2 3 4 5
```

如果姓名中有空白，建議使用一行一位或逗號分隔，例如：

```text
John Smith
Jane Chen
```

## 匯入 Excel / CSV / TXT

匯入功能全部在瀏覽器本機執行，不會上傳檔案到任何伺服器。

支援格式：

- `.xlsx`：新版 Excel 格式。
- `.csv`：逗號、全形逗號、分號、全形分號分隔。
- `.txt`：純文字名單。

Excel 匯入規則：

1. 讀取第一個工作表。
2. 如果第一列有欄位名稱，會優先讀取以下欄位：
   `姓名`、`名字`、`名稱`、`參加者`、`參與者`、`抽獎名單`、`名單`、`編號`、`號碼`、`序號`、`name`、`id`、`number`、`participant`。
3. 如果找不到上述欄位，就使用第一個有資料的欄位。
4. 匯入時會自動移除空白列與重複名單。

舊版 `.xls` 目前不直接解析。請先用 Excel、Numbers 或 Google Sheets 另存成 `.xlsx` 或 CSV 後再匯入。

## 使用方式

1. 開啟線上頁面，預設名單為 `1-120`。
2. 在「抽獎名單」貼上名單、匯入 `.xlsx` / `.csv` / `.txt`，或快速產生連號名單。
3. 如果不希望同一人重複中獎，保持「允許重複中獎」關閉。
4. 按「開始抽獎」啟動輪盤。
5. 按「停止抽獎」進入減速並開獎。
6. 中獎者會顯示在畫面中央，並加入中獎紀錄。
7. 下一輪抽獎會自動排除已中獎者。
8. 活動結束後可匯出中獎紀錄 CSV。

如果剩餘可抽名單為空，系統會提示清除中獎紀錄或開啟重複中獎。

## 現場使用建議

- 正式活動前先匯入名單並試抽一次，確認投影比例與字體大小。
- 建議使用全螢幕模式，避免瀏覽器工具列干擾投影。
- 名單建議維持 `100` 人內，輪盤視覺最清楚。
- 需要支援更多人時仍可匯入到 `200` 人，但輪盤上的文字會縮小或只顯示部分；中獎結果仍會清楚顯示。
- 活動開始前可先匯出或備份名單原始檔；中獎紀錄也可以在活動後匯出 CSV。

## 資料儲存與隱私

本專案沒有後端、沒有資料庫，也不會把名單傳到伺服器。

以下資料會存在目前瀏覽器的 `localStorage`：

- 抽獎名單。
- 是否允許重複中獎。
- 中獎紀錄。

如果更換裝置、清除瀏覽器資料、使用無痕模式，這些資料不會自動同步。正式活動建議保留原始名單檔，並在活動結束後匯出中獎紀錄 CSV。

## 本地開發

需求：

- Node.js 20 或更新版本。
- npm。

安裝依賴：

```bash
npm install
```

啟動開發伺服器：

```bash
npm run dev
```

預設本地網址：

```text
http://127.0.0.1:5173/fortune-draw-wheel/
```

常用指令：

```bash
npm run lint
npm run build
npm run preview
```

## GitHub Pages 部署

`vite.config.ts` 已設定 GitHub Pages 專案路徑：

```ts
base: '/fortune-draw-wheel/'
```

`.github/workflows/deploy.yml` 會在推送到 `main` 時自動執行：

1. Checkout repository。
2. 使用 Node.js 20。
3. 執行 `npm ci`。
4. 執行 `npm run build`。
5. 將 `dist` 發布到 GitHub Pages。

Repository 第一次啟用 GitHub Pages 時，請到 GitHub repository 設定：

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

設定完成後，推送到 `main` 即可由 GitHub Actions 部署。

## 專案結構

```text
.
├── .github/workflows/deploy.yml
├── public/assets/
│   ├── favicon.svg
│   ├── logo.svg
│   └── og-image.svg
├── src/
│   ├── components/
│   │   ├── ParticipantEditor.tsx
│   │   ├── Wheel.tsx
│   │   └── WinnerHistory.tsx
│   ├── utils/
│   │   ├── csv.ts
│   │   ├── importParticipants.ts
│   │   └── participants.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

## 技術說明

- Framework: Vite + React + TypeScript。
- Styling: CSS / SVG，主視覺不依賴外部圖片服務。
- Randomness: `crypto.getRandomValues`。
- Storage: browser `localStorage`。
- Excel parsing: `read-excel-file`，只在使用者選擇檔案時於瀏覽器本機解析。
- Deployment: GitHub Actions + GitHub Pages。

## 開源授權

本專案採用 MIT License。詳見 [LICENSE](LICENSE)。
