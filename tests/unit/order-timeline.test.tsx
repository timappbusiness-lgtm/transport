import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrderTimeline } from '@/components/orders/order-timeline';

/**
 * The rail between the steps.
 *
 * It was written `last:hidden` on the line, and the line is always the
 * last thing in its own column, so it matched every line and none was
 * ever drawn: seven icons in a column with nothing joining them. The
 * rule belongs to the step — hide the rail after the last one.
 */
describe('the order timeline', () => {
  const html = renderToStaticMarkup(<OrderTimeline status="confirmata" events={[]} />);
  const steps = [...html.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1]!);

  it('draws a row for every step', () => {
    expect(steps.length).toBeGreaterThanOrEqual(5);
  });

  it('makes each step the group its rail answers to', () => {
    for (const step of steps) expect(step.split(' ')).toContain('group');
  });

  it('hides the rail only after the last step, never every rail', () => {
    const rails = [...html.matchAll(/<span aria-hidden="true" class="(w-px[^"]*)"/g)].map((m) => m[1]!);
    expect(rails.length).toBe(steps.length);
    for (const rail of rails) {
      expect(rail.split(' ')).toContain('group-last:hidden');
      expect(rail.split(' ')).not.toContain('last:hidden');
    }
  });
});
