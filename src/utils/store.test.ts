import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimDrawOwner, downloadRawRecovery, readAppData, restoreFromBackup, STORE_KEY, subscribeStore, supportsLocks, transaction } from './store';
import { createActivity, createEmptyData } from './models';
import { beginDraw, revealNext } from './drawEngine';
import * as downloads from './export';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
}

function lockManager() {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();
  return {
    async request<T>(name: string, options: { ifAvailable?: boolean }, callback: (lock: { name: string } | null) => T | Promise<T>): Promise<T> {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        await new Promise<void>((resolve) => { queues.set(name, [...(queues.get(name) ?? []), resolve]); });
      }
      held.add(name);
      try { return await callback({ name }); }
      finally { held.delete(name); queues.get(name)?.shift()?.(); }
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('navigator', { locks: lockManager() });
});

function seed() {
  const data = createEmptyData();
  const activity = createActivity('正式活動');
  activity.participants = [{ id: 'a', label: '王小明', code: '001', groupId: null }, { id: 'b', label: 'John Smith', code: '002', groupId: null }];
  data.activities.push(activity);
  data.activeActivityId = activity.id;
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  return activity.id;
}

describe('fresh-read durable transactions', () => {
  it('serializes independent updates without stale-data overwrites', async () => {
    const id = seed();
    await Promise.all([
      transaction((data) => { data.activities.find((activity) => activity.id === id)!.name = '已改活動名'; }),
      transaction((data) => { data.preferences.largeText = true; }),
    ]);
    expect(readAppData().data.activities[0].name).toBe('已改活動名');
    expect(readAppData().data.preferences.largeText).toBe(true);
  });

  it('permits only one concurrent start and rejects pending setup edits', async () => {
    seed();
    const results = await Promise.allSettled([
      transaction((data) => { beginDraw(data.activities[0], null, 1, 'single'); }),
      transaction((data) => { beginDraw(data.activities[0], null, 1, 'single'); }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(transaction((data) => { data.activities[0].participants = []; })).rejects.toThrow('不能變更');
    await expect(transaction((data) => { data.activities = []; data.activeActivityId = null; })).rejects.toThrow('不能刪除');
    expect(readAppData().data.activities[0].participants).toHaveLength(2);
  });

  it('commits a sequence result and cursor together and rejects a duplicate reveal event', async () => {
    seed();
    const started = await transaction((data) => { beginDraw(data.activities[0], null, 2, 'sequence'); });
    const id = started.activities[0].pendingDraw!.id;
    const outcomes = await Promise.all([
      transaction((data) => { revealNext(data.activities[0], id, false, 0); }),
      transaction((data) => { revealNext(data.activities[0], id, false, 0); }),
    ]);
    expect(outcomes[1].activities[0].records).toHaveLength(1);
    expect(readAppData().data.activities[0].pendingDraw?.revealedCount).toBe(1);
    await transaction((data) => { revealNext(data.activities[0], id, false, 1); });
    expect(readAppData().data.activities[0].pendingDraw).toBeNull();
    expect(readAppData().data.activities[0].records).toHaveLength(2);
  });

  it('does not report success or notify subscribers when saving fails', async () => {
    seed();
    const callback = vi.fn();
    const unsubscribe = subscribeStore(callback);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    await expect(transaction((data) => { data.activities[0].name = '尚未保存'; })).rejects.toThrow('資料未保存');
    expect(callback).not.toHaveBeenCalled();
    expect(readAppData().data.activities[0].name).toBe('正式活動');
    unsubscribe();
  });

  it('preserves unreadable stored data instead of overwriting it during a routine mutation', async () => {
    const damaged = '{bad';
    localStorage.setItem(STORE_KEY, damaged);
    expect(readAppData().warnings[0]).toContain('原始資料仍保留');
    await expect(transaction((data) => { data.preferences.largeText = true; })).rejects.toThrow('尚未覆寫');
    expect(localStorage.getItem(STORE_KEY)).toBe(damaged);
  });

  it('preserves winner snapshots and timestamps while permitting absence marking', async () => {
    seed();
    const started = await transaction((data) => { beginDraw(data.activities[0], null, 1, 'single'); });
    const drawId = started.activities[0].pendingDraw!.id;
    await transaction((data) => { revealNext(data.activities[0], drawId, false, 0); });
    const record = readAppData().data.activities[0].records[0];
    await expect(transaction((data) => { data.activities[0].records[0].drawnAt = '2030-01-01T00:00:00.000Z'; })).rejects.toThrow('開獎時間不能更改');
    await expect(transaction((data) => { data.activities[0].records[0].label = '其他人'; })).rejects.toThrow('中獎人選');
    await expect(transaction((data) => { data.activities[0].records = []; })).rejects.toThrow('紀錄需保留');
    await transaction((data) => { data.activities[0].records[0].status = 'declined'; });
    await expect(transaction((data) => { data.activities[0].records[0].status = 'won'; })).rejects.toThrow('排除');
    expect(readAppData().data.activities[0].records[0].drawnAt).toBe(record.drawnAt);
  });
});

describe('explicit recovery of an unreadable store', () => {
  it('validates a selected backup and preserves the exact damaged original before restoring', async () => {
    seed();
    const backup = readAppData().data;
    const original = '{damaged original';
    localStorage.setItem(STORE_KEY, original);
    const writes = vi.spyOn(localStorage, 'setItem');
    const restored = await restoreFromBackup(JSON.stringify(backup));
    expect(restored).toEqual(backup);
    expect(writes.mock.calls[0][0]).toMatch(/^fortune-draw-wheel:data:v2:recovery:/u);
    expect(writes.mock.calls[0][1]).toBe(original);
    expect(writes.mock.calls[1][0]).toBe(STORE_KEY);
    expect(localStorage.getItem(writes.mock.calls[0][0])).toBe(original);
    expect(readAppData().warnings).toEqual([]);
  });

  it('never overwrites intact data or writes an invalid backup', async () => {
    seed();
    const backup = readAppData().data;
    await expect(restoreFromBackup(backup)).rejects.toThrow('資料完整');
    localStorage.setItem(STORE_KEY, '{damaged');
    const writes = vi.spyOn(localStorage, 'setItem');
    await expect(restoreFromBackup('{invalid selected file')).rejects.toThrow('JSON');
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORE_KEY)).toBe('{damaged');
  });

  it('does not overwrite if preserving the original fails and does not falsely report a failed restore', async () => {
    seed();
    const backup = readAppData().data;
    localStorage.setItem(STORE_KEY, '{damaged');
    const originalSet = localStorage.setItem;
    const writes = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    await expect(restoreFromBackup(backup)).rejects.toThrow('沒有覆寫');
    expect(localStorage.getItem(STORE_KEY)).toBe('{damaged');
    writes.mockImplementation((key, value) => { if (key === STORE_KEY) throw new Error('QuotaExceeded'); originalSet(key, value); });
    await expect(restoreFromBackup(backup)).rejects.toThrow('備份尚未恢復');
    expect(localStorage.getItem(STORE_KEY)).toBe('{damaged');
    expect(writes.mock.calls.some(([key]) => key.includes(':recovery:'))).toBe(true);
  });

  it('downloads the raw original without parsing or altering it', () => {
    localStorage.setItem(STORE_KEY, '{damaged original');
    const download = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
    downloadRawRecovery();
    expect(download).toHaveBeenCalledWith(expect.stringContaining('原始資料'), '{damaged original');
    expect(localStorage.getItem(STORE_KEY)).toBe('{damaged original');
  });
});

describe('activity ownership locks', () => {
  it('does not wait for an occupied owner and can recover after release', async () => {
    expect(supportsLocks()).toBe(true);
    const release = await claimDrawOwner('activity');
    expect(release).toBeTypeOf('function');
    expect(await claimDrawOwner('activity')).toBeNull();
    const other = await claimDrawOwner('other-activity');
    expect(other).toBeTypeOf('function');
    other?.(); release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const recovered = await claimDrawOwner('activity');
    expect(recovered).toBeTypeOf('function');
    recovered?.();
  });

  it('declines formal ownership when the browser lacks Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    expect(supportsLocks()).toBe(false);
    expect(await claimDrawOwner('activity')).toBeNull();
  });
});

