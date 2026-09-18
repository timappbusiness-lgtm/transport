// =====================================================================
// Rendering an e-mail, and refusing to send a broken one
//
// Templates are plain objects with a subject, an HTML body and a text
// body. No engine: the substitution is `{{ nume }}`, and anything more
// clever than that is a dependency and a class of injection bug for the
// sake of a loop nobody needs yet.
//
// The rule that matters is the refusal. A template rendered with a
// missing variable produces „Bună ziua, {{ nume }}" in somebody's inbox,
// which is worse than no e-mail at all: it is visibly broken, from a
// platform whose entire pitch is that it checks things carefully.
// `render` throws instead, the row is marked failed with the name of the
// missing variable, and it shows up on the admin screen.
// =====================================================================

export interface Template {
  /** What the subject line says. Substitutions allowed. */
  subject: string;
  /** The body, as the lines a person reads. Rendered to both HTML and text. */
  lines: string[];
  /** The one thing to do about it, if there is one. */
  action?: { label: string; href: string };
  /**
   * Whether a person may switch this off.
   *
   * False for suspension and security messages: somebody who cannot be
   * told their account stopped working cannot fix it, and an unsubscribe
   * link on that e-mail is an invitation to make the problem permanent.
   */
  unsubscribable: boolean;
}

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export class MissingVariable extends Error {
  constructor(public variable: string, public template: string) {
    super(`Variabila {{ ${variable} }} lipsește pentru șablonul ${template}`);
  }
}

/** Every `{{ name }}` in a string, in order, without duplicates. */
export function variablesIn(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1]!))];
}

/** Every variable a whole template needs. */
export function templateVariables(template: Template): string[] {
  const parts = [template.subject, ...template.lines];
  if (template.action) parts.push(template.action.label, template.action.href);
  return [...new Set(parts.flatMap(variablesIn))];
}

function substitute(text: string, values: Record<string, unknown>, name: string): string {
  return text.replace(VARIABLE, (_, variable: string) => {
    const value = values[variable];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new MissingVariable(variable, name);
    }
    return String(value);
  });
}

/** HTML-escapes, because a company name is somebody else's text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export interface RenderOptions {
  /** Where an unsubscribe link points, when the template allows one. */
  unsubscribeUrl?: string | undefined;
  brand?: string;
}

/**
 * One layout for every e-mail.
 *
 * Deliberately plain: a table-based responsive shell with inline styles,
 * because that is what survives Outlook, Gmail's clipping and a dark-mode
 * client. No images — a logo that does not load leaves a broken icon
 * where the sender's name should be, and half of Romanian business
 * e-mail is read with images off.
 */
export function render(
  name: string,
  template: Template,
  values: Record<string, unknown>,
  options: RenderOptions = {},
): Rendered {
  const brand = options.brand ?? 'Coridor';
  const subject = substitute(template.subject, values, name);
  const lines = template.lines.map((line) => substitute(line, values, name));
  const action = template.action
    ? {
      label: substitute(template.action.label, values, name),
      href: substitute(template.action.href, values, name),
    }
    : null;

  const canUnsubscribe = template.unsubscribable && options.unsubscribeUrl !== undefined;

  const htmlLines = lines
    .map((line) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(line)}</p>`)
    .join('\n      ');

  const htmlAction = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.href)}" ` +
      `style="display:inline-block;padding:12px 20px;border-radius:999px;` +
      `background:#1c262b;color:#ffffff;text-decoration:none;font-weight:500">` +
      `${escapeHtml(action.label)}</a></p>`
    : '';

  const htmlFooter = canUnsubscribe
    ? `<p style="margin:24px 0 0;font-size:13px;color:#5b6b73">` +
      `Nu mai vrei mesajele astea? ` +
      `<a href="${escapeHtml(options.unsubscribeUrl!)}" style="color:#5b6b73">` +
      `Schimbă-ți preferințele</a>.</p>`
    : '';

  const html = `<!doctype html>
<html lang="ro">
  <head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:24px;background:#f5f7f8;font-family:system-ui,-apple-system,sans-serif;color:#1c262b">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
      <p style="margin:0 0 24px;font-weight:600;font-size:17px">${escapeHtml(brand)}</p>
      ${htmlLines}
      ${htmlAction}
      ${htmlFooter}
    </div>
  </body>
</html>`;

  const textParts = [...lines];
  if (action) textParts.push('', `${action.label}: ${action.href}`);
  if (canUnsubscribe) {
    textParts.push('', `Nu mai vrei mesajele astea? ${options.unsubscribeUrl}`);
  }
  textParts.push('', brand);

  return { subject, html, text: textParts.join('\n') };
}
