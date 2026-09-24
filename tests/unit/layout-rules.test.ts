import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The layout rules in CLAUDE.md that can be read from the source.
 *
 * The browser sweep (`tests/e2e/aspect-asezare.spec.ts`) sees what a
 * screen does with the data it has; these see every file, including the
 * screens a sweep without a session never reaches.
 */

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, ext));
    else if (ext.test(name)) out.push(path);
  }
  return out;
}

const TSX = files('src', /\.tsx$/);

describe('wide content scrolls inside its own container', () => {
  it('every table sits in a wrapper that scrolls sideways', () => {
    const bare: string[] = [];
    for (const file of TSX) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!/<table[\s>]/.test(line)) return;
        // The wrapper is the nearest element opened above the table.
        const above = lines.slice(Math.max(0, index - 4), index).join('\n');
        if (!/overflow-x-auto/.test(above)) bare.push(`${file}:${index + 1}`);
      });
    }
    // The rate and verification tables were `overflow-hidden`: at tablet
    // width the last column was cut off rather than scrolled to.
    expect(bare).toEqual([]);
  });
});

describe('hover is for pointers that hover', () => {
  it('every hand-written :hover in a stylesheet is inside @media (hover: hover)', () => {
    const loose: string[] = [];
    for (const file of files('src', /\.css$/)) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // Walk the blocks, remembering which at-rules enclose each point.
      const stack: string[] = [];
      let prelude = '';
      for (const char of css) {
        if (char === '{') {
          stack.push(prelude.trim());
          if (/:hover/.test(prelude) && !stack.some((p) => /@media\s*\(hover:\s*hover\)/.test(p))) {
            loose.push(`${file}: ${prelude.trim().replace(/\s+/g, ' ').slice(0, 80)}`);
          }
          prelude = '';
        } else if (char === '}') {
          stack.pop();
          prelude = '';
        } else if (char === ';') {
          prelude = '';
        } else {
          prelude += char;
        }
      }
    }
    // A phone keeps :hover on the last thing tapped; a field or a link
    // stayed in its hover colour until the next tap somewhere else.
    expect(loose).toEqual([]);
  });
});

describe('a bottom bar never covers what it belongs to', () => {
  it('bars pinned to the bottom inside the account stop above the phone menu', () => {
    for (const file of ['src/components/firma/save-bar.tsx', 'src/components/messages/composer.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain('bottom-[var(--bottom-bar,0px)]');
      expect(source, file).not.toMatch(/sticky bottom-0/);
    }
    // The account layout says how tall the menu is, below lg only.
    const layout = readFileSync('src/app/cont/layout.tsx', 'utf8');
    expect(layout).toMatch(/\[--bottom-bar:calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
    expect(layout).toMatch(/lg:\[--bottom-bar:0px\]/);
  });

  it('the toast clears the phone menu and its safe area', () => {
    const toast = readFileSync('src/components/ui/toast.tsx', 'utf8');
    expect(toast).toContain('bottom-[calc(5rem+env(safe-area-inset-bottom))]');
  });

  it('a page with a bottom bar keeps focused fields clear of it', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    for (const marker of ['data-action-bar', 'data-save-bar', 'data-bottom-nav', 'data-composer']) {
      expect(css, marker).toMatch(new RegExp(`html:has\\(\\[${marker}\\]\\)[^{]*\\{\\s*scroll-padding-bottom`));
    }
    // The message box grows with its images and says how tall it is.
    const composer = readFileSync('src/components/messages/composer.tsx', 'utf8');
    expect(composer).toContain('data-composer');
    expect(composer).toContain("setProperty('--composer-height'");
    expect(css).toContain('var(--composer-height');
  });

  it('the end of the page, footer included, clears the phone menu', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(/body:has\(\[data-bottom-nav\]\)\s*\{\s*padding-bottom:\s*calc\(3\.5rem \+ env\(safe-area-inset-bottom\)\)/);
  });

  it('the account sidebar is no taller than the screen and scrolls inside', () => {
    const layout = readFileSync('src/app/cont/layout.tsx', 'utf8');
    expect(layout).toContain('sticky top-24 flex max-h-[calc(100dvh-7.5rem)] flex-col');
    const sidebar = readFileSync('src/components/app/sidebar.tsx', 'utf8');
    expect(sidebar).toContain('flex h-full min-h-0 flex-col');
    expect(sidebar).toMatch(/min-h-0 flex-1 flex-col gap-5 overflow-y-auto/);
  });

  it('one id per target: the account skip link goes past the menu', () => {
    const root = readFileSync('src/app/layout.tsx', 'utf8');
    const account = readFileSync('src/app/cont/layout.tsx', 'utf8');
    const skip = readFileSync('src/components/app/top-bar.tsx', 'utf8');
    expect(root).toContain('<main id="continut">');
    expect(account).not.toMatch(/id="continut"/);
    expect(account).toContain('id="continut-cont"');
    expect(skip).toContain('href="#continut-cont"');
  });
});

describe('sheets and menus', () => {
  it('the phone sheet locks the page behind it and scrolls inside itself', () => {
    const sheet = readFileSync('src/components/app/mobile-nav.tsx', 'utf8');
    expect(sheet).toContain('lockScroll(document.documentElement');
    expect(sheet).toMatch(/max-h-\[85dvh\][^"]*overflow-y-auto/);
  });

  it('the header menus have a height limit and scroll inside themselves', () => {
    const header = readFileSync('src/components/layout/header-menu.tsx', 'utf8');
    const limited = header.match(/max-h-\[calc\(100dvh-5\.5rem\)\]/g) ?? [];
    expect(limited.length).toBeGreaterThanOrEqual(2);
  });
});
