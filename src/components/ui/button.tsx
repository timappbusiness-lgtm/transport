import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  // Dark text on accent measures 10.49:1 against this ground.
  primary: 'bg-accent text-background hover:bg-[#f7bd69]',
  secondary:
    'border border-border text-foreground hover:border-muted hover:bg-white/5',
  ghost: 'text-muted hover:text-foreground',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-2 text-xs',
  md: 'px-5 py-3 text-sm',
};

export const buttonClasses = (variant: Variant = 'primary', size: Size = 'md') =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-[8px]',
    'font-display font-bold',
    // NOT `transition-colors`: in Tailwind v4 that list includes
    // outline-color, which makes the focus ring fade in from the element's
    // own text colour — on the primary variant it starts invisible. A focus
    // indicator has to appear on the first frame.
    'transition-[color,background-color,border-color] duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
  );

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * Minimal primitive for phase 0. shadcn/ui components are copied in as
 * source; ui.shadcn.com is unreachable from this environment, so the CLI
 * cannot fetch them here — add them from a machine with access, or paste
 * the source. components.json is already configured for it.
 *
 * For a link styled as a button, spread `buttonClasses()` onto next/link
 * rather than reaching for an asChild polymorph.
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
