import { useEffect, useMemo, useRef, useState } from 'react';
import FirstRunGuide from './components/FirstRunGuide';
import ParticipantEditor from './components/ParticipantEditor';
import Wheel from './components/Wheel';
import WinnerHistory from './components/WinnerHistory';
import {
  createDefaultParticipants,
  getAvailableParticipants,
  MAX_PARTICIPANT_COUNT,
  parseParticipants,
  participantsToText,
  randomIndex,
  RECOMMENDED_PARTICIPANT_COUNT,
} from './utils/participants';
import { downloadCsv, winnerHistoryToCsv, type WinnerRecord } from './utils/csv';
import { importParticipantsFromFile } from './utils/importParticipants';

const STORAGE_KEYS = {
  participants: 'fortune-draw-wheel:participants',
  winners: 'fortune-draw-wheel:winners',
  allowRepeat: 'fortune-draw-wheel:allow-repeat',
  guideSeen: 'fortune-draw-wheel:first-run-guide-seen',
} as const;

type DrawPhase = 'idle' | 'spinning' | 'stopping';

function readStoredWinners(): WinnerRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.winners);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as WinnerRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function createCsvFilename(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `fortune-draw-winners-${date}.csv`;
}

export default function App() {
  const defaultParticipantsText = useMemo(() => participantsToText(createDefaultParticipants()), []);
  const [participantInput, setParticipantInput] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.participants) ?? defaultParticipantsText;
  });
  const [winnerHistory, setWinnerHistory] = useState<WinnerRecord[]>(readStoredWinners);
  const [allowRepeat, setAllowRepeat] = useState(() => localStorage.getItem(STORAGE_KEYS.allowRepeat) === 'true');
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [rotation, setRotation] = useState(0);
  const [wheelTransition, setWheelTransition] = useState('none');
  const [currentWinner, setCurrentWinner] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [quickCount, setQuickCount] = useState(RECOMMENDED_PARTICIPANT_COUNT);
  const [isImporting, setIsImporting] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.guideSeen) !== 'true';
  });
  const rotationRef = useRef(rotation);
  const pendingWinnerRef = useRef<string | null>(null);

  const participants = useMemo(() => parseParticipants(participantInput), [participantInput]);
  const winnerIds = useMemo(() => winnerHistory.map((record) => record.id), [winnerHistory]);
  const availableParticipants = useMemo(
    () => getAvailableParticipants(participants, winnerIds, allowRepeat),
    [allowRepeat, participants, winnerIds],
  );

  const isBusy = phase === 'spinning' || phase === 'stopping';
  const isOverParticipantLimit = participants.length > MAX_PARTICIPANT_COUNT;
  const areControlsDisabled = isBusy || isImporting;

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.participants, participantInput);
  }, [participantInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.winners, JSON.stringify(winnerHistory));
  }, [winnerHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.allowRepeat, String(allowRepeat));
  }, [allowRepeat]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (phase !== 'spinning') {
      return undefined;
    }

    let animationFrame = 0;
    let previousTimestamp = performance.now();

    const tick = (timestamp: number) => {
      const elapsedSeconds = Math.min((timestamp - previousTimestamp) / 1000, 0.05);
      previousTimestamp = timestamp;
      setRotation((previousRotation) => previousRotation + elapsedSeconds * 980);
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [phase]);

  function startDraw() {
    if (participants.length === 0) {
      setNotice('請先輸入抽獎名單。');
      return;
    }

    if (isOverParticipantLimit) {
      setNotice(`目前名單 ${participants.length} 人，最多支援 ${MAX_PARTICIPANT_COUNT} 人。`);
      return;
    }

    if (availableParticipants.length === 0) {
      setNotice('剩餘可抽名單為空，請清除中獎紀錄或開啟重複中獎。');
      return;
    }

    setWheelTransition('none');
    setCurrentWinner(null);
    setNotice('');
    pendingWinnerRef.current = null;
    setPhase('spinning');
  }

  function stopDraw() {
    if (availableParticipants.length === 0) {
      setNotice('剩餘可抽名單為空，請清除中獎紀錄或開啟重複中獎。');
      setPhase('idle');
      return;
    }

    const winningCandidate = availableParticipants[randomIndex(availableParticipants.length)];
    const winningIndex = participants.findIndex((participant) => participant === winningCandidate);

    if (winningIndex < 0) {
      setNotice('名單狀態已變更，請重新開始抽獎。');
      setPhase('idle');
      return;
    }

    const sliceAngle = 360 / participants.length;
    const segmentCenter = (winningIndex + 0.5) * sliceAngle;
    const currentRotation = rotationRef.current;
    const currentNormalized = normalizeDegrees(currentRotation);
    const targetNormalized = normalizeDegrees(360 - segmentCenter);
    const slowDownDelta = normalizeDegrees(targetNormalized - currentNormalized);
    const finalRotation = currentRotation + slowDownDelta + 360 * 7;

    pendingWinnerRef.current = winningCandidate;
    setCurrentWinner(winningCandidate);
    setNotice('');
    setPhase('stopping');
    setWheelTransition('transform 5200ms cubic-bezier(0.08, 0.72, 0.11, 1)');
    requestAnimationFrame(() => setRotation(finalRotation));
  }

  function handlePrimaryAction() {
    if (phase === 'idle') {
      startDraw();
      return;
    }

    if (phase === 'spinning') {
      stopDraw();
    }
  }

  function handleStopAnimationEnd() {
    if (phase !== 'stopping' || !pendingWinnerRef.current) {
      return;
    }

    const winner = pendingWinnerRef.current;
    pendingWinnerRef.current = null;
    setWheelTransition('none');
    setWinnerHistory((records) => [
      {
        id: winner,
        round: records.length + 1,
        drawnAt: new Date().toISOString(),
      },
      ...records,
    ]);
    setNotice(`恭喜 ${winner} 中獎`);
    setPhase('idle');
  }

  function resetParticipants() {
    setParticipantInput(defaultParticipantsText);
    setQuickCount(RECOMMENDED_PARTICIPANT_COUNT);
    setNotice('名單已重設為 1-120。');
  }

  function generateSequentialParticipants() {
    const safeCount = Math.min(Math.max(Math.trunc(quickCount) || 1, 1), MAX_PARTICIPANT_COUNT);
    setQuickCount(safeCount);
    setParticipantInput(participantsToText(createDefaultParticipants(safeCount)));
    setNotice(`已產生 1-${safeCount} 的抽獎名單。`);
  }

  async function importParticipantFile(file: File) {
    if (isBusy) {
      return;
    }

    setIsImporting(true);
    setNotice(`正在匯入 ${file.name}...`);

    try {
      const importedParticipants = await importParticipantsFromFile(file);

      if (importedParticipants.length === 0) {
        setNotice('匯入檔案沒有可用名單。');
        return;
      }

      setParticipantInput(participantsToText(importedParticipants));
      setQuickCount(Math.min(importedParticipants.length, MAX_PARTICIPANT_COUNT));
      setCurrentWinner(null);

      if (importedParticipants.length > MAX_PARTICIPANT_COUNT) {
        setNotice(
          `已匯入 ${importedParticipants.length} 筆；目前最多支援 ${MAX_PARTICIPANT_COUNT} 人，請刪減名單後再抽獎。`,
        );
        return;
      }

      setNotice(`已匯入 ${importedParticipants.length} 筆名單。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '匯入失敗，請確認檔案格式。');
    } finally {
      setIsImporting(false);
    }
  }

  function clearWinnerHistory() {
    const confirmed = window.confirm('確定清除全部中獎紀錄？');
    if (!confirmed) {
      return;
    }

    setWinnerHistory([]);
    setCurrentWinner(null);
    setNotice('中獎紀錄已清除。');
  }

  function exportWinnerHistory() {
    const chronologicalRecords = [...winnerHistory].reverse();
    downloadCsv(createCsvFilename(), winnerHistoryToCsv(chronologicalRecords));
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setNotice('無法切換全螢幕，請確認瀏覽器權限。');
    }
  }

  function closeGuide() {
    localStorage.setItem(STORAGE_KEYS.guideSeen, 'true');
    setIsGuideOpen(false);
  }

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <header className="temple-header">
        <div className="brand-mark">
          <img src={`${import.meta.env.BASE_URL}assets/logo.svg`} alt="" />
        </div>
        <div className="brand-title">
          <h1>土城廣厚宮功德會抽獎</h1>
          <button type="button" className="guide-open-button" onClick={() => setIsGuideOpen(true)}>
            使用說明
          </button>
        </div>
        <img
          className="mascot-image"
          src={`${import.meta.env.BASE_URL}assets/guanghougong-mascot.png`}
          alt="土城廣厚宮功德會抽獎主視覺"
        />
      </header>

      <main className="draw-layout">
        <section className="wheel-stage" aria-label="抽獎輪盤">
          <Wheel
            participants={participants}
            rotation={rotation}
            transition={wheelTransition}
            winningId={currentWinner}
            isBusy={isBusy}
            onStopAnimationEnd={handleStopAnimationEnd}
          />

          <div
            className={`result-burst ${currentWinner ? 'show' : ''} ${
              currentWinner && currentWinner.length > 8 ? 'is-long' : ''
            }`}
            aria-live="assertive"
          >
            <span>中獎者</span>
            <strong>{currentWinner ?? '--'}</strong>
          </div>

          <div className="primary-actions">
            <button
              type="button"
              className={`button draw-button ${phase === 'spinning' ? 'stop' : ''}`}
              onClick={handlePrimaryAction}
              disabled={phase === 'stopping' || isImporting}
            >
              {phase === 'spinning' ? '停止抽獎' : phase === 'stopping' ? '開獎中' : '開始抽獎'}
            </button>
            <button type="button" className="button fullscreen-button" onClick={toggleFullscreen}>
              {isFullscreen ? '離開全螢幕' : '全螢幕模式'}
            </button>
          </div>

          {notice ? <p className="notice">{notice}</p> : null}
        </section>

        <aside className="control-panel">
          <ParticipantEditor
            value={participantInput}
            totalCount={participants.length}
            availableCount={availableParticipants.length}
            winnerCount={winnerHistory.length}
            recommendedCount={RECOMMENDED_PARTICIPANT_COUNT}
            maxCount={MAX_PARTICIPANT_COUNT}
            quickCount={quickCount}
            isOverLimit={isOverParticipantLimit}
            allowRepeat={allowRepeat}
            disabled={areControlsDisabled}
            isImporting={isImporting}
            onChange={setParticipantInput}
            onReset={resetParticipants}
            onImportFile={importParticipantFile}
            onQuickCountChange={setQuickCount}
            onGenerateSequential={generateSequentialParticipants}
            onToggleAllowRepeat={setAllowRepeat}
          />

          <WinnerHistory
            records={winnerHistory}
            currentWinner={currentWinner}
            disabled={isBusy}
            onClear={clearWinnerHistory}
            onExport={exportWinnerHistory}
          />
        </aside>
      </main>

      <FirstRunGuide open={isGuideOpen} onClose={closeGuide} />
    </div>
  );
}
