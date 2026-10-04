import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { AppData } from '../types';
import { readAppData, subscribeStore, transaction } from '../utils/store';

type CacheStatus = 'preparing' | 'ready' | 'error' | 'unsupported';
type Props = { data: AppData; onNotice?: (message: string) => void };

export function OfflineStatus({ data, onNotice }: Props) {
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>(() => 'serviceWorker' in navigator && 'caches' in window ? 'preparing' : 'unsupported');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [storedBusy, setStoredBusy] = useState(() => readAppData().data.activities.some((activity) => activity.pendingDraw));
  const [updating, setUpdating] = useState(false);
  const dataRef = useRef(data);
  const noticeRef = useRef(onNotice);
  const deferredReloadRef = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const busy = storedBusy || data.activities.some((activity) => activity.pendingDraw);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { noticeRef.current = onNotice; }, [onNotice]);

  const safeToReload = useCallback(() => {
    const latest = readAppData();
    return latest.warnings.length === 0
      && !latest.data.activities.some((activity) => activity.pendingDraw)
      && !dataRef.current.activities.some((activity) => activity.pendingDraw);
  }, []);

  const reloadWhenSafe = useCallback(() => {
    if (safeToReload()) {
      deferredReloadRef.current = false;
      window.location.reload();
    } else {
      deferredReloadRef.current = true;
      setUpdating(false);
      noticeRef.current?.('新版已準備完成，會先保留本輪抽獎，完成後再更新。');
    }
  }, [safeToReload]);

  const checkCache = useCallback(async () => {
    try {
      await navigator.serviceWorker.ready;
      const shell = await caches.match(`${location.origin}${import.meta.env.BASE_URL}index.html`, { ignoreSearch: true });
      setCacheStatus(shell ? 'ready' : 'error');
    } catch { setCacheStatus('error'); }
  }, []);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onOfflineReady: () => { void checkCache(); },
    onNeedReload: reloadWhenSafe,
    onRegisteredSW: (_url, registration) => {
      registrationRef.current = registration ?? null;
      if (!registration) return;
      if (registration.active) void checkCache();
      const observeInstall = () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'redundant' && !registration.active) setCacheStatus('error');
        });
      };
      observeInstall();
      registration.addEventListener('updatefound', observeInstall);
    },
    onRegisterError: (error) => {
      console.warn('離線服務註冊失敗', error);
      setCacheStatus((current) => current === 'ready' ? current : 'error');
      noticeRef.current?.('離線準備尚未完成，請連網後重新開啟；現有活動資料仍保留。');
    },
  });

  useEffect(() => {
    const onConnection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void registrationRef.current?.update().catch(() => {});
    };
    const refreshBusy = (latest: AppData) => {
      setStoredBusy(latest.activities.some((activity) => activity.pendingDraw));
      if (deferredReloadRef.current && safeToReload()) reloadWhenSafe();
    };
    window.addEventListener('online', onConnection);
    window.addEventListener('offline', onConnection);
    const unsubscribe = subscribeStore(refreshBusy);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onConnection);
      window.removeEventListener('offline', onConnection);
    };
  }, [reloadWhenSafe, safeToReload]);

  useEffect(() => {
    if (deferredReloadRef.current) queueMicrotask(() => { if (safeToReload()) reloadWhenSafe(); });
  }, [data, reloadWhenSafe, safeToReload]);

  const applyUpdate = async () => {
    if (!safeToReload()) {
      noticeRef.current?.('本機還有未完成抽獎，請先完成本輪再更新。');
      return;
    }
    setUpdating(true);
    try {
      // Re-read and save under the shared store lock before changing versions.
      await transaction((latest) => {
        if (latest.activities.some((activity) => activity.pendingDraw)) throw new Error('本機還有未完成抽獎，請先完成本輪再更新。');
      });
      if (!safeToReload()) throw new Error('本輪抽獎已開始，會在完成後再提供更新。');
      await updateServiceWorker(true);
    } catch (error) {
      setUpdating(false);
      noticeRef.current?.(error instanceof Error ? error.message : '更新尚未完成，請稍後再試。');
    }
  };

  if (!import.meta.env.PROD) return null;

  const message = cacheStatus === 'ready' ? (online ? '已準備離線使用' : '離線使用中')
    : cacheStatus === 'preparing' ? (online ? '正在準備離線使用' : '尚未完成離線準備，請先連網')
      : cacheStatus === 'unsupported' ? '此瀏覽器需連網使用' : '離線準備未完成，請連網後重開';

  return (
    <aside className={`offline-status offline-status--${cacheStatus}`} aria-label="離線與更新狀態">
      <div className="offline-status-copy" role="status" aria-live="polite">
        <span className="offline-status-dot" aria-hidden="true" />
        <span>{message}</span>
        {needRefresh && <span>{busy ? '本輪完成後可更新版本' : '有新版可以更新'}</span>}
      </div>
      {needRefresh && (
        <button type="button" className="button button-secondary" disabled={busy || updating} onClick={() => { void applyUpdate(); }}>
          {updating ? '正在更新' : busy ? '抽獎完成後更新' : '更新版本'}
        </button>
      )}
    </aside>
  );
}

export default OfflineStatus;
