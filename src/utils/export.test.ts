import { describe, expect, it } from 'vitest';
import { escapeCsvCell, localDateStamp, participantsToCsv, recordsToCsv } from './export';
import { createActivity } from './models';
import { beginDraw, markRecord, revealNext } from './drawEngine';
import { applyParticipantImport, createImportTable, mapImportRows, parseImportCsv } from './importPreview';

describe('spreadsheet-safe downloadable evidence', () => {
  it('quotes delimiters and blocks spreadsheet formula interpretation', () => {
    expect(escapeCsvCell('王,小明')).toBe('"王,小明"');
    expect(escapeCsvCell('John "Smith"')).toBe('"John ""Smith"""');
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(escapeCsvCell('  +cmd')).toBe("'  +cmd");
    expect(escapeCsvCell('@abc')).toBe("'@abc");
  });

  it('exports display labels and immutable winner data with Chinese status', () => {
    const activity = createActivity('秋季活動');
    activity.participants = [{ id: 'a', label: 'John Smith', code: '001', groupId: null }];
    expect(participantsToCsv(activity)).toContain('001,John Smith,\r\n');
    const pending = beginDraw(activity, null, 1, 'single');
    const [record] = revealNext(activity, pending.id);
    markRecord(activity, record.id, 'declined');
    expect(recordsToCsv(activity)).toContain('秋季活動,自由抽獎,001,John Smith,未分組,放棄');
    expect(recordsToCsv(activity).charCodeAt(0)).toBe(0xfeff);
  });

  it('uses the Taiwan date when a download crosses the UTC date boundary', () => {
    expect(localDateStamp(new Date('2026-10-04T17:30:00.000Z'))).toBe('20261005');
  });

  it('round-trips the participant CSV without creating a literal unassigned group', () => {
    const activity = createActivity('名單往返');
    activity.groups = [{ id: 'g', name: '第一組' }];
    activity.participants = [{ id: 'a', label: 'John Smith', code: '001', groupId: null }, { id: 'b', label: '王小明', code: '002', groupId: 'g' }];
    const table = createImportTable(parseImportCsv(participantsToCsv(activity)));
    const restored = applyParticipantImport(createActivity('新裝置'), mapImportRows(table, table.suggested), { mode: 'replace', keepDuplicateNames: false });
    expect(restored.participants[0].groupId).toBeNull();
    expect(restored.participants[0].code).toBe('001');
    expect(restored.groups.map((group) => group.name)).toEqual(['第一組']);
  });
});
