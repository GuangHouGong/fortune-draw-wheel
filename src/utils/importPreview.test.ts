import { describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { strToU8, zipSync } from 'fflate';
import type { Activity } from '../types';
import {
  applyParticipantImport, createImportTable, mapImportRows,
  parseImportCsv, parsePastedParticipants, readImportFile, sequentialImportRows,
} from './importPreview';

function activity(): Activity {
  return {
    id: 'activity-1', name: '測試活動', createdAt: '2026-10-05T00:00:00.000Z', archived: false,
    participants: [{ id: 'person-1', label: '王小明', code: '001', groupId: 'group-1' }],
    groups: [{ id: 'group-1', name: '第一組' }], prizes: [],
    settings: { method: 'wheel', autoStop: true, repeatPolicy: 'activity' },
    records: [], pendingDraw: null,
  };
}

function doubleSpaceWorkbook(): File {
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const worksheet = (rows: string[][]) => `<worksheet xmlns="${namespace}"><sheetData>${rows.map((row, index) => `<row r="${index + 1}">${row.map((cell, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${cell}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(`<workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="第一頁" sheetId="1" r:id="rId1"/><sheet name="忽略此頁" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(worksheet([['姓名', '編號', '組別'], ['  John  Smith  ', '001', '第一組'], ['王  小明', '002', '第二組']])),
    'xl/worksheets/sheet2.xml': strToU8(worksheet([['姓名', '編號'], ['不應匯入', '999']])),
  });
  return new File([new Uint8Array(bytes).buffer], '雙空白姓名.xlsx');
}

describe('import parsing and preview', () => {
  it('preserves names with spaces and only splits a purely numeric list on whitespace', () => {
    expect(parsePastedParticipants('John  Smith\n王 小明,李小華')).toEqual([['John  Smith'], ['王 小明'], ['李小華']]);
    expect(parsePastedParticipants('001 002\n003，004')).toEqual([['001'], ['002'], ['003'], ['004']]);
    expect(parsePastedParticipants('001 王小明')).toEqual([['001 王小明']]);
    expect(parsePastedParticipants(' \n ')).toEqual([]);
  });

  it('parses quoted commas, quotes, newlines, BOM and traditional separators', () => {
    expect(parseImportCsv('\uFEFF姓名,編號,組別\r\n"Smith, John",001,"第""一組"\r\n"王\n小明",002,第二組')).toEqual([
      ['姓名', '編號', '組別'], ['Smith, John', '001', '第"一組'], ['王\n小明', '002', '第二組'],
    ]);
    expect(parseImportCsv('姓名\t編號\n王小明\t001')).toEqual([['姓名', '編號'], ['王小明', '001']]);
    expect(() => parseImportCsv('"未結束')).toThrow('引號未成對');
    expect(() => parseImportCsv('"姓名"bad,001')).toThrow('引號後');
  });

  it('suggests name, code and group headers and permits explicit header override', () => {
    const table = createImportTable([['備註', '姓名', '編號', '組別'], ['VIP', 'John  Smith', '001', '第一組']]);
    expect(table.hasHeader).toBe(true);
    expect(table.suggested).toEqual({ labelColumn: 1, codeColumn: 2, groupColumn: 3 });
    expect(mapImportRows(table, table.suggested)).toEqual([{ label: 'John  Smith', code: '001', group: '第一組' }]);
    expect(createImportTable(table.sourceRows, false).rows).toHaveLength(2);
  });

  it('falls back to first populated column and uses a code column as display label when no name exists', () => {
    const fallback = createImportTable([['', '王小明'], ['', '李小華']]);
    expect(fallback.hasHeader).toBe(false);
    expect(fallback.suggested.labelColumn).toBe(1);
    const codes = createImportTable([['id'], ['001']]);
    expect(mapImportRows(codes, codes.suggested)).toEqual([{ label: '001', code: '001', group: '' }]);
    expect(() => createImportTable([['', ' ']])).toThrow('沒有可匯入');
  });

  it('produces padded ranges and rejects invalid or over-limit ranges', () => {
    expect(sequentialImportRows(8, 10, 3)).toEqual([['008'], ['009'], ['010']]);
    expect(sequentialImportRows(1, 200, 0)).toHaveLength(200);
    expect(() => sequentialImportRows(1, 201, 0)).toThrow('最多 200');
    expect(() => sequentialImportRows(10, 2, 0)).toThrow('結束編號');
    expect(() => sequentialImportRows(1, 2, 13)).toThrow('補零位數');
    expect(() => sequentialImportRows(1.5, 2, 0)).toThrow('整數');
  });

  it('reads text and CSV files locally, rejects unsupported and malformed imports', async () => {
    const text = await readImportFile(new File(['John Smith\n王小明'], '名單.txt'));
    expect(mapImportRows(text, text.suggested).map((row) => row.label)).toEqual(['John Smith', '王小明']);
    const csv = await readImportFile(new File(['姓名,編號\n王小明,001'], '名單.CSV'));
    expect(csv.suggested.codeColumn).toBe(1);
    await expect(readImportFile(new File(['bad'], '名單.xls'))).rejects.toThrow('另存成');
    await expect(readImportFile(new File(['bad'], '名單.json'))).rejects.toThrow('請選擇');
    await expect(readImportFile(new File(['"bad'], '名單.csv'))).rejects.toThrow('引號未成對');
  });

  it('reads only the first XLSX sheet and preserves double spaces through preview and saving', async () => {
    // Supply the same XML DOM surface as the browser while reading a real ZIP workbook.
    vi.stubGlobal('DOMParser', DOMParser);
    try {
      const table = await readImportFile(doubleSpaceWorkbook());
      const rows = mapImportRows(table, table.suggested);
      expect(rows).toEqual([
        { label: 'John  Smith', code: '001', group: '第一組' },
        { label: '王  小明', code: '002', group: '第二組' },
      ]);
      const saved = applyParticipantImport(activity(), rows, { mode: 'replace', keepDuplicateNames: false });
      expect(saved.participants.map((participant) => participant.label)).toEqual(['John  Smith', '王  小明']);
      expect(saved.participants.map((participant) => participant.code)).toEqual(['001', '002']);
      expect(saved.participants.some((participant) => participant.code === '999')).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it('preserves distinct single and double-space names through pasted and CSV mappings', () => {
    const pasted = createImportTable(parsePastedParticipants(' John  Smith \nJohn Smith\n001 002'), false);
    expect(mapImportRows(pasted, pasted.suggested).map((row) => row.label)).toEqual(['John  Smith', 'John Smith', '001 002']);
    const csv = createImportTable(parseImportCsv('姓名,編號\n John  Smith ,001\nJohn Smith,002'));
    const saved = applyParticipantImport(activity(), mapImportRows(csv, csv.suggested), { mode: 'replace', keepDuplicateNames: false });
    expect(saved.participants.map((participant) => participant.label)).toEqual(['John  Smith', 'John Smith']);
  });
});

describe('applying an import', () => {
  it('preserves stable identity on a matching code and creates new groups without changing original data', () => {
    const source = activity();
    const updated = applyParticipantImport(source, [
      { label: '王 大明', code: '001', group: '第二組' },
      { label: '李小華', code: '002', group: '第二組' },
    ], { mode: 'append', keepDuplicateNames: false });
    expect(updated.participants[0]).toMatchObject({ id: 'person-1', label: '王 大明', code: '001' });
    expect(updated.groups).toHaveLength(2);
    expect(updated.participants[0].groupId).toBe(updated.participants[1].groupId);
    expect(source.participants[0].label).toBe('王小明');
    expect(source.groups).toHaveLength(1);
  });

  it('merges no-code duplicate names by default but preserves distinct codes', () => {
    const updated = applyParticipantImport(activity(), [
      { label: '李小華', code: '', group: '' }, { label: '李小華', code: '', group: '' },
      { label: '李小華', code: '002', group: '' }, { label: '李小華', code: '003', group: '' },
    ], { mode: 'append', keepDuplicateNames: false });
    expect(updated.participants).toHaveLength(4);
    const retained = applyParticipantImport(activity(), [
      { label: '李小華', code: '', group: '' }, { label: '李小華', code: '', group: '' },
    ], { mode: 'replace', keepDuplicateNames: true });
    expect(retained.participants).toHaveLength(2);
    expect(retained.participants[0].id).not.toBe(retained.participants[1].id);
  });

  it('rejects duplicate codes and counts the merged final list against the 200-person limit', () => {
    expect(() => applyParticipantImport(activity(), [
      { label: '王小明', code: '001', group: '' }, { label: '李小華', code: '001', group: '' },
    ], { mode: 'append', keepDuplicateNames: false })).toThrow('編號「001」重複');
    const rows = Array.from({ length: 200 }, (_, index) => ({ label: String(index), code: String(index), group: '' }));
    expect(() => applyParticipantImport(activity(), rows, { mode: 'append', keepDuplicateNames: false })).toThrow('最多 200');
    expect(applyParticipantImport(activity(), rows, { mode: 'replace', keepDuplicateNames: false }).participants).toHaveLength(200);
  });

  it('protects recorded participants from replacement while permitting code-matched updates', () => {
    const source = activity();
    source.records = [{ id: 'record-1', drawId: 'draw-1', participantId: 'person-1', label: '王小明', code: '001', groupName: '第一組', prizeId: null, prizeName: '自由抽獎', drawnAt: source.createdAt, status: 'won' }];
    expect(() => applyParticipantImport(source, [{ label: '李小華', code: '002', group: '' }], { mode: 'replace', keepDuplicateNames: false })).toThrow('只能加入');
    const updated = applyParticipantImport(source, [{ label: '王大明', code: '001', group: '' }], { mode: 'append', keepDuplicateNames: false });
    expect(updated.participants[0].id).toBe(source.records[0].participantId);
    expect(updated.records[0].label).toBe('王小明');
    expect(updated.participants[0].groupId).toBe('group-1');
  });
});
