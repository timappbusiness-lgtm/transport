import { BRAND_NAME } from '@/config/brand';
import type { MarkSize } from '@/config/brand-mark';
import { cn } from '@/lib/utils';
import { LogoMark, type MarkTone } from './logo-mark';

export type LogoLayout = 'horizontal' | 'stacked' | 'mark';

const LAYOUT: Record<LogoLayout, string> = {
  horizontal: 'inline-flex items-center gap-2.5',
  stacked: 'inline-flex flex-col items-center gap-1.5 text-center',
  mark: 'inline-flex items-center',
};

/**
 * The lockup: the mark and the name, set in the display face.
 *
 * The name is text, read from `BRAND_NAME` at render time — never a
 * drawing of it — so renaming the platform is one constant and nothing
 * here. Size and colour of the word come from the element around it, the
 * way a heading's do; the lockup only sets the face, the weight and the
 * tracking the word was drawn with.
 *
 * `mark` is for a space too small for the word: the name is still there
 * for a screen reader, in an `sr-only` span, so a link made of just the
 * mark keeps its accessible name.
 */
export function Logo({
  layout = 'horizontal',
  size = 24,
  tone = 'color',
  className,
  wordClassName,
}: {
  layout?: LogoLayout;
  size?: MarkSize;
  tone?: MarkTone;
  className?: string;
  /** Extra classes on the word, e.g. to draw it only from a breakpoint up. */
  wordClassName?: string;
}) {
  return (
    <span data-logo={layout} className={cn(LAYOUT[layout], className)}>
      <LogoMark size={size} tone={tone} />
      <span
        data-logo-word=""
        className={cn(
          layout === 'mark'
            ? 'sr-only'
            : 'min-w-0 font-display font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]',
          wordClassName,
        )}
      >
        {BRAND_NAME}
      </span>
    </span>
  );
}
