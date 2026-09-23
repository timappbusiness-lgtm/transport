import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'onDark' | 'onDarkGhost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  // Ink pill on light ground: white on #1c262b is 15.42:1.
  primary: 'bg-foreground text-white hover:bg-[#2a3740]',
  secondary: 'border border-border-strong text-foreground hover:bg-ground-alt',
  // White pill on the dark sections: ink on white is 14.37:1.
  onDark: 'bg-white text-foreground hover:bg-[#eef1f2]',
  onDarkGhost: 'border border-white/45 text-white hover:bg-white/12',
};

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-2 text-small',
  md: 'px-6 py-3 text-body',
};

export const buttonClasses = (variant: Variant = 'primary', size: Size = 'md') =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-pill',
    'font-sans font-medium',
    // Never `transition-colors`: in Tailwind v4 that list includes
    // outline-color, which makes the focus ring fade in from the element's
    // own text colour. A focus indicator has to be there on the first frame.
    'transition-[color,background-color,border-color] duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
  );

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant | undefined;
  size?: Size | undefined;
}

/**
 * Pill button. For a link styled as a button, spread `buttonClasses()` onto
 * next/link rather than reaching for an asChild polymorph.
 */
export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    />
  );
}
