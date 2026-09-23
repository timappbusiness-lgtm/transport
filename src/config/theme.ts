/**
 * The one colour TypeScript has to know as a value rather than a class.
 *
 * `viewport.themeColor` is metadata the browser reads before any CSS has
 * loaded, so it cannot say `var(--color-foreground)`. It says the hex, and
 * `tests/unit/token-usage.test.ts` fails if this and `globals.css` ever
 * disagree — which is the only way a second copy of a token stays honest.
 *
 * Every other colour in `src/` is a Tailwind class naming a token.
 */
export const THEME_COLOR = '#1c262b';
