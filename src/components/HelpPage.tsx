const steps = [
  ['建立活動', '每場活動分開儲存。先輸入活動名稱，再準備名單；同一台裝置可以儲存多場活動。'],
  ['準備名單與獎項', '可貼上姓名、建立連號名單，或匯入 Excel／CSV／TXT。姓名一行一位，姓名中的空白會保留。確認預覽與人數後，再按「確認並套用名單」。'],
  ['先試抽與備份', '在「現場抽獎」勾選「先試抽，不計入正式結果」，確認畫面、投影與聲音。試抽不會扣除名額或留下正式紀錄。正式抽獎前，先下載活動備份。'],
  ['開始與停止', '轉盤或跳號可一位一位抽，也能連續抽；快速開獎可一次抽出多人。按「開始抽獎」後，會先儲存這一輪的結果，預設約六秒自動開獎，也可按「停止並開獎」提早公布。'],
  ['缺席就補抽', '到「結果與備份」將中獎者標示為「缺席」或「放棄」。原紀錄會保留，該參加者不再參加後續抽獎；回到現場抽獎即可補抽該獎項的空缺名額。'],
  ['下載與換裝置', '抽完下載結果表（CSV）及活動備份（JSON）。在另一台裝置匯入備份檔，就能接續使用；匯入時會新增活動，保留現有活動。'],
];
export default function HelpPage() {
  return <div className="stack help-workspace"><div className="page-heading"><div><h2>第一次使用，也能輕鬆上手</h2><p>先準備、再試抽，現場開獎更順手。</p></div><img src={`${import.meta.env.BASE_URL}assets/mascot-welcome.webp`} alt="" /></div><section className="panel"><h3>抽獎操作流程</h3><ol className="help-steps">{steps.map(([title, body], index) => <li key={title}><span>{index + 1}</span><div><h4>{title}</h4><p>{body}</p></div></li>)}</ol></section><div className="help-columns"><section className="panel stack"><h3>名單怎麼準備</h3><p>每場建議 100 人以內，最多 200 人。可使用姓名或編號；同名者建議填不同編號。</p><pre>編號,姓名,組別{'\n'}001,王小明,第一組{'\n'}002,John Smith,第二組</pre><p>Excel 讀取第一張工作表，優先找姓名、編號、name、id 欄位。預覽時可自行選擇姓名、編號與組別欄位。舊版 .xls 請先另存成 .xlsx 或 CSV。</p><p>每人可加入一個組別。每個獎項可開放全部參加者，或指定一個以上的組別；也能選擇「未分組」。沒有設定獎項時，可使用「自由抽獎」。</p></section><section className="panel stack"><h3>現場常見問題</h3><details open><summary>網路突然斷了怎麼辦？</summary><p>第一次連網成功載入，並顯示「已準備離線使用」後，才能斷網重新開啟。離線也可匯入名單、抽獎與下載結果。</p></details><details><summary>抽到一半不小心重新整理頁面？</summary><p>回到「現場抽獎」，按「接續上次抽獎」公布已儲存的結果。按停止或接續，都不會重新選人。</p></details><details><summary>為什麼沒有聲音？</summary><p>聲音預設關閉，請先手動開啟並試聽。朗讀需要裝置內建的中文語音，也請確認裝置音量。若沒有可用語音，仍能正常抽獎、顯示與儲存結果。</p></details><details><summary>長輩看不清楚或覺得太晃？</summary><p>在畫面上方可開啟「大字」與「減少動畫」。投影模式會放大獎項和結果；手機即使無法切換全螢幕，也能使用投影版面。</p></details><details><summary>資料會同步或上傳嗎？</summary><p>名單與紀錄只儲存在這台裝置的瀏覽器，不會上傳，也不會自動同步。換裝置請使用活動備份檔（JSON）；清除瀏覽資料前，請先下載備份。不需註冊帳號，也不用支付使用費。</p></details></section></div><p className="muted">版本 2.0 · 土城廣厚宮功德會抽獎 · 朗讀與離線功能是否可用，依裝置與瀏覽器而定。</p></div>;
}
