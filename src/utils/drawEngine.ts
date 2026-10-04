import type { Activity, DrawRecord, PendingDraw } from '../types';
import { assertActivityEditable, createId, UNASSIGNED_GROUP_ID } from './models';
import { MAX_PARTICIPANT_COUNT, randomIndex } from './participants';

function findPrize(activity: Activity, prizeId: string | null) {
  if (prizeId === null) return null;
  const prize = activity.prizes.find((item) => item.id === prizeId);
  if (!prize) throw new Error('找不到此獎項，請重新選擇。');
  return prize;
}

export function getCandidates(activity: Activity, prizeId: string | null) {
  const prize = findPrize(activity, prizeId);
  const excluded = new Set(activity.records.filter((record) => {
    if (record.status !== 'won') return true;
    if (activity.settings.repeatPolicy === 'activity') return true;
    return activity.settings.repeatPolicy === 'prize' && record.prizeId === prizeId;
  }).map((record) => record.participantId));
  const reserved = new Set(activity.pendingDraw?.winners.slice(activity.pendingDraw.revealedCount).map((winner) => winner.id));
  return activity.participants.filter((participant) => !excluded.has(participant.id) && !reserved.has(participant.id)
    && (!prize?.groupIds || prize.groupIds.includes(participant.groupId ?? UNASSIGNED_GROUP_ID)));
}

export function remainingPrizeSlots(activity: Activity, prizeId: string | null): number {
  const prize = findPrize(activity, prizeId);
  if (!prize) return Infinity;
  const occupied = activity.records.filter((record) => record.prizeId === prizeId && record.status === 'won').length;
  const pending = activity.pendingDraw;
  const reserved = pending?.prizeId === prizeId ? pending.winners.length - pending.revealedCount : 0;
  return Math.max(0, prize.quantity - occupied - reserved);
}

export function beginDraw(activity: Activity, prizeId: string | null, count: number, mode: PendingDraw['mode']): PendingDraw {
  assertActivityEditable(activity);
  if (activity.archived) throw new Error('封存活動不能抽獎，請先取消封存。');
  if (!Number.isInteger(count) || count < 1 || count > MAX_PARTICIPANT_COUNT) throw new Error('本輪人數須為 1–200。');
  if (!['single', 'sequence', 'batch'].includes(mode) || (mode === 'single' && count !== 1)) throw new Error('單人抽獎每輪只能抽出一位。');
  if (activity.participants.length > MAX_PARTICIPANT_COUNT) throw new Error('每場活動最多 200 人。');
  const prize = findPrize(activity, prizeId);
  const candidates = getCandidates(activity, prizeId);
  if (count > remainingPrizeSlots(activity, prizeId)) throw new Error('本輪人數超過獎項剩餘名額，請減少人數。');
  if (count > candidates.length) throw new Error(`目前只有 ${candidates.length} 位符合資格，請減少本輪人數或確認分組。`);
  const pool = [...candidates];
  const winners = Array.from({ length: count }, () => ({ ...pool.splice(randomIndex(pool.length), 1)[0] }));
  const pending: PendingDraw = {
    id: createId(), prizeId, prizeName: prize?.name ?? '自由抽獎', winners,
    groupNames: Object.fromEntries(winners.map((winner) => [winner.id, activity.groups.find((group) => group.id === winner.groupId)?.name ?? '未分組'])),
    revealedCount: 0, startedAt: new Date().toISOString(), mode,
    candidateIds: candidates.map((candidate) => candidate.id),
  };
  activity.pendingDraw = pending;
  return pending;
}

export function revealNext(activity: Activity, drawId: string, all = false, expectedCursor?: number): DrawRecord[] {
  const pending = activity.pendingDraw;
  if (!pending || pending.id !== drawId) return [];
  if (expectedCursor !== undefined && pending.revealedCount !== expectedCursor) return [];
  const count = all || pending.mode === 'batch' ? pending.winners.length : pending.revealedCount + 1;
  const revealed: DrawRecord[] = [];
  while (pending.revealedCount < count) {
    const winner = pending.winners[pending.revealedCount];
    const recordId = `${pending.id}:${winner.id}`;
    if (!activity.records.some((record) => record.id === recordId)) {
      const record: DrawRecord = {
        id: recordId, drawId: pending.id, participantId: winner.id,
        label: winner.label, code: winner.code, groupName: pending.groupNames[winner.id] ?? '未分組',
        prizeId: pending.prizeId, prizeName: pending.prizeName,
        drawnAt: new Date().toISOString(), status: 'won',
      };
      activity.records.push(record);
      revealed.push(record);
    }
    pending.revealedCount += 1;
  }
  if (pending.revealedCount === pending.winners.length) activity.pendingDraw = null;
  return revealed;
}

export function markRecord(activity: Activity, recordId: string, status: DrawRecord['status']): void {
  assertActivityEditable(activity);
  const record = activity.records.find((item) => item.id === recordId);
  if (!record) throw new Error('找不到這筆中獎紀錄。');
  if (!['won', 'absent', 'declined'].includes(status)) throw new Error('中獎狀態不正確。');
  if (status === 'won' && record.status !== 'won') throw new Error('缺席或放棄者已排除，請保留紀錄並補抽。');
  record.status = status;
}
