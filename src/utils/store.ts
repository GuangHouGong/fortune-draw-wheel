import type { Activity, AppData, DrawRecord, Participant } from '../types';
import { createActivity, createEmptyData, createId, validateAppData } from './models';
import { MAX_PARTICIPANT_COUNT, parseParticipants } from './participants';
import { parseBackup } from './backup';
import { downloadText, localDateStamp } from './export';

export const STORE_KEY = 'fortune-draw-wheel:data:v2';
const STORE_LOCK = 'fortune-draw-wheel:store';
const LEGACY = {
  participants: 'fortune-draw-wheel:participants', winners: 'fortune-draw-wheel:winners',
  allowRepeat: 'fortune-draw-wheel:allow-repeat', autoStop: 'fortune-draw-wheel:auto-stop',
  memory: 'fortune-draw-wheel:browser-memory',
};
const listeners = new Set<(data: AppData) => void>();
let fallbackQueue: Promise<unknown> = Promise.resolve();

export function supportsLocks(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.locks?.request);
}

function migrateActivity(id: string, name: string, participantsText: string, winners: unknown, allowRepeat: boolean, autoStop: boolean, warnings: string[]): Activity {
  const activity = createActivity(name);
  activity.id = id;
  const labels = parseParticipants(participantsText);
  if (labels.length > MAX_PARTICIPANT_COUNT) warnings.push(`舊版名單超過 200 人，先移入前 200 人；原始舊版資料仍完整保留於瀏覽器。`);
  activity.participants = labels.slice(0, MAX_PARTICIPANT_COUNT).map((label, index): Participant => ({
    id: `${id}:participant:${index}`, label, code: /^\d+$/u.test(label) ? label : '', groupId: null,
  }));
  activity.settings.autoStop = autoStop;
  activity.settings.repeatPolicy = allowRepeat ? 'none' : 'activity';
  const records = Array.isArray(winners) ? [...winners].reverse() : [];
  activity.records = records.flatMap((item, index): DrawRecord[] => {
    if (!item || typeof item !== 'object') { warnings.push('已略過一筆無法讀取的舊中獎紀錄，原始資料仍保留。'); return []; }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim() || typeof record.drawnAt !== 'string' || !Number.isFinite(Date.parse(record.drawnAt))) {
      warnings.push('已略過一筆格式不完整的舊中獎紀錄，原始資料仍保留。'); return [];
    }
    const participant = activity.participants.find((row) => row.label === record.id);
    return [{ id: `${id}:record:${index}`, drawId: `${id}:draw:${index}`, participantId: participant?.id ?? `${id}:removed:${record.id}`,
      label: record.id, code: participant?.code ?? (/^\d+$/u.test(record.id) ? record.id : ''), groupName: '未分組', prizeId: null, prizeName: '自由抽獎',
      drawnAt: record.drawnAt, status: 'won' }];
  });
  if (activity.records.length) activity.createdAt = activity.records[0].drawnAt;
  return activity;
}

function parseLegacyJson(raw: string | null, warnings: string[], label: string): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { warnings.push(`${label}無法讀取；原始舊版資料仍保留。`); return null; }
}

export function readAppData(): { data: AppData; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw !== null) {
      try { return { data: validateAppData(JSON.parse(raw)), warnings }; }
      catch (error) {
        warnings.push(error instanceof Error ? `目前儲存資料無法讀取。${error.message} 原始資料仍保留，可先下載原始資料，再選擇有效的活動備份還原。` : '目前儲存資料無法讀取，原始資料仍保留，可先下載原始資料，再選擇有效的活動備份還原。');
        return { data: createEmptyData(), warnings };
      }
    }
    const data = createEmptyData();
    const text = localStorage.getItem(LEGACY.participants);
    const winnersRaw = localStorage.getItem(LEGACY.winners);
    const repeatRaw = localStorage.getItem(LEGACY.allowRepeat);
    const autoRaw = localStorage.getItem(LEGACY.autoStop);
    if (text !== null || winnersRaw !== null || repeatRaw !== null || autoRaw !== null) {
      data.activities.push(migrateActivity('legacy-current', '既有抽獎活動', text ?? '', parseLegacyJson(winnersRaw, warnings, '舊版中獎紀錄'), repeatRaw === 'true', autoRaw !== 'false', warnings));
    }
    const memory = parseLegacyJson(localStorage.getItem(LEGACY.memory), warnings, '舊版手動備份');
    if (memory && typeof memory === 'object') {
      const snapshot = memory as Record<string, unknown>;
      if (typeof snapshot.participantsText === 'string' && Array.isArray(snapshot.winnerHistory) && typeof snapshot.allowRepeat === 'boolean') {
        const activity = migrateActivity('legacy-manual', '舊版手動備份', snapshot.participantsText, snapshot.winnerHistory, snapshot.allowRepeat, snapshot.autoStop !== false, warnings);
        if (typeof snapshot.savedAt === 'string' && Number.isFinite(Date.parse(snapshot.savedAt))) activity.createdAt = snapshot.savedAt;
        activity.archived = true;
        data.activities.push(activity);
      } else warnings.push('舊版手動備份格式不完整，原始資料仍保留。');
    }
    data.activeActivityId = data.activities.find((activity) => !activity.archived)?.id ?? null;
    if (data.activities.length) warnings.push('已載入舊版活動與紀錄，舊版資料仍完整保留。');
    return { data, warnings };
  } catch {
    return { data: createEmptyData(), warnings: ['瀏覽器無法使用本機儲存。請允許網站儲存資料，或更換瀏覽器後使用。'] };
  }
}

