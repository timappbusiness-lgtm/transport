/**
 * The values of an ordinary form, read out and written back.
 *
 * Most forms here are uncontrolled: the browser holds what was typed, and
 * the action gets it as `FormData` on submit. To keep a draft of one, or
 * to know whether anything was changed, the values have to be read out of
 * the fields — and to restore a draft, written back into them. This is
 * that, against the few properties of a field it needs, so a unit test can
 * pass plain objects.
 *
 * Never read: files (they cannot be stored, and the upload keeps its own
 * copy), passwords (never stored anywhere but the password manager), and
 * hidden fields (they come from the page, not from the person — an id, a
 * token — and restoring an old one is the one way a draft could cause
 * harm).
 */

export type FieldValues = Record<string, string | string[]>;

export interface FieldLike {
  name: string;
  type: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
  options?: ArrayLike<{ value: string; selected: boolean }>;
}

const SKIPPED_TYPES = new Set(['file', 'password', 'hidden', 'submit', 'button', 'reset', 'image']);

function readable(field: FieldLike, exclude: ReadonlySet<string>): boolean {
  return field.name !== '' && !SKIPPED_TYPES.has(field.type) && !exclude.has(field.name);
}

export function readFields(
  fields: Iterable<FieldLike>,
  exclude: ReadonlySet<string> = new Set(),
): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    if (!readable(field, exclude)) continue;
    if (field.type === 'checkbox') {
      const list = Array.isArray(values[field.name]) ? (values[field.name] as string[]) : [];
      if (field.checked) list.push(field.value);
      values[field.name] = list;
    } else if (field.type === 'radio') {
      if (!(field.name in values)) values[field.name] = '';
      if (field.checked) values[field.name] = field.value;
    } else if (field.type === 'select-multiple' && field.options) {
      values[field.name] = Array.from(field.options)
        .filter((option) => option.selected)
        .map((option) => option.value);
    } else {
      values[field.name] = field.value;
    }
  }
  return values;
}

/** Writes values back; returns how many fields took one. */
export function writeFields(
  fields: Iterable<FieldLike>,
  values: FieldValues,
  exclude: ReadonlySet<string> = new Set(),
): number {
  let applied = 0;
  for (const field of fields) {
    if (!readable(field, exclude) || !(field.name in values)) continue;
    const value = values[field.name];
    if (field.type === 'checkbox') {
      if (!Array.isArray(value)) continue;
      field.checked = value.includes(field.value);
    } else if (field.type === 'radio') {
      if (typeof value !== 'string') continue;
      field.checked = field.value === value;
    } else if (field.type === 'select-multiple' && field.options) {
      if (!Array.isArray(value)) continue;
      for (const option of Array.from(field.options)) option.selected = value.includes(option.value);
    } else {
      if (typeof value !== 'string') continue;
      field.value = value;
    }
    applied += 1;
  }
  return applied;
}

/** Storage can hold anything; this is the only shape that comes back in. */
export function parseFieldValues(payload: unknown): FieldValues | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length > 300) return null;
  const values: FieldValues = {};
  for (const [name, value] of entries) {
    if (name.length > 100) return null;
    if (typeof value === 'string') {
      values[name] = value.slice(0, 10_000);
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      values[name] = (value as string[]).slice(0, 200);
    } else {
      return null;
    }
  }
  return values;
}

/** Order-insensitive comparison, so reading the same form twice is equal. */
export function sameFieldValues(a: FieldValues, b: FieldValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xs = Array.isArray(x) ? [...x].sort() : [];
      const ys = Array.isArray(y) ? [...y].sort() : [];
      if (xs.length !== ys.length || xs.some((v, i) => v !== ys[i])) return false;
    } else if ((x ?? '') !== (y ?? '')) {
      return false;
    }
  }
  return true;
}

/** The fields of a form element, as the helpers above see them. */
export function fieldsOf(form: HTMLFormElement): FieldLike[] {
  return Array.from(form.elements).filter(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement,
  ) as unknown as FieldLike[];
}
