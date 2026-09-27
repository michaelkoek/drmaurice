# DrMauriceCards

Flashcard app for a Dutch medical student. Lecture `.pptx` + learning goals (`.pages`/`.docx`/`.txt`) → AI flashcards weighted toward the learning goals, grouped per exam and subject, practiced with a mountain-climb progress metaphor. UI language: **Dutch**. See README.md for setup and deploy.

## Stack
Next.js 16 App Router (note: `proxy.ts`, not `middleware.ts`), React 19, Tailwind v4 (tokens in `app/globals.css`, use `bg-surface`, `text-muted`, `border-line` etc., never raw hex in components), Supabase Auth (email + password, invite-only) + Postgres with RLS, OpenAI Responses API with strict JSON schema, hosted on Vercel.

## Rules that matter
- **Never add knowledge to cards.** The prompt forbids facts not in the slides; missing answers become cards with `a: null` and a `gap`. Keep it that way; the student can fill gaps with own cards.
- The OpenAI key is server-only. Every API route calls `requireUser()` first.
- All generated/user HTML goes through `clean()` (DOMPurify allowlist) before `dangerouslySetInnerHTML`.
- Files are parsed client-side; only text + ≤8 downscaled images (JPEG ≤1280px) are sent, to stay under Vercel's 4.5 MB body limit.
- Subject colors `--s0..--s5` are validated for colour-vision deficiency in that order; max 6 subjects per exam.
- Data access goes through `lib/backend.ts`. `NEXT_PUBLIC_E2E=1` swaps in an in-memory backend and skips the auth proxy — **test builds only, never set it in Vercel**.

## Data model (supabase/migrations/001_init.sql)
exams → subjects → lessons (goals/cards/findings as jsonb) → own_cards (may `replaces` a generated card id) ; progress per (user, lesson): mastered ids + first-try results. "Score" = share correct on first attempt.

## Commands
`npm run dev` · `npm run verify` (typecheck + vitest + build)
