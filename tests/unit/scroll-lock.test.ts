import { describe, expect, it } from 'vitest';
import { lockScroll } from '@/lib/scroll-lock';

function root(overflow = '', paddingRight = '') {
  return { style: { overflow, paddingRight }, dataset: {} as DOMStringMap };
}

describe('the page behind a sheet stays put', () => {
  it('locks, and gives back exactly the style it found', () => {
    const page = root('clip', '3px');
    const release = lockScroll(page);
    expect(page.style.overflow).toBe('hidden');
    release();
    expect(page.style).toEqual({ overflow: 'clip', paddingRight: '3px' });
    expect(page.dataset).toEqual({});
  });

  it('two layers release the page only when the last one closes', () => {
    const page = root();
    const first = lockScroll(page);
    const second = lockScroll(page);
    first();
    expect(page.style.overflow).toBe('hidden');
    second();
    expect(page.style.overflow).toBe('');
  });

  it('releasing twice is harmless', () => {
    const page = root();
    const other = lockScroll(page);
    const release = lockScroll(page);
    release();
    release();
    expect(page.style.overflow).toBe('hidden');
    other();
    expect(page.style.overflow).toBe('');
  });

  it("keeps a desktop scrollbar's width, so the page does not jump sideways", () => {
    const page = root();
    const release = lockScroll(page, 15);
    expect(page.style.paddingRight).toBe('15px');
    release();
    expect(page.style.paddingRight).toBe('');
  });
});
