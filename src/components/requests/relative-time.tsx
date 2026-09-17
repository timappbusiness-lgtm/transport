'use client';

import { useEffect, useState } from 'react';
import { relativeTimeRo } from '@/lib/requests';

/**
 * "acum 6 min", kept honest without reloading the page.
 *
 * `initial` is what the server rendered. Using it as the starting state is
 * what keeps hydration silent: the page may have been cached for a minute,
 * so recomputing on the first client render would produce a different
 * string than the HTML that arrived. The effect then corrects it, and an
 * interval keeps it correct.
 */
export function RelativeTime({
  publishedAt,
  initial,
  className,
}: {
  publishedAt: string;
  initial: string;
  className?: string | undefined;
}) {
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    const update = () => setLabel(relativeTimeRo(publishedAt));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [publishedAt]);

  return (
    <time dateTime={publishedAt} className={className}>
      {label}
    </time>
  );
}
