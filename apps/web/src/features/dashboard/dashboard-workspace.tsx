'use client';
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { widgetSources } from '../support/target-catalog';
import { DashboardHelp } from './dashboard-help';
import { WidgetMotion } from './widget-motion';
import { contentHeight, MIN_HEIGHT, snapHeight, widgetRows } from './widget-sizing';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Failed, Loading } from '../../components/resource-state';
import { api } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';

type Layout = components['schemas']['LayoutResponse'];
type Widget = components['schemas']['Widget'];
type Id = Exclude<Widget['id'], 'approval' | 'payment'>;
type Device = 'desktop' | 'mobile';
const titles: Record<Id, string> = { support: '문의·이슈', tasks: '내 할 일', dues: '회비 미납 현황', balance: '장부 잔액', summary: '수입과 지출', flow: '자금 흐름', categories: '지출 분류', recent: '최근 입출금' };
type Gesture = { pointerId: number; id: Id; mode: 'move' | 'resize'; x: number; y: number; device: Device; initial: Layout; draft: Layout; width: Widget['width']; height: number; step: number; ending: boolean; latestX: number; latestY: number; lastTarget: string | null; rowStep: number; scrollY: number; startScrollY: number; limits: Map<string, number> };

export function DashboardWorkspace({ widgets }: { widgets: Record<Id, ReactNode> }) {
  const session = useSession();
  const path = `/families/${session?.family_id}/dashboard-layout`;
  const resource = useResource<Layout>(session ? path : null);
  const [saved, setSaved] = useState<Layout | null>(null);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [active, setActive] = useState<Id | null>(null);
  const [motion] = useState(() => new WidgetMotion());
  const frame = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const locked = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); motion.dispose(); }, [motion]);
  useEffect(() => {
    const query = matchMedia('(max-width: 800px)');
    const sync = () => setMobile(query.matches); sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!draft && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, busy]);
  const current = draft ?? saved ?? resource.data;
  const device: Device = mobile ? 'mobile' : 'desktop';
  const disabled = busy || Boolean(error);
  function renderDraft(next: Layout | null) {
    if (grid.current) motion.capture(grid.current);
    flushSync(() => setDraft(next));
    if (grid.current) motion.reflow(grid.current, gesture.current?.id ?? null);
  }
  async function persist(next: Layout) {
    if (locked.current || !session) return;
    locked.current = true; renderDraft(next); setBusy(true); setMessage('배치 저장 중…');
    try {
      const result = await api<Layout>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: JSON.stringify({ desktop: next.desktop, mobile: next.mobile, revision: next.revision }) });
      setSaved(result); setDraft(null); setMessage('배치를 자동 저장했습니다.');
    } catch (failure) {
      setMessage(''); setError(`${failure instanceof Error ? failure.message : '저장 결과를 확인하지 못했습니다.'} 현재 배치는 화면에 남아 있습니다. 최신 배치를 불러오면 서버에 저장된 상태로 바뀝니다.`);
    } finally { locked.current = false; setBusy(false); }
  }
  async function reload() {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { const result = await api<Layout>(path); setSaved(result); setDraft(null); setError(''); setMessage('최신 배치를 불러왔습니다.'); }
    catch { setError('최신 배치를 불러오지 못했습니다. 현재 배치를 유지합니다.'); }
    finally { locked.current = false; setBusy(false); }
  }
  function change(id: Id, patch: Partial<Widget>) {
    if (!current || locked.current || error) return;
    void persist({ ...current, [device]: current[device].map(item => item.id === id ? { ...item, ...patch } : item) });
  }
  function reorder(layout: Layout, target: Device, id: Id, index: number): Layout {
    const items = [...layout[target]];
    const from = items.findIndex(item => item.id === id);
    items.splice(Math.max(0, Math.min(items.length - 1, index)), 0, ...items.splice(from, 1));
    return { ...layout, [target]: items };
  }
  function start(event: PointerEvent<HTMLButtonElement>, item: Widget, mode: Gesture['mode']) {
    if (!current || disabled || locked.current || event.button !== 0 || gesture.current || !event.isPrimary) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); grid.current?.setPointerCapture(event.pointerId);
    const element = event.currentTarget.closest<HTMLElement>('[data-widget]');
    if (!element || !grid.current) return;
    const gap = Number.parseFloat(getComputedStyle(grid.current).rowGap);
    motion.lift(element, mode);
    gesture.current = { pointerId: event.pointerId, id: item.id as Id, mode, x: event.clientX, y: event.clientY, latestX: event.clientX, latestY: event.clientY, device, initial: current, draft: current, width: item.width, height: element.getBoundingClientRect().height, step: (grid.current.clientWidth + gap) / 2, rowStep: 4 + gap, ending: false, lastTarget: null, scrollY: window.scrollY, startScrollY: window.scrollY, limits: new Map() };
    setActive(item.id as Id); setMessage('');
  }
  function paintGesture() {
    frame.current = null;
    const g = gesture.current; if (!g || g.ending || !grid.current) return;
    const dx = g.latestX - g.x; const dy = g.latestY - g.y + (g.mode === 'resize' ? window.scrollY - g.startScrollY : 0);
    if (g.mode === 'resize') {
      const gap = Number.parseFloat(getComputedStyle(grid.current).rowGap);
      const element = grid.current.querySelector<HTMLElement>(`[data-widget="${g.id}"]`);
      if (!element) return;
      const width: Widget['width'] = dx > g.step / 3 ? 'full' : dx < -g.step / 3 ? 'half' : g.width;
      const pixels = width === 'full' ? grid.current.clientWidth : g.step - gap;
      if (!g.limits.has(width)) g.limits.set(width, snapHeight(Math.max(g.height, contentHeight(element, pixels)), gap));
      const maximum = g.limits.get(width)!;
      const height = snapHeight(Math.min(maximum, Math.max(MIN_HEIGHT, g.height + dy)), gap);
      motion.resize(dx, dy, g.step - gap, grid.current.clientWidth, MIN_HEIGHT, maximum, window.scrollY - g.startScrollY);
      const next = { ...g.initial, [g.device]: g.initial[g.device].map(item => item.id === g.id ? { ...item, width, height_px: height } : item) };
      if (JSON.stringify(next) !== JSON.stringify(g.draft)) { g.draft = next; renderDraft(next); }
      if (g.latestY > innerHeight - 70 && g.height + dy < maximum) window.scrollBy(0, 12);
      if (g.latestY < 70 && g.height + dy > MIN_HEIGHT) window.scrollBy(0, -12);
      if (window.scrollY !== g.scrollY) { g.scrollY = window.scrollY; frame.current = requestAnimationFrame(paintGesture); }
    } else {
      motion.follow(dx, dy);
      // Hit-test final grid slots, not the animated visuals passing under the pointer.
      // offset positions are stable while FLIP transforms interpolate the neighbours.
      const target = [...grid.current.querySelectorAll<HTMLElement>(':scope > [data-widget]')].find(element => {
        const parent = element.offsetParent as HTMLElement | null;
        const rect = parent?.getBoundingClientRect();
        const x = (rect?.left ?? 0) + element.offsetLeft; const y = (rect?.top ?? 0) + element.offsetTop;
        return g.latestX >= x && g.latestX <= x + element.offsetWidth && g.latestY >= y && g.latestY <= y + element.offsetHeight;
      });
      const index = g.draft[g.device].findIndex(item => item.id === target?.dataset.widget);
      if (index >= 0 && target?.dataset.widget !== g.id && target?.dataset.widget !== g.lastTarget) {
        g.lastTarget = target?.dataset.widget ?? null;
        g.draft = reorder(g.draft, g.device, g.id, index); renderDraft(g.draft);
      } else if (target?.dataset.widget === g.id) { g.lastTarget = null; }
      if (g.latestY > innerHeight - 70) window.scrollBy(0, 12);
      if (g.latestY < 70) window.scrollBy(0, -12);
      if (window.scrollY !== g.scrollY) { g.scrollY = window.scrollY; frame.current = requestAnimationFrame(paintGesture); }
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current; if (!g || g.ending || event.pointerId !== g.pointerId) return;
    g.latestX = event.clientX; g.latestY = event.clientY;
    if (frame.current === null) frame.current = requestAnimationFrame(paintGesture);
  }
  function finish(cancel = false) {
    const g = gesture.current; if (!g || g.ending) return;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; if (!cancel) paintGesture(); }
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    g.ending = true;
    if (cancel) renderDraft(null);
    const element = grid.current?.querySelector<HTMLElement>(`[data-widget="${g.id}"]`);
    const settled = () => {
      gesture.current = null; setActive(null);
      if (cancel || JSON.stringify(g.initial) === JSON.stringify(g.draft)) { setDraft(null); return; }
      void persist(g.draft);
    };
    if (element) motion.land(element, settled); else { motion.dispose(); settled(); }
  }
  if (!current) return resource.loading ? <Loading/> : <Failed message={resource.error || '배치를 불러오지 못했습니다.'} retry={resource.retry}/>;
  const items = current[device];
  return <div className="dashboard-workspace">
    <div className="dashboard-edit-bar"><div className="dashboard-heading"><h2>나의 대시보드</h2><DashboardHelp/></div></div>
    <p role="status" className="dashboard-save-status small muted" aria-live="polite">{message}</p>
    {error && <div role="alert" className="inline-error">{error}<Button disabled={busy} onClick={() => void reload()}>최신 배치 불러오기</Button></div>}
    <div ref={grid} className="widget-grid" data-device={device} aria-label="대시보드 위젯" aria-busy={busy} onPointerMove={move} onPointerUp={event => { if (event.pointerId === gesture.current?.pointerId) finish(); }} onPointerCancel={event => { if (event.pointerId === gesture.current?.pointerId) finish(true); }} onLostPointerCapture={event => { if (event.pointerId === gesture.current?.pointerId) finish(true); }}>
      {items.map(item => <div key={item.id} className="dashboard-widget" data-widget={item.id} data-report-id={`dashboard.widget.${item.id}`} data-report-label={`${titles[item.id as Id]} 위젯`} data-report-source={item.id==='dues'?'apps/web/src/features/family/dues-summary.tsx':`apps/web/src/features/dashboard/${widgetSources[item.id]||'dashboard-view'}.tsx`} data-width={item.width} data-height={item.height} data-active={active === item.id} style={{ gridRow: `span ${widgetRows(item, mobile)}` }}>
        <div className="widget-controls"><button type="button" className="widget-drag" disabled={disabled} aria-label={`${titles[item.id as Id]} 이동 손잡이`} title="끌어서 이동 · 방향키로 순서 변경" onPointerDown={event => start(event, item, 'move')} onKeyDown={event => {
          if (event.key === 'Escape') { finish(true); return; }
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || active) return;
          event.preventDefault(); void persist(reorder(current, device, item.id as Id, items.indexOf(item) + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1)));
        }}>⠿ <span>{titles[item.id as Id]}</span></button><button className="widget-fit" disabled={disabled || Boolean(active)} aria-label={`${titles[item.id as Id]} 내용에 맞추기`} title="내용이 모두 보이는 높이로 맞추기" onClick={event => {
          const element = event.currentTarget.closest<HTMLElement>('[data-widget]');
          if (element && grid.current) change(item.id as Id, { height_px: snapHeight(contentHeight(element), Number.parseFloat(getComputedStyle(grid.current).rowGap)) });
        }}>↕</button></div>
        <div className="widget-content">{widgets[item.id as Id]}</div>
        <button type="button" className="widget-resize" disabled={disabled} aria-label={`${titles[item.id as Id]} 크기 조절`} title="끌어서 크기 조절 · 좌우 키: 너비 · 위아래 키: 높이" onPointerDown={event => start(event, item, 'resize')} onKeyDown={event => {
          if (event.key === 'Escape') { finish(true); return; }
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || active) return;
          event.preventDefault();
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { change(item.id as Id, { width: event.key === 'ArrowLeft' ? 'half' : 'full' }); return; }
          const element = event.currentTarget.closest<HTMLElement>('[data-widget]');
          if (!element || !grid.current) return;
          const gap = Number.parseFloat(getComputedStyle(grid.current).rowGap);
          const height = element.getBoundingClientRect().height;
          const maximum = snapHeight(Math.max(height, contentHeight(element)), gap);
          change(item.id as Id, { height_px: Math.min(maximum, snapHeight(height + (4 + gap) * (event.key === 'ArrowUp' ? -1 : 1), gap)) });
        }}>↘</button>
      </div>)}
    </div>
  </div>;
}
