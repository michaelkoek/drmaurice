/**
 * Password rules, shared by the forms (live checklist) and the Better Auth hook
 * (lib/auth.ts), so the server enforces exactly what the student sees.
 * Leaked passwords are rejected separately on the server (haveIBeenPwned plugin).
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export type PasswordRule = { id: string; label: string; ok: boolean };

export function passwordRules(pw: string, email = ""): PasswordRule[] {
  const name = email.split("@")[0].toLowerCase();
  return [
    { id: "length", label: `Minstens ${PASSWORD_MIN} tekens`, ok: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX },
    { id: "lower", label: "Een kleine letter", ok: /\p{Ll}/u.test(pw) },
    { id: "upper", label: "Een hoofdletter", ok: /\p{Lu}/u.test(pw) },
    { id: "digit", label: "Een cijfer", ok: /\d/.test(pw) },
    { id: "symbol", label: "Een leesteken of symbool (bv. ! ? # -)", ok: /[^\p{L}\d\s]/u.test(pw) },
    { id: "email", label: "Niet je e-mailnaam", ok: name.length < 3 || !pw.toLowerCase().includes(name) },
  ];
}

/** First unmet rule as an error message, or null when the password is acceptable. */
export function passwordError(pw: string, email = ""): string | null {
  if (pw.length > PASSWORD_MAX) return `Gebruik hoogstens ${PASSWORD_MAX} tekens.`;
  const miss = passwordRules(pw, email).find((r) => !r.ok);
  return miss ? `Wachtwoord voldoet niet: ${miss.label.toLowerCase()}.` : null;
}
