/**
 * The page behind a sheet or a dialog stays where it is.
 *
 * Without it, a thumb that drags on the dimmed backdrop of the „Mai mult"
 * sheet scrolled the account page underneath (390px, before) — the sheet
 * floated over a page that moved. Locking the root element's overflow is
 * the one thing every mobile browser honours.
 *
 * Locks nest: two layers open at once release the page only when the last
 * one closes, and the page gets back exactly the style it had.
 */

interface Lockable {
  style: { overflow: string; paddingRight: string };
  dataset: DOMStringMap;
}

export function lockScroll(root: Lockable, scrollbarWidth = 0): () => void {
  const depth = Number(root.dataset.scrollLocks ?? '0');
  if (depth === 0) {
    root.dataset.scrollLockOverflow = root.style.overflow;
    root.dataset.scrollLockPadding = root.style.paddingRight;
    root.style.overflow = 'hidden';
    // A desktop scrollbar that disappears would shift the page sideways.
    if (scrollbarWidth > 0) root.style.paddingRight = `${scrollbarWidth}px`;
  }
  root.dataset.scrollLocks = String(depth + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = Number(root.dataset.scrollLocks ?? '1') - 1;
    if (left > 0) {
      root.dataset.scrollLocks = String(left);
      return;
    }
    root.style.overflow = root.dataset.scrollLockOverflow ?? '';
    root.style.paddingRight = root.dataset.scrollLockPadding ?? '';
    delete root.dataset.scrollLocks;
    delete root.dataset.scrollLockOverflow;
    delete root.dataset.scrollLockPadding;
  };
}
