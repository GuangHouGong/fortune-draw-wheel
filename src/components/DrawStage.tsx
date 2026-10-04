import { useEffect, useRef, useState } from 'react';
import type { Activity, DrawRecord, PendingDraw, Preferences } from '../types';
import { beginDraw, getCandidates, remainingPrizeSlots, revealNext } from '../utils/drawEngine';
import { supportsLocks } from '../utils/store';
import { useAudio } from '../hooks/useAudio';
import Wheel from './Wheel';

type Phase = 'ready' | 'running' | 'stopping' | 'revealed' | 'paused';
type Props = {
  activity: Activity; preferences: Preferences; onPreferences: (preferences: Preferences) => void;
  onSettings: (activity: Activity) => Promise<void>; onNotice: (message: string) => void;
  onStart: (prizeId: string | null, count: number, mode: PendingDraw['mode']) => Promise<PendingDraw | null>;
  onRecover: () => Promise<PendingDraw | null>;
  onReveal: (drawId: string, all: boolean, expectedCursor: number) => Promise<DrawRecord[]>;
  onRelease: () => void;
};
const normalize = (n: number) => (n % 360 + 360) % 360;
const display = (p: {label: string; code: string}) => p.code && p.code !== p.label ? `${p.code} ${p.label}` : p.label;
export default function DrawStage({ activity, preferences, onPreferences, onSettings, onNotice, onStart, onRecover, onReveal, onRelease }: Props) {
  const [storedPrizeId, setPrizeId] = useState<string | null>(() => { if (activity.pendingDraw) return activity.pendingDraw.prizeId; const selected = new URLSearchParams(location.hash.split('?')[1]).get('prize'); return selected === 'free' ? null : activity.prizes.find(p => p.id === selected)?.id ?? activity.prizes[0]?.id ?? null; });
  const prizeId = storedPrizeId && activity.prizes.some(p => p.id === storedPrizeId) ? storedPrizeId : null;
  const [count, setCount] = useState(activity.pendingDraw?.winners.length ?? 1), [mode, setMode] = useState<PendingDraw['mode']>(activity.pendingDraw?.mode ?? 'single');
  const [phase, setPhase] = useState<Phase>('ready'), [trial, setTrial] = useState(false), [projecting, setProjecting] = useState(false);
  const [results, setResults] = useState<DrawRecord[]>([]), [rollingLabel, setRollingLabel] = useState('準備好迎接好運');
  const [loading, setLoading] = useState(false), [sequencePaused, setSequencePaused] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null), rotorRef = useRef<HTMLDivElement>(null), rotation = useRef(0), phaseRef = useRef<Phase>('ready');
  const pending = useRef<PendingDraw | null>(null), sandbox = useRef<Activity | null>(null), pauseRef = useRef(false), revealing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]), frame = useRef(0), generation = useRef(0), mounted = useRef(true), startInFlight = useRef(false), nextRoundTimer = useRef<ReturnType<typeof setTimeout> | null>(null), releaseRef = useRef(onRelease);
  const audio = useAudio(preferences, onNotice);
  const lastPool = useRef<string[] | null>(null);
  const availableCandidates = getCandidates(activity, prizeId);
  const candidateIds = pending.current?.candidateIds ?? lastPool.current;
  const candidates = candidateIds && phase !== 'ready' ? activity.participants.filter(p => candidateIds.includes(p.id)) : availableCandidates;
  const remaining = remainingPrizeSlots(activity, prizeId), prize = activity.prizes.find(p => p.id === prizeId);
  const busy = phase === 'running' || phase === 'stopping' || loading;
  const locked = activity.archived || busy || Boolean(pending.current && pending.current.revealedCount < pending.current.winners.length) || Boolean(activity.pendingDraw);
  const recovered = Boolean(activity.pendingDraw) && !pending.current;
  const reduced = preferences.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const candidateRef = useRef(candidates), audioRef = useRef(audio), preferencesRef = useRef(preferences);
  useEffect(() => { candidateRef.current = candidates; audioRef.current = audio; preferencesRef.current = preferences; releaseRef.current = onRelease; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; timers.current.forEach(clearTimeout); if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current); cancelAnimationFrame(frame.current); releaseRef.current(); audioRef.current.stop(); }; }, []);
  function transition(next: Phase) { phaseRef.current = next; setPhase(next); }
  function clearAnimation() { if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current); nextRoundTimer.current = null; timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(frame.current); }
  function later(callback: () => void, ms: number) { timers.current.push(setTimeout(callback, ms)); }
  function animateRound() {
    if (!mounted.current || pauseRef.current) return;
    clearAnimation(); generation.current += 1;
    transition('running');
    if (rotorRef.current) rotorRef.current.style.transition = 'none';
    if (activity.settings.method === 'instant') { transition('stopping'); later(() => { void completeRound(); }, 100); return; }
    const started = performance.now(); let previous = started, lastTick = started;
    const tick = (now: number) => {
      if (phaseRef.current !== 'running') return;
      if (!(preferencesRef.current.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        rotation.current += Math.min(now - previous, 50) * .55;
        if (rotorRef.current) rotorRef.current.style.transform = `rotate(${rotation.current}deg)`;
      }
      previous = now;
      if (now - lastTick > 125) {
        const pool = candidateRef.current;
        if (pool.length) setRollingLabel(display(pool[Math.floor((now - started) / 125) % pool.length]));
        audioRef.current.tick(); lastTick = now;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    if (activity.settings.autoStop) later(stopRound, reduced ? 250 : 4000);
  }
  function stopRound() {
    if (phaseRef.current !== 'running' || !pending.current) return;
    clearAnimation(); transition('stopping');
    const nextWinner = pending.current.winners[pending.current.revealedCount];
    const index = candidateRef.current.findIndex(p => p.id === nextWinner?.id);
    const stopWithoutMotion = preferencesRef.current.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = normalize(360 - (index + .5) * 360 / Math.max(candidateRef.current.length, 1));
    const final = rotation.current + normalize(target - normalize(rotation.current)) + (stopWithoutMotion ? 0 : 360 * 3);
    rotation.current = final;
    if (rotorRef.current) {
      rotorRef.current.style.transition = stopWithoutMotion ? 'none' : 'transform 2000ms cubic-bezier(.12,.68,.15,1)';
      requestAnimationFrame(() => { if (rotorRef.current) rotorRef.current.style.transform = `rotate(${final}deg)`; });
    }
    const token = generation.current;
    later(() => { if (generation.current === token) void completeRound(); }, stopWithoutMotion ? 100 : 2200);
  }
  async function completeRound() {
    if (phaseRef.current !== 'stopping' || revealing.current || !pending.current) return;
    revealing.current = true; clearAnimation();
    const draw = pending.current;
    try {
      const all = draw.mode === 'batch';
      const records = sandbox.current ? revealNext(sandbox.current, draw.id, all, draw.revealedCount) : await onReveal(draw.id, all, draw.revealedCount);
      if (!mounted.current) return;
      if (!records.length) { transition('paused'); onNotice('這筆結果已處理，請回到活動後恢復或查看結果。'); return; }
      draw.revealedCount += records.length;
      if (sandbox.current?.pendingDraw) draw.revealedCount = sandbox.current.pendingDraw.revealedCount;
      setResults(previous => [...previous, ...records]);
      audioRef.current.celebrate();
      if (preferencesRef.current.speech) audioRef.current.speak(records.map(record => `恭喜 ${display(record)}，${record.prizeName || '中獎'}`).join('。'));
      transition('revealed');
      requestAnimationFrame(() => { if (!mounted.current || !resultRef.current) return; const rect = resultRef.current.getBoundingClientRect(); if (rect.top < 70 || rect.bottom > innerHeight - 100) resultRef.current.scrollIntoView({block:'center',behavior:preferencesRef.current.reducedMotion ? 'instant' : 'smooth'}); });
      if (draw.revealedCount < draw.winners.length) {
        if (!pauseRef.current) nextRoundTimer.current = setTimeout(animateRound, 1800);
        else transition('paused');
      } else {
        pending.current = null; sandbox.current = null; onRelease();
      }
    } catch (error) { transition('paused'); onNotice(error instanceof Error ? error.message : '結果尚未保存，請稍後恢復本輪。'); }
    finally { revealing.current = false; }
  }
  async function start() {
    if (startInFlight.current || loading || busy) return;
    startInFlight.current = true; setLoading(true);
    try {
      if (preferences.sound || preferences.speech) await audio.enable();
      if (!mounted.current) return;
      setResults([]); pauseRef.current = false; setSequencePaused(false);
      const selectedMode = mode === 'batch' && activity.settings.method !== 'instant' ? 'sequence' : mode;
      if (trial && !recovered) {
        const copy = structuredClone(activity); copy.pendingDraw = null;
        sandbox.current = copy; pending.current = structuredClone(beginDraw(copy, prizeId, selectedMode === 'single' ? 1 : count, selectedMode));
      } else {
        sandbox.current = null;
        pending.current = recovered ? await onRecover() : await onStart(prizeId, selectedMode === 'single' ? 1 : count, selectedMode);
        if (pending.current) { setPrizeId(pending.current.prizeId); setTrial(false); }
      }
      if (pending.current && mounted.current) { lastPool.current = pending.current.candidateIds; animateRound(); }
    } catch (error) { onNotice(error instanceof Error ? error.message : '無法開始抽獎。'); }
    finally { startInFlight.current = false; if (mounted.current) setLoading(false); }
  }
  function primary() {
    if (phase === 'running') { stopRound(); return; }
    if (!pending.current && remaining === 0 && nextPrize) { setPrizeId(nextPrize.id); lastPool.current = null; setResults([]); transition('ready'); return; }
    if (pending.current) { pauseRef.current = false; setSequencePaused(false); animateRound(); return; }
    void start();
  }
  async function changeMethod(method: Activity['settings']['method']) {
    try { await onSettings({ ...activity, settings: { ...activity.settings, method } });
    if (method !== 'instant' && mode === 'batch') setMode('sequence'); } catch (error) { onNotice(error instanceof Error ? error.message : '設定尚未保存。'); }
  }
  async function settings(updated: Activity) { try { await onSettings(updated); } catch (error) { onNotice(error instanceof Error ? error.message : '設定尚未保存。'); } }
  async function projection() {
    const next = !projecting; setProjecting(next);
    if (next && document.documentElement.requestFullscreen) { try { await document.documentElement.requestFullscreen(); } catch { /* Projection layout also works without native fullscreen. */ } }
    else if (document.fullscreenElement) { await document.exitFullscreen(); }
  }
  const nextPrize = activity.prizes.slice(Math.max(0, activity.prizes.findIndex(p => p.id === prizeId) + 1)).find(p => remainingPrizeSlots(activity, p.id) > 0);
  const latest = results.at(-1), left = pending.current ? pending.current.winners.length - pending.current.revealedCount : 0;
  const primaryLabel = loading ? '正在保存本輪…' : phase === 'running' ? '停止並開獎' : phase === 'stopping' ? '即將揭曉…' : pending.current ? '繼續連抽' : recovered ? '恢復上次本輪' : remaining === 0 ? nextPrize ? '下一獎項' : '本場獎項已完成' : phase === 'revealed' ? '再抽下一位' : '開始抽獎';
  return <section className={`draw-workspace ${projecting ? 'projection-mode' : ''}`}>
    <div className="stage-heading"><div><p className="muted">{activity.name}</p><h2>{prize?.name || '好運抽獎'}</h2></div><button className="button button-secondary" onClick={() => { void projection(); }}>{projecting ? '離開投影' : '投影模式'}</button></div>
    {trial && <div className="trial-banner">試抽中 · 不會寫入正式紀錄或扣除名額</div>}
    {recovered && <div className="alert">上次抽獎尚未完成。按「恢復上次本輪」會接續原本結果，不會重新抽選。</div>}
    <div className="draw-columns">
      <div className="draw-stage">
        <div className={`stage-visual ${activity.settings.method !== 'wheel' ? 'has-ticker' : ''}`}>
          {activity.settings.method === 'wheel' ? <Wheel participants={candidates} rotorRef={rotorRef} winnerId={phase === 'revealed' || phase === 'paused' ? latest?.participantId ?? null : null} onTransitionEnd={() => { void completeRound(); }} /> : <div className="ticker-stage"><img src={`${import.meta.env.BASE_URL}assets/${latest && !busy ? 'mascot-celebrate' : 'mascot-cheer'}.webp`} alt="" /><span>{busy ? '好運轉動中' : '下一份好運，會是誰？'}</span><strong>{busy && !reduced ? rollingLabel : activity.settings.method === 'instant' ? '準備開獎' : '準備跳號'}</strong></div>}
          <img className="stage-mascot" src={`${import.meta.env.BASE_URL}assets/${latest && !busy ? 'mascot-celebrate' : busy ? 'mascot-cheer' : 'mascot-welcome'}.webp`} alt="" />
        </div>
        <div className={`winner-display ${latest && !busy ? 'has-winner' : ''}`} aria-live="polite" role="status" ref={resultRef}>
          <span>{phase === 'stopping' ? '好運即將揭曉' : phase === 'running' ? '好運轉動中' : latest && !busy ? trial ? '試抽結果' : '恭喜中獎' : '準備開始'}</span>
          <strong>{busy ? '請稍候…' : latest ? display(latest) : candidates.length ? '下一位幸運得主' : '先準備抽獎名單'}</strong>
          {latest && !busy && <small>{latest.groupName || '未分組'}{latest.prizeName ? ` · ${latest.prizeName}` : ''}</small>}
        </div>
        {results.length > 1 && <div className="batch-results">{results.map((record, index) => <span key={record.id}><small>{index + 1}</small>{display(record)}</span>)}</div>}
        <div className="draw-action-bar"><button className="button main-draw-button" onClick={primary} disabled={loading || phase === 'stopping' || (!pending.current && !recovered && (activity.archived || (!availableCandidates.length && !(remaining === 0 && nextPrize)) || (remaining === 0 && !nextPrize) || (!trial && !supportsLocks())))}>{primaryLabel}</button>{pending.current?.mode === 'sequence' && <button className="button button-secondary" onClick={() => { pauseRef.current = true; setSequencePaused(true); if (nextRoundTimer.current) clearTimeout(nextRoundTimer.current); if (phase === 'revealed') transition('paused'); }} disabled={sequencePaused}>{sequencePaused ? '已設定暫停' : '暫停連抽'}</button>}</div>
        {!pending.current && remaining === 0 && !nextPrize && <a className="button button-primary" href={`#/activity/${activity.id}/results`}>查看結果與下載備份</a>}
        <p className="stage-status">{busy ? activity.settings.autoStop ? '自動開獎，也可提早按停止' : '按停止並開獎，公布這一輪' : left ? `本輪還有 ${left} 位等待公布` : `${availableCandidates.length} 人可抽${Number.isFinite(remaining) ? ` · 本獎項剩 ${remaining} 名` : ''}`}</p>
      </div>
      <aside className="draw-controls panel stack">
        <div className="section-heading"><h3>這一輪怎麼抽</h3><span className="badge">{activity.participants.length} 人</span></div>
        <label className="field">獎項<select value={prizeId ?? ''} disabled={locked} onChange={e => { setPrizeId(e.target.value || null); lastPool.current = null; setResults([]); transition('ready'); }}><option value="">自由抽獎</option>{activity.prizes.map(p => <option key={p.id} value={p.id}>{p.name}（{remainingPrizeSlots(activity, p.id)} 名可抽）</option>)}</select></label>
        <div className="method-buttons" role="group" aria-label="抽獎呈現方式">{([['wheel', '轉盤'], ['ticker', '跳號'], ['instant', '快速開獎']] as const).map(([id, label]) => <button key={id} className={`button ${activity.settings.method === id ? 'button-primary' : 'button-secondary'}`} disabled={locked} aria-pressed={activity.settings.method === id} onClick={() => { void changeMethod(id); }}>{label}</button>)}</div>
        <label className="field">抽獎流程<select value={mode} disabled={locked} onChange={e => setMode(e.target.value as PendingDraw['mode'])}><option value="single">一次抽一位</option><option value="sequence">連續逐位開獎</option>{activity.settings.method === 'instant' && <option value="batch">一次公布多位</option>}</select></label>
        {mode !== 'single' && <label className="field">這輪人數<input type="number" min="1" max="200" value={count} disabled={locked} onChange={e => setCount(Number(e.target.value))} /></label>}
        <label className="check-field"><input type="checkbox" checked={activity.settings.autoStop} disabled={locked} onChange={e => { void settings({ ...activity, settings: { ...activity.settings, autoStop: e.target.checked } }); }} />自動停止（約六秒）</label>
        <label className="check-field"><input type="checkbox" checked={trial} disabled={locked} onChange={e => { setTrial(e.target.checked); setResults([]); transition('ready'); }} />先試抽，不計入正式結果</label>
        <details><summary>重複中獎與聲音設定</summary><div className="stack">
          <label className="field">重複中獎<select value={activity.settings.repeatPolicy} disabled={locked} onChange={e => { void settings({ ...activity, settings: { ...activity.settings, repeatPolicy: e.target.value as Activity['settings']['repeatPolicy'] } }); }}><option value="activity">整場不重複</option><option value="prize">同獎項不重複</option><option value="none">允許跨輪重複</option></select></label>
          <label className="check-field"><input type="checkbox" checked={preferences.sound} onChange={e => { void audio.enable(); onPreferences({ ...preferences, sound: e.target.checked }); }} />抽獎音效</label>
          <label className="check-field"><input type="checkbox" checked={preferences.speech} onChange={e => { void audio.enable(); onPreferences({ ...preferences, speech: e.target.checked }); }} />朗讀中獎者</label>
          {preferences.speech && <><label className="field">本機中文聲音<select value={preferences.voiceURI} onChange={e => onPreferences({ ...preferences, voiceURI: e.target.value })}><option value="">自動選擇</option>{audio.voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select></label><label className="field">朗讀速度<input type="range" min=".6" max="1.3" step=".1" value={preferences.speechRate} onChange={e => onPreferences({ ...preferences, speechRate: Number(e.target.value) })} /></label><p className="muted">{audio.voices.length ? '使用裝置本機中文語音。' : '這台裝置尚無可用的本機中文聲音，抽獎仍可正常進行。'}</p></>}
          <div className="button-row"><button className="button button-secondary" onClick={() => { void audio.enable(); audio.speak('土城廣厚宮功德會，祝大家好運。'); }}>試聽</button><button className="button button-secondary" disabled={!results.length} onClick={() => audio.speak(results.map(r => `恭喜 ${display(r)}，${r.prizeName || '中獎'}`).join('。'))}>再念一次</button><button className="button button-secondary" onClick={() => { audio.stop(); onPreferences({ ...preferences, sound: false, speech: false }); }}>靜音</button></div>
          <button className="button button-secondary" onClick={audio.stop}>停止朗讀</button>
        </div></details>
        {!supportsLocks() && <p className="alert">請以新版 Safari 或 Chrome 開啟，才能可靠保存正式抽獎。此處仍可試抽。</p>}
        {activity.archived && <p className="alert">這場活動已封存，請先回活動列表取消封存。</p>}
        <a className="text-link" href={`#/activity/${activity.id}/prepare`}>調整名單與獎項</a>
      </aside>
    </div>
  </section>;
}
