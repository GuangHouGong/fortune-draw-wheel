import type { Row } from 'read-excel-file/browser';
import { parseParticipants } from './participants';

type SpreadsheetCell = Row[number];
type SpreadsheetRow = SpreadsheetCell[];

const PREFERRED_COLUMN_HEADERS = new Set([
  '姓名',
  '名字',
  '名稱',
  '參加者',
  '參與者',
  '抽獎名單',
  '名單',
  '中獎者',
  '編號',
  '號碼',
  '序號',
  'id',
  'no',
  'number',
  'name',
  'participant',
  'participants',
  'person',
  'member',
  'ticket',
  'ticketno',
]);

function normalizeHeader(value: SpreadsheetCell): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/gu, '');
}

function normalizeCell(value: SpreadsheetCell): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim().replace(/\s+/gu, ' ');
}

function rowsToParticipants(rows: SpreadsheetRow[]): string[] {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => normalizeCell(cell)));

  if (nonEmptyRows.length === 0) {
    return [];
  }

  const headerRow = nonEmptyRows[0];
  const preferredColumnIndex = headerRow.findIndex((cell) => PREFERRED_COLUMN_HEADERS.has(normalizeHeader(cell)));
  const columnIndex = preferredColumnIndex >= 0 ? preferredColumnIndex : findFirstPopulatedColumn(nonEmptyRows);
  const dataRows = preferredColumnIndex >= 0 ? nonEmptyRows.slice(1) : nonEmptyRows;
  const values = dataRows.map((row) => normalizeCell(row[columnIndex])).filter(Boolean);

  return uniqueParticipants(values);
}

function uniqueParticipants(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function findFirstPopulatedColumn(rows: SpreadsheetRow[]): number {
  const maxColumnCount = Math.max(...rows.map((row) => row.length));

  for (let columnIndex = 0; columnIndex < maxColumnCount; columnIndex += 1) {
    if (rows.some((row) => normalizeCell(row[columnIndex]))) {
      return columnIndex;
    }
  }

  return 0;
}

function parseCsvRows(input: string): SpreadsheetRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let isInsideQuotes = false;
  const text = input.replace(/^\uFEFF/u, '');

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (isInsideQuotes) {
      if (character === '"' && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        isInsideQuotes = false;
      } else {
        cell += character;
      }

      continue;
    }

    if (character === '"') {
      isInsideQuotes = true;
      continue;
    }

    if (character === ',' || character === '，' || character === ';' || character === '；') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (character === '\r' || character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';

      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function getFileExtension(filename: string): string {
  const match = /\.([^.]+)$/u.exec(filename);
  return match?.[1].toLowerCase() ?? '';
}

export async function importParticipantsFromFile(file: File): Promise<string[]> {
  const extension = getFileExtension(file.name);

  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    return rowsToParticipants(rows);
  }

  if (extension === 'csv') {
    return rowsToParticipants(parseCsvRows(await file.text()));
  }

  if (extension === 'txt' || file.type.startsWith('text/')) {
    return parseParticipants(await file.text());
  }

  if (extension === 'xls') {
    throw new Error('目前支援新版 Excel .xlsx；舊版 .xls 請先另存成 .xlsx 或 CSV。');
  }

  throw new Error('目前支援 .xlsx、.csv 或 .txt 名單檔。');
}
