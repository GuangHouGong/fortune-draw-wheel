import type { Activity, AppData, Preferences } from '../types';
import { MAX_PARTICIPANT_COUNT } from './participants';

export const UNASSIGNED_GROUP_ID = '__ungrouped__';
export const DEFAULT_PREFERENCES: Preferences = {
  largeText: false, reducedMotion: false, sound: false, speech: false,
  voiceURI: '', speechRate: 0.9,
};

export function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('此瀏覽器不支援安全亂數，請使用新版瀏覽器。');
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createActivity(name: string): Activity {
  return {
    id: createId(), name: name.trim() || '新抽獎活動', createdAt: new Date().toISOString(),
    archived: false, participants: [], groups: [], prizes: [],
    settings: { method: 'wheel', autoStop: true, repeatPolicy: 'activity' },
    records: [], pendingDraw: null,
  };
}

export function assertActivityEditable(activity: Activity): void {
  if (activity.pendingDraw) throw new Error('本活動尚有未完成抽獎，請先恢復並完成本輪。');
}

export function duplicateActivity(activity: Activity): Activity {
  assertActivityEditable(activity);
  const copy = JSON.parse(JSON.stringify(activity)) as Activity;
  copy.id = createId();
  copy.name = `${activity.name}（副本）`;
  copy.createdAt = new Date().toISOString();
  copy.archived = false;
  copy.records = [];
  copy.pendingDraw = null;
  return copy;
}

export function createEmptyData(): AppData {
  return { schemaVersion: 2, activities: [], activeActivityId: null, preferences: { ...DEFAULT_PREFERENCES } };
}

function fail(message: string): never { throw new Error(`抽獎資料格式不正確：${message}`); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, empty = false): asserts value is string {
  if (typeof value !== 'string' || (!empty && !value.trim())) fail(label);
}
function array(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) fail(label);
}
function timestamp(value: unknown, label: string) {
  string(value, label);
  if (!Number.isFinite(Date.parse(value))) fail(label);
}
function uniqueIds(values: unknown[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    const row = object(value, label);
    string(row.id, label);
    if (ids.has(row.id)) fail(`${label}識別碼重複`);
    ids.add(row.id);
  }
  return ids;
}

