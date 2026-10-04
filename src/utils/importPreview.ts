import type { Activity, ImportRow, Participant } from '../types';
import { createId } from './models';

export type ImportMapping = {
  labelColumn: number;
  codeColumn: number | null;
  groupColumn: number | null;
};

export type ImportTable = {
  sourceRows: string[][];
  columns: string[];
  rows: string[][];
  hasHeader: boolean;
  suggested: ImportMapping;
};

const NAME_HEADERS = new Set(['姓名', '名字', '名稱', '參加者', '參與者', '抽獎名單', '名單', 'name', 'participant', 'participants', 'person', 'member']);
const CODE_HEADERS = new Set(['編號', '號碼', '序號', 'id', 'no', 'number', 'ticket', 'ticketno']);
const GROUP_HEADERS = new Set(['組別', '分組', '組', '群組', 'group', 'team', 'category']);
const MAX_PARTICIPANTS = 200;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Trim only the boundary: internal spaces belong to the participant's name.
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
}

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[\s._-]+/gu, '');
}

/** CSV parsing stays in the browser and preserves quoted commas and line breaks. */
export function parseImportCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/u, '');
  const firstLine = text.split(/\r?\n/u)[0] ?? '';
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : null;
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else value += character;
      continue;
    }
    if (character === '"' && !value.trim() && !afterQuote) {
      value = '';
      quoted = true;
    } else if (delimiter ? character === delimiter : /[,，;；]/u.test(character)) {
      row.push(value.trim());
      value = '';
      afterQuote = false;
    } else if (character === '\r' || character === '\n') {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = '';
      afterQuote = false;
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else if (afterQuote && character.trim()) {
      throw new Error('CSV 引號後有無法辨識的內容，請檢查名單格式。');
    } else value += character;
  }
  if (quoted) throw new Error('CSV 的引號未成對，請檢查名單格式。');
  row.push(value.trim());
  rows.push(row);
  return rows;
}

export function parsePastedParticipants(input: string): string[][] {
  const text = input.replace(/^\uFEFF/u, '').trim();
  if (!text) return [];
  // Only purely numeric lists split on whitespace. "John Smith" stays one person.
  const numericTokens = text.split(/[\s,，;；]+/u).filter(Boolean);
  if (numericTokens.every((token) => /^\d+$/u.test(token))) {
    return numericTokens.map((token) => [token]);
  }
  return text.split(/\r?\n|\r|[,，;；]/u).map((label) => [label.trim()]).filter(([label]) => Boolean(label));
}

export function createImportTable(source: unknown[][], headerOverride?: boolean): ImportTable {
  const sourceRows = source.map((row) => row.map(cellText)).filter((row) => row.some(Boolean));
  if (!sourceRows.length) throw new Error('檔案中沒有可匯入的名單。');
  const firstRow = sourceRows[0];
  const headerKeys = firstRow.map(headerKey);
  const recognizedHeader = headerKeys.some((header) => NAME_HEADERS.has(header) || CODE_HEADERS.has(header) || GROUP_HEADERS.has(header));
  const hasHeader = headerOverride ?? recognizedHeader;
  const width = sourceRows.reduce((largest, row) => Math.max(largest, row.length), 0);
  const rows = hasHeader ? sourceRows.slice(1) : sourceRows;
  const columns = Array.from({ length: width }, (_, index) => hasHeader ? firstRow[index] || `欄位 ${index + 1}` : `欄位 ${index + 1}`);
  const keys = hasHeader ? headerKeys : [];
  const nameColumn = keys.findIndex((key) => NAME_HEADERS.has(key));
  const codeColumn = keys.findIndex((key) => CODE_HEADERS.has(key));
  const groupColumn = keys.findIndex((key) => GROUP_HEADERS.has(key));
  const firstPopulatedColumn = Array.from({ length: width }, (_, index) => index).find((index) => rows.some((row) => row[index])) ?? 0;
  return {
    sourceRows, columns, rows, hasHeader,
    suggested: {
      labelColumn: nameColumn >= 0 ? nameColumn : codeColumn >= 0 ? codeColumn : firstPopulatedColumn,
      codeColumn: codeColumn >= 0 ? codeColumn : null,
      groupColumn: groupColumn >= 0 ? groupColumn : null,
    },
  };
}

