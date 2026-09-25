/**
 * The two colours TypeScript has to know as values rather than classes.
 *
 * `viewport.themeColor` and the web manifest are read by the browser
 * before any CSS has loaded, so they cannot say `var(--color-foreground)`.
 * They say the hex, and `tests/unit/token-usage.test.ts` fails if these
 * and `globals.css` ever disagree — which is the only way a second copy
 * of a token stays honest.
 *
 * Every other colour in `src/` is a Tailwind class naming a token.
 */
export const THEME_COLOR = '#1c262b';

/** The ground behind an installed app while it starts: `--color-background`. */
export const BACKGROUND_COLOR = '#f6f7f7';