describe('non-destructive legacy migration', () => {
  it('starts empty when no legacy data exists', () => {
    expect(readAppData().data.activities).toEqual([]);
  });

  it('keeps current history and manual memory as separate activities and retains original keys', async () => {
    const oldWinners = JSON.stringify([{ id: '1', round: 1, drawnAt: '2026-10-04T12:00:00.000Z' }]);
    localStorage.setItem('fortune-draw-wheel:participants', '1\n2');
    localStorage.setItem('fortune-draw-wheel:winners', oldWinners);
    localStorage.setItem('fortune-draw-wheel:auto-stop', 'false');
    localStorage.setItem('fortune-draw-wheel:browser-memory', JSON.stringify({ participantsText: 'A\nB', winnerHistory: [], allowRepeat: true, autoStop: true, savedAt: '2026-10-04T00:00:00.000Z' }));
    const first = readAppData();
    const second = readAppData();
    expect(first.data.activities.map((activity) => activity.id)).toEqual(second.data.activities.map((activity) => activity.id));
    expect(first.data.activities).toHaveLength(2);
    expect(first.data.activities[0].records[0].label).toBe('1');
    expect(first.data.activities[0].settings.autoStop).toBe(false);
    expect(first.data.activities[1].archived).toBe(true);
    await transaction((data) => { data.preferences.largeText = true; });
    expect(readAppData().data.activities).toHaveLength(2);
    expect(localStorage.getItem('fortune-draw-wheel:winners')).toBe(oldWinners);
  });

  it('retains historical winners missing from the current list without creating fake current participants', async () => {
    localStorage.setItem('fortune-draw-wheel:participants', '2');
    localStorage.setItem('fortune-draw-wheel:winners', JSON.stringify([{ id: '001', round: 1, drawnAt: '2026-10-04T00:00:00.000Z' }]));
    const data = readAppData().data;
    expect(data.activities[0].participants.map((person) => person.label)).toEqual(['2']);
    expect(data.activities[0].records[0]).toMatchObject({ participantId: 'legacy-current:removed:001', label: '001', code: '001' });
    await transaction(() => undefined);
    expect(readAppData().data.activities[0].records).toHaveLength(1);
  });
});
