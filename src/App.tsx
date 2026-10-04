import { useEffect, useRef, useState } from 'react';
import type { Activity, AppData, DrawRecord, PendingDraw, Preferences } from './types';
import { createActivity, duplicateActivity, assertActivityEditable } from './utils/models';
import { readAppData, transaction, subscribeStore, claimDrawOwner, restoreFromBackup, downloadRawRecovery } from './utils/store';
import { beginDraw, revealNext, markRecord } from './utils/drawEngine';
import { downloadBackup, importBackup } from './utils/backup';
import ActivitySetup from './components/ActivitySetup';
import DrawStage from './components/DrawStage';
import ActivityResults from './components/ActivityResults';
import HelpPage from './components/HelpPage';
import OfflineStatus from './components/OfflineStatus';

type Page = 'activities' | 'prepare' | 'draw' | 'results' | 'help';
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  if (parts[0] === 'activity' && parts[1]) return { page: (['prepare', 'draw', 'results'].includes(parts[2]) ? parts[2] : 'prepare') as Page, id: parts[1] };
  return { page: parts[0] === 'help' ? 'help' as Page : 'activities' as Page, id: null };
}
export default function App() {
  const [initial] = useState(readAppData), [data, setData] = useState<AppData>(initial.data), [currentRoute, setRoute] = useState(route);
  const [notice, setNotice] = useState(initial.warnings.join(' ')), [name, setName] = useState(''), [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false), [damaged, setDamaged] = useState(initial.warnings.some(w => w.startsWith('目前儲存資料無法讀取')));
  const owner = useRef<(() => void) | null>(null), ownerVersion = useRef(0), messageRef = useRef<HTMLDivElement>(null);
  const activity = data.activities.find(a => a.id === currentRoute.id);
  useEffect(() => {
    document.documentElement.dataset.drawLargeText = String(data.preferences.largeText);
    return () => { delete document.documentElement.dataset.drawLargeText; };
  }, [data.preferences.largeText]);
  useEffect(() => { const handleHash = () => { setRoute(route()); setNotice(''); window.scrollTo({top:0,behavior:'instant'}); }; window.addEventListener('hashchange', handleHash); return () => window.removeEventListener('hashchange', handleHash); }, []);
  useEffect(() => subscribeStore(() => { const next = readAppData(); setData(next.data); setDamaged(next.warnings.some(w => w.startsWith('目前儲存資料無法讀取'))); if (next.warnings.length) setNotice(next.warnings.join(' ')); }), []);
  useEffect(() => { void transaction(() => {}).then(setData).catch(error => setNotice(error instanceof Error ? error.message : '資料尚未儲存，請先下載備份。')); return () => owner.current?.(); }, []);
  async function mutate(action: (next: AppData) => void) {
    setSaving(true);
    try { const next = await transaction(action); setData(next); return next; }
    catch (error) { setNotice(error instanceof Error ? error.message : '資料尚未儲存，請下載備份。'); throw error; }
    finally { setSaving(false); }
  }
  async function safe(action: () => Promise<unknown>) { try { await action(); } catch { /* The notice explains the failure. */ } }
  function navigate(page: Page, id = activity?.id ?? data.activeActivityId) { location.hash = page === 'activities' || page === 'help' ? `#/${page}` : `#/activity/${id}/${page}`; }
  async function addActivity() {
    const label = name.trim(); if (!label) { setNotice('請先輸入活動名稱。'); return; }
    const created = createActivity(label);
    await mutate(next => { next.activities.push(created); next.activeActivityId = created.id; });
    setName(''); navigate('prepare', created.id); setNotice('活動已建立，接著準備名單與獎項。');
  }
  async function updateActivity(updated: Activity) {
    await mutate(next => {
      const index = next.activities.findIndex(a => a.id === updated.id); if (index < 0) throw new Error('找不到這場活動。');
      const live = next.activities[index]; assertActivityEditable(live);
      if (live.archived) throw new Error('請先取消封存才能修改活動。');
      const baseline = data.activities.find(a => a.id === updated.id);
      if (JSON.stringify(live) !== JSON.stringify(baseline)) throw new Error('另一個分頁已更新活動，請確認最新資料後再修改。');
      next.activities[index] = { ...updated, records: live.records, pendingDraw: live.pendingDraw };
    });
  }
  function updatePreferences(preferences: Preferences) { void safe(() => mutate(next => { next.preferences = preferences; })); }
  function releaseOwner() { ownerVersion.current += 1; owner.current?.(); owner.current = null; }
  async function acquireOwner() {
    if (!activity) return false;
    releaseOwner(); const version = ownerVersion.current; const release = await claimDrawOwner(activity.id);
    if (version !== ownerVersion.current) { release?.(); return false; }
    if (!release) { setNotice('這場活動正在另一個分頁抽獎，請回原分頁繼續。'); return false; }
    owner.current = release; return true;
  }
  async function start(prizeId: string | null, count: number, mode: PendingDraw['mode']) {
    if (!activity || !await acquireOwner()) return null;
    const claimedVersion = ownerVersion.current;
    try {
      let selected: PendingDraw | null = null;
      await mutate(next => { const current = next.activities.find(a => a.id === activity.id); if (!current) throw new Error('找不到活動。'); selected = structuredClone(beginDraw(current, prizeId, count, mode)); });
      return selected;
    } catch (error) { if (claimedVersion === ownerVersion.current) releaseOwner(); throw error; }
  }
  async function recover() {
    if (!activity || !await acquireOwner()) return null;
    const current = readAppData().data.activities.find(a => a.id === activity.id);
    if (!current?.pendingDraw) { releaseOwner(); setNotice('本輪已在其他分頁完成，請重新查看結果。'); setData(readAppData().data); return null; }
    return structuredClone(current.pendingDraw);
  }
  async function reveal(drawId: string, all: boolean, expectedCursor: number) {
    let revealed: DrawRecord[] = [];
    await mutate(next => { const current = next.activities.find(a => a.id === activity?.id); if (!current) throw new Error('找不到活動。'); revealed = revealNext(current, drawId, all, expectedCursor); });
    return revealed;
  }
  async function status(recordId: string, value: DrawRecord['status']) {
    await mutate(next => { const current = next.activities.find(a => a.id === activity?.id); if (!current) throw new Error('找不到活動。'); markRecord(current, recordId, value); });
    setNotice('已保留原中獎紀錄，這位參加者不會再被抽到，可以補抽剩餘名額。');
  }
  async function loadBackup(input: string) {
    await mutate(next => { importBackup(next, input); }); setNotice('備份已新增為獨立活動，原活動完整保留。'); navigate('activities');
  }
  const currentId = activity?.id ?? data.activeActivityId ?? data.activities.find(a => !a.archived)?.id;
  const page = currentRoute.page;
  const visibleActivities = data.activities.filter(a => showArchived || !a.archived);
  return <div className={`app-shell ${data.preferences.largeText ? 'large-text' : ''} ${data.preferences.reducedMotion ? 'reduce-motion' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView(); }}>跳到主要內容</a>
    <header className="app-header"><a className="brand" href="#/activities"><img src={`${import.meta.env.BASE_URL}assets/logo.svg`} alt="" /><span>土城廣厚宮<span>功德會抽獎</span></span></a><div className="accessibility-tools"><button className="button header-button" aria-pressed={data.preferences.largeText} onClick={() => updatePreferences({ ...data.preferences, largeText: !data.preferences.largeText })}>大字 {data.preferences.largeText ? '開' : '關'}</button><button className="button header-button" aria-pressed={data.preferences.reducedMotion} onClick={() => updatePreferences({ ...data.preferences, reducedMotion: !data.preferences.reducedMotion })}>減少動畫 {data.preferences.reducedMotion ? '開' : '關'}</button></div></header>
    <nav className="main-nav" aria-label="主要功能">{([['activities', '活動'], ['prepare', '準備'], ['draw', '現場抽獎'], ['results', '結果與備份'], ['help', '說明']] as const).map(([target, label]) => <a key={target} href={target === 'activities' || target === 'help' ? `#/${target}` : currentId ? `#/activity/${currentId}/${target}` : '#/activities'} aria-current={page === target ? 'page' : undefined} className={page === target ? 'active' : ''}>{label}</a>)}</nav>
    <main id="main-content" className="main-content" tabIndex={-1}>
      <div className="system-status no-print"><OfflineStatus data={data} onNotice={setNotice} /><span>{saving ? '正在儲存…' : '資料自動儲存在這台裝置'}</span></div>
      {damaged && <section className="panel stack no-print"><h2>活動資料救援</h2><p>活動資料無法讀取。請先下載原始資料，再選擇本系統的活動備份還原；損壞的原始資料也會另外保留在這個瀏覽器。</p><div className="button-row"><button className="button button-secondary" onClick={downloadRawRecovery}>下載原始資料</button><label className="button button-primary file-button">選擇備份還原<input type="file" accept=".json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void (async () => { try { if (file.size > 10 * 1024 * 1024) throw new Error('備份檔請保持在 10 MB 以內。'); const recovered = await restoreFromBackup(await file.text()); setData(recovered); setDamaged(false); setNotice('資料已還原，損壞的原始資料仍另外保留。'); navigate('activities'); } catch (error) { setNotice(error instanceof Error ? error.message : '尚未還原，請確認備份檔。'); } })(); }} /></label></div></section>}
      {notice && <div className="notice no-print" role="status" ref={messageRef}><span>{notice}</span><button aria-label="關閉提示" onClick={() => setNotice('')}>×</button></div>}
      {page === 'activities' && <div className="stack activities-workspace">
        <section className="activity-hero" aria-labelledby="activities-title"><div className="activity-hero-copy"><p>土城廣厚宮功德會抽獎</p><h1 id="activities-title">今天的好運，<br />從這裡開始。</h1><p className="activity-hero-description">準備名單、現場開獎，<br />結果隨時帶走。</p><div className="activity-hero-links">{visibleActivities.length > 0 && <a className="text-link" href="#my-activities" onClick={event => { event.preventDefault(); const section = document.getElementById('my-activities'); section?.focus(); section?.scrollIntoView({ block: 'start' }); }}>查看我的活動</a>}<a className="text-link" href="#/help">第一次使用？看操作說明</a></div></div><img src={`${import.meta.env.BASE_URL}assets/mascot-welcome.webp`} alt="迎接大家的抽獎吉祥物" /></section>
        <section className="create-activity panel" aria-labelledby="create-title"><div><h2 id="create-title">建立一場活動</h2><p className="muted">先取個名稱，名單和獎項可以慢慢準備。</p></div><form className="field-row" onSubmit={e => { e.preventDefault(); void safe(addActivity); }}><label className="field">活動名稱<input maxLength={100} value={name} placeholder="例如：功德會摸彩活動" onChange={e => setName(e.target.value)} required /></label><button className="button button-primary" disabled={saving}>建立活動</button></form><div className="home-import"><p className="muted">已有活動備份？匯入後就能繼續使用。</p><label className="button button-secondary file-button">匯入活動備份<input type="file" accept=".json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void safe(async () => { if (file.size > 10 * 1024 * 1024) { setNotice('備份檔請保持在 10 MB 以內。'); return; } await loadBackup(await file.text()); }); }} /></label></div></section>
        <section id="my-activities" tabIndex={-1} aria-labelledby="my-activities-title"><div className="section-heading"><h2 id="my-activities-title">我的活動</h2><label className="check-field"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />顯示封存活動</label></div>
          {!visibleActivities.length ? <div className="panel empty-state"><h3>{data.activities.length ? '目前沒有進行中的活動' : '建立第一場活動'}</h3><p>{data.activities.length ? '活動都已封存。可以查看原本的活動，或建立新活動。' : '輸入上方活動名稱，就能準備名單與獎項。'}</p>{data.activities.length > 0 && <button className="button button-secondary" onClick={() => setShowArchived(true)}>查看封存活動</button>}</div> : <div className="activity-list">{visibleActivities.map(a => <article className={`activity-entry ${a.archived ? 'archived' : ''}`} key={a.id}><div className="activity-entry-heading"><div><h3>{a.name}</h3><p>{a.participants.length} 人 · {a.prizes.length ? `${a.prizes.length} 個獎項` : '自由抽獎'} · {a.records.filter(r => r.status === 'won').length} 名中獎</p></div><span className="badge">{a.archived ? '已封存' : a.pendingDraw ? '本輪尚未開完' : a.records.length ? '進行中' : '準備中'}</span></div><div className="button-row"><a className="button button-primary" href={`#/activity/${a.id}/${a.archived ? 'results' : a.pendingDraw || a.participants.length ? 'draw' : 'prepare'}`}>{a.archived ? '查看結果' : a.pendingDraw ? '接續上次抽獎' : a.participants.length ? '前往抽獎' : '準備名單'}</a><a className="button button-secondary" href={`#/activity/${a.id}/prepare`}>準備</a>{!a.archived && <a className="button button-secondary" href={`#/activity/${a.id}/results`}>結果</a>}<button className="button button-secondary" disabled={Boolean(a.pendingDraw)} onClick={() => { void safe(async () => { const copy = duplicateActivity(a); await mutate(next => { next.activities.push(copy); next.activeActivityId = copy.id; }); navigate('prepare', copy.id); setNotice('已複製名單與設定，新活動沒有中獎紀錄。'); }); }}>複製</button><button className="button button-secondary" disabled={Boolean(a.pendingDraw)} onClick={() => { void safe(() => mutate(next => { const live = next.activities.find(item => item.id === a.id); if (live) { assertActivityEditable(live); live.archived = !live.archived; } })); }}>{a.archived ? '取消封存' : '封存'}</button></div></article>)}</div>}
        </section><div className="backup-footer panel"><div><h3>活動資料，隨時帶走</h3><p>換裝置或清除瀏覽器前，先下載完整備份。</p></div><button className="button button-secondary" onClick={() => downloadBackup(data)}>下載全部活動備份</button></div>
      </div>}
      {page === 'help' && <HelpPage />}
      {page !== 'activities' && page !== 'help' && !activity && <div className="panel empty-state"><h2>先選擇一場活動</h2><p>每場活動的名單與結果分開儲存。</p><a className="button button-primary" href="#/activities">回活動列表</a></div>}
      {activity && page === 'prepare' && <><div className="page-heading"><div><p className="muted">活動準備</p><h1>{activity.name}</h1><p>確認名單、分組與獎項，現場就能輕鬆抽。</p></div><a className="button button-primary" href={`#/activity/${activity.id}/draw`}>準備好了，前往抽獎</a></div>{(activity.pendingDraw || activity.archived) && <div className="alert">{activity.pendingDraw ? '本輪尚未全部開獎，請先接續抽獎。' : '已封存活動可查看，請先取消封存才能修改。'}</div>}<ActivitySetup key={activity.id} activity={activity} disabled={Boolean(activity.pendingDraw) || activity.archived || saving} onChange={updateActivity} onNotice={setNotice} /></>}
      {activity && page === 'draw' && <DrawStage key={activity.id} activity={activity} preferences={data.preferences} onPreferences={updatePreferences} onSettings={updateActivity} onNotice={setNotice} onStart={start} onRecover={recover} onReveal={reveal} onRelease={releaseOwner} />}
      {activity && page === 'results' && <ActivityResults key={activity.id} activity={activity} data={data} onStatus={(id, value) => safe(() => status(id, value))} onImport={loadBackup} onNotice={setNotice} />}
    </main><footer className="app-footer no-print"><span>土城廣厚宮功德會抽獎</span><span>名單留在這台裝置 · 請下載備份妥善保管</span></footer>
  </div>;
}
