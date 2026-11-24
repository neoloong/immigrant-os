export interface Mailer {
  sendLoginCode(email: string, code: string): Promise<void>;
}

export type MailerEnv = {
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

const DEFAULT_FROM = "Immigrant OS <login@immigrantos.com>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function isDevRuntime(isDevOverride?: boolean): boolean {
  if (typeof isDevOverride === "boolean") return isDevOverride;
  return Boolean(import.meta.env?.DEV);
}

export function isMailerConfigured(env: MailerEnv, isDevOverride?: boolean): boolean {
  return Boolean(env.RESEND_API_KEY?.trim()) || isDevRuntime(isDevOverride);
}

export function createResendMailer(apiKey: string, from = DEFAULT_FROM): Mailer {
  return {
    async sendLoginCode(email: string, code: string): Promise<void> {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Your Immigrant OS sign-in code",
          text: [
            `Your Immigrant OS sign-in code is: ${code}`,
            "",
            "This code expires in 10 minutes and can only be used once.",
            "If you did not request this code, you can ignore this email.",
            "",
            "Immigrant OS · Invite-only beta · Not a law firm · No legal advice",
          ].join("\n"),
          html: [
            `<div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#17231f;line-height:1.6;max-width:480px;margin:0 auto;padding:24px">`,
            `<p style="font-weight:700;font-size:18px;margin:0 0 16px">Immigrant OS</p>`,
            `<p style="margin:0 0 12px">Use this 6-digit code to sign in:</p>`,
            `<p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:6px;background:#f8f9f6;border:1px solid #e2e7e2;border-radius:12px;padding:16px 20px;text-align:center;margin:0 0 16px">${code}</p>`,
            `<p style="color:#5d6b65;font-size:14px;margin:0 0 8px">This code expires in 10 minutes and can only be used once.</p>`,
            `<p style="color:#5d6b65;font-size:14px;margin:0 0 20px">If you did not request this code, you can ignore this email.</p>`,
            `<p style="color:#5d6b65;font-size:12px;border-top:1px solid #e2e7e2;padding-top:12px;margin:0">Immigrant OS · Invite-only beta · Not a law firm · No legal advice</p>`,
            `</div>`,
          ].join(""),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend delivery failed with status ${response.status}`);
      }
    },
  };
}

export function createDevMailer(isDevOverride?: boolean): Mailer {
  const dev = isDevRuntime(isDevOverride);
  return {
    async sendLoginCode(email: string, code: string): Promise<void> {
      if (!dev) {
        throw new Error("Email delivery is not configured.");
      }
      console.info(`[dev-mailer] Immigrant OS sign-in code for ${email}: ${code}`);
    },
  };
}

export function createMailer(env: MailerEnv, options?: { isDev?: boolean }): Mailer {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (apiKey) {
    return createResendMailer(apiKey, env.RESEND_FROM?.trim() || DEFAULT_FROM);
  }
  return createDevMailer(options?.isDev);
}

export async function sendLoginCode(email: string, code: string, env: MailerEnv = {}): Promise<void> {
  await createMailer(env).sendLoginCode(email, code);
}
