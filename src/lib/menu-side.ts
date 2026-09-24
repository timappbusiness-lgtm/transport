/**
 * Which edge of its button a dropdown hangs from, so it opens on screen.
 *
 * The „Publică" menu hung from the button's right edge. On a phone the
 * page title takes the row and the button wraps under it, at the left
 * edge — and a 240px menu hanging from a button whose right edge is at
 * 140px opened 100px off the screen, its labels cut in half.
 *
 * Right when there is room to the left of the button's right edge, left
 * when there is room to the right of its left edge; left otherwise, where
 * at least the start of every label shows.
 */
export type MenuSide = 'left' | 'right';

export function menuSide(
  button: { left: number; right: number },
  viewportWidth: number,
  menuWidth: number,
  margin = 8,
): MenuSide {
  if (button.right - menuWidth >= margin) return 'right';
  if (button.left + menuWidth <= viewportWidth - margin) return 'left';
  return 'left';
}
