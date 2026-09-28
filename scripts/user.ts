/**
 * Students can sign up at /registreren, but there is no email, so the admin creates or resets accounts here:
 *   npm run user -- add <email> [naam]   create an account with a temporary password
 *   npm run user -- reset <email>        new temporary password, signs out all devices
 * Reads DATABASE_URL and BETTER_AUTH_SECRET from .env (or .env.local).
 */
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

const [cmd, rawEmail, ...nameParts] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

async function main() {
  if (!email || (cmd !== "add" && cmd !== "reset")) {
    console.error("Gebruik: npm run user -- add <email> [naam] | reset <email>");
    process.exit(1);
  }
  const ctx = await auth().$context;
  const password = randomBytes(9).toString("base64url");
  const hash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findUserByEmail(email);

  if (cmd === "add") {
    if (existing) throw new Error(`${email} bestaat al. Gebruik 'reset'.`);
    const user = await ctx.internalAdapter.createUser({ email, name: nameParts.join(" ") || email.split("@")[0], emailVerified: true }, { method: "admin" });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
    console.log(`Account aangemaakt voor ${email}`);
  } else {
    if (!existing) throw new Error(`${email} bestaat niet.`);
    await ctx.internalAdapter.updatePassword(existing.user.id, hash);
    await ctx.internalAdapter.deleteUserSessions(existing.user.id);
    console.log(`Wachtwoord gereset voor ${email}, alle sessies uitgelogd`);
  }
  console.log(`Tijdelijk wachtwoord: ${password}`);
  console.log("Laat de student dit na inloggen wijzigen via 'Wachtwoord' rechtsboven.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => pool().end());
