'use client';
import { useId, useState } from 'react';
import { useSession } from '../../components/app-shell';
import { Button } from '../../components/ui/Button';
import { Money } from '../../components/ui/Money';
import { Failed, Loading } from '../../components/resource-state';
import { useResource } from '../../lib/use-resource';
import type { components } from '../../generated/api';

type Flow = components['schemas']['FlowResponse'];
type Bucket = components['schemas']['FlowBucket'];
const coverageLabels = { none: '자료 없음', partial: '일부 자료', complete: '조회기간 포함' };

export function CashFlowWidget() {
  const session = useSession();
  const [unit, setUnit] = useState<'week' | 'month'>('month');
  const resource = useResource<Flow>(session ? `/families/${session.family_id}/dashboard/flow?unit=${unit}` : null, true);
  const data = resource.data;
  return <section className="fl-card cash-flow-widget">
    <div className="section-heading cash-flow-heading"><h2>우리 가족 자금 흐름</h2><div className="cash-flow-switch" role="group" aria-label="자금 흐름 집계 단위">
      <Button variant={unit === 'week' ? 'primary' : 'secondary'} aria-pressed={unit === 'week'} onClick={() => setUnit('week')}>주 단위</Button>
      <Button variant={unit === 'month' ? 'primary' : 'secondary'} aria-pressed={unit === 'month'} onClick={() => setUnit('month')}>월 단위</Button>
    </div></div>
    {resource.loading ? <Loading/> : resource.error ? <Failed message={resource.error} retry={resource.retry}/> : data && <>
      <p className="small muted">{data.today} 기준 · {unit === 'week' ? '최근 8주 · 월요일 시작' : '최근 6개월'} · 이번 기간은 오늘까지</p>
      <p className="small muted">{data.items[0]?.start_on} ~ {data.today} · {data.data_mode === 'synthetic' ? '합성 예시' : '업로드 자료'}{data.data_through && ` · 자료 조회 종료일 ${data.data_through}`}</p>
      <div className="chart-legend"><span><i className="legend income"/>수입</span><span><i className="legend expense"/>지출</span><span><i className="legend balance"/>마지막 확인 잔액</span></div>
      <FlowChart rows={data.items}/>
      <p className="small muted">자료가 없는 구간은 비워 두며, 일부 자료는 해당 자료만 집계합니다. 잔액은 마지막 확인값입니다.</p>
      <details><summary>금액을 표로 확인하기</summary><div className="table-scroll"><table className="fl-table"><caption className="sr-only">{unit === 'week' ? '주별' : '월별'} 자금 흐름</caption><thead><tr><th scope="col">기간</th><th scope="col">수입</th><th scope="col">지출</th><th scope="col">확인 잔액</th><th scope="col">자료 범위</th></tr></thead><tbody>{data.items.map(row => <tr key={row.start_on}><th scope="row">{row.start_on} ~ {row.end_on}{row.in_progress && <span className="small muted"> · 진행 중</span>}</th><td><Value amount={row.income_krw}/></td><td><Value amount={row.expense_krw}/></td><td><Value amount={row.balance_krw}/></td><td>{coverageLabels[row.coverage]}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}

function Value({ amount }: { amount: string | null }) { return amount === null ? <span className="muted">—</span> : <Money amountKrw={amount}/>; }

function FlowChart({ rows }: { rows: Bucket[] }) {
  const [active, setActive] = useState<number | null>(null);
  const tooltipId = useId();
  const selected = active === null ? undefined : rows[active];
  const values = rows.flatMap(row => [row.balance_krw, row.income_krw, row.expense_krw]).filter((v): v is string => v !== null);
  const minimum = values.reduce((min, value) => BigInt(value) < min ? BigInt(value) : min, 0n);
  const maximum = values.reduce((max, value) => BigInt(value) > max ? BigInt(value) : max, 1n);
  // Money remains BigInt; only bounded chart coordinates become Number.
  const y = (value: string) => 190 - Number((BigInt(value) - minimum) * 150n / (maximum - minimum));
  const candidates = [...new Set([minimum, minimum + (maximum-minimum)/2n, maximum])];
  const ticks = candidates.some(tick => tick === 0n) || candidates.some(tick => Math.abs(y(String(tick)) - y('0')) < 22) ? candidates : [...candidates, 0n];
  const baseline = y('0');
  const x = (index: number) => 95 + (index + 0.5) * 425 / Math.max(rows.length, 1);
  const barWidth = Math.min(24, 145 / Math.max(rows.length, 1));
  return <div className="cash-flow-plot" onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setActive(null); } }}>
    <p className="small muted">금액 (원) · 그래프에 마우스를 올리거나 눌러 확인하세요.</p>
    <div className="cash-flow-interactive">
    <div className="cash-flow-axis" aria-label="금액 축">{ticks.map(tick => <span key={String(tick)} style={{ top: `${y(String(tick))/205*100}%` }}>{axisAmount(tick)}</span>)}</div>
    <svg className="flow-chart" viewBox="0 0 540 205" role="img" aria-label="기간별 수입과 지출, 마지막 확인 잔액. 자료 없는 구간은 비어 있으며 정확한 금액은 아래 표에서 확인할 수 있습니다.">
    <line x1="95" x2="520" y1={baseline} y2={baseline} stroke="var(--color-border)"/>
    {ticks.map(tick => <line key={String(tick)} x1="95" x2="520" y1={y(String(tick))} y2={y(String(tick))} stroke="var(--color-border)" strokeDasharray="3 5"/>)}
    {rows.map((row, index) => { const previous = rows[index-1]; return <g key={row.start_on}>
      <title>{row.start_on} ~ {row.end_on} · {coverageLabels[row.coverage]}</title>
      {row.income_krw !== null && <rect x={x(index)-barWidth-3} y={y(row.income_krw)} width={barWidth} height={baseline-y(row.income_krw)} fill="var(--color-brand-blue)" stroke="var(--color-primary)" rx="3"/>}
      {row.expense_krw !== null && <rect x={x(index)+3} y={y(row.expense_krw)} width={barWidth} height={baseline-y(row.expense_krw)} fill="var(--color-brand-pink)" stroke="var(--color-accent)" rx="3"/>}
      {previous?.balance_krw != null && row.balance_krw !== null && previous.coverage === 'complete' && row.coverage === 'complete' && <line x1={x(index-1)} x2={x(index)} y1={y(previous.balance_krw)} y2={y(row.balance_krw)} stroke="var(--color-text)" strokeWidth="2"/>}
      {row.balance_krw !== null && <circle cx={x(index)} cy={y(row.balance_krw)} r="4" fill="var(--color-text)"/>}
      {row.coverage === 'none' && <text x={x(index)} y="178" textAnchor="middle" fill="var(--color-muted)" fontSize="11">—</text>}
    </g>; })}
  </svg>
    <div className="cash-flow-targets" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>{rows.map((row,index) => <button key={row.start_on} type="button" aria-label={`${row.start_on} ~ ${row.end_on} 금액 확인`} aria-describedby={active === index ? tooltipId : undefined} data-active={active === index} onPointerEnter={event => { if (event.pointerType === 'mouse') setActive(index); }} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)}/>)}</div>
    {selected && <div id={tooltipId} role="tooltip" className="cash-flow-tooltip">
      <strong>{selected.start_on} ~ {selected.end_on}</strong>
      <dl><div><dt>수입</dt><dd><Value amount={selected.income_krw}/></dd></div><div><dt>지출</dt><dd><Value amount={selected.expense_krw}/></dd></div><div><dt>확인 잔액</dt><dd><Value amount={selected.balance_krw}/></dd></div></dl>
      <span className="muted">{coverageLabels[selected.coverage]}</span>
    </div>}
    </div><div className="cash-flow-labels" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>{rows.map(row => <span key={row.start_on}>{row.label.replace(' 주', '')}{row.coverage !== 'complete' && <small>{coverageLabels[row.coverage]}</small>}</span>)}</div></div>;
}

function axisAmount(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const [unit, suffix] = absolute >= 1000000000000n ? [1000000000000n, '조'] : absolute >= 100000000n ? [100000000n, '억'] : absolute >= 10000n ? [10000n, '만'] : [1n, ''];
  const decimals = absolute / unit >= 100n ? 0n : (absolute % unit) * 100n / unit;
  return `${value < 0n ? '−' : ''}${suffix ? String(absolute / unit) : (absolute / unit).toLocaleString('ko-KR')}${decimals ? '.' + String(decimals).padStart(2, '0').replace(/0$/, '') : ''}${suffix}`;
}
