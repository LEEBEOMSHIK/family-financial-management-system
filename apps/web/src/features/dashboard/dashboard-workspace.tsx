'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Failed, Loading } from '../../components/resource-state';
import { api } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';

type Layout = components['schemas']['LayoutResponse'];
type Widget = components['schemas']['Widget'];
type Id = Widget['id'];
type Device = 'desktop' | 'mobile';
const titles: Record<Id, string> = { approval: '승인 대기', payment: '송금 대기', balance: '장부 잔액', summary: '수입과 지출', flow: '자금 흐름', categories: '지출 분류', recent: '최근 입출금' };
const sizes: Widget['height'][] = ['compact', 'regular', 'tall'];
function defaults(ids: Id[]): Widget[] { return ids.map(id => ({ id, visible: true, width: ['balance', 'summary', 'categories'].includes(id) ? 'half' : 'full', height: ['balance', 'summary', 'approval', 'payment'].includes(id) ? 'compact' : 'regular' })); }

export function DashboardWorkspace({ widgets, onEditingChange }: { widgets: Record<Id, ReactNode>; onEditingChange: (editing: boolean) => void }) {
  const session = useSession();
  const path = `/families/${session?.family_id}/dashboard-layout`;
  const resource = useResource<Layout>(session ? path : null);
  const [saved, setSaved] = useState<Layout | null>(null);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const resizing = useRef<{ id: Id; x: number; y: number; width: Widget['width']; height: number } | null>(null);
  useEffect(() => {
    const query = matchMedia('(max-width: 800px)');
    const sync = () => setMobile(query.matches); sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const current = draft ?? saved ?? resource.data;
  const activeDevice = draft ? device : mobile ? 'mobile' : 'desktop';
  function update(id: Id, patch: Partial<Widget>) {
    if (busy) return;
    setDraft(value => value && ({ ...value, [device]: value[device].map(item => item.id === id ? { ...item, ...patch } : item) }));
  }
  function move(id: Id, offset: number) {
    if (busy) return;
    setDraft(value => {
      if (!value) return value;
      const items = [...value[device]]; const from = items.findIndex(item => item.id === id); const to = Math.max(0, Math.min(items.length - 1, from + offset));
      items.splice(to, 0, ...items.splice(from, 1));
      return { ...value, [device]: items };
    });
  }
  async function save() {
    if (!draft || !session || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<Layout>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: JSON.stringify({ desktop: draft.desktop, mobile: draft.mobile, revision: draft.revision }) });
      setSaved(result); setDraft(null); onEditingChange(false); setMessage('대시보드 배치를 저장했습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다. 편집 내용은 유지됩니다.'); }
    finally { setBusy(false); }
  }
  if (!current) return resource.loading ? <Loading/> : <Failed message={resource.error || '배치를 불러오지 못했습니다.'} retry={resource.retry}/>;
  const items = current[activeDevice];
  return <div className="dashboard-workspace">
    <div className="dashboard-edit-bar"><div><strong>{draft ? '대시보드 편집 중' : '나의 대시보드'}</strong><p className="small muted">{draft ? '변경 후 저장해 주세요. PC와 모바일 배치는 따로 저장됩니다.' : '필요한 정보만, 원하는 순서와 크기로 구성하세요.'}</p></div><div className="dashboard-edit-actions">{draft ? <><Button variant="ghost" disabled={busy} onClick={() => { setDraft(null); onEditingChange(false); setSaved(null); setError(''); resource.retry(); }}>취소</Button><Button disabled={busy} pending={busy} onClick={save}>배치 저장</Button></> : <Button variant="secondary" onClick={() => { setDevice(mobile ? 'mobile' : 'desktop'); setDraft(structuredClone(current)); onEditingChange(true); setMessage(''); setError(''); }}>대시보드 편집</Button>}</div></div>
    {message && <p role="status" className="expense-success">{message}</p>}{error && <p role="alert" className="inline-error">{error}</p>}
    {draft && <fieldset className="dashboard-editor fl-card" disabled={busy}><legend>위젯 설정</legend><div className="dashboard-editor-toolbar"><Select label="편집할 화면" value={device} onChange={value => setDevice(value as Device)} options={[{ value: 'desktop', label: 'PC 배치' }, { value: 'mobile', label: '모바일 배치' }]}/><Button variant="ghost" onClick={() => setDraft(value => value && ({ ...value, [device]: defaults(value.allowed_widgets) }))}>현재 화면 기본 배치로 복원</Button></div><div className="widget-visibility">{items.map(item => <label key={item.id}><input type="checkbox" checked={item.visible} onChange={event => update(item.id, { visible: event.target.checked })}/>{titles[item.id]}</label>)}</div><p className="small muted">이동 손잡이를 끌거나 앞·뒤 버튼을 사용하세요.{device === 'desktop' && ' 크기는 선택 메뉴 또는 오른쪽 아래 손잡이로 조절합니다.'}</p></fieldset>}
    <div className="widget-grid" data-device={activeDevice} data-editing={Boolean(draft)} aria-label="대시보드 위젯">
      {items.filter(item => item.visible).map(item => <div key={item.id} className="dashboard-widget" data-widget={item.id} data-width={item.width} data-height={item.height}
        onDragOver={event => { if (draft && !busy) event.preventDefault(); }} onDrop={event => {
          if (!draft || busy) return; event.preventDefault();
          const id = event.dataTransfer.getData('text/plain') as Id; const from = items.findIndex(x => x.id === id); const to = items.findIndex(x => x.id === item.id);
          if (from >= 0) move(id, to - from);
        }}>
        {draft && <div className="widget-controls"><div className="widget-move-controls"><button type="button" className="widget-drag" draggable={!busy} disabled={busy} aria-label={`${titles[item.id]} 이동 손잡이`} onDragStart={event => event.dataTransfer.setData('text/plain', item.id)}>⠿ {titles[item.id]}</button><Button variant="ghost" disabled={busy || items[0]?.id === item.id} aria-label={`${titles[item.id]} 앞으로 이동`} onClick={() => move(item.id, -1)}>↑</Button><Button variant="ghost" disabled={busy || items[items.length - 1]?.id === item.id} aria-label={`${titles[item.id]} 뒤로 이동`} onClick={() => move(item.id, 1)}>↓</Button><Button variant="ghost" disabled={busy} aria-label={`${titles[item.id]} 숨기기`} onClick={() => update(item.id, { visible: false })}>숨기기</Button></div>{device === 'desktop' && <div className="widget-size-controls"><Select label={`${titles[item.id]} 너비`} value={item.width} onChange={width => update(item.id, { width: width as Widget['width'] })} options={[{ value: 'half', label: '반폭' }, { value: 'full', label: '전체폭' }]}/><Select label={`${titles[item.id]} 높이`} value={item.height} onChange={height => update(item.id, { height: height as Widget['height'] })} options={[{ value: 'compact', label: '작게' }, { value: 'regular', label: '보통' }, { value: 'tall', label: '크게' }]}/></div>}</div>}
        <div className="widget-content" inert={Boolean(draft)}>{widgets[item.id]}</div>
        {draft && device === 'desktop' && <button type="button" className="widget-resize" disabled={busy} aria-label={`${titles[item.id]} 크기 조절`} title="끌어서 크기 조절 · 키보드는 위 크기 메뉴 사용"
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); resizing.current = { id: item.id, x: event.clientX, y: event.clientY, width: item.width, height: sizes.indexOf(item.height) }; }}
          onPointerMove={event => { const start = resizing.current; if (!start || start.id !== item.id) return; const dx = event.clientX - start.x; const dy = event.clientY - start.y; update(item.id, { width: dx > 70 ? 'full' : dx < -70 ? 'half' : start.width, height: sizes[Math.max(0, Math.min(2, start.height + Math.round(dy / 100)))] }); }}
          onPointerUp={() => { resizing.current = null; }} onPointerCancel={() => { resizing.current = null; }}>↘</button>}
      </div>)}
    </div>
    {!items.some(item => item.visible) && <p className="fl-card empty-state">표시 중인 위젯이 없습니다. 대시보드 편집에서 원하는 위젯을 켜 주세요.</p>}
  </div>;
}
