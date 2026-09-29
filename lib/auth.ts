import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned } from "better-auth/plugins";
import { headers } from "next/headers";
import { pool } from "./db";
import { PASSWORD_MAX, PASSWORD_MIN, passwordError } from "./password";

/** Emails that may sign up (SIGNUP_ALLOWED_EMAILS, comma-separated). Unset or empty = sign-up closed. */
function signupAllowed(email: string) {
  const list = (process.env.SIGNUP_ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

function createAuth() {
  return betterAuth({
    database: pool(),
    baseURL: process.env.BETTER_AUTH_URL,
    // Vercel serves one deployment under several hosts (production domain, branch URL, deployment URL);
    // trust all of them, not only BETTER_AUTH_URL
    trustedOrigins: [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
      .filter(Boolean)
      .map((host) => `https://${host}`),
    // sign-up at /registreren, only for SIGNUP_ALLOWED_EMAILS; the admin can still create accounts with `npm run user -- add`
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN, maxPasswordLength: PASSWORD_MAX },
    hooks: {
      // same rules as the forms show (lib/password.ts); never trust the client
      before: createAuthMiddleware(async (ctx) => {
        let pw: unknown, email = "";
        if (ctx.path === "/sign-up/email") {
          pw = ctx.body?.password;
          email = String(ctx.body?.email ?? "");
          if (!signupAllowed(email)) throw new APIError("FORBIDDEN", { message: "Dit e-mailadres mag geen account aanmaken.", code: "SIGNUP_NOT_ALLOWED" });
        } else if (ctx.path === "/change-password") {
          pw = ctx.body?.newPassword;
          email = (await getSessionFromCtx(ctx))?.user.email ?? "";
        } else return;
        const msg = passwordError(typeof pw === "string" ? pw : "", email);
        if (msg) throw new APIError("BAD_REQUEST", { message: msg, code: "WEAK_PASSWORD" });
      }),
    },
    plugins: [
      haveIBeenPwned({ customPasswordCompromisedMessage: "Dit wachtwoord komt voor in bekende datalekken. Kies een ander." }),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | null = null;
export function auth() {
  return (instance ??= createAuth());
}

export async function currentUser() {
  const session = await auth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
