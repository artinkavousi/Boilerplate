const STYLE_ID = 'convas-dashboard-style';

export function ensureDashboardStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tp-dfwv {
      backdrop-filter: blur(16px) saturate(140%);
      background: rgba(22, 24, 33, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
      border-radius: 16px;
      color: #e6e8ef;
    }
    .tp-rotv * {
      color: inherit !important;
    }
    .tp-lblv_v {
      color: rgba(230, 232, 239, 0.72) !important;
    }
    .tp-rotv::-webkit-scrollbar {
      width: 8px;
    }
    .tp-rotv::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 99px;
    }
  `;
  document.head.append(style);
}
