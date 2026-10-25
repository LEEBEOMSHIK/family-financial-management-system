'use client';
import { Button } from '../components/ui/Button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="center-state"><h1>화면을 불러오지 못했습니다</h1><p>잠시 후 다시 시도해 주세요.</p><Button onClick={reset}>다시 시도</Button></main>; }
