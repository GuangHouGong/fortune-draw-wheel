import { useEffect } from 'react';

type FirstRunGuideProps = {
  open: boolean;
  onClose: () => void;
};

const guideSteps = [
  {
    title: '準備名單',
    body: '可貼上編號或姓名，也可以匯入 Excel / CSV / TXT。Excel 建議使用「姓名」或「編號」欄位。',
  },
  {
    title: '確認人數',
    body: '建議 100 人內最清楚，目前最多支援 200 人。右側會顯示總名單、可抽與已中獎人數。',
  },
  {
    title: '開始抽獎',
    body: '按「開始抽獎」讓輪盤轉動，再按「停止抽獎」慢慢減速並停在中獎者。',
  },
  {
    title: '保存結果',
    body: '中獎者會自動加入紀錄。活動結束後可匯出 CSV，或視情況清除紀錄重新開始。',
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
            <span>電話或備註</span>
            <span>王小明</span>
            <span>選填</span>
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
