'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

type Option = { value: string; label: string };
export function Select({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRef({ text: '', at: 0 });
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close); };
  }, [open]);
  function reveal(index = selected) {
    const rect = trigger.current?.getBoundingClientRect();
    setAbove(Boolean(rect && window.innerHeight - rect.bottom < Math.min(options.length * 44 + 16, 256) && rect.top > 256));
    setActive(index); setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false); trigger.current?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const key = event.key;
    if (key === 'Tab') { setOpen(false); return; }
    if (key === 'Escape') { if (open) event.preventDefault(); setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault();
      if (key === 'Enter' || key === ' ') { if (open) choose(active); else reveal(); return; }
      const next = key === 'Home' ? 0 : key === 'End' ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, active + (key === 'ArrowDown' ? 1 : -1)));
      if (open) setActive(next); else reveal(key === 'Home' || key === 'End' ? next : selected);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      search.current = { text: Date.now() - search.current.at < 700 ? search.current.text + key : key, at: Date.now() };
      const index = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()));
      if (index >= 0) { event.preventDefault(); reveal(index); }
    }
  }
  return <div className="select-field" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span id={`${id}-label`} className="select-label">{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
      aria-activedescendant={open ? `${id}-${active}` : undefined} className="select-trigger"
      onClick={() => open ? setOpen(false) : reveal()} onKeyDown={keyDown}>
      <span>{options[selected]?.label}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>
    </button>
    {open && <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="select-options" data-above={above}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={option.value === value} data-active={active === index} className="select-option"
        onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span><span aria-hidden="true">{option.value === value ? '✓' : ''}</span>
      </div>)}
    </div>}
  </div>;
}
