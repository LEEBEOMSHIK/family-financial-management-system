'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Select } from './ui/Select';

declare global { interface Window { familyTheme?: { connectControl: () => void }; } }
function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-preference'] });
  return () => observer.disconnect();
}
export function ThemeControl() {
  const control = useRef<HTMLSelectElement>(null);
  const preference = useSyncExternalStore(subscribe, () => document.documentElement.getAttribute('data-theme-preference') || 'system', () => 'system');
  useEffect(() => { window.familyTheme?.connectControl(); }, []);
  return <div className="theme-control"><Select label="화면 모드" value={preference}
    options={[{value:'system',label:'시스템 설정'},{value:'light',label:'라이트'},{value:'dark',label:'다크'}]}
    onChange={value => { if (control.current) { control.current.value = value; control.current.dispatchEvent(new Event('change', { bubbles: true })); } }}/>
    <select hidden aria-hidden="true" tabIndex={-1} id="theme-preference" ref={control} defaultValue="system">
      <option value="system">시스템 설정</option><option value="light">라이트</option><option value="dark">다크</option>
    </select>
  </div>;
}
