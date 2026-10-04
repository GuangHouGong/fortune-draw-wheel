import { useEffect } from 'react';

type FirstRunGuideProps = {
  open: boolean;
  onClose: () => void;
};

const guideSteps = [
  {
    title: '準備名單',
    body: '先建立活動，再貼上姓名或編號，也能匯入 Excel／CSV／TXT。確認名單預覽後，再按「確認並套用名單」。',
  },
  {
    title: '確認人數',
    body: '每場建議 100 人以內，最多 200 人。可先設定分組、獎項與名額；沒有設定獎項也能自由抽獎。',
  },
  {
    title: '先試抽',
    body: '到「現場抽獎」勾選「先試抽，不計入正式結果」，確認畫面、投影與聲音。試抽不會扣除名額，也不會留下正式紀錄。',
  },
  {
    title: '開始抽獎',
    body: '正式抽獎前取消勾選「先試抽」。按「開始抽獎」後，預設約六秒自動開獎，也可按「停止並開獎」提早公布。關閉自動開獎時，請按「停止並開獎」。',
  },
  {
    title: '下載結果與備份',
    body: '正式結果會自動儲存。到「結果與備份」下載結果與活動備份；換裝置時匯入備份檔，就能接續使用。',
  },
];

export default function FirstRunGuide({ open, onClose }: FirstRunGuideProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="guide-overlay" role="presentation">
      <div className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div className="guide-header">
          <span className="guide-mark" aria-hidden="true">
            福
          </span>
          <div>
            <p>第一次使用</p>
            <h2 id="guide-title">活動抽獎流程</h2>
          </div>
        </div>

        <ol className="guide-steps">
          {guideSteps.map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="guide-format">
          <strong>Excel 建議格式</strong>
          <div aria-label="Excel 建議欄位範例">
            <span>姓名</span>
            <span>編號</span>
            <span>王小明</span>
            <span>001</span>
          </div>
        </div>

        <div className="guide-actions">
          <button type="button" className="button guide-primary" onClick={onClose}>
            我知道了，開始使用
          </button>
        </div>
      </div>
    </div>
  );
}
