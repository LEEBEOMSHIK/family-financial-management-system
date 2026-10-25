import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  pending?: boolean;
};

/** Presentation primitive. The server still enforces authorization and idempotency. */
export function Button({ variant = 'primary', pending = false, disabled,
  type = 'button', className = '', children, ...rest }: Props) {
  return (
    <button {...rest} type={type} className={`fl-button ${className}`}
      data-variant={variant} disabled={disabled || pending}
      aria-busy={pending || undefined}>
      {pending ? '처리 중…' : children}
    </button>
  );
}
