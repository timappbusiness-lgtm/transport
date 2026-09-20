// =====================================================================
// Sending, and deciding whether a failure is worth repeating
//
// Separate from `index.ts` because that file calls `Deno.serve` at the
// top level: a test importing it would bind a port. Everything here is a
// pure function over a response, so the tests inject a fetch and never
// touch the network.
// =====================================================================

export interface SendResult {
  ok: boolean;
  error?: string;
  /** The provider's id for the message, kept so a bounce can be traced back. */
  providerId?: string;
  /**
   * True when the provider says this address will never work.
   *
   * Different from `permanent`, which is about this attempt. A hard
   * bounce is about the address: retrying is pointless, and so is every
   * other message queued for it, so the whole address is flagged once
   * rather than each row failing on its own five times.
   */
  hardBounce?: boolean;
  /**
   * True when trying again cannot help.
   *
   * The distinction matters: a 500 is a provider having a bad minute and
   * deserves the four remaining attempts; a 422 for a malformed address
   * will be a 422 every time, and four more tries only delay the moment a
   * person looks at it.
   */
  permanent?: boolean;
}

export interface MailerConfig {
  apiKey: string;
  /** The address the mail comes from, already in whatever shape Resend wants. */
  from: string;
  /**
   * The display name in front of it.
   *
   * Separate from `from` so the address can be a plain one in the
   * environment and the name can change without anybody editing a
   * variable that also has to parse as an address.
   */
  senderName?: string | undefined;
  /** Where a reply goes, when that is not the sending address. */
  replyTo?: string | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * The sender, as Resend wants it.
 *
 * A display name containing a comma, a quote or a bracket breaks the
 * header it lands in, so it is quoted and the two characters that could
 * escape the quotes are dropped. A name is a courtesy; a malformed From
 * header is a message nobody receives.
 */
export function formatSender(from: string, senderName?: string | undefined): string {
  const name = (senderName ?? '').replace(/["\\]/g, '').trim();
  if (name === '') return from;
  return `"${name}" <${from}>`;
}

/**
 * Whether the provider is telling us the address itself is dead.
 *
 * Resend answers a malformed or blocked recipient with 422 and a
 * `validation_error`, and a suppressed one with 403. Both mean: stop.
 * Anything else in the 4xx range is about this request rather than about
 * the person, so it fails the row without condemning the address.
 */
export function isHardBounce(status: number, body: string): boolean {
  if (status === 403) return true;
  if (status !== 422) return false;
  return /invalid|not.?valid|does not exist|suppress|bounce|undeliverable/i.test(body);
}

/** Whether a status code is worth another attempt. */
export function isPermanent(status: number): boolean {
  // 429 is the exception inside the 4xx range: it means "not now", which
  // is exactly what a retry is for.
  return status >= 400 && status < 500 && status !== 429;
}

export async function sendEmail(
  config: MailerConfig,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<SendResult> {
  const doFetch = config.fetchImpl ?? fetch;

  const body: Record<string, unknown> = {
    from: formatSender(config.from, config.senderName),
    to: [to],
    subject,
    html,
    text,
  };
  if (config.replyTo !== undefined && config.replyTo.trim() !== "") {
    body.reply_to = config.replyTo.trim();
  }

  let response: Response;
  try {
    response = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // A network error is always worth repeating.
    return {
      ok: false,
      error: `rețea: ${error instanceof Error ? error.message : "necunoscut"}`,
    };
  }

  // The body is read either way now: on success it carries the id that
  // makes a later bounce traceable, and on failure the sentence that says
  // whether the address is worth trying again.
  const raw = await response.text().catch(() => "");

  if (response.ok) {
    let providerId: string | undefined;
    try {
      const parsed = JSON.parse(raw) as { id?: unknown };
      if (typeof parsed.id === "string" && parsed.id !== "") providerId = parsed.id;
    } catch {
      // A 200 with a body we cannot read is still a send. The id is a
      // convenience for support, not a condition of success.
    }
    return { ok: true, ...(providerId === undefined ? {} : { providerId }) };
  }

  const hardBounce = isHardBounce(response.status, raw);
  return {
    ok: false,
    error: `provider a răspuns ${response.status}${raw === "" ? "" : `: ${raw.slice(0, 200)}`}`,
    permanent: hardBounce || isPermanent(response.status),
    ...(hardBounce ? { hardBounce: true } : {}),
  };
}

/** What a row needs on top of its payload to render. */
export function renderValues(
  payload: Record<string, unknown>,
  siteUrl: string,
): Record<string, unknown> {
  // `site_url` first so a payload that carries its own wins — a producer
  // that knows better than the environment is rare but should not be
  // overridden by it.
  return { site_url: siteUrl, ...payload };
}
