const steps = [
  ['建立活動', '每場活動各自保存。先取活動名稱，再準備名單；同一台裝置可以保存多場活動。'],
  ['準備名單與獎項', '可貼上姓名、產生連號，或匯入 Excel／CSV／TXT。姓名一行一位，英文姓名中的空白會保留。先預覽確認人數，再套用。'],
  ['先試抽與備份', '在現場抽獎勾選「先試抽」，確認投影、字級及聲音。試抽不會影響正式結果。正式活動前下載完整活動備份。'],
  ['開始與停止', '轉盤或跳號可逐位、連抽；快速開獎可一次多名。按開始後會先保存本輪，自動約六秒開獎，也可按停止提早揭曉。'],
  ['缺席就補抽', '到結果頁將缺席或放棄標示出來。原紀錄保留，原中獎者排除，再補抽相同獎項缺額。'],
  ['下載與換裝置', '抽完下載結果 CSV，以及完整活動 JSON。另一台裝置匯入 JSON 即可接續，現有活動不會被覆蓋。'],
];
export default function HelpPage() {
  return <div className="stack help-workspace"><div className="page-heading"><div><h2>第一次使用，也能輕鬆上手</h2><p>活動前準備好，現場專心把好運公布。</p></div><img src={`${import.meta.env.BASE_URL}assets/mascot-welcome.webp`} alt="" /></div><section className="panel"><h3>從準備到帶走</h3><ol className="help-steps">{steps.map(([title, body], index) => <li key={title}><span>{index + 1}</span><div><h4>{title}</h4><p>{body}</p></div></li>)}</ol></section><div className="help-columns"><section className="panel stack"><h3>名單怎麼準備</h3><p>每場建議 100 人內，最多 200 人。可使用姓名或編號；同名者建議填不同編號。</p><pre>編號,姓名,組別{'\n'}001,王小明,第一組{'\n'}002,John Smith,第二組</pre><p>Excel 讀取第一張工作表，優先找姓名、編號、name、id 欄位。預覽可自行調整欄位。舊版 .xls 請先另存 .xlsx 或 CSV。</p><p>每人可有一個組別；獎項可指定多組參加，未分組也可抽。沒有設定獎項時使用自由抽獎。</p></section><section className="panel stack"><h3>現場常見問題</h3><details open><summary>網路突然斷了怎麼辦？</summary><p>第一次連網成功載入，並顯示「可離線使用」後，才能斷網重新開啟。離線也可匯入名單、抽獎與下載結果。</p></details><details><summary>抽到一半不小心刷新？</summary><p>回現場按「恢復上次本輪」，接續已保存的結果。停止與恢復不會重新選人。</p></details><details><summary>為什麼沒有聲音？</summary><p>聲音預設關閉，需手動開啟並試聽。朗讀需要裝置內可用的本機中文聲音；請確認音量，必要時改用 Safari 或 Chrome。無語音仍可正常抽獎。</p></details><details><summary>長輩看不清楚或覺得太晃？</summary><p>右上角可開「大字」與「減少動畫」。投影模式會放大獎項和結果；手機即使無法進入系統全螢幕，也能使用投影版面。</p></details><details><summary>資料會同步或上傳嗎？</summary><p>名單與紀錄只保存在這台裝置的瀏覽器。換裝置請用 JSON 備份檔；清除瀏覽器資料前務必下載備份。網站不需要帳號或付費 API。</p></details></section></div><p className="muted">版本 2.0 · 土城廣厚宮功德會抽獎 · 手機語音與離線體驗依裝置能力提供。</p></div>;
}
