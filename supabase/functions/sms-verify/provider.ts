// =====================================================================
// The SMS provider, behind an interface
//
// One implementation today (Twilio), and the seam so the second one is a
// file rather than a rewrite. Romanian operators sell SMS through half a
// dozen aggregators and the choice is a commercial decision that has not
// been made — which is exactly why the code should not assume it has.
//
// Everything here is pure: `fetch` is injected, no `Deno.env`, so the
// tests run under `--no-prompt` and never touch the network.
// =====================================================================

export interface SmsResult {
  ok: boolean;
  /** The provider's id for the message, so an undelivered SMS can be traced. */
  providerId?: string;
  error?: string;
  /**
   * True when trying again cannot help.
   *
   * A 500 is the provider having a bad minute. A 400 for a number that is
   * not a mobile will be a 400 every time, and the person is better told
   * now than left waiting for an SMS that will never arrive.
   */
  permanent?: boolean;
}

export interface SmsProvider {
  /** Recorded on the challenge, so support knows where to look. */
  readonly name: string;
  send(to: string, message: string): Promise<SmsResult>;
}

/** What the caller has to set before any of this does anything. */
export interface ProviderSecrets {
  accountSid?: string | undefined;
  authToken?: string | undefined;
  /** A sending number in E.164, or a Messaging Service SID. One of the two. */
  fromNumber?: string | undefined;
  messagingServiceSid?: string | undefined;
}

/**
 * Which secret is missing, in the order somebody would set them.
 *
 * Returns null when the provider is configured. The name matters: „SMS
 * nu este configurat" sends somebody to read code, `TWILIO_AUTH_TOKEN`
 * sends them to the dashboard.
 */
export function missingSecret(secrets: ProviderSecrets): string | null {
  if (!secrets.accountSid) return "TWILIO_ACCOUNT_SID";
  if (!secrets.authToken) return "TWILIO_AUTH_TOKEN";
  if (!secrets.fromNumber && !secrets.messagingServiceSid) {
    return "TWILIO_FROM_NUMBER sau TWILIO_MESSAGING_SERVICE_SID";
  }
  return null;
}

/** Whether a status code is worth another attempt. */
export function isPermanent(status: number): boolean {
  // 429 is the exception inside the 4xx range: it means "not now", which
  // is what a retry is for.
  return status >= 400 && status < 500 && status !== 429;
}

/**
 * Twilio's Programmable Messaging, not Verify.
 *
 * Verify would own the code, its expiry and the attempt count, and this
 * platform has rules about all three that are enforced in Postgres and
 * tested there — `phone_verification_settings`. Handing them to a vendor
 * would mean two sets of limits, one of them unreadable from here, and
 * a change of provider would silently change how many guesses a stranger
 * gets at somebody's number.
 */
export function twilioProvider(
  secrets: ProviderSecrets,
  fetchImpl: typeof fetch = fetch,
): SmsProvider {
  return {
    name: "twilio",
    async send(to: string, message: string): Promise<SmsResult> {
      const body = new URLSearchParams({ To: to, Body: message });
      if (secrets.messagingServiceSid) {
        body.set("MessagingServiceSid", secrets.messagingServiceSid);
      } else {
        body.set("From", secrets.fromNumber!);
      }

      let response: Response;
      try {
        response = await fetchImpl(
          `https://api.twilio.com/2010-04-01/Accounts/${secrets.accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${secrets.accountSid}:${secrets.authToken}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
          },
        );
      } catch (error) {
        return {
          ok: false,
          error: `rețea: ${error instanceof Error ? error.message : "necunoscut"}`,
        };
      }

      const raw = await response.text().catch(() => "");

      if (response.ok) {
        let providerId: string | undefined;
        try {
          const parsed = JSON.parse(raw) as { sid?: unknown };
          if (typeof parsed.sid === "string" && parsed.sid !== "") providerId = parsed.sid;
        } catch {
          // A 2xx whose body we cannot read is still a send. The id is a
          // convenience for support, not a condition of success.
        }
        return { ok: true, ...(providerId === undefined ? {} : { providerId }) };
      }

      return {
        ok: false,
        error: `furnizorul a răspuns ${response.status}${raw === "" ? "" : `: ${raw.slice(0, 200)}`}`,
        permanent: isPermanent(response.status),
      };
    },
  };
}

/**
 * A code, and the message that carries it.
 *
 * Six digits from `crypto.getRandomValues`, never `Math.random`: the
 * code is the only thing standing between a stranger and somebody else's
 * verified number, and a predictable generator makes the whole flow
 * decorative. Leading zeros are kept — a five-digit code is a bug report
 * from somebody who typed what they were sent.
 */
export function generateCode(randomBytes: (n: number) => Uint8Array = defaultRandom): string {
  const bytes = randomBytes(4);
  const value = ((bytes[0]! << 24) >>> 0) + (bytes[1]! << 16) + (bytes[2]! << 8) + bytes[3]!;
  return String(value % 1_000_000).padStart(6, "0");
}

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** The SMS itself. Short, because an SMS is 160 characters and costs money. */
export function verificationMessage(code: string, brand: string): string {
  // One SMS, not two: ă and î make it a Unicode message, whose single
  // segment holds 70 characters rather than 160. With the platform's name
  // this is 68; the test measures it with the real name.
  return `${code} e codul ${brand}, valabil 10 minute. Nu îl da nimănui.`;
}

/** `sha256` hex of the code, which is all the database ever sees. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
