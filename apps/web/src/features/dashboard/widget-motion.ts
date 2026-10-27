/** Visual-only overlay and FLIP transitions. Never changes saved layout or mounts widget data sources. */
export class WidgetMotion {
  private preview: HTMLElement | null = null;
  private previous = new Map<HTMLElement, DOMRect>();
  private animations = new Map<HTMLElement, Animation>();
  private landing: Animation | null = null;
  private origin: DOMRect | null = null;
  private reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

  capture(grid: HTMLElement) {
    this.previous.clear();
    for (const element of grid.querySelectorAll<HTMLElement>(':scope > [data-widget]')) {
      this.previous.set(element, element.getBoundingClientRect());
    }
  }

  reflow(grid: HTMLElement, active: string | null) {
    // Read the currently visible positions before cancelling in-flight transitions.
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear();
    if (this.reduced()) { this.previous.clear(); return; }
    for (const element of grid.querySelectorAll<HTMLElement>(':scope > [data-widget]')) {
      const before = this.previous.get(element);
      const after = element.getBoundingClientRect();
      if (!before || element.dataset.widget === active) continue;
      const dx = before.left - after.left; const dy = before.top - after.top;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(before.width - after.width) < .5 && Math.abs(before.height - after.height) < .5) continue;
      const animation = element.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${before.width / after.width}, ${before.height / after.height})`, transformOrigin: 'top left' },
        { transform: 'none', transformOrigin: 'top left' },
      ], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
      this.animations.set(element, animation);
      void animation.finished.then(() => { if (this.animations.get(element) === animation) this.animations.delete(element); }).catch(() => {});
    }
    this.previous.clear();
  }

  lift(element: HTMLElement, mode: 'move' | 'resize') {
    this.origin = element.getBoundingClientRect();
    const preview = element.cloneNode(true) as HTMLElement;
    preview.classList.add('widget-motion-preview');
    preview.dataset.motion = mode;
    preview.removeAttribute('data-widget');
    preview.removeAttribute('id');
    preview.setAttribute('aria-hidden', 'true');
    preview.inert = true;
    for (const child of preview.querySelectorAll('[id]')) child.removeAttribute('id');
    Object.assign(preview.style, { left: `${this.origin.left}px`, top: `${this.origin.top}px`, width: `${this.origin.width}px`, height: `${this.origin.height}px` });
    document.body.append(preview);
    // Preserve widget content's scroll position without sharing live DOM nodes.
    const source = element.querySelector('.widget-content');
    const copy = preview.querySelector('.widget-content');
    if (source && copy) { copy.scrollTop = source.scrollTop; copy.scrollLeft = source.scrollLeft; }
    this.preview = preview;
    return this.origin;
  }

  follow(dx: number, dy: number) {
    if (this.preview) this.preview.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  resize(dx: number, dy: number, minWidth: number, maxWidth: number, minHeight: number, maxHeight: number, scrollDelta = 0) {
    if (!this.preview || !this.origin) return;
    this.preview.style.top = `${this.origin.top - scrollDelta}px`;
    this.preview.style.width = `${Math.max(minWidth, Math.min(maxWidth, this.origin.width + dx))}px`;
    this.preview.style.height = `${Math.max(minHeight, Math.min(maxHeight, this.origin.height + dy))}px`;
  }

  land(element: HTMLElement, done: () => void) {
    const preview = this.preview;
    if (!preview || this.reduced()) { this.removePreview(); done(); return; }
    const from = preview.getBoundingClientRect(); const to = element.getBoundingClientRect();
    preview.style.transform = 'none';
    Object.assign(preview.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    this.landing = preview.animate([
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: .78 },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: 1 },
    ], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    void this.landing.finished.then(() => { this.removePreview(); done(); }).catch(() => {});
  }

  private removePreview() { this.preview?.remove(); this.preview = null; this.origin = null; this.landing = null; }
  dispose() {
    this.landing?.cancel(); this.removePreview();
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear(); this.previous.clear();
  }
}
