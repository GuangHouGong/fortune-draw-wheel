import { useState } from 'react';
import type { Activity, AppData, DrawRecord } from '../types';
import { downloadBackup, parseBackup } from '../utils/backup';
import { downloadParticipants, downloadRecords } from '../utils/export';

type Props = { activity: Activity; data: AppData; onStatus: (id: string, status: DrawRecord['status']) => Promise<void>; onImport: (input: string) => Promise<void>; onNotice: (message: string) => void };
const STATUS = { won: '中獎', absent: '缺席', declined: '放棄' };
export default function ActivityResults({ activity, data, onStatus, onImport, onNotice }: Props) {
  const [search, setSearch] = useState(''), [prize, setPrize] = useState('all'), [group, setGroup] = useState('all'), [importing, setImporting] = useState(false);
  const records = [...activity.records].reverse().filter(r => `${r.label} ${r.code}`.includes(search) && (prize === 'all' || (r.prizeId ?? '') === prize) && (group === 'all' || r.groupName === group));
  async function loadBackup(file?: File) {
    if (!file) return; setImporting(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('備份檔不能超過 10 MB。');
      const contents = await file.text(), preview = parseBackup(contents);
      if (window.confirm(`這份備份有 ${preview.activities.length} 場活動，匯入後會新增活動，保留現有活動。確定匯入？`)) await onImport(contents);
    } catch (error) { onNotice(error instanceof Error ? error.message : '備份檔無法讀取。'); }
    finally { setImporting(false); }
  }
  return <div className="stack results-workspace">
    <div className="page-heading"><div><p className="muted">{activity.name}</p><h2>結果與備份</h2><p>查看中獎名單，下載結果與活動備份。</p></div><img src={`${import.meta.env.BASE_URL}assets/mascot-celebrate.webp`} alt="" /></div>
    {activity.pendingDraw && <div className="alert">這場活動還有尚未公布的結果，請先回「現場抽獎」完成開獎。<a href={`#/activity/${activity.id}/draw`}>接續上次抽獎</a></div>}
    <section className="panel"><div className="section-heading"><h3>下載資料與備份</h3><span className="badge">儲存在這台裝置</span></div><div className="backup-options">
      <div><h4>抽獎前／換裝置</h4><p>活動備份檔包含名單、分組、獎項、設定與紀錄。換裝置時匯入備份檔，就能接續使用。</p><div className="button-row"><button className="button button-primary" onClick={() => downloadBackup({ ...data, activities: [activity], activeActivityId: activity.id })}>下載這場活動備份</button><button className="button button-secondary" onClick={() => downloadParticipants(activity)}>下載名單 CSV</button></div></div>
      <div><h4>抽獎後／備份全部</h4><p>結果 CSV 可用 Excel 開啟，保留中獎、缺席與放棄紀錄。按「下載全部活動備份」，可一次下載這台裝置的所有活動。</p><div className="button-row"><button className="button button-primary" disabled={!activity.records.length} onClick={() => downloadRecords(activity)}>下載結果 CSV</button><button className="button button-secondary" onClick={() => downloadBackup(data)}>下載全部活動備份</button><button className="button button-secondary" onClick={() => window.print()}>列印結果</button></div></div>
    </div><label className="file-button button button-secondary">{importing ? '正在讀取…' : '匯入活動備份（JSON）'}<input type="file" accept=".json,application/json" disabled={importing} onChange={event => { void loadBackup(event.target.files?.[0]); event.target.value = ''; }} /></label><p className="muted">資料不會自動同步到其他裝置。請使用一般瀏覽模式；清除瀏覽資料或換裝置前，請先下載活動備份。</p></section>
    <section className="panel"><div className="section-heading"><h3>中獎紀錄</h3><span className="badge">{activity.records.filter(r => r.status === 'won').length} 名中獎 · {activity.records.length} 筆紀錄</span></div>
      <div className="field-row result-filters"><label className="field">搜尋姓名或編號<input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入姓名或編號" /></label><label className="field">獎項<select value={prize} onChange={e => setPrize(e.target.value)}><option value="all">全部獎項</option><option value="">自由抽獎</option>{activity.prizes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field">組別<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">全部組別</option>{[...new Set(activity.records.map(r => r.groupName))].map(g => <option key={g} value={g}>{g || '未分組'}</option>)}</select></label></div>
      {!records.length ? <div className="empty-state"><h4>{activity.records.length ? '沒有符合的紀錄' : '還沒有中獎紀錄'}</h4><p>{activity.records.length ? '請調整搜尋或篩選條件。' : '正式開獎後，結果會自動儲存在這裡。'}</p><a className="button button-primary" href={`#/activity/${activity.id}/draw`}>前往抽獎</a></div> : <div className="table-wrap"><table className="data-table"><caption className="sr-only">{activity.name} 抽獎結果</caption><thead><tr><th>中獎者</th><th>組別／獎項</th><th>時間</th><th>狀態</th><th className="no-print">缺席補抽</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td><strong>{record.label}</strong>{record.code && record.code !== record.label && <small>{record.code}</small>}</td><td>{record.groupName || '未分組'}<small>{record.prizeName || '自由抽獎'}</small></td><td><time dateTime={record.drawnAt}>{new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(record.drawnAt))}</time></td><td><span className={`badge status-${record.status}`}>{STATUS[record.status]}</span></td><td className="no-print">{record.status === 'won' ? <div className="button-row"><button className="button button-secondary compact" disabled={Boolean(activity.pendingDraw) || activity.archived} onClick={() => { if (window.confirm(`將 ${record.label} 標示為缺席，保留紀錄並排除後續抽獎？`)) void onStatus(record.id, 'absent'); }}>缺席</button><button className="button button-secondary compact" disabled={Boolean(activity.pendingDraw) || activity.archived} onClick={() => { if (window.confirm(`將 ${record.label} 標示為放棄，保留紀錄並排除後續抽獎？`)) void onStatus(record.id, 'declined'); }}>放棄</button></div> : <a className="text-link" href={`#/activity/${activity.id}/draw${record.prizeId ? `?prize=${record.prizeId}` : '?prize=free'}`}>前往補抽</a>}</td></tr>)}</tbody></table></div>}
      <p className="muted">標示缺席或放棄後，原紀錄會保留，該參加者不再參加後續抽獎。原獎項會空出名額，可回「現場抽獎」補抽。</p>
    </section>
  </div>;
}
