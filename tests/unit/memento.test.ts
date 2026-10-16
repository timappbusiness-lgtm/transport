import { describe, expect, it } from 'vitest';
import {
  addDays,
  bucharestToday,
  conversionLine,
  daysLeft,
  DEFAULT_REMINDER_DAYS,
  displayPlate,
  fleetView,
  formatDay,
  mementoLabel,
  mementoState,
  nextReminderDay,
  normalisePlate,
  parseReminderDays,
  readFleetFilter,
  reminderBatch,
  reminderMarks,
  whenText,
  type ReminderEntry,
} from '@/lib/memento';
import { parseMementoCsv, readCsvDate, splitCsvLine } from '@/lib/memento-csv';

describe('today, in Bucharest', () => {
  it('is already tomorrow at 23:30 UTC in summer', () => {
    // EEST is UTC+3: 23:30 UTC on 15 October is 02:30 on the 16th.
    expect(bucharestToday(new Date('2026-10-15T23:30:00Z'))).toBe('2026-10-16');
  });

  it('and at 22:30 UTC in winter', () => {
    // EET is UTC+2: 22:30 UTC on 15 January is 00:30 on the 16th.
    expect(bucharestToday(new Date('2027-01-15T22:30:00Z'))).toBe('2027-01-16');
    expect(bucharestToday(new Date('2027-01-15T21:30:00Z'))).toBe('2027-01-15');
  });

  it('counts days across the change of hour without losing one', () => {
    // 25 October 2026: clocks go back. Still one day from the 24th to the 25th.
    expect(daysLeft('2026-10-25', '2026-10-24')).toBe(1);
    expect(daysLeft('2026-11-23', '2026-10-24')).toBe(30);
    expect(daysLeft('2027-03-29', '2027-03-27')).toBe(2);
  });

  it('adds days by the calendar', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
});

describe('the state of a date', () => {
  it('is „valabil" beyond thirty days, „expiră curând" within, „expirat" after', () => {
    expect(mementoState(31)).toBe('valabil');
    expect(mementoState(30)).toBe('curand');
    expect(mementoState(0)).toBe('curand');
    expect(mementoState(-1)).toBe('expirat');
  });

  it('says how long in plain Romanian, with „de" from twenty up', () => {
    expect(whenText(0)).toBe('expiră azi');
    expect(whenText(1)).toBe('expiră mâine');
    expect(whenText(7)).toBe('expiră în 7 zile');
    expect(whenText(19)).toBe('expiră în 19 zile');
    expect(whenText(20)).toBe('expiră în 20 de zile');
    expect(whenText(101)).toBe('expiră în 101 zile');
    expect(whenText(-1)).toBe('a expirat ieri');
    expect(whenText(-30)).toBe('a expirat acum 30 de zile');
  });

  it('writes a day the way a Romanian reads it', () => {
    expect(formatDay('2027-03-05')).toBe('05.03.2027');
    expect(formatDay('2027-02-30')).toBe('');
  });

  it('names „Altceva" by what the person called it', () => {
    expect(mementoLabel('rovinieta')).toBe('Rovinietă');
    expect(mementoLabel('altceva', ' Autorizație GPL ')).toBe('Autorizație GPL');
    expect(mementoLabel('altceva', '')).toBe('Altceva');
  });
});

describe('plates', () => {
  it('are one plate however they are typed', () => {
    expect(normalisePlate(' b-123 abc ')).toBe('B123ABC');
  });

  it('are shown the way they are painted', () => {
    expect(displayPlate('B123ABC')).toBe('B 123 ABC');
    expect(displayPlate('CJ12XYZ')).toBe('CJ 12 XYZ');
    expect(displayPlate('M1234')).toBe('M1234');
  });
});

/**
 * The schedule, against the cases the SQL suite (block MEM) pins for
 * `memento_queue_reminders()`. Same entry, same day, same answer.
 */
describe('which reminder goes today', () => {
  const today = '2026-10-16';
  const entry = (left: number, logged: number[] = [], setDaysAgo = 300, days = DEFAULT_REMINDER_DAYS): ReminderEntry => ({
    id: `e${left}`,
    validUntil: addDays(today, left),
    dateSetOn: addDays(today, -setDaysAgo),
    days,
    logged,
  });

  it('a month before, a week before, the day before and on the day', () => {
    expect(reminderMarks(entry(30), today).due).toBe(30);
    expect(reminderMarks(entry(7, [30]), today).due).toBe(7);
    expect(reminderMarks(entry(1, [30, 7]), today).due).toBe(1);
    expect(reminderMarks(entry(0, [30, 7, 1]), today).due).toBe(0);
  });

  it('and nothing on a day in between', () => {
    expect(reminderMarks(entry(20, [30]), today).due).toBeNull();
    expect(reminderBatch([entry(20, [30])], today)).toBeNull();
  });

  it('not a reminder whose day had passed when the date was written', () => {
    expect(reminderMarks(entry(20, [], 0), today).due).toBeNull();
  });

  it('a missed night is caught up the next', () => {
    expect(reminderMarks(entry(29), today).due).toBe(30);
  });

  it('nothing for a date already past', () => {
    expect(reminderMarks(entry(-1, [30, 7, 1]), today).due).toBeNull();
  });

  it('the day before never swallows the day itself', () => {
    const batch = reminderBatch([entry(1, [30, 7])], today);
    expect(batch?.entries[0]?.milestones).toEqual([1]);
  });

  it('a late reminder takes its next one along when it is days away', () => {
    // A week out with the month's reminder never sent: told once, not
    // again tomorrow.
    const batch = reminderBatch([entry(8)], today);
    expect(batch?.entries[0]?.milestones).toEqual([30, 7]);
  });

  it('follows the schedule the person chose', () => {
    expect(reminderMarks(entry(10, [], 300, [10]), today).due).toBe(10);
    expect(reminderMarks(entry(30, [], 300, [10]), today).due).toBeNull();
    expect(reminderMarks(entry(30, [], 300, []), today).due).toBeNull();
  });
});

describe('close dates make one e-mail', () => {
  const today = '2026-10-16';
  const at = (id: string, left: number, logged: number[]): ReminderEntry => ({
    id,
    validUntil: addDays(today, left),
    dateSetOn: addDays(today, -300),
    days: DEFAULT_REMINDER_DAYS,
    logged,
  });

  it('an RCA due today and an ITP two days from its week reminder go together', () => {
    const batch = reminderBatch([at('itp', 9, [30]), at('rca', 7, [30])], today);
    expect(batch?.template).toBe('memento_expiry_digest');
    expect(batch?.entries.map((e) => [e.id, e.daysLeft, e.milestones])).toEqual([
      ['rca', 7, [7]],
      ['itp', 9, [7]],
    ]);
  });

  it('a date far from the others waits for its own day', () => {
    const batch = reminderBatch([at('rca', 7, [30]), at('itp', 15, [30])], today);
    expect(batch?.template).toBe('memento_expiry_reminder');
    expect(batch?.entries.map((e) => e.id)).toEqual(['rca']);
  });

  it('nothing goes when nothing is due, however close the dates', () => {
    expect(reminderBatch([at('rca', 8, [30]), at('itp', 9, [30])], today)).toBeNull();
  });
});

describe('the next reminder, for the line under an entry', () => {
  it('is the next of the reminder days still ahead', () => {
    expect(nextReminderDay('2026-12-31', '2026-10-16')).toBe('2026-12-01');
    expect(nextReminderDay('2026-10-20', '2026-10-16')).toBe('2026-10-19');
    expect(nextReminderDay('2026-10-16', '2026-10-16')).toBe('2026-10-16');
    expect(nextReminderDay('2026-10-15', '2026-10-16')).toBeNull();
  });

  it('reads days as typed', () => {
    expect(parseReminderDays('7, 30 1;0 30')).toEqual([30, 7, 1, 0]);
    expect(parseReminderDays('')).toEqual([]);
    expect(parseReminderDays('400')).toBeNull();
    expect(parseReminderDays('o săptămână')).toBeNull();
  });
});

describe('the fleet view', () => {
  const today = '2026-10-16';
  const fleet = [
    { plate: 'TM10AAA', entries: [{ validUntil: '2027-05-01' }] },
    { plate: 'B20BBB', entries: [{ validUntil: '2026-11-10' }, { validUntil: '2027-01-01' }] },
    { plate: 'CJ30CCC', entries: [{ validUntil: '2026-10-01' }] },
    { plate: 'AR40DDD', entries: [] },
  ];

  it('„expiră în 30 de zile" keeps a date between today and a month out', () => {
    expect(fleetView(fleet, '30', 'urgenta', today).map((v) => v.plate)).toEqual(['B20BBB']);
  });

  it('„expirate" keeps a date already past', () => {
    expect(fleetView(fleet, 'expirate', 'urgenta', today).map((v) => v.plate)).toEqual(['CJ30CCC']);
  });

  it('sorts by the nearest date, vehicles without dates last', () => {
    expect(fleetView(fleet, 'toate', 'urgenta', today).map((v) => v.plate)).toEqual([
      'CJ30CCC',
      'B20BBB',
      'TM10AAA',
      'AR40DDD',
    ]);
  });

  it('or by plate', () => {
    expect(fleetView(fleet, 'toate', 'numar', today).map((v) => v.plate)).toEqual([
      'AR40DDD',
      'B20BBB',
      'CJ30CCC',
      'TM10AAA',
    ]);
  });

  it('reads an unknown filter as all', () => {
    expect(readFleetFilter('altceva')).toBe('toate');
    expect(readFleetFilter('30')).toBe('30');
  });
});

describe('the one conversion line', () => {
  it('asks a person if they need a car moved', () => {
    expect(conversionLine('personal', [], false)).toBe('cerere');
  });

  it('tells a firm with vans or car transporters about requests', () => {
    expect(conversionLine('firma', ['autoturism', 'duba'], false)).toBe('transport');
    expect(conversionLine('firma', ['transportor'], false)).toBe('transport');
  });

  it('and says nothing to a firm with cars only, or to a carrier already here', () => {
    expect(conversionLine('firma', ['autoturism', null], false)).toBeNull();
    expect(conversionLine('firma', ['transportor'], true)).toBeNull();
  });
});

describe('CSV import', () => {
  it('reads the Romanian Excel shape: semicolons, dotted dates', () => {
    const result = parseMementoCsv('Număr;Marcă;Model;RCA;ITP;Rovinietă\nB 123 ABC;Dacia;Logan;15.03.2027;1.6.2027;\n');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { line: 2, plate: 'B123ABC', make: 'Dacia', model: 'Logan', dates: { rca: '2027-03-15', itp: '2027-06-01' } },
    ]);
  });

  it('and the comma shape, with quotes and ISO dates', () => {
    const result = parseMementoCsv('numar,model,casco\r\n"CJ45XYZ","Transit, lung",2027-02-10\r\n');
    expect(result.rows[0]).toMatchObject({ plate: 'CJ45XYZ', model: 'Transit, lung', dates: { casco: '2027-02-10' } });
  });

  it('names every bad line, with what is wrong on it', () => {
    const result = parseMementoCsv(
      ['numar;rca;itp', 'B1ABC;15.03.2027;', ';15.03.2027;', 'X;;', 'B3ABC;31.02.2027;', 'b1abc;;01.01.2027'].join('\n'),
    );
    expect(result.rows.map((r) => r.plate)).toEqual(['B1ABC']);
    expect(result.errors).toEqual([
      { line: 3, message: 'Rândul 3: lipsește numărul de înmatriculare.' },
      { line: 4, message: 'Rândul 4: numărul „X" nu pare corect.' },
      { line: 5, message: 'Rândul 5: data „31.02.2027" pentru RCA nu este o dată (scrie-o ca 15.03.2027).' },
      { line: 6, message: 'Rândul 6: numărul B1ABC apare deja pe rândul 2.' },
    ]);
  });

  it('wants a plate column, and says which one', () => {
    const result = parseMementoCsv('marca;rca\nDacia;15.03.2027');
    expect(result.errors[0]?.message).toContain('numărul de înmatriculare');
  });

  it('says which columns it does not use, rather than dropping them quietly', () => {
    expect(parseMementoCsv('numar;sofer;rca\nB1ABC;Ion;').ignored).toEqual(['sofer']);
  });

  it('skips empty lines, including the ones Excel leaves full of separators', () => {
    expect(parseMementoCsv('numar;rca\n\nB1ABC;\n;;\n').rows).toHaveLength(1);
  });

  it('refuses a file over the maximum, and a file with nothing in it', () => {
    const many = ['numar', ...Array.from({ length: 4 }, (_, i) => `B${i}ABC`)].join('\n');
    expect(parseMementoCsv(many, 3).errors[0]?.message).toBe(
      'Fișierul are mai mult de 3 rânduri. Împarte-l și importă-l pe bucăți.',
    );
    expect(parseMementoCsv('numar;rca\n').errors[0]?.message).toContain('fără niciun vehicul');
    expect(parseMementoCsv('').errors[0]?.message).toBe('Fișierul este gol.');
  });

  it('reads dates the ways people write them, and only real ones', () => {
    expect(readCsvDate('05/03/2027')).toBe('2027-03-05');
    expect(readCsvDate('5-3-2027')).toBe('2027-03-05');
    expect(readCsvDate('2027-03-05')).toBe('2027-03-05');
    expect(readCsvDate('29.02.2027')).toBeNull();
    expect(readCsvDate('martie 2027')).toBeNull();
  });

  it('splits on the separator only outside quotes', () => {
    expect(splitCsvLine('"a;b";c;"d ""e"""', ';')).toEqual(['a;b', 'c', 'd "e"']);
  });
});
