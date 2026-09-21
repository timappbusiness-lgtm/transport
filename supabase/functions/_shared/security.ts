/**
 * Ce împart toate funcțiile edge: originea permisă și comparația de
 * secret.
 *
 * Două constatări din `docs/12-audit-securitate.md`:
 *
 * **M3.** Cele trei funcții chemate din browser aveau
 * `Deno.env.get("ALLOWED_ORIGIN") ?? "*"`, iar `ALLOWED_ORIGIN` nu era
 * pus nicăieri — nici în `scripts/ci/`, nici în workflow-uri. Deci în
 * producție rulau cu `*`. Nu este o scurgere directă, dar orice site
 * terț putea chema funcțiile cu un token pe care îl avea deja și putea
 * consuma bugetul de extragere al utilizatorului.
 *
 * **S1.** Secretul de cron se compara cu `!==`, care iese la primul
 * octet diferit. Peste HTTP, cu jitter de rețea, atacul de temporizare
 * este teoretic — dar comparația constantă costă trei linii, iar
 * „teoretic" se schimbă când cineva mută funcția în altă parte.
 */

/**
 * Originile permise, din `ALLOWED_ORIGIN` (una sau mai multe, separate
 * prin virgulă).
 *
 * Fără variabilă nu se cade înapoi pe `*`. Se cade înapoi pe
 * `SITE_URL`, iar dacă nici ea nu există, pe nimic — o funcție care
 * refuză cererile din browser este o problemă care se vede și se
 * repară, spre deosebire de un `*` care nu se vede niciodată.
 */
export function allowedOrigins(configured: string | undefined): string[] {
  return (configured ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin !== "");
}

/**
 * Aceeași listă, citită din mediu. Separată de funcția de deasupra ca
 * testele să nu aibă nevoie de drept pe variabilele de mediu — și ca
 * regula să se poată verifica fără să existe un mediu deloc.
 */
export function allowedOriginsFromEnv(): string[] {
  return allowedOrigins(Deno.env.get("ALLOWED_ORIGIN") ?? Deno.env.get("SITE_URL"));
}

/**
 * Antetele CORS pentru cererea asta.
 *
 * Originea se întoarce numai dacă este pe listă. Altfel lipsește, iar
 * browserul oprește răspunsul — ceea ce este exact ce vrem.
 */
export function corsHeaders(req: Request, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Răspunsul depinde de Origin, deci nu se pune într-un cache comun.
    Vary: "Origin",
  };

  const origin = (req.headers.get("Origin") ?? "").replace(/\/$/, "");
  if (origin !== "" && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (allowed.length > 0) {
    headers["Access-Control-Allow-Origin"] = allowed[0]!;
  }

  return headers;
}

/** Ce folosesc funcțiile: aceleași antete, cu lista luată din mediu. */
export function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, allowedOriginsFromEnv());
}

/**
 * Compară două secrete fără să spună, prin durată, cât de departe a
 * ajuns potrivirea.
 *
 * Lungimile diferite ies devreme — asta scurge lungimea, care nu este
 * un secret. Restul se parcurge întreg, indiferent unde apare prima
 * diferență.
 */
export function secretsMatch(given: string | null, expected: string | null): boolean {
  if (given === null || expected === null) return false;
  if (given.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < given.length; i += 1) {
    difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}
