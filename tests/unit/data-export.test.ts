import { describe, expect, it } from 'vitest';
import { BRAND_SLUG } from '@/config/brand';
import {
  buildExportArchive,
  crc32,
  exportDateStamp,
  exportStoragePath,
  toCsv,
  zipStore,
} from '@/lib/data-export';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);
}
function u16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(offset, true);
}

describe('crc32', () => {
  it('matches the published check value', () => {
    // The one vector every zip implementation is tested against.
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zipStore', () => {
  it('writes a readable local header for each entry', () => {
    const zip = zipStore([{ name: 'date.json', data: encoder.encode('{"a":1}') }]);

    expect(u32(zip, 0)).toBe(0x04034b50);
    // Stored, never deflated.
    expect(u16(zip, 8)).toBe(0);
    // UTF-8 names, so a diacritic in a file name survives.
    expect(u16(zip, 6) & 0x0800).toBe(0x0800);
    expect(u32(zip, 14)).toBe(crc32(encoder.encode('{"a":1}')));
    expect(u32(zip, 18)).toBe(7);
    expect(u32(zip, 22)).toBe(7);
    expect(decoder.decode(zip.subarray(30, 39))).toBe('date.json');
    expect(decoder.decode(zip.subarray(39, 46))).toBe('{"a":1}');
  });

  it('ends with a central directory that points at every entry', () => {
    const zip = zipStore([
      { name: 'a.txt', data: encoder.encode('unu') },
      { name: 'b.txt', data: encoder.encode('doi') },
    ]);

    const end = zip.length - 22;
    expect(u32(zip, end)).toBe(0x06054b50);
    expect(u16(zip, end + 8)).toBe(2);
    expect(u16(zip, end + 10)).toBe(2);

    const cdOffset = u32(zip, end + 16);
    const cdSize = u32(zip, end + 12);
    expect(cdOffset + cdSize).toBe(end);
    expect(u32(zip, cdOffset)).toBe(0x02014b50);
    // The first entry's local header is at the very start of the file.
    expect(u32(zip, cdOffset + 42)).toBe(0);
  });

  it('produces the same bytes for the same data', () => {
    const once = zipStore([{ name: 'a.txt', data: encoder.encode('unu') }]);
    const twice = zipStore([{ name: 'a.txt', data: encoder.encode('unu') }]);
    expect(Array.from(once)).toEqual(Array.from(twice));
  });
});

describe('toCsv', () => {
  it('quotes only what has to be quoted', () => {
    const csv = toCsv([{ oras: 'Cluj', nota: 'a, b', citat: 'zice "da"' }]);
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('oras,nota,citat');
    expect(lines[1]).toBe('Cluj,"a, b","zice ""da"""');
  });

  it('carries a column that only later rows have', () => {
    // jsonb_agg promises nothing about two rows sharing a shape, and a
    // column silently missing is data somebody asked for and did not get.
    const csv = toCsv([{ a: 1 }, { a: 2, b: 'trei' }]);
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('a,b');
    expect(lines[1]).toBe('1,');
    expect(lines[2]).toBe('2,trei');
  });

  it('starts with the byte-order mark Excel needs for diacritics', () => {
    expect(toCsv([{ oras: 'Timișoara' }]).startsWith('﻿')).toBe(true);
  });

  it('is empty for an empty list rather than a lonely header', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('buildExportArchive', () => {
  const payload = {
    generat_la: '2026-09-18T10:00:00',
    profil: { email: 'ana@exemplu.ro' },
    cereri: [{ titlu: 'Golf pentru Timișoara', oras: 'Milano' }],
    oferte: [],
  };

  function namesIn(zip: Uint8Array): string[] {
    const names: string[] = [];
    let offset = 0;
    while (u32(zip, offset) === 0x04034b50) {
      const nameLength = u16(zip, offset + 26);
      const size = u32(zip, offset + 18);
      names.push(decoder.decode(zip.subarray(offset + 30, offset + 30 + nameLength)));
      offset += 30 + nameLength + size;
    }
    return names;
  }

  it('carries the JSON, a readme and one CSV per non-empty list', () => {
    const names = namesIn(buildExportArchive(payload));
    expect(names).toEqual(['CITESTE.txt', 'date.json', 'cereri.csv']);
  });

  it('skips an empty list rather than writing a header with nothing under it', () => {
    expect(namesIn(buildExportArchive(payload))).not.toContain('oferte.csv');
  });

  it('never writes a CSV for a value that is not a list of rows', () => {
    const names = namesIn(buildExportArchive({ profil: { a: 1 }, note: ['unu', 'doi'] }));
    expect(names).toEqual(['CITESTE.txt', 'date.json']);
  });
});

describe('exportStoragePath', () => {
  it('puts the archive in the folder that belongs to the caller', () => {
    const path = exportStoragePath(
      '8a1f0000-0000-0000-0000-000000000001',
      'c0ffee12-0000-0000-0000-000000000002',
      new Date('2026-09-18T21:30:00Z'),
    );
    expect(path.startsWith('8a1f0000-0000-0000-0000-000000000001/')).toBe(true);
    expect(path).toContain(`${BRAND_SLUG}-date-2026-09-19-c0ffee12.zip`);
  });

  it('stamps the date in the timezone people here live in', () => {
    // 22:30 in Bucharest on the 18th is 19:30 UTC; a UTC stamp would be
    // right, but 00:30 local on the 19th would print the 18th.
    expect(exportDateStamp(new Date('2026-09-18T21:30:00Z'))).toBe('2026-09-19');
  });
});
