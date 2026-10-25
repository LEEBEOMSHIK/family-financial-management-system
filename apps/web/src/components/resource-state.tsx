import { Button } from './ui/Button';
export function Loading() { return <p className="fl-card" role="status">자료를 불러오고 있습니다.</p>; }
export function Failed({ message, retry }: { message: string; retry: () => void }) {
  return <section className="fl-card"><p role="alert">{message}</p><Button onClick={retry}>다시 시도</Button></section>;
}
