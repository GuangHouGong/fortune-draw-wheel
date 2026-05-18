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
        <h2 id="browser-memory-title">瀏覽器記憶</h2>
        <span className={`memory-state ${savedAt ? 'is-saved' : ''}`}>
          {savedAt ? '已記住' : '尚未記住'}
        </span>
      </div>

      <p className="field-hint">把目前名單、重複中獎設定與中獎紀錄記在這台瀏覽器。</p>
      <p className="memory-time">
        {savedAt ? `上次記住：${formatSavedAt(savedAt)}` : '尚未建立瀏覽器記憶。'}
      </p>

      <div className="memory-actions">
        <button type="button" className="button button-ghost" onClick={onSave} disabled={disabled}>
          記住目前資料
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={onRestore}
          disabled={disabled || !savedAt}
        >
          還原記憶
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={onClear}
          disabled={disabled || !savedAt}
        >
          清除記憶
        </button>
      </div>
    </section>
  );
}
