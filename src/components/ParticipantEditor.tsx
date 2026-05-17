import type { ChangeEvent } from 'react';

type ParticipantEditorProps = {
  value: string;
  totalCount: number;
  availableCount: number;
  winnerCount: number;
  recommendedCount: number;
  maxCount: number;
  quickCount: number;
  isOverLimit: boolean;
  allowRepeat: boolean;
  disabled: boolean;
  isImporting: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  onImportFile: (file: File) => void;
  onQuickCountChange: (count: number) => void;
  onGenerateSequential: () => void;
  onToggleAllowRepeat: (allowRepeat: boolean) => void;
};

export default function ParticipantEditor({
  value,
  totalCount,
  availableCount,
  winnerCount,
  recommendedCount,
  maxCount,
  quickCount,
  isOverLimit,
  allowRepeat,
  disabled,
  isImporting,
  onChange,
  onReset,
  onImportFile,
  onQuickCountChange,
  onGenerateSequential,
  onToggleAllowRepeat,
}: ParticipantEditorProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      onImportFile(file);
    }
  }

  return (
    <section className="control-section" aria-labelledby="participants-title">
      <div className="section-heading">
        <h2 id="participants-title">抽獎名單</h2>
        <button type="button" className="button button-ghost" onClick={onReset} disabled={disabled}>
          重設為 1-120
        </button>
      </div>

      <div className={`stats-grid ${isOverLimit ? 'is-over-limit' : ''}`} aria-label="抽獎統計">
        <div>
          <span>總名單</span>
          <strong>{totalCount}</strong>
        </div>
        <div>
          <span>可抽</span>
          <strong>{availableCount}</strong>
        </div>
        <div>
          <span>已中獎</span>
          <strong>{winnerCount}</strong>
        </div>
        <div>
          <span>上限</span>
          <strong>{maxCount}</strong>
        </div>
      </div>

      <label className="textarea-label" htmlFor="participant-input">
        自訂名單
      </label>
      <p className="field-hint">
        可自行貼上編號或姓名。姓名建議一行一位或逗號分隔；純編號也支援空白分隔。建議 {recommendedCount}{' '}
        人內，最多 {maxCount} 人。
      </p>
      <div className="import-row">
        <input
          id="participant-file"
          className="file-input"
          type="file"
          accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          disabled={disabled || isImporting}
          onChange={handleFileChange}
        />
        <label
          className={`button button-ghost import-button ${disabled || isImporting ? 'is-disabled' : ''}`}
          htmlFor="participant-file"
          aria-disabled={disabled || isImporting}
        >
          {isImporting ? '匯入中' : '匯入 Excel / CSV'}
        </label>
        <span className="import-hint">Excel 讀第一個工作表，優先抓姓名、編號、name 或 id 欄位。</span>
      </div>
      <textarea
        id="participant-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'1\n2\n王小明\n李小華\n或：1, 2, 王小明, 李小華'}
        spellCheck={false}
      />
      {isOverLimit ? <p className="limit-warning">目前超過最多 {maxCount} 人，請刪減名單後再抽獎。</p> : null}

      <div className="quick-generate" aria-label="快速產生連號名單">
        <label htmlFor="quick-count">快速產生編號 1 到</label>
        <input
          id="quick-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={maxCount}
          value={quickCount}
          disabled={disabled}
          onChange={(event) => onQuickCountChange(Number(event.target.value))}
        />
        <button type="button" className="button button-ghost" onClick={onGenerateSequential} disabled={disabled}>
          產生
        </button>
      </div>

      <label className="switch-row">
        <input
          type="checkbox"
          checked={allowRepeat}
          disabled={disabled}
          onChange={(event) => onToggleAllowRepeat(event.target.checked)}
        />
        <span className="switch" aria-hidden="true" />
        <span>允許重複中獎</span>
      </label>
    </section>
  );
}
