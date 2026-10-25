import { Button } from './Button';

/** Return navigation keeps a shared 24px separation from the page heading. */
export function BackButton({ onClick, disabled, children = '목록으로' }: {
  onClick: () => void; disabled?: boolean; children?: React.ReactNode;
}) {
  return <div className="page-back-navigation"><Button variant="secondary" disabled={disabled} onClick={onClick}>
    <svg className="back-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M19 12H5m7-7-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>{children}
  </Button></div>;
}
