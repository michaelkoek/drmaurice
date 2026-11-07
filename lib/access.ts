/**
 * Who may use the app. Access = paid once (user.paidAt, set by the Stripe webhook)
 * or listed in FREE_ACCESS_EMAILS. ADMIN_EMAILS may open /beheer.
 * Server-side only in practice: these env vars are never exposed to the browser.
 */
type AccessUser = { email: string; paidAt?: Date | string | null };

function emails(name: string) {
  return (process.env[name] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
const listed = (name: string, email: string) => emails(name).includes(email.trim().toLowerCase());

export const hasFreeAccess = (email: string) => listed("FREE_ACCESS_EMAILS", email);
export const isAdmin = (user: { email: string } | null | undefined) => !!user && listed("ADMIN_EMAILS", user.email);
export const hasAccess = (user: AccessUser | null | undefined) => !!user && (!!user.paidAt || hasFreeAccess(user.email) || isAdmin(user));
