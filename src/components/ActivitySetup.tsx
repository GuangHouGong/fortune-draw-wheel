import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Activity, Prize } from '../types';
import {
  applyParticipantImport, createImportTable, mapImportRows, parsePastedParticipants,
  readImportFile, sequentialImportRows,
} from '../utils/importPreview';
import type { ImportMapping, ImportTable } from '../utils/importPreview';
import { downloadText } from '../utils/export';
import { createId, UNASSIGNED_GROUP_ID } from '../utils/models';

type ActivitySetupProps = {
  activity: Activity;
  disabled: boolean;
  onChange: (updated: Activity) => Promise<void> | void;
  onNotice: (message: string) => void;
};

function formValue(form: HTMLFormElement, key: string): string {
  return String(new FormData(form).get(key) ?? '').trim();
}

function downloadTemplate() {
  downloadText('抽獎名單範本.csv', '\uFEFF姓名,編號,組別\r\n王小明,001,第一組\r\n李小華,002,第二組\r\n', 'text/csv;charset=utf-8');
}

function PrizeEditor({ prize, activity, index, blocked, onSave, onMove, onDelete }: {
  prize: Prize; activity: Activity; index: number; blocked: boolean;
  onSave: (updated: Prize) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void;
}) {
  const [allGroups, setAllGroups] = useState(prize.groupIds === null);
  const [groupError, setGroupError] = useState('');
  const wonCount = activity.records.filter((record) => record.prizeId === prize.id && record.status === 'won').length;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = formValue(form, 'name');
    const quantity = Number(formValue(form, 'quantity'));
    const groupIds = allGroups ? null : new FormData(form).getAll('groups').map(String);
    if (groupIds !== null && !groupIds.length) { setGroupError('請至少選一個可參加的組別，或勾選所有參加者。'); return; }
    setGroupError('');
    if (name && Number.isInteger(quantity) && quantity >= Math.max(1, wonCount) && quantity <= 200) {
      onSave({ ...prize, name, quantity, groupIds });
    }
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="section-heading">
        <h3>第 {index + 1} 個獎項</h3>
        <span className="badge">已中獎 {wonCount} / {prize.quantity}</span>
      </div>
      <div className="field-row">
        <label className="field">獎項名稱<input name="name" required maxLength={80} defaultValue={prize.name} disabled={blocked} /></label>
        <label className="field">名額<input name="quantity" type="number" inputMode="numeric" required min={Math.max(1, wonCount)} max={200} defaultValue={prize.quantity} disabled={blocked} /></label>
      </div>
      <label className="field-row"><input type="checkbox" checked={allGroups} onChange={(event) => setAllGroups(event.target.checked)} disabled={blocked} />所有參加者都能抽這個獎項</label>
      {!allGroups && (
        <fieldset className="chips" disabled={blocked}>
          <legend>可參加的組別（可複選）</legend>
          {activity.groups.map((group) => (
            <label key={group.id}><input name="groups" type="checkbox" value={group.id} defaultChecked={prize.groupIds?.includes(group.id)} />{group.name}</label>
          ))}
          <label><input name="groups" type="checkbox" value={UNASSIGNED_GROUP_ID} defaultChecked={prize.groupIds?.includes(UNASSIGNED_GROUP_ID)} />未分組</label>
          <p className="muted">至少選一個組別；各組參加者都有機會中獎。</p>
        </fieldset>
      )}
      {groupError && <p className="alert" role="alert">{groupError}</p>}
      <div className="field-row">
        <button className="button button-primary" disabled={blocked}>儲存獎項</button>
        <button type="button" className="button button-secondary" disabled={blocked || index === 0} onClick={() => onMove(-1)} aria-label={`${prize.name}往前移`}>往前移</button>
        <button type="button" className="button button-secondary" disabled={blocked || index === activity.prizes.length - 1} onClick={() => onMove(1)} aria-label={`${prize.name}往後移`}>往後移</button>
        <button type="button" className="button button-danger" disabled={blocked || activity.records.some((record) => record.prizeId === prize.id)} onClick={onDelete}>刪除</button>
      </div>
    </form>
  );
}

