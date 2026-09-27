# DrMauriceCards

Flashcards uit colleges voor een geneeskundestudent. Upload de PowerPoint van een les en het document met lesdoelen; de AI maakt kaarten met de nadruk op de lesdoelen, zet de les bij het juiste vak en meldt wat er ontbreekt of elkaar tegenspreekt. Voortgang is een bergbeklimming naar de toets.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Supabase (Auth + Postgres met RLS) · OpenAI Responses API · Vercel.

## Hoe het werkt

1. **Toets & vakken.** De student maakt een toets (naam, datum, aantal vragen) met 1–6 vakken. Elk vak is een graat op de berg.
2. **Les toevoegen.** `.pptx` + lesdoelen (`.pages`, `.docx` of `.txt`) worden **in de browser** uitgelezen (`lib/parse.ts`). Er gaat alleen tekst en maximaal 8 verkleinde afbeeldingen naar de server.
3. **Twee AI-stappen** (`app/api/*`, sleutel alleen op de server):
   - `pick-images` kiest welke slide-afbeeldingen leerstof bevatten (schema's, tabellen).
   - `generate` schrijft de kaarten als JSON met een strikt schema en streamt de tekst terug zodat de pagina kan laten zien hoeveel kaarten er al zijn.
4. **Controleren.** De student ziet naam, voorgesteld vak (aanpasbaar), kaarten per lesdoel, gaten en tegenstrijdigheden, en slaat op.
5. **Oefenen.** Omdraaien, "Wist ik" / "Opnieuw", eigen kaarten toevoegen of een ontbrekend antwoord zelf invullen.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # vul de waarden in, zie hieronder
npm run dev
```

`npm run verify` draait typecheck, tests en een productie-build.

## Supabase instellen (eenmalig)

1. Maak een project op [supabase.com](https://supabase.com).
2. **SQL Editor** → plak en run `supabase/migrations/001_init.sql`.
3. **Authentication → Sign In / Providers → Email**: laat Email aan, zet **"Allow new users to sign up" uit** (alleen uitnodigingen).
4. **Authentication → URL Configuration**: zet *Site URL* op je Vercel-URL (bv. `https://drmauricecards.vercel.app`) en voeg bij *Redirect URLs* toe: `https://drmauricecards.vercel.app/**` en `http://localhost:3000/**`.
5. **Authentication → Email Templates**: vervang de templates *Invite user* en *Reset password* door `supabase/templates/invite.html` en `supabase/templates/recovery.html`. (Die sturen de student naar `/auth/confirm`, waarna hij een wachtwoord kiest.)
6. **Authentication → Users → Invite user**: nodig de student (en jezelf) uit.
7. **Project settings → API**: kopieer *Project URL* en *anon public key* naar de env-variabelen.

> Tip: de ingebouwde e-mail van Supabase heeft een lage limiet. Voor meer dan een paar uitnodigingen: stel eigen SMTP in (Authentication → SMTP).

## Omgevingsvariabelen

| Naam | Waar | Uitleg |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API | anon public key (veilig in de browser; RLS beschermt de data) |
| `OPENAI_API_KEY` | platform.openai.com | **Alleen server.** Nooit met `NEXT_PUBLIC_` ervoor |
| `OPENAI_MODEL` | | Een model dat afbeeldingen en structured outputs ondersteunt |
| `OPENAI_MODEL_FAST` | optioneel | Goedkoper model voor de afbeeldingskeuze; valt terug op `OPENAI_MODEL` |
| `NEXT_PUBLIC_SITE_URL` | | Publieke URL, gebruikt in de wachtwoord-vergeten-link |

## Naar GitHub en Vercel

```bash
git add -A
git commit -m "DrMauriceCards: eerste versie"
git branch -M main
git remote add origin git@github.com:<jouw-account>/drmauricecards.git
git push -u origin main
```

Dan op [vercel.com](https://vercel.com): **Add New → Project → Import** de repo. Framework wordt herkend als Next.js. Vul bij *Environment Variables* de zes variabelen hierboven in en klik **Deploy**. Elke push naar `main` deployt opnieuw; pull requests krijgen een preview-URL.

- Het genereren van kaarten kan 1–3 minuten duren. `app/api/generate/route.ts` vraagt `maxDuration = 300`. Controleer in Vercel (Settings → Functions) dat *Fluid compute* aan staat; anders is de limiet op het gratis plan lager.
- Verzoeken aan Vercel-functies mogen maximaal 4,5 MB zijn. Daarom worden afbeeldingen in de browser verkleind (`lib/image.ts`).

## Beveiliging in het kort

- Alle tabellen hebben row-level security: een student ziet alleen zijn eigen rijen.
- De API-routes weigeren verzoeken zonder ingelogde gebruiker, dus niemand anders kan je OpenAI-tegoed gebruiken.
- AI-antwoorden en eigen kaarten worden bij het tonen gefilterd (`lib/sanitize.ts`): alleen `b`, `i`, `ul`, `li` en vergelijkbare opmaak blijft over.
- `robots: noindex` staat aan; SEO is geen doel.

## Mappen

```
app/(app)/            ingelogde schermen: dashboard, toets & vakken, les toevoegen, oefenen
app/api/              OpenAI-routes (server)
app/login, auth/      inloggen, uitnodiging en wachtwoord
components/           Dashboard, Mountain, ScoreChart, UploadLesson, Study, ExamForms, ui
lib/parse.ts          .pptx / .pages / .docx uitlezen in de browser
lib/prompts.ts        prompts en JSON-schema's (server)
lib/normalize.ts      AI-JSON → les-concept
lib/data.tsx          alle data van de student + opslaan (via lib/backend.ts)
supabase/             SQL-migratie en e-mailtemplates
tests/                unit tests (vitest)
```
