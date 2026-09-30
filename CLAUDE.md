# DrMauriceCards

Flashcard app for a Dutch medical student. Lecture `.pptx` or `.pdf` and/or learning goals (`.pages`/`.docx`/`.txt` or typed) → AI flashcards (goals only → researched on trusted medical sites) weighted toward the learning goals, grouped per exam and subject, practiced with a mountain-climb progress metaphor. UI language: **Dutch**. See README.md for setup and deploy.

## Stack
Next.js 16 App Router (note: `proxy.ts`, not `middleware.ts`), React 19, Tailwind v4 (tokens in `app/globals.css`, use `bg-surface`, `text-muted`, `border-line` etc., never raw hex in components), Neon Postgres (`@neondatabase/serverless`) + Better Auth (email + password, sign-up at `/registreren` limited to `SIGNUP_ALLOWED_EMAILS`, no email so resets via `npm run user`), OpenAI Responses API with strict JSON schema, hosted on Vercel.

## Rules that matter
- **Never add knowledge to cards.** The prompt forbids facts not in the slides; missing answers become cards with `a: null` and a `gap`. Keep it that way; the student can fill gaps with own cards.
- **Goals-only lessons (no presentation)** are the one exception: `/api/generate` with `mode: "web"` uses OpenAI `web_search` restricted to `TRUSTED_DOMAINS` (`lib/prompts.ts`). Cards may only use pages found that way (not model memory) and cite the URL in `bron`; lessons get `source.web = true`. An uploaded presentation never triggers web search, not even for uncovered goals.
- The OpenAI key, `DATABASE_URL` and `BETTER_AUTH_SECRET` are server-only. Every API route calls `requireUser()` first.
- All generated/user HTML goes through `clean()` (DOMPurify allowlist) before `dangerouslySetInnerHTML`.
- Files are parsed client-side (PDF via pdf.js in `lib/pdf.ts`: each page is a slide, pages with a large image or no text are offered as whole-page images); only text + ≤8 downscaled images (JPEG ≤1280px) are sent, to stay under Vercel's 4.5 MB body limit.
- Subject colors `--s0..--s5` are validated for colour-vision deficiency in that order; max 6 subjects per exam.
- Password rules live in `lib/password.ts`, used by the forms (live checklist) and enforced server-side by the `hooks.before` in `lib/auth.ts`; leaked passwords are blocked by the `haveIBeenPwned` plugin. Change both together.
- Data access goes through `lib/backend.ts` → `app/api/data/route.ts`. No RLS: that route scopes every query to the session user and checks FK parents belong to them; new tables/columns must be added to its whitelist. `NEXT_PUBLIC_E2E=1` swaps in an in-memory backend and skips the auth proxy — **test builds only, never set it in Vercel**.

## Data model (db/migrations/001_init.sql)
exams → subjects → lessons (goals/cards/findings as jsonb) → own_cards (may `replaces` a generated card id) ; progress per (user, lesson): mastered ids + first-try results. "Score" = share correct on first attempt.

## Commands
`npm run dev` · `npm run verify` (typecheck + vitest + build) · `npm run db:migrate` · `npm run user -- add|reset <email>`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
