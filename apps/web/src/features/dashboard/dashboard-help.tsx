'use client';
import { useEffect, useId, useRef, useState } from 'react';

export function DashboardHelp() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="dashboard-help">
    <button ref={button} type="button" className="dashboard-help-button" aria-label="대시보드 보는 법과 사용법" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>?</button>
    {open && <section id={panelId} className="dashboard-help-panel" role="region" aria-label="대시보드 안내">
      <h3>대시보드 보는 법</h3>
      <p>동기화된 통장의 최종 거래 후 잔액과 최신 자료 기준 월의 수입·지출을 확인하세요. 다른 화면에서 자료를 등록했다면 돌아올 때 자동 갱신되며 ‘최신 자료 새로고침’으로도 확인할 수 있습니다. 자료의 기준 시점은 화면 위에 표시되며, 자세한 거래는 ‘상세 입출금 보기’에서 볼 수 있습니다.</p>
      <p>‘내 할 일’에는 역할에 따라 승인·송금 대기가 표시됩니다. 실제 송금은 총무가 은행 앱에서 진행합니다.</p>
      <h3>위젯 사용법</h3>
      <ul>
        <li>위쪽 ⠿ 손잡이를 끌어 원하는 위치로 옮깁니다.</li>
        <li>위젯에 마우스를 올리면 나타나는 오른쪽 아래 ↘ 손잡이로 크기를 조절합니다. 터치 화면에서는 항상 표시됩니다.</li>
        <li>위쪽 ↕ 버튼을 누르면 내용이 모두 보이는 높이로 맞춥니다.</li>
        <li>변경한 배치는 자동 저장됩니다. PC와 모바일 배치는 따로 유지됩니다.</li>
        <li>키보드로는 손잡이에 포커스를 둔 뒤 방향키로 조절합니다. 드래그 중 Escape를 누르면 취소합니다.</li>
      </ul>
    </section>}
  </div>;
}