/** Validate unknown local or portable data before trusting it as an AppData. */
export function validateAppData(value: unknown): AppData {
  const data = object(value, '檔案內容');
  if (data.schemaVersion !== 2) fail('請使用本系統版本 2 的活動備份');
  array(data.activities, '活動列表');
  const activityIds = uniqueIds(data.activities, '活動');
  if (data.activeActivityId !== null && (typeof data.activeActivityId !== 'string' || !activityIds.has(data.activeActivityId))) fail('目前活動');
  const prefs = object(data.preferences, '偏好設定');
  for (const key of ['largeText', 'reducedMotion', 'sound', 'speech']) if (typeof prefs[key] !== 'boolean') fail('偏好設定');
  string(prefs.voiceURI, '語音設定', true);
  if (typeof prefs.speechRate !== 'number' || !Number.isFinite(prefs.speechRate) || prefs.speechRate < 0.5 || prefs.speechRate > 2) fail('語音速度');

  for (const item of data.activities) {
    const activity = object(item, '活動');
    string(activity.name, '活動名稱');
    timestamp(activity.createdAt, '活動建立時間');
    if (typeof activity.archived !== 'boolean') fail('活動狀態');
    for (const key of ['participants', 'groups', 'prizes', 'records']) array(activity[key], key);
    const groups = activity.groups as unknown[];
    const groupIds = uniqueIds(groups, '分組');
    if (groupIds.has(UNASSIGNED_GROUP_ID)) fail('分組識別碼');
    for (const group of groups) string(object(group, '分組').name, '分組名稱');
    const participants = activity.participants as unknown[];
    if (participants.length > MAX_PARTICIPANT_COUNT) fail(`每活動最多 ${MAX_PARTICIPANT_COUNT} 人`);
    const participantIds = uniqueIds(participants, '參加者');
    const validateParticipant = (entry: unknown) => {
      const participant = object(entry, '參加者');
      string(participant.id, '參加者識別碼');
      string(participant.label, '參加者姓名');
      string(participant.code, '參加者編號', true);
      if (participant.groupId !== null && (typeof participant.groupId !== 'string' || !groupIds.has(participant.groupId))) fail('參加者分組');
    };
    participants.forEach(validateParticipant);
    const codes = participants.map((entry) => object(entry, '參加者').code).filter((code) => typeof code === 'string' && code.trim());
    if (new Set(codes).size !== codes.length) fail('參加者編號重複');
    const prizes = activity.prizes as unknown[];
    const prizeIds = uniqueIds(prizes, '獎項');
    for (const entry of prizes) {
      const prize = object(entry, '獎項');
      string(prize.name, '獎項名稱');
      if (!Number.isInteger(prize.quantity) || Number(prize.quantity) < 1 || Number(prize.quantity) > MAX_PARTICIPANT_COUNT) fail('獎項名額須為 1–200');
      if (prize.groupIds !== null) {
        array(prize.groupIds, '獎項分組');
        if (!prize.groupIds.length || new Set(prize.groupIds).size !== prize.groupIds.length || prize.groupIds.some((id) => typeof id !== 'string' || (!groupIds.has(id) && id !== UNASSIGNED_GROUP_ID))) fail('獎項分組');
      }
    }
    const settings = object(activity.settings, '抽獎設定');
    if (typeof settings.method !== 'string' || !['wheel', 'ticker', 'instant'].includes(settings.method) || typeof settings.autoStop !== 'boolean' || typeof settings.repeatPolicy !== 'string' || !['activity', 'prize', 'none'].includes(settings.repeatPolicy)) fail('抽獎設定');
    const records = activity.records as unknown[];
    uniqueIds(records, '中獎紀錄');
    const drawPairs = new Set<string>();
    for (const entry of records) {
      const record = object(entry, '中獎紀錄');
      for (const key of ['drawId', 'participantId', 'label', 'groupName', 'prizeName']) string(record[key], '中獎紀錄');
      string(record.code, '中獎者編號', true);
      if (record.prizeId !== null && (typeof record.prizeId !== 'string' || !prizeIds.has(record.prizeId))) fail('紀錄獎項');
      timestamp(record.drawnAt, '開獎時間');
      if (typeof record.status !== 'string' || !['won', 'absent', 'declined'].includes(record.status)) fail('中獎狀態');
      const pair = JSON.stringify([record.drawId, record.participantId]);
      if (drawPairs.has(pair)) fail('同一輪同一人有重複中獎紀錄');
      drawPairs.add(pair);
    }
    if (activity.pendingDraw !== null) {
      const pending = object(activity.pendingDraw, '尚未完成的抽獎');
      string(pending.id, '抽獎識別碼');
      string(pending.prizeName, '抽獎獎項');
      if (pending.prizeId !== null && (typeof pending.prizeId !== 'string' || !prizeIds.has(pending.prizeId))) fail('抽獎獎項');
      array(pending.winners, '本輪人選');
      array(pending.candidateIds, '本輪候選名單');
      const candidateIds = new Set(pending.candidateIds);
      if (!candidateIds.size || candidateIds.size !== pending.candidateIds.length || pending.candidateIds.some((id) => typeof id !== 'string' || !participantIds.has(id))) fail('本輪候選名單');
      if (!pending.winners.length || pending.winners.length > MAX_PARTICIPANT_COUNT || uniqueIds(pending.winners, '本輪人選').size > candidateIds.size) fail('本輪人選');
      pending.winners.forEach(validateParticipant);
      if (pending.winners.some((entry) => !candidateIds.has(object(entry, '本輪人選').id))) fail('本輪人選');
      if (!Number.isInteger(pending.revealedCount) || Number(pending.revealedCount) < 0 || Number(pending.revealedCount) >= pending.winners.length) fail('開獎進度');
      if (typeof pending.mode !== 'string' || !['single', 'sequence', 'batch'].includes(pending.mode) || (pending.mode === 'single' && pending.winners.length !== 1)) fail('開獎方式');
      timestamp(pending.startedAt, '抽獎開始時間');
      const names = object(pending.groupNames, '本輪分組');
      for (const winner of pending.winners) string(names[object(winner, '本輪人選').id as string], '本輪分組');
      const pendingRecords = records.map((entry) => object(entry, '中獎紀錄')).filter((record) => record.drawId === pending.id);
      if (pendingRecords.length !== pending.revealedCount) fail('開獎進度與紀錄不一致');
      for (let index = 0; index < Number(pending.revealedCount); index += 1) {
        const winner = object(pending.winners[index], '本輪人選');
        const record = pendingRecords[index];
        if (!record || record.participantId !== winner.id || record.label !== winner.label || record.code !== winner.code || record.prizeId !== pending.prizeId || record.prizeName !== pending.prizeName || record.groupName !== names[winner.id as string] || record.status !== 'won') fail('開獎進度與紀錄快照不一致');
      }
      const prize = prizes.map((entry) => object(entry, '獎項')).find((entry) => entry.id === pending.prizeId);
      const excluded = new Set(records.map((entry) => object(entry, '中獎紀錄')).filter((record) => record.drawId !== pending.id && (record.status !== 'won' || settings.repeatPolicy === 'activity' || (settings.repeatPolicy === 'prize' && record.prizeId === pending.prizeId))).map((record) => record.participantId));
      const eligibleIds = participants.map((entry) => object(entry, '參加者')).filter((participant) => !excluded.has(participant.id) && (!prize?.groupIds || (prize.groupIds as string[]).includes((participant.groupId as string | null) ?? UNASSIGNED_GROUP_ID))).map((participant) => participant.id);
      if (JSON.stringify(eligibleIds) !== JSON.stringify(pending.candidateIds)) fail('本輪候選名單與抽獎資格不一致');
    }
    for (const entry of prizes) {
      const prize = object(entry, '獎項');
      const occupied = records.filter((entry) => { const record = object(entry, '中獎紀錄'); return record.prizeId === prize.id && record.status === 'won'; }).length;
      const pending = activity.pendingDraw as Activity['pendingDraw'];
      const reserved = pending && pending.prizeId === prize.id ? pending.winners.length - pending.revealedCount : 0;
      if (occupied + reserved > Number(prize.quantity)) fail('已中獎與待公布人數超過獎項名額');
    }
  }
  return value as AppData;
}
