// The part of fontkit the brand generator uses. The package ships no
// types, and this is four members, so a declaration beats a dependency.
declare module 'fontkit' {
  interface Path {
    toSVG(): string;
  }
  interface Glyph {
    path: Path;
    advanceWidth: number;
  }
  interface GlyphPosition {
    xAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  interface GlyphRun {
    glyphs: Glyph[];
    positions: GlyphPosition[];
  }
  export interface Font {
    unitsPerEm: number;
    capHeight: number;
    layout(text: string): GlyphRun;
  }
  export function openSync(path: string): Font;
}
