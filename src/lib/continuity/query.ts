/**
 * A link to the same list with one parameter changed and every other one
 * kept. Paging that wrote `?pagina=2` from scratch dropped the filters the
 * page was showing, so page two of „nota 1, firma X" was page two of
 * everything.
 */
export function withParam(
  path: string,
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
  key: string,
  value: string | null,
): string {
  const query = new URLSearchParams();
  for (const [name, raw] of Object.entries(params)) {
    if (name === key || raw === undefined) continue;
    for (const item of typeof raw === 'string' ? [raw] : raw) {
      if (item !== '') query.append(name, item);
    }
  }
  if (value !== null && value !== '') query.set(key, value);
  const text = query.toString();
  return text === '' ? path : `${path}?${text}`;
}
