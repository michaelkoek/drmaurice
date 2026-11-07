# DrMauriceCards

Flashcard app for a Dutch medical student. Lecture `.pptx` or `.pdf` and/or learning goals (`.pages`/`.docx`/`.txt` or typed) → AI flashcards (goals only → researched on trusted Dutch sites) weighted toward the learning goals, grouped per exam and subject, practiced with a mountain-climb progress metaphor. UI language: **Dutch**. See README.md for setup and deploy.

## Stack
Next.js 16 App Router (note: `proxy.ts`, not `middleware.ts`), React 19, Tailwind v4 (tokens in `app/globals.css`, use `bg-surface`, `text-muted`, `border-line` etc., never raw hex in components), Neon Postgres (`@neondatabase/serverless`) + Better Auth (email + password, open sign-up at `/registreren`, no email so resets via `npm run user`), Stripe Checkout (€5 one-time), OpenAI Responses API with strict JSON schema (model + effort per task in `TASKS`, `lib/openai.ts`; compare before switching with `npm run eval:models`), hosted on Vercel.

## Rules that matter
- **Never add knowledge to cards.** The prompt forbids facts not in the slides; missing answers become cards with `a: null` and a `gap`. Keep it that way; the student can fill gaps with own cards.
- **Goals-only lessons (no presentation)** are the one exception: `/api/generate` with `mode: "web"` uses OpenAI `web_search` restricted to `TRUSTED_DOMAINS` (`lib/prompts.ts`): **Dutch sites only**, with `PRIORITY_DOMAINS` (Hartstichting, EHBO Nederland, Rode Kruis) searched first and `FALLBACK_DOMAINS` only when those lack the topic. Cards may only use pages found that way (not model memory) and cite the URL in `bron`; research runs Luna first and redoes only weakly covered goals with Sol (`lib/research.ts`); lessons get `source.web = true`. An uploaded presentation never triggers web search, not even for uncovered goals.
- **Manual lessons** (`source.manual = true`, made via "Zelf kaarten maken" on the add-lesson page with `manualDraft()`) have no goals and no AI cards; they hold only own cards and never call OpenAI.
- The OpenAI key, `DATABASE_URL`, `BETTER_AUTH_SECRET` and Stripe keys are server-only. Every API route calls `requireUser()` first; routes that touch OpenAI or study data use `requirePaidUser()` (402 → client goes to `/betalen`). Only `/api/stripe/webhook` has no session (Stripe signature instead).
- **Paywall**: access = `user."paidAt"` set (Stripe webhook or `/betalen/gelukt` via `markPaid()` in `lib/stripe.ts`) or email in `FREE_ACCESS_EMAILS`/`ADMIN_EMAILS` (`hasAccess()` in `lib/access.ts`). `app/(app)/layout.tsx` redirects unpaid users to `/betalen`. `paidAt` has `input: false`; never let a client set it.
- **Feedback** goes to the `feedback` table via `/api/feedback`; admins read it on `/beheer`. Render it as plain text only.
- All generated/user HTML goes through `clean()` (DOMPurify allowlist) before `dangerouslySetInnerHTML`.
- Files are parsed client-side (PDF via pdf.js in `lib/pdf.ts`: each page is a slide, pages with a large image or no text are offered as whole-page images); only text + ≤8 downscaled images (JPEG ≤1280px) are sent, to stay under Vercel's 4.5 MB body limit.
- Subject colors `--s0..--s5` are validated for colour-vision deficiency in that order; max 6 subjects per exam.
- Password rules live in `lib/password.ts`, used by the forms (live checklist) and enforced server-side by the `hooks.before` in `lib/auth.ts`; leaked passwords are blocked by the `haveIBeenPwned` plugin. Change both together.
- Data access goes through `lib/backend.ts` → `app/api/data/route.ts`. No RLS: that route scopes every query to the session user and checks FK parents belong to them; new tables/columns must be added to its whitelist. `NEXT_PUBLIC_E2E=1` swaps in an in-memory backend and skips the auth proxy — **test builds only, never set it in Vercel**.

## Data model (db/migrations/)
exams → subjects → lessons (goals/cards/findings as jsonb) → own_cards (may `replaces` a generated card id) ; progress per (user, lesson): mastered ids + first-try results. "Score" = share correct on first attempt. 002 adds `user."paidAt"`, `payments` (unique Stripe session id) and `feedback`. Add new migrations as new numbered files; `db:migrate` tracks applied ones in `_migrations`.

## Commands
`npm run dev` · `npm run verify` (typecheck + vitest + build) · `npm run db:migrate` · `npm run user -- add|reset|grant <email>`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
