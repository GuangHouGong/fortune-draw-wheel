export type WinnerRecord = {
  id: string;
  round: number;
  drawnAt: string;
};

function escapeCsvCell(value: string | number): string {
  const text = String(value);

  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function winnerHistoryToCsv(records: WinnerRecord[]): string {
  const rows = [
    ['round', 'winner_id', 'drawn_at'],
    ...records.map((record) => [record.round, record.id, record.drawnAt]),
  ];

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
}

export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
