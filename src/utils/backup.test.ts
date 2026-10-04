import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup, parseBackup } from './backup';
import { createActivity, createEmptyData, duplicateActivity, validateAppData } from './models';
import { beginDraw, revealNext } from './drawEngine';

function dataFixture() {
  const data = createEmptyData();
  const activity = createActivity('功德會');
  activity.participants = [{ id: 'a', label: 'John Smith', code: '001', groupId: null }, { id: 'b', label: '王小明', code: '002', groupId: null }];
  data.activities.push(activity);
  data.activeActivityId = activity.id;
  return data;
}

describe('portable activity backups', () => {
  it('round-trips an unfinished sequence and preserves selected outcomes and history', () => {
    const data = dataFixture();
    const draw = beginDraw(data.activities[0], null, 2, 'sequence');
    revealNext(data.activities[0], draw.id, false, 0);
    const restored = parseBackup(exportBackup(data));
    expect(restored).toEqual(data);
    const last = revealNext(restored.activities[0], draw.id, false, 1);
    expect(last[0].participantId).toBe(draw.winners[1].id);
  });

  it('imports with new activity IDs without overwriting an existing activity', () => {
    const original = dataFixture();
    const before = JSON.stringify(original.activities[0]);
    const imported = importBackup(original, exportBackup(original));
    expect(original.activities).toHaveLength(2);
    expect(JSON.stringify(original.activities[0])).toBe(before);
    expect(imported[0].id).not.toBe(original.activities[0].id);
    expect(imported[0].name).toContain('匯入');
    expect(validateAppData(original)).toBe(original);
  });

  it('rejects damaged JSON, unsupported schemas, duplicate people and invalid pending cursors', () => {
    expect(() => parseBackup('{broken')).toThrow('JSON');
    const data = dataFixture();
    expect(() => parseBackup({ ...data, schemaVersion: 99 })).toThrow('版本 2');
    data.activities[0].participants.push({ ...data.activities[0].participants[0] });
    expect(() => parseBackup(data)).toThrow('識別碼重複');
    const valid = dataFixture();
    const pending = beginDraw(valid.activities[0], null, 2, 'sequence');
    pending.revealedCount = 1;
    expect(() => parseBackup(valid)).toThrow('進度與紀錄');
  });

  it('duplicates setup only and requires finishing pending outcomes first', () => {
    const activity = dataFixture().activities[0];
    const draw = beginDraw(activity, null, 1, 'single');
    expect(() => duplicateActivity(activity)).toThrow('未完成');
    revealNext(activity, draw.id);
    const copy = duplicateActivity(activity);
    expect(copy.records).toEqual([]);
    expect(copy.id).not.toBe(activity.id);
    expect(copy.participants).toEqual(activity.participants);
  });

  it('rejects duplicate draw/person records and inconsistent frozen sequence snapshots', () => {
    const data = dataFixture();
    const pending = beginDraw(data.activities[0], null, 2, 'sequence');
    const [record] = revealNext(data.activities[0], pending.id, false, 0);
    const duplicate = parseBackup(exportBackup(data));
    duplicate.activities[0].records.push({ ...record, id: 'different-id' });
    expect(() => parseBackup(duplicate)).toThrow('同一輪同一人');
    data.activities[0].records[0].label = '被更換的人選';
    expect(() => parseBackup(data)).toThrow('紀錄快照');
  });

  it('rejects pending candidates that omit eligible people or include excluded winners', () => {
    const data = dataFixture();
    const pending = beginDraw(data.activities[0], null, 1, 'single');
    pending.candidateIds = [pending.winners[0].id];
    expect(() => parseBackup(data)).toThrow('候選名單與抽獎資格');
  });
});
