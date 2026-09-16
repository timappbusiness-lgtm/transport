/** What a form's server action returns to useActionState. */
export type ActionState =
  | {
      ok: boolean;
      message?: string;
      /** Field name -> message, shown next to the field. */
      errors?: Record<string, string>;
    }
  | undefined;

export const initialActionState: ActionState = undefined;

/**
 * Database errors raised by our own triggers and RPCs are written in
 * Romanian for the user; show them as they are. Anything else (a network
 * failure, a Postgres internal) gets a generic sentence.
 */
export function messageFromError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error?.message) return 'A apărut o eroare. Încearcă din nou.';
  if (/[ăâîșțĂÂÎȘȚ]/.test(error.message) || error.code === '42501' || error.code === 'P0002' || error.code === '55000') {
    return error.message;
  }
  if (error.code === '23505') return 'Există deja o înregistrare cu aceste date.';
  return 'A apărut o eroare. Încearcă din nou.';
}
