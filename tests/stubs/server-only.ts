/**
 * `server-only` exists to throw at build time when a client component
 * imports a server module. Under Vitest there is no such boundary — the
 * package resolves to its browser entry, which throws on import and takes
 * the whole test file with it.
 *
 * Aliasing it away here is not weakening the guard: the guard is enforced
 * by the bundler, which is where it belongs, and `pnpm build` is what
 * catches a real violation. This only stops a Node test runner from
 * tripping over a check that was never aimed at it.
 */
export {};
