import { describe, expect, it, vi } from 'vitest';
import { beginDraw, getCandidates, markRecord, remainingPrizeSlots, revealNext } from './drawEngine';
import { createActivity, UNASSIGNED_GROUP_ID } from './models';
import * as randomness from './participants';
import type { Activity } from '../types';

function fixture(): Activity {
  const activity = createActivity('春季活動');
  activity.groups = [{ id: 'a', name: '第一組' }, { id: 'b', name: '第二組' }];
  activity.participants = [
    { id: '1', label: '王小明', code: '001', groupId: 'a' },
    { id: '2', label: '王小明', code: '002', groupId: 'a' },
    { id: '3', label: 'John Smith', code: '', groupId: 'b' },
    { id: '4', label: '陳小美', code: '004', groupId: null },
  ];
  activity.prizes = [{ id: 'p', name: '平安獎', quantity: 2, groupIds: null }, { id: 'q', name: '好運獎', quantity: 4, groupIds: null }];
  return activity;
}

describe('draw eligibility and prize capacity', () => {
  it('filters groups by stable identity and supports unassigned people', () => {
    const activity = fixture();
    activity.prizes[0].groupIds = ['a', UNASSIGNED_GROUP_ID];
    expect(getCandidates(activity, 'p').map((row) => row.id)).toEqual(['1', '2', '4']);
    expect(getCandidates(activity, null)).toHaveLength(4);
  });

  it('retains absent/declined records, frees a slot and permanently excludes the participant', () => {
    vi.spyOn(randomness, 'randomIndex').mockReturnValue(0);
    const activity = fixture();
    const draw = beginDraw(activity, 'p', 1, 'single');
    const [record] = revealNext(activity, draw.id);
    expect(remainingPrizeSlots(activity, 'p')).toBe(1);
    markRecord(activity, record.id, 'absent');
    activity.settings.repeatPolicy = 'none';
    expect(remainingPrizeSlots(activity, 'p')).toBe(2);
    expect(getCandidates(activity, 'q').map((row) => row.id)).not.toContain(record.participantId);
    expect(activity.records[0].status).toBe('absent');
    expect(() => markRecord(activity, record.id, 'won')).toThrow('保留紀錄');
    vi.restoreAllMocks();
  });

  it('distinguishes whole-activity, same-prize, and unrestricted repeat policies', () => {
    const activity = fixture();
    const pending = beginDraw(activity, 'p', 1, 'single');
    const [record] = revealNext(activity, pending.id);
    expect(getCandidates(activity, 'q').some((row) => row.id === record.participantId)).toBe(false);
    activity.settings.repeatPolicy = 'prize';
    expect(getCandidates(activity, 'q').some((row) => row.id === record.participantId)).toBe(true);
    expect(getCandidates(activity, 'p').some((row) => row.id === record.participantId)).toBe(false);
    activity.settings.repeatPolicy = 'none';
    expect(getCandidates(activity, 'p').some((row) => row.id === record.participantId)).toBe(true);
  });

  it('rejects excess quota, insufficient candidates, archived events and concurrent draws', () => {
    const activity = fixture();
    expect(() => beginDraw(activity, 'p', 3, 'batch')).toThrow('剩餘名額');
    expect(() => beginDraw(activity, null, 5, 'batch')).toThrow('符合資格');
    expect(() => beginDraw(activity, null, 2, 'single')).toThrow('單人');
    activity.archived = true;
    expect(() => beginDraw(activity, null, 1, 'single')).toThrow('封存');
    activity.archived = false;
    beginDraw(activity, null, 1, 'single');
    expect(() => beginDraw(activity, null, 1, 'single')).toThrow('未完成');
  });
});

describe('durable selected outcomes', () => {
  it('draws without replacement, freezes display snapshots, reserves quota, and reveals only once', () => {
    vi.spyOn(randomness, 'randomIndex').mockReturnValue(0);
    const activity = fixture();
    const pending = beginDraw(activity, 'p', 2, 'batch');
    expect(pending.winners.map((winner) => winner.id)).toEqual(['1', '2']);
    expect(new Set(pending.winners.map((winner) => winner.id)).size).toBe(2);
    expect(remainingPrizeSlots(activity, 'p')).toBe(0);
    expect(activity.records).toEqual([]);
    activity.participants[0].label = '名單變更不影響快照';
    expect(pending.winners[0].label).toBe('王小明');
    const records = revealNext(activity, pending.id);
    expect(records).toHaveLength(2);
    expect(records[0].groupName).toBe('第一組');
    expect(activity.pendingDraw).toBeNull();
    expect(revealNext(activity, pending.id)).toEqual([]);
    vi.restoreAllMocks();
  });

  it('recovers a sequence after reload and uses an expected cursor to reject duplicate completion', () => {
    const activity = fixture();
    const pending = beginDraw(activity, null, 3, 'sequence');
    const winnerIds = pending.winners.map((winner) => winner.id);
    expect(revealNext(activity, pending.id, false, 0)).toHaveLength(1);
    expect(revealNext(activity, pending.id, false, 0)).toEqual([]);
    const recovered = JSON.parse(JSON.stringify(activity)) as Activity;
    expect(recovered.pendingDraw?.winners.map((winner) => winner.id)).toEqual(winnerIds);
    expect(revealNext(recovered, pending.id, false, 1)).toHaveLength(1);
    expect(revealNext(recovered, pending.id, true, 2)).toHaveLength(1);
    expect(recovered.records.map((record) => record.participantId)).toEqual(winnerIds);
    expect(recovered.pendingDraw).toBeNull();
  });

  it('trial on a data clone changes no official history, eligibility or quota', () => {
    const activity = fixture();
    const before = JSON.stringify(activity);
    const trial = JSON.parse(before) as Activity;
    const pending = beginDraw(trial, 'p', 2, 'batch');
    revealNext(trial, pending.id, true);
    expect(JSON.stringify(activity)).toBe(before);
    expect(remainingPrizeSlots(activity, 'p')).toBe(2);
    expect(getCandidates(activity, 'p')).toHaveLength(4);
  });
});