function ensurePendingUnchanged(before: AppData, after: AppData): void {
  for (const previous of before.activities) {
    const pending = previous.pendingDraw;
    const current = after.activities.find((item) => item.id === previous.id);
    if (!current) {
      if (pending) throw new Error('不能刪除尚有未完成抽獎的活動。');
      continue;
    }
    const snapshotKeys = ['id', 'drawId', 'participantId', 'label', 'code', 'groupName', 'prizeId', 'prizeName', 'drawnAt'] as const;
    for (const original of previous.records) {
      const updated = current.records.find((record) => record.id === original.id);
      if (!updated) throw new Error('既有中獎紀錄需保留，請以新活動開始另一場抽獎。');
      if (snapshotKeys.some((key) => updated[key] !== original[key])) throw new Error('已公布的中獎人選與開獎時間不能更改。');
      if (original.status !== 'won' && updated.status === 'won') throw new Error('缺席或放棄者需保留紀錄並排除，請補抽。');
    }
    if (!pending) {
      if (current.records.some((record) => !previous.records.some((original) => original.id === record.id))) throw new Error('中獎紀錄只能由正式抽獎產生。');
      continue;
    }
    const setup = (activity: Activity) => ({ ...activity, records: undefined, pendingDraw: undefined });
    if (JSON.stringify(setup(previous)) !== JSON.stringify(setup(current))) throw new Error('本活動抽獎尚未完成，不能變更活動設定或名單。');
    if (JSON.stringify(current.records.slice(0, previous.records.length)) !== JSON.stringify(previous.records)) throw new Error('本輪尚未完成，不能修改既有中獎紀錄。');
    const next = current.pendingDraw;
    const cursor = next?.revealedCount ?? pending.winners.length;
    if (cursor < pending.revealedCount || cursor > pending.winners.length || (next && JSON.stringify({ ...next, revealedCount: 0 }) !== JSON.stringify({ ...pending, revealedCount: 0 }))) throw new Error('未完成抽獎只能繼續公布原定人選。');
    const added = current.records.slice(previous.records.length);
    if (added.length !== cursor - pending.revealedCount) throw new Error('抽獎紀錄與開獎進度不一致。');
    added.forEach((record, index) => {
      const winner = pending.winners[pending.revealedCount + index];
      if (record.drawId !== pending.id || record.participantId !== winner.id || record.label !== winner.label || record.code !== winner.code || record.prizeId !== pending.prizeId || record.prizeName !== pending.prizeName || record.groupName !== pending.groupNames[winner.id] || record.status !== 'won') throw new Error('只能公布本輪已選定的人選。');
    });
  }
}

function notify(data: AppData): void {
  for (const callback of listeners) {
    try { callback(data); } catch { /* A view callback must not invalidate a committed transaction. */ }
  }
}

function writeTransaction(mutator: (data: AppData) => void): AppData {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw !== null) {
    try { validateAppData(JSON.parse(raw)); }
    catch { throw new Error('目前儲存資料格式不完整，為保留原始資料，尚未覆寫。請先還原有效活動備份。'); }
  }
  const before = readAppData().data;
  const data = JSON.parse(JSON.stringify(before)) as AppData;
  mutator(data);
  ensurePendingUnchanged(before, data);
  validateAppData(data);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch { throw new Error('資料未儲存：瀏覽器儲存空間不足或未允許儲存。本次變更尚未完成。'); }
  notify(data);
  return data;
}

export async function transaction(mutator: (data: AppData) => void): Promise<AppData> {
  if (supportsLocks()) return navigator.locks.request(STORE_LOCK, { mode: 'exclusive' }, () => writeTransaction(mutator));
  const next = fallbackQueue.then(() => writeTransaction(mutator));
  fallbackQueue = next.catch(() => undefined);
  return next;
}

/** Explicit recovery only: quarantine the unreadable original before replacing it. */
export async function restoreFromBackup(input: unknown): Promise<AppData> {
  const backup = parseBackup(input);
  const restore = () => {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw === null) throw new Error('目前沒有損壞的儲存資料，請使用一般活動備份匯入。');
    let damaged = false;
    try { validateAppData(JSON.parse(raw)); } catch { damaged = true; }
    if (!damaged) throw new Error('目前儲存資料完整，請使用一般匯入以保留既有活動。');
    const recoveryKey = `${STORE_KEY}:recovery:${Date.now()}-${createId()}`;
    try { localStorage.setItem(recoveryKey, raw); }
    catch { throw new Error('原始資料尚未儲存，因此沒有覆寫。請先下載原始資料並確認瀏覽器儲存空間。'); }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(backup)); }
    catch { throw new Error('備份尚未還原；原始資料仍保留，請確認瀏覽器儲存空間後重試。'); }
    notify(backup);
    return backup;
  };
  if (supportsLocks()) return navigator.locks.request(STORE_LOCK, { mode: 'exclusive' }, restore);
  const next = fallbackQueue.then(restore);
  fallbackQueue = next.catch(() => undefined);
  return next;
}

export function downloadRawRecovery(): void {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw === null) throw new Error('目前沒有可下載的原始儲存資料。');
  downloadText(`功德會抽獎-原始資料-${localDateStamp()}.txt`, raw);
}

export function subscribeStore(callback: (data: AppData) => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => { if (event.key === STORE_KEY || event.key === null) callback(readAppData().data); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => { listeners.delete(callback); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
}

/** Hold the ownership lock until the caller releases it or this tab closes. */
export function claimDrawOwner(activityId: string): Promise<(() => void) | null> {
  if (!supportsLocks()) return Promise.resolve(null);
  return new Promise((resolve) => {
    void navigator.locks.request(`fortune-draw-wheel:activity:${activityId}:draw-owner`, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return; }
      await new Promise<void>((release) => {
        let released = false;
        resolve(() => { if (!released) { released = true; release(); } });
      });
    }).catch(() => resolve(null));
  });
}