export default function ActivitySetup({ activity, disabled, onChange, onNotice }: ActivitySetupProps) {
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [table, setTable] = useState<ImportTable | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({ labelColumn: 0, codeColumn: null, groupColumn: null });
  const [sourceName, setSourceName] = useState('');
  const [keepDuplicateNames, setKeepDuplicateNames] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [error, setError] = useState('');
  const working = useRef(false);
  const blocked = disabled || saving || reading;
  const hasRecords = activity.records.length > 0;
  const previewRows = table ? mapImportRows(table, mapping) : [];
  const duplicateCodes = previewRows.map((row) => row.code).filter((code, index, values) => code && values.indexOf(code) !== index);

  async function save(updated: Activity, message: string) {
    if (blocked || working.current) return false;
    working.current = true;
    setSaving(true);
    setError('');
    try {
      await onChange(updated);
      onNotice(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法儲存，請先下載備份再重試。');
      return false;
    } finally {
      working.current = false;
      setSaving(false);
    }
  }

  function showPreview(nextTable: ImportTable, name: string) {
    setTable(nextTable);
    setMapping(nextTable.suggested);
    setSourceName(name);
    setKeepDuplicateNames(false);
    setImportMode('append');
    setError('');
    onNotice('已讀取名單，請確認欄位與預覽，再按「確認並套用名單」。');
  }

  async function handleFile(file: File) {
    setReading(true);
    setError('');
    try { showPreview(await readImportFile(file), file.name); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '無法讀取名單檔。'); }
    finally { setReading(false); }
  }

  async function applyPreview() {
    try {
      const updated = applyParticipantImport(activity, previewRows, { mode: importMode, keepDuplicateNames });
      if (await save(updated, `名單已套用，目前共有 ${updated.participants.length} 人。`)) setTable(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '名單套用失敗。'); }
  }

  function updateMapping(key: keyof ImportMapping, value: string) {
    setMapping((current) => ({ ...current, [key]: value === '' ? null : Number(value) }));
  }

  function movePrize(index: number, direction: -1 | 1) {
    const prizes = [...activity.prizes];
    [prizes[index], prizes[index + direction]] = [prizes[index + direction], prizes[index]];
    void save({ ...activity, prizes }, '已更新獎項順序。');
  }

  function submitParticipant(event: FormEvent<HTMLFormElement>, participantId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const label = formValue(form, 'label');
    const code = formValue(form, 'code');
    const groupId = formValue(form, 'groupId') || null;
    if (!label) { setError('請輸入姓名或顯示編號。'); return; }
    if (code && activity.participants.some((participant) => participant.id !== participantId && participant.code === code)) {
      setError(`編號「${code}」已存在，請使用不同編號。`);
      return;
    }
    if (!participantId && activity.participants.length >= 200) { setError('每場活動最多 200 人。'); return; }
    const participant = { id: participantId ?? createId(), label, code, groupId };
    const participants = participantId ? activity.participants.map((item) => item.id === participantId ? participant : item) : [...activity.participants, participant];
    void save({ ...activity, participants }, participantId ? '參加者已更新。' : '已加入參加者。').then((saved) => {
      if (saved && !participantId) form.reset();
    });
  }

  return (
    <div className="stack">
      {error && <p className="alert" role="alert">{error}</p>}
      {disabled && <p className="alert">{activity.archived ? '這場活動已封存，請先回活動列表取消封存。' : '若有尚未公布的結果，請先完成本輪抽獎；資料儲存中，請稍候再調整。'}</p>}
      <section className="panel stack" aria-labelledby="setup-title">
        <div className="section-heading"><h2 id="setup-title">活動準備</h2><span className="badge">{activity.participants.length} 位參加者</span></div>
        <p className="muted">先確認名單與獎項，再到「現場抽獎」試抽。所有檔案只在這台裝置處理。</p>
        <form className="field-row" onSubmit={(event) => {
          event.preventDefault();
          const name = formValue(event.currentTarget, 'activityName');
          if (name) void save({ ...activity, name }, '活動名稱已更新。');
        }}>
          <label className="field">活動名稱<input key={activity.name} name="activityName" required maxLength={100} defaultValue={activity.name} disabled={blocked} /></label>
          <button className="button button-primary" disabled={blocked}>儲存名稱</button>
        </form>
      </section>

      <section className="panel stack" aria-labelledby="groups-title">
        <div className="section-heading"><h2 id="groups-title">參加者分組</h2><span className="muted">不需要分組也可以直接抽獎</span></div>
        <form className="field-row" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = formValue(form, 'groupName');
          if (!name) return;
          if (activity.groups.some((group) => group.name === name)) { setError('已有同名組別，請使用不同名稱。'); return; }
          void save({ ...activity, groups: [...activity.groups, { id: createId(), name }] }, '組別已新增。').then((saved) => { if (saved) form.reset(); });
        }}>
          <label className="field">新組別<input name="groupName" placeholder="例如：第一組、志工" required maxLength={60} disabled={blocked} /></label>
          <button className="button button-secondary" disabled={blocked}>新增組別</button>
        </form>
        {activity.groups.map((group) => (
          <form className="field-row" key={`${group.id}:${group.name}`} onSubmit={(event) => {
            event.preventDefault();
            const name = formValue(event.currentTarget, 'name');
            if (activity.groups.some((item) => item.id !== group.id && item.name === name)) { setError('已有同名組別。'); return; }
            if (name) void save({ ...activity, groups: activity.groups.map((item) => item.id === group.id ? { ...item, name } : item) }, '組別已更新。');
          }}>
            <label className="field">組別名稱<input name="name" defaultValue={group.name} required maxLength={60} disabled={blocked} /></label>
            <span className="badge">{activity.participants.filter((participant) => participant.groupId === group.id).length} 人</span>
            <button className="button button-secondary" disabled={blocked}>儲存</button>
            <button type="button" className="button button-danger" disabled={blocked} onClick={() => {
              const affectedPrize = activity.prizes.find((prize) => prize.groupIds?.length === 1 && prize.groupIds.includes(group.id));
              if (affectedPrize) { setError(`「${affectedPrize.name}」只開放此組抽獎，請先調整這個獎項開放的組別，再刪除「${group.name}」。`); return; }
              if (!window.confirm(`刪除「${group.name}」？組內參加者會改為未分組，限定此組的獎項請重新確認。`)) return;
              void save({ ...activity,
                groups: activity.groups.filter((item) => item.id !== group.id),
                participants: activity.participants.map((participant) => participant.groupId === group.id ? { ...participant, groupId: null } : participant),
                prizes: activity.prizes.map((prize) => ({ ...prize, groupIds: prize.groupIds?.filter((id) => id !== group.id) ?? null })),
              }, '組別已刪除，請確認各獎項開放的組別。');
            }}>刪除</button>
          </form>
        ))}
      </section>

      <section className="panel stack" aria-labelledby="prizes-title">
        <div className="section-heading"><h2 id="prizes-title">獎項與抽獎順序</h2><span className="badge">{activity.prizes.length} 個獎項</span></div>
        <p className="muted">獎項會依畫面順序開獎。不設定獎項也能使用「自由抽獎」；已有抽獎紀錄的獎項不能刪除。</p>
        <form className="field-row" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = formValue(form, 'prizeName');
          const quantity = Number(formValue(form, 'quantity'));
          if (name && Number.isInteger(quantity) && quantity > 0 && quantity <= 200) {
            void save({ ...activity, prizes: [...activity.prizes, { id: createId(), name, quantity, groupIds: null }] }, '獎項已新增。').then((saved) => { if (saved) form.reset(); });
          }
        }}>
          <label className="field">新獎項<input name="prizeName" placeholder="例如：平安好禮" required maxLength={80} disabled={blocked} /></label>
          <label className="field">名額<input name="quantity" type="number" inputMode="numeric" required min={1} max={200} defaultValue={1} disabled={blocked} /></label>
          <button className="button button-secondary" disabled={blocked}>新增獎項</button>
        </form>
        {activity.prizes.map((prize, index) => (
          <PrizeEditor key={`${prize.id}:${prize.name}:${prize.quantity}:${prize.groupIds?.join(',') ?? 'all'}:${activity.groups.map((group) => group.id).join(',')}`} prize={prize} activity={activity} index={index} blocked={blocked}
            onSave={(updated) => void save({ ...activity, prizes: activity.prizes.map((item) => item.id === prize.id ? updated : item) }, '獎項已更新。')}
            onMove={(direction) => movePrize(index, direction)}
            onDelete={() => { if (window.confirm(`刪除獎項「${prize.name}」？`)) void save({ ...activity, prizes: activity.prizes.filter((item) => item.id !== prize.id) }, '獎項已刪除。'); }} />
        ))}
      </section>

      <section className="panel stack" aria-labelledby="import-title">
        <div className="section-heading"><h2 id="import-title">快速建立名單</h2><button type="button" className="button button-secondary" onClick={downloadTemplate}>下載名單範本</button></div>
        <p className="muted">建議 100 人以內，每場最多 200 人。匯入後先預覽，不會直接更動現有名單。</p>
        <label className="field">選擇 Excel、CSV 或文字檔
          <input type="file" accept=".xlsx,.csv,.txt" disabled={blocked} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleFile(file);
          }} />
        </label>
        <p className="muted">Excel 只讀取第一張工作表，可選姓名、編號與組別欄位。若編號含有開頭的 0（例如 001），請先在 Excel 將該欄設為「文字」。</p>
        <form className="stack" onSubmit={(event) => {
          event.preventDefault();
          try { showPreview(createImportTable(parsePastedParticipants(formValue(event.currentTarget, 'names')), false), '貼上名單'); }
          catch (cause) { setError(cause instanceof Error ? cause.message : '請輸入名單。'); }
        }}>
          <label className="field">貼上姓名或編號<textarea name="names" rows={5} placeholder={'王小明\nJohn Smith\n李小華\n也可以用逗號分隔'} disabled={blocked} /></label>
          <p className="muted">姓名一行一位或用逗號分隔，姓名中的空白會保留；純數字可用空白分隔。</p>
          <button className="button button-secondary" disabled={blocked}>預覽貼上名單</button>
        </form>
        <form className="field-row" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          try {
            const rows = sequentialImportRows(Number(formValue(form, 'start')), Number(formValue(form, 'end')), Number(formValue(form, 'padding')));
            const nextTable = createImportTable(rows, false);
            nextTable.suggested.codeColumn = 0;
            showPreview(nextTable, '快速連號');
          } catch (cause) { setError(cause instanceof Error ? cause.message : '請確認連號範圍。'); }
        }}>
          <label className="field">開始編號<input name="start" type="number" inputMode="numeric" min={0} defaultValue={1} required disabled={blocked} /></label>
          <label className="field">結束編號<input name="end" type="number" inputMode="numeric" min={0} defaultValue={100} required disabled={blocked} /></label>
          <label className="field">編號位數（不足補 0）<input name="padding" type="number" inputMode="numeric" min={0} max={12} defaultValue={0} required disabled={blocked} /></label>
          <button className="button button-secondary" disabled={blocked}>預覽連號</button>
        </form>
        <p className="muted">編號位數填 3，可產生 001、002 等三位數編號；填 0 則不補零。</p>
      </section>

      {table && <section className="panel stack" aria-labelledby="preview-title">
        <div className="section-heading"><h2 id="preview-title">名單匯入預覽</h2><span className="badge">{sourceName}・{previewRows.length} 列</span></div>
        <label className="field-row"><input type="checkbox" checked={table.hasHeader} disabled={blocked} onChange={(event) => {
          const nextTable = createImportTable(table.sourceRows, event.target.checked);
          setTable(nextTable);
          setMapping(nextTable.suggested);
        }} />第一列是欄位名稱，不加入名單</label>
        <div className="field-row">
          {(['labelColumn', 'codeColumn', 'groupColumn'] as const).map((key) => (
            <label className="field" key={key}>{key === 'labelColumn' ? '姓名／顯示編號' : key === 'codeColumn' ? '編號（選填，不可重複）' : '組別（選填）'}
              <select value={mapping[key] ?? ''} onChange={(event) => updateMapping(key, event.target.value)} disabled={blocked}>
                {key !== 'labelColumn' && <option value="">不使用此欄位</option>}
                {table.columns.map((column, index) => <option value={index} key={index}>{column}（第 {index + 1} 欄）</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="table-wrap"><table className="data-table"><caption>前 20 列預覽</caption><thead><tr><th scope="col">姓名／編號</th><th scope="col">編號</th><th scope="col">組別</th></tr></thead><tbody>
          {previewRows.slice(0, 20).map((row, index) => <tr key={index}><td style={{ whiteSpace: 'pre-wrap' }}>{row.label || row.code}</td><td>{row.code || '—'}</td><td>{row.group || '未指定'}</td></tr>)}
        </tbody></table></div>
        {!previewRows.length && <p className="alert">所選欄位沒有名單，請調整欄位或取消「第一列是欄位名稱」。</p>}
        {duplicateCodes.length > 0 && <p className="alert">重複編號：{[...new Set(duplicateCodes)].slice(0, 10).join('、')}。請修正來源名單後重新匯入。</p>}
        <label className="field-row"><input type="checkbox" checked={keepDuplicateNames} onChange={(event) => setKeepDuplicateNames(event.target.checked)} disabled={blocked} />保留沒有編號的同名者，每一列算一位參加者</label>
        <p className="muted">未勾選時，沒有編號的同名者會合併成一位；編號不同的同名者會各自保留。加入名單時，若編號相同，會更新原本那位參加者的資料。</p>
        <fieldset className="chips" disabled={blocked}><legend>名單套用方式</legend>
          <label><input type="radio" name="import-mode" value="append" checked={importMode === 'append'} onChange={() => setImportMode('append')} />加入或更新現有名單</label>
          <label><input type="radio" name="import-mode" value="replace" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} disabled={hasRecords} />取代整份名單</label>
        </fieldset>
        {hasRecords && <p className="muted">這場活動已有抽獎紀錄，只能加入或更新名單。若要換整份名單，請建立新活動或複製這場活動。</p>}
        <div className="field-row"><button type="button" className="button button-primary" onClick={() => void applyPreview()} disabled={blocked || !previewRows.length || duplicateCodes.length > 0}>確認並套用名單</button><button type="button" className="button button-secondary" disabled={blocked} onClick={() => setTable(null)}>關閉預覽</button></div>
      </section>}

      <section className="panel stack" aria-labelledby="participants-title">
        <div className="section-heading"><h2 id="participants-title">參加者名單</h2><span className="badge">{activity.participants.length} / 200 人</span></div>
        <form className="field-row" onSubmit={(event) => submitParticipant(event)}>
          <label className="field">姓名／顯示編號<input name="label" required maxLength={100} disabled={blocked} /></label>
          <label className="field">編號（選填，不可重複）<input name="code" maxLength={60} disabled={blocked} /></label>
          <label className="field">組別<select name="groupId" disabled={blocked}><option value="">未分組</option>{activity.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <button className="button button-primary" disabled={blocked || activity.participants.length >= 200}>加入一位</button>
        </form>
        {!activity.participants.length ? <p className="muted">名單還是空的。上方可以貼上名單、匯入檔案或快速產生連號。</p> : <>
          <p className="muted">修改後請按「儲存」。已有抽獎紀錄的參加者不能刪除；同名者建議填不同編號。</p>
          <div className="table-wrap"><table className="data-table"><caption>本場活動名單</caption><thead><tr><th scope="col">姓名／顯示編號</th><th scope="col">編號</th><th scope="col">組別</th><th scope="col">操作</th></tr></thead><tbody>
            {activity.participants.map((participant) => {
              const formId = `participant-${participant.id}`;
              const drawn = activity.records.some((record) => record.participantId === participant.id);
              return <tr key={`${participant.id}:${participant.label}:${participant.code}:${participant.groupId}`}>
                <td><form id={formId} onSubmit={(event) => submitParticipant(event, participant.id)}><input aria-label={`${participant.label}的姓名`} name="label" defaultValue={participant.label} required maxLength={100} disabled={blocked} /></form></td>
                <td><input form={formId} aria-label={`${participant.label}的編號`} name="code" defaultValue={participant.code} maxLength={60} disabled={blocked} /></td>
                <td><select form={formId} aria-label={`${participant.label}的組別`} name="groupId" defaultValue={participant.groupId ?? ''} disabled={blocked}><option value="">未分組</option>{activity.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></td>
                <td><div className="field-row"><button form={formId} className="button button-secondary" disabled={blocked}>儲存</button><button type="button" className="button button-danger" disabled={blocked || drawn} title={drawn ? '這位參加者已有抽獎紀錄，無法刪除' : undefined} onClick={() => {
                  if (window.confirm(`從名單刪除「${participant.label}」？`)) void save({ ...activity, participants: activity.participants.filter((item) => item.id !== participant.id) }, '參加者已刪除。');
                }}>刪除</button></div></td>
              </tr>;
            })}
          </tbody></table></div>
        </>}
      </section>
    </div>
  );
}
