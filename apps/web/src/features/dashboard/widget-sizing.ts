import type { components } from '../../generated/api';
type Widget = components['schemas']['Widget'];
export const MIN_HEIGHT = 120;
const MAX_HEIGHT = 32768;
export function snapHeight(pixels: number, gap: number) {
  const step = 4 + gap;
  const rows = Math.min(Math.floor((MAX_HEIGHT + gap) / step), Math.ceil((Math.max(MIN_HEIGHT, pixels) + gap) / step));
  return rows * step - gap;
}
export function widgetRows(item: Widget, mobile: boolean) {
  const gap = mobile ? 12 : 16;
  const legacyRows = { compact: 4, regular: 6, tall: 8 }[item.height];
  const pixels = item.height_px ?? legacyRows * (54 + gap) - gap;
  return Math.ceil((pixels + gap) / (4 + gap));
}
/** Measure intrinsic content at its final width, without remounting React or fetching data. */
export function contentHeight(element: HTMLElement, width = element.getBoundingClientRect().width) {
  const probe = element.cloneNode(true) as HTMLElement;
  probe.removeAttribute('id'); probe.removeAttribute('data-widget');
  probe.classList.add('widget-size-probe');
  probe.setAttribute('aria-hidden', 'true'); probe.inert = true;
  for (const child of probe.querySelectorAll('[id]')) child.removeAttribute('id');
  Object.assign(probe.style, { width: `${width}px`, height: 'auto', gridRow: 'auto' });
  document.body.append(probe);
  try { return Math.max(MIN_HEIGHT, Math.ceil(probe.getBoundingClientRect().height)); }
  finally { probe.remove(); }
}
