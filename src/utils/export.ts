import type { Activity } from '../types';

export function escapeCsvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r]/u.test(text)) text = `'${text}`;
  if (/[",\n\r]/u.test(text)) return `"${text.replace(/"/gu, '""')}"`;
  return text;
}

function csv(rows: Array<Array<string | number>>): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function participantsToCsv(activity: Activity): string {
  return csv([['編號', '姓名', '分組'], ...activity.participants.map((participant) => [participant.code, participant.label, activity.groups.find((group) => group.id === participant.groupId)?.name ?? ''])]);
}

export function recordsToCsv(activity: Activity): string {
  const labels = { won: '中獎', absent: '缺席', declined: '放棄' };
  return csv([['活動', '獎項', '編號', '姓名', '分組', '狀態', '開獎時間'], ...activity.records.map((record) => [
    activity.name, record.prizeName, record.code, record.label, record.groupName,
    labels[record.status], new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Taipei', hour12: false }).format(new Date(record.drawnAt)),
  ])]);
}

export function localDateStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value ?? '').join('');
}

export function safeFilename(value: string): string {
  const printable = Array.from(value).filter((character) => character.charCodeAt(0) >= 32).join('');
  return printable.replace(/[<>:"/\\|?*]/gu, '-').slice(0, 80).trim() || '抽獎活動';
}

export function downloadText(filename: string, contents: string, mime = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  const extension = /\.(csv|json|txt)$/iu.exec(filename)?.[0] ?? '';
  link.download = `${safeFilename(extension ? filename.slice(0, -extension.length) : filename)}${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadParticipants(activity: Activity): void {
  downloadText(`${safeFilename(activity.name)}-名單-${localDateStamp()}.csv`, participantsToCsv(activity), 'text/csv;charset=utf-8');
}

export function downloadRecords(activity: Activity): void {
  downloadText(`${safeFilename(activity.name)}-結果-${localDateStamp()}.csv`, recordsToCsv(activity), 'text/csv;charset=utf-8');
}
