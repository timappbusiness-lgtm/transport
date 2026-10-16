import { isIsoDay, isPlate, MEMENTO_KIND_LABELS, normalisePlate, type MementoKind } from './memento';

/**
 * A fleet's plates and dates, from a CSV.
 *
 * Read in the browser, line by line, so every mistake is named with its
 * line before anything is sent; the database checks the same rows again
 * (`memento_import`) and imports them all or none. Romanian Excel saves
 * with `;`, everything else with `,`: the header decides which.
 *
 * Free of React and of Supabase.
 */

/** The kinds a CSV may carry; „Altceva" needs a name, so it is added by hand. */
export const CSV_KINDS = ['rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala', 'extinctor', 'revizie'] as const;
export type CsvKind = (typeof CSV_KINDS)[number];

export interface CsvRow {
  /** The line in the file, counting the header as 1. */
  line: number;
  plate: string;
  make: string | null;
  model: string | null;
  dates: Partial<Record<CsvKind, string>>;
}

export interface CsvError {
  line: number;
  message: string;
}

export interface CsvResult {
  rows: CsvRow[];
  errors: CsvError[];
  /** Header columns that are not used, said so rather than silently dropped. */
  ignored: string[];
}

/** An example to download — labelled as one, with invented plates. */
export const MEMENTO_CSV_EXAMPLE =
  'numar;marca;model;rca;itp;rovinieta;casco\n' +
  'B123ABC;Dacia;Logan;15.03.2027;01.06.2027;31.12.2026;\n' +
  'CJ45XYZ;Ford;Transit;20.11.2026;;;10.02.2027\n';

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const PLATE_HEADERS = new Set(['numar', 'nr', 'numar inmatriculare', 'nr inmatriculare', 'inmatriculare', 'placuta', 'plate', 'numar auto']);
const MAKE_HEADERS = new Set(['marca', 'make']);
const MODEL_HEADERS = new Set(['model']);
const KIND_HEADERS: Record<string, CsvKind> = {
  rca: 'rca',
  itp: 'itp',
  rovinieta: 'rovinieta',
  vigneta: 'rovinieta',
  casco: 'casco',
  'trusa medicala': 'trusa_medicala',
  trusa: 'trusa_medicala',
  extinctor: 'extinctor',
  revizie: 'revizie',
  service: 'revizie',
};

type Column = { field: 'plate' } | { field: 'make' } | { field: 'model' } | { field: 'date'; kind: CsvKind } | null;

/** One line split on the separator, honouring double quotes. */
export function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === separator) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** The separator the header uses most; `;` when it has none. */
function separatorOf(header: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of header) if (ch in counts) counts[ch]! += 1;
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return count > 0 ? best : ';';
}

/** „5 rânduri", „300 de rânduri". */
function randuri(n: number): string {
  const lastTwo = n % 100;
  return lastTwo >= 1 && lastTwo <= 19 ? `${n} rânduri` : `${n} de rânduri`;
}

/**
 * A date as people write it in a spreadsheet: 15.03.2027, 5.3.2027,
 * 15/03/2027, 15-03-2027 or 2027-03-15. Null when it is not a real day.
 */
export function readCsvDate(raw: string): string | null {
  const value = raw.trim();
  let iso: string | null = null;
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (dmy) iso = `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) iso = value;
  return iso !== null && isIsoDay(iso) ? iso : null;
}

/**
 * Reads the file. Every problem is an error with its line; a file with
 * any error imports nothing, so the person fixes it and sends it again
 * rather than wondering which half went in.
 */
export function parseMementoCsv(text: string, maxRows = 300): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  if (headerIndex === -1) {
    return { rows: [], errors: [{ line: 1, message: 'Fișierul este gol.' }], ignored: [] };
  }
  const separator = separatorOf(lines[headerIndex]!);
  const headers = splitCsvLine(lines[headerIndex]!, separator);
  const ignored: string[] = [];
  const columns: Column[] = headers.map((header) => {
    const key = fold(header);
    if (PLATE_HEADERS.has(key)) return { field: 'plate' };
    if (MAKE_HEADERS.has(key)) return { field: 'make' };
    if (MODEL_HEADERS.has(key)) return { field: 'model' };
    const kind = KIND_HEADERS[key];
    if (kind) return { field: 'date', kind };
    if (header.trim() !== '') ignored.push(header.trim());
    return null;
  });

  const errors: CsvError[] = [];
  if (!columns.some((c) => c?.field === 'plate')) {
    errors.push({ line: headerIndex + 1, message: 'Nu găsesc coloana cu numărul de înmatriculare (de exemplu „numar").' });
    return { rows: [], errors, ignored };
  }

  const rows: CsvRow[] = [];
  const seen = new Map<string, number>();
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    if (raw.trim() === '' || /^[;,\t\s]*$/.test(raw)) continue;
    const line = i + 1;
    const cells = splitCsvLine(raw, separator);
    const row: CsvRow = { line, plate: '', make: null, model: null, dates: {} };
    let rowOk = true;

    columns.forEach((column, index) => {
      if (column === null) return;
      const value = (cells[index] ?? '').trim();
      if (column.field === 'plate') {
        row.plate = normalisePlate(value);
        if (value === '') {
          errors.push({ line, message: `Rândul ${line}: lipsește numărul de înmatriculare.` });
          rowOk = false;
        } else if (!isPlate(value)) {
          errors.push({ line, message: `Rândul ${line}: numărul „${value}" nu pare corect.` });
          rowOk = false;
        }
      } else if (column.field === 'make') {
        row.make = value === '' ? null : value.slice(0, 40);
      } else if (column.field === 'model') {
        row.model = value === '' ? null : value.slice(0, 40);
      } else if (value !== '') {
        const iso = readCsvDate(value);
        if (iso === null) {
          errors.push({
            line,
            message: `Rândul ${line}: data „${value}" pentru ${MEMENTO_KIND_LABELS[column.kind as MementoKind]} nu este o dată (scrie-o ca 15.03.2027).`,
          });
          rowOk = false;
        } else {
          row.dates[column.kind] = iso;
        }
      }
    });

    if (rowOk && row.plate !== '') {
      const first = seen.get(row.plate);
      if (first !== undefined) {
        errors.push({ line, message: `Rândul ${line}: numărul ${row.plate} apare deja pe rândul ${first}.` });
        continue;
      }
      seen.set(row.plate, line);
    }
    if (rowOk) rows.push(row);
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: headerIndex + 1, message: 'Fișierul are doar capul de tabel, fără niciun vehicul.' });
  }
  if (rows.length + errors.filter((e) => e.line > headerIndex + 1).length > maxRows) {
    errors.unshift({
      line: headerIndex + 1,
      message: `Fișierul are mai mult de ${randuri(maxRows)}. Împarte-l și importă-l pe bucăți.`,
    });
  }
  return { rows, errors, ignored };
}
