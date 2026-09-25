/**
 * Building the archive behind „Descarcă datele mele".
 *
 * Everything here is pure: bytes in, bytes out, no session and no network,
 * because the interesting failures are all in the format. A zip that one
 * unzipper opens and another refuses is a person who cannot read their own
 * data, and they have no way to tell us which of the two of us is wrong.
 *
 * Stored, never deflated. The saving on a few hundred kilobytes of JSON is
 * not worth a compressor in the bundle, and a stored entry is the one
 * shape every unzipper on every operating system has agreed about since
 * 1989.
 */

import { BRAND_NAME, BRAND_SLUG } from '@/config/brand';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** A fixed timestamp, so the same data produces the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = (2026 - 1980) << 9 | (1 << 5) | 1;

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}
function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * A zip with every entry stored.
 *
 * Bit 11 of the flags is set on every header: the names here are ASCII
 * today, but „cereri.csv" is one product decision away from carrying a
 * diacritic, and an unzipper that guesses the code page turns that into
 * mojibake in a file somebody asked us for by law.
 */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    return { name, data: entry.data, crc: crc32(entry.data) };
  });

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0);
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let offset = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(offset);
    writeU32(view, offset, 0x04034b50);
    writeU16(view, offset + 4, 20);
    writeU16(view, offset + 6, 0x0800);
    writeU16(view, offset + 8, 0);
    writeU16(view, offset + 10, DOS_TIME);
    writeU16(view, offset + 12, DOS_DATE);
    writeU32(view, offset + 14, entry.crc);
    writeU32(view, offset + 18, entry.data.length);
    writeU32(view, offset + 22, entry.data.length);
    writeU16(view, offset + 26, entry.name.length);
    writeU16(view, offset + 28, 0);
    out.set(entry.name, offset + 30);
    out.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  }

  const centralStart = offset;
  prepared.forEach((entry, index) => {
    writeU32(view, offset, 0x02014b50);
    writeU16(view, offset + 4, 20);
    writeU16(view, offset + 6, 20);
    writeU16(view, offset + 8, 0x0800);
    writeU16(view, offset + 10, 0);
    writeU16(view, offset + 12, DOS_TIME);
    writeU16(view, offset + 14, DOS_DATE);
    writeU32(view, offset + 16, entry.crc);
    writeU32(view, offset + 20, entry.data.length);
    writeU32(view, offset + 24, entry.data.length);
    writeU16(view, offset + 28, entry.name.length);
    writeU16(view, offset + 30, 0);
    writeU16(view, offset + 32, 0);
    writeU16(view, offset + 34, 0);
    writeU16(view, offset + 36, 0);
    writeU32(view, offset + 38, 0);
    writeU32(view, offset + 42, offsets[index]!);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });

  writeU32(view, offset, 0x06054b50);
  writeU16(view, offset + 4, 0);
  writeU16(view, offset + 6, 0);
  writeU16(view, offset + 8, prepared.length);
  writeU16(view, offset + 10, prepared.length);
  writeU32(view, offset + 12, centralSize);
  writeU32(view, offset + 16, centralStart);
  writeU16(view, offset + 20, 0);

  return out;
}

/** One cell, quoted when it has to be and never when it does not. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A list as CSV, with every key any row carries as a column.
 *
 * The union rather than the first row's keys: rows here come from
 * Postgres `jsonb_agg`, which drops nothing but also promises nothing
 * about two rows having the same shape, and a column silently missing
 * from an export is data we did not give somebody who asked for all of it.
 *
 * The byte-order mark is for Excel, which otherwise reads „Timișoara" as
 * „TimiÈ™oara" and makes the export look like ours is the broken side.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const EXPORT_README = `Arhiva cu datele tale de pe ${BRAND_NAME}

date.json   tot ce avem despre tine, în format JSON
*.csv       aceleași liste, pe rând, ca să poată fi deschise în Excel

Fișierele CSV sunt codate UTF-8 și separate prin virgulă. Dacă Excel
pune tot rândul într-o singură coloană, folosește Date > Text în coloane
și alege virgula ca separator.

Nu sunt incluse fișierele încărcate (documente, poze). Le găsești în cont,
în paginile din care le-ai încărcat.
`;

/** `2026-09-18` for a file name, in the timezone people here live in. */
export function exportDateStamp(now: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}

/**
 * The archive, from what `my_data_export()` returned.
 *
 * Every array in the payload becomes a CSV next to the JSON. Empty lists
 * are skipped rather than written as a header with nothing under it: a
 * file called `oferte.csv` with one line in it reads as a bug, and the
 * JSON already says the list is empty.
 */
export function buildExportArchive(payload: Record<string, unknown>): Uint8Array {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'CITESTE.txt', data: encoder.encode(EXPORT_README) },
    { name: 'date.json', data: encoder.encode(`${JSON.stringify(payload, null, 2)}\n`) },
  ];

  for (const [key, value] of Object.entries(payload)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const rows = value.filter(
      (row): row is Record<string, unknown> =>
        typeof row === 'object' && row !== null && !Array.isArray(row),
    );
    if (rows.length === 0) continue;
    entries.push({ name: `${key}.csv`, data: encoder.encode(toCsv(rows)) });
  }

  return zipStore(entries);
}

/** Where the archive lives: the caller's own folder, which is what the policy allows. */
export function exportStoragePath(userId: string, exportId: string, now: Date): string {
  return `${userId}/${BRAND_SLUG}-date-${exportDateStamp(now)}-${exportId.slice(0, 8)}.zip`;
}
