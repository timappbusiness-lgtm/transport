import { describe, expect, it } from 'vitest';
import { menuSide } from '@/lib/menu-side';

describe('the side a dropdown hangs from', () => {
  it('hangs from the right edge when the button is on the right', () => {
    // 1440: the button at the end of the title row.
    expect(menuSide({ left: 1160, right: 1284 }, 1440, 240)).toBe('right');
  });

  it('hangs from the left edge when the button wrapped to the left on a phone', () => {
    // 390, before: right-anchored, the menu opened at x = -100.
    expect(menuSide({ left: 16, right: 140 }, 390, 240)).toBe('left');
  });

  it('keeps a margin from the screen edge', () => {
    expect(menuSide({ left: 20, right: 247 }, 390, 240)).toBe('left');
    expect(menuSide({ left: 20, right: 248 }, 390, 240)).toBe('right');
  });

  it('with no room either way, shows the start of every label', () => {
    expect(menuSide({ left: 100, right: 200 }, 250, 240)).toBe('left');
  });
});
