import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

const paths: Record<string, string> = {
  check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M18 6 6 18', arrow: 'M5 12h14m-6-6 6 6-6 6',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7', plus: 'M12 5v14M5 12h14',
  play: 'm9 5 11 7-11 7Z', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  hide: 'm3 3 18 18M10 5c5-1 9 3 12 7-1 2-3 4-5 5M6 6C4 8 2 10 1 12c3 4 6 7 11 7 2 0 3 0 5-1',
  copy: 'M8 8h13v13H8zM16 8V3H3v13h5', chat: 'M3 3h18v14H8l-5 4Z', library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1 3 15-4 1z',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z', upload: 'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',
  users: 'M9 14c-4 0-7 2-7 6m14 0c0-4-3-6-7-6m12 6c0-3-1-5-4-6M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0m3-3a4 4 0 0 1 0 8',
  bars: 'M4 19h16M6 15V9m6 6V4m6 11v-4', back: 'M19 12H5m6-6-6 6 6 6', help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.check}/></svg>; }
export function Button({ children, icon, tone = 'quiet', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; tone?: 'primary' | 'quiet' | 'danger' }) {
  return <button {...props} type={props.type ?? 'button'} className={`button ${tone} ${props.className ?? ''}`}>{icon && <Icon name={icon}/>}<span>{children}</span></button>;
}
export function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby={id} className={`dialog ${className}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-head"><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></header>{children}
  </dialog>;
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export const verdictLabel = (value: string) => value.toUpperCase().replaceAll('_', ' ');
export const shortTime = (value: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const shortDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
export function clock(seconds: number): string { const whole = Math.floor(seconds); return `${Math.floor(whole / 3600)}:${String(Math.floor(whole / 60) % 60).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`; }
