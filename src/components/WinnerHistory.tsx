import type { WinnerRecord } from '../utils/csv';

type WinnerHistoryProps = {
  records: WinnerRecord[];
  currentWinner: string | null;
  disabled: boolean;
  onClear: () => void;
  onExport: () => void;
};

function formatDrawnAt(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export default function WinnerHistory({
  records,
  currentWinner,
  disabled,
  onClear,
  onExport,
}: WinnerHistoryProps) {
  return (
    <section className="control-section" aria-labelledby="history-title">
      <div className="section-heading">
        <h2 id="history-title">中獎紀錄</h2>
        <div className="history-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onExport}
            disabled={records.length === 0}
          >
            匯出 CSV
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={onClear}
            disabled={disabled || records.length === 0}
          >
            清除紀錄
          </button>
        </div>
      </div>

      <div className="winner-spotlight" aria-live="polite">
        <span>本輪中獎</span>
        <strong>{currentWinner ?? '尚未抽出'}</strong>
      </div>

      <div className="history-list">
        {records.length === 0 ? (
          <p className="empty-state">尚無紀錄</p>
        ) : (
          <ol>
            {records.map((record) => (
              <li key={`${record.round}-${record.drawnAt}-${record.id}`}>
                <span className="history-round">第 {record.round} 輪</span>
                <strong>{record.id}</strong>
                <time dateTime={record.drawnAt}>{formatDrawnAt(record.drawnAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
