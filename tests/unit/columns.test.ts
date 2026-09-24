import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitColumns } from '@/lib/columns';

describe('items shared out into independent columns', () => {
  it('fills the first column first, and reads in the original order', () => {
    const columns = splitColumns(['a', 'b', 'c', 'd', 'e'], 2);
    expect(columns).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
    // A phone stacks the columns: the order is the one the list was given in.
    expect(columns.flat()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('one column is the list itself; an empty list is one empty column', () => {
    expect(splitColumns([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
    expect(splitColumns([], 2)).toEqual([[]]);
  });

  it('never makes an empty column beside a full one', () => {
    expect(splitColumns(['a'], 2)).toEqual([['a']]);
    expect(splitColumns(['a', 'b'], 3)).toEqual([['a'], ['b']]);
  });

  it('a nonsense count still gives one column', () => {
    expect(splitColumns(['a', 'b'], 0)).toEqual([['a', 'b']]);
    expect(splitColumns(['a', 'b'], Number.NaN)).toEqual([['a', 'b']]);
  });
});

describe('the FAQ accordion never shares a row between neighbours', () => {
  const source = readFileSync('src/components/faq/accordion.tsx', 'utf8');

  it('is built from independent column stacks, aligned to the start', () => {
    expect(source).toContain('splitColumns(entries, columns)');
    expect(source).toMatch(/grid items-start/);
  });

  it('no page hands it grid columns of its own', () => {
    for (const page of [
      'src/app/abonamente/page.tsx',
      'src/app/intrebari-frecvente/page.tsx',
      'src/components/home/faq.tsx',
      'src/components/seo/page-body.tsx',
    ]) {
      const text = readFileSync(page, 'utf8');
      for (const use of text.match(/<FaqAccordion[^>]*>/g) ?? []) {
        expect(use, page).not.toMatch(/grid-cols/);
      }
    }
  });
});