export function mapImportRows(table: ImportTable, mapping: ImportMapping): ImportRow[] {
  return table.rows.map((row) => ({
    label: row[mapping.labelColumn]?.trim() ?? '',
    code: mapping.codeColumn === null ? '' : row[mapping.codeColumn]?.trim() ?? '',
    group: mapping.groupColumn === null ? '' : row[mapping.groupColumn]?.trim() ?? '',
  })).filter((row) => row.label || row.code);
}

export async function readImportFile(file: File): Promise<ImportTable> {
  if (file.size > 10 * 1024 * 1024) throw new Error('名單檔請控制在 10 MB 內，最多 200 人。');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    return createImportTable(await readSheet(file, { trim: false }));
  }
  if (extension === 'csv') return createImportTable(parseImportCsv(await file.text()));
  if (extension === 'txt') return createImportTable(parsePastedParticipants(await file.text()), false);
  if (extension === 'xls') throw new Error('舊版 .xls 請先另存成 .xlsx 或 CSV。');
  throw new Error('請選擇 .xlsx、.csv 或 .txt 名單檔。');
}

export function sequentialImportRows(start: number, end: number, padding: number): string[][] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error('起訖編號需為非負整數，結束編號不能小於開始編號。');
  }
  if (end - start + 1 > MAX_PARTICIPANTS) throw new Error('每場活動最多 200 人，請縮小連號範圍。');
  if (!Number.isInteger(padding) || padding < 0 || padding > 12) throw new Error('補零位數請輸入 0 到 12。');
  return Array.from({ length: end - start + 1 }, (_, index) => [String(start + index).padStart(padding, '0')]);
}

export function applyParticipantImport(
  activity: Activity,
  rows: ImportRow[],
  options: { mode: 'append' | 'replace'; keepDuplicateNames: boolean },
): Activity {
  if (options.mode === 'replace' && (activity.records.length || activity.pendingDraw)) {
    throw new Error('已有抽獎紀錄的活動只能追加或更新名單；完整替換請建立新活動。');
  }
  if (!rows.length) throw new Error('沒有可套用的參加者，請確認姓名或編號欄位。');
  const groups = activity.groups.map((group) => ({ ...group }));
  const participants = options.mode === 'append' ? activity.participants.map((participant) => ({ ...participant })) : [];
  const incomingCodes = new Set<string>();
  const incomingNames = new Set<string>();

  for (const row of rows) {
    const code = row.code.trim();
    const label = row.label.trim() || code;
    if (!label) continue;
    if (code && incomingCodes.has(code)) throw new Error(`編號「${code}」重複，請修正後再套用。`);
    if (code) incomingCodes.add(code);
    if (!code && !options.keepDuplicateNames && incomingNames.has(label)) continue;
    if (!code) incomingNames.add(label);
    const existing = activity.participants.find((participant) => code ? participant.code === code : !options.keepDuplicateNames && !participant.code && participant.label === label);
    let groupId: string | null = options.mode === 'append' && existing ? existing.groupId : null;
    if (row.group.trim()) {
      let group = groups.find((item) => item.name === row.group.trim());
      if (!group) {
        group = { id: createId(), name: row.group.trim() };
        groups.push(group);
      }
      groupId = group.id;
    }
    const participant: Participant = { id: existing?.id ?? createId(), label, code, groupId };
    const position = participants.findIndex((item) => item.id === participant.id);
    if (position >= 0) participants[position] = participant;
    else participants.push(participant);
  }
  if (participants.length > MAX_PARTICIPANTS) throw new Error(`套用後會有 ${participants.length} 人，每場活動最多 200 人。`);
  return { ...activity, groups, participants };
}
