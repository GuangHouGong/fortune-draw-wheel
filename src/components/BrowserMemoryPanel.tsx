type BrowserMemoryPanelProps = {
  savedAt: string | null;
  disabled: boolean;
  onSave: () => void;
  onRestore: () => void;
  onClear: () => void;
};

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    return '時間不明';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function BrowserMemoryPanel({
  savedAt,
  disabled,
  onSave,
  onRestore,
  onClear,
}: BrowserMemoryPanelProps) {
  return (
    <section className="control-section browser-memory" aria-labelledby="browser-memory-title">
      <div className="section-heading">
        <h2 id="browser-memory-title">儲存在此瀏覽器</h2>
        <span className={`memory-state ${savedAt ? 'is-saved' : ''}`}>
          {savedAt ? '已儲存' : '尚未儲存'}
        </span>
      </div>

      <p className="field-hint">在目前的瀏覽器儲存名單、抽獎設定與中獎紀錄。清除瀏覽資料後，這份資料也會刪除。</p>
      <p className="memory-time">
        {savedAt ? `上次儲存：${formatSavedAt(savedAt)}` : '尚未儲存資料。'}
      </p>

      <div className="memory-actions">
        <button type="button" className="button button-ghost" onClick={onSave} disabled={disabled}>
          儲存目前資料
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={onRestore}
          disabled={disabled || !savedAt}
        >
          還原已儲存資料
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={onClear}
          disabled={disabled || !savedAt}
        >
          清除已儲存資料
        </button>
      </div>
    </section>
  );
}
