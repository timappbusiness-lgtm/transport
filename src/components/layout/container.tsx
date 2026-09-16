import { cn } from '@/lib/utils';

/** Content capped at 1240px with the fluid gutter from the design system. */
export function Container({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[1240px] px-[clamp(16px,4vw,56px)]', className)}
      {...props}
    />
  );
}
