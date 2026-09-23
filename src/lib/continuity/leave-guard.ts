/**
 * Asking before somebody leaves with changes nobody saved.
 *
 * Asked once. A person who has said „yes, leave" has decided, and asking
 * again on the next link is a form arguing with them. Never after a save:
 * a guard still up after the data is safe blocks the navigation the save
 * was for.
 *
 * Forms that autosave a draft do not need this — leaving them loses
 * nothing — so it is for the ones that do not: profile tabs and settings,
 * where a half-edited value is not a draft but a change.
 */

export interface LeaveState {
  /** Something differs from what was last saved. */
  dirty: boolean;
  /** The person already said yes once on this page. */
  confirmed: boolean;
}

/** Whether leaving now should ask. */
export function shouldAskBeforeLeaving(state: LeaveState): boolean {
  return state.dirty && !state.confirmed;
}

/** The parts of a click that decide whether it navigates this page away. */
export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** The parts of an anchor that decide where a click goes. */
export interface AnchorLike {
  href: string;
  target: string;
  hasDownload: boolean;
}

/**
 * True when a click on this anchor would take the current tab to another
 * page of this site — the one case the guard has to ask about. A new tab,
 * a download, a modified click, another site (the browser asks there
 * itself, through `beforeunload`) and a jump within the same page do not.
 */
export function leavesThisPage(click: ClickLike, anchor: AnchorLike, current: URL): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.hasDownload) return false;
  if (anchor.target !== '' && anchor.target !== '_self') return false;

  let destination: URL;
  try {
    destination = new URL(anchor.href, current);
  } catch {
    return false;
  }
  if (destination.origin !== current.origin) return false;
  // Only the fragment differs: the page stays.
  return destination.pathname !== current.pathname || destination.search !== current.search;
}
