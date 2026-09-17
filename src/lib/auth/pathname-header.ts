/**
 * Layouts do not receive the request path, so the middleware forwards it on
 * this header. Without it, a redirect raised from a layout can only guess
 * where the user was going and sends them somewhere else after sign-in.
 *
 * Its own module so that reading it from a server component does not pull
 * the middleware — and `next/server` with it — into every page.
 */
export const PATHNAME_HEADER = 'x-coridor-pathname';
