import type { Activity, AppData } from '../types';
import { createId, validateAppData } from './models';
import { downloadText, localDateStamp } from './export';

export function parseBackup(input: string | unknown): AppData {
  let value: unknown;
  try { value = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/u, '')) : input; }
  catch { throw new Error('備份檔不是有效的 JSON，請選擇本系統下載的活動備份。'); }
  return JSON.parse(JSON.stringify(validateAppData(value))) as AppData;
}

export function exportBackup(data: AppData): string {
  return JSON.stringify(validateAppData(data), null, 2);
}

export function downloadBackup(data: AppData): void {
  downloadText(`功德會抽獎-完整備份-${localDateStamp()}.json`, exportBackup(data), 'application/json;charset=utf-8');
}

/** Import as new activities; never overwrite existing activities or histories. */
export function importBackup(data: AppData, input: string | unknown): Activity[] {
  const incoming = parseBackup(input);
  const activities = incoming.activities.map((activity) => ({ ...activity, id: createId(), name: `${activity.name}（匯入）` }));
  data.activities.push(...activities);
  data.activeActivityId = activities.find((activity) => !activity.archived)?.id ?? data.activeActivityId;
  return activities;
}
