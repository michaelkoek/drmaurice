# DrMauriceCards

Flashcards uit colleges voor een geneeskundestudent. Upload de PowerPoint of pdf van een les en het document met lesdoelen; de AI maakt kaarten met de nadruk op de lesdoelen, zet de les bij het juiste vak en meldt wat er ontbreekt of elkaar tegenspreekt. Voortgang is een bergbeklimming naar de toets.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Neon (Postgres) · Better Auth · OpenAI Responses API · Vercel.

## Hoe het werkt

1. **Toets & vakken.** De student maakt een toets (naam, datum, aantal vragen) met 1–6 vakken. Elk vak is een graat op de berg.
2. **Les toevoegen.** `.pptx` of `.pdf` + lesdoelen (`.pages`, `.docx` of `.txt`) worden **in de browser** uitgelezen (`lib/parse.ts`, `lib/pdf.ts`). Er gaat alleen tekst en maximaal 8 verkleinde afbeeldingen naar de server.
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

## Neon instellen (eenmalig)

1. Maak een project op [neon.com](https://neon.com). Kopieer bij **Connect** de *pooled* connection string naar `DATABASE_URL`.
2. Maak een geheim voor de sessies: `openssl rand -base64 32` → `BETTER_AUTH_SECRET`.
3. Maak de tabellen: `npm run db:migrate` (voert `db/migrations/*.sql` uit). Of plak `db/migrations/001_init.sql` in de **SQL Editor** van Neon.
4. Accounts: registreren op `/registreren` kan alleen met een e-mailadres uit `SIGNUP_ALLOWED_EMAILS` (komma-gescheiden; leeg = registratie dicht). Wachtwoorden moeten minstens 10 tekens hebben met een kleine letter, hoofdletter, cijfer en symbool, mogen de e-mailnaam niet bevatten en worden geweigerd als ze in een bekend datalek staan (Have I Been Pwned, alleen de eerste 5 tekens van de SHA-1-hash gaan de deur uit). De regels staan in `lib/password.ts`. Er is geen e-mail, dus wachtwoord vergeten loopt via de beheerder:

```bash
npm run user -- add student@example.com Maurice   # toont een tijdelijk wachtwoord
npm run user -- reset student@example.com         # nieuw tijdelijk wachtwoord, logt alle apparaten uit
```

Geef het tijdelijke wachtwoord door; de student wijzigt het na inloggen via **Wachtwoord** rechtsboven. De scripts lezen `.env` en `.env.local`. Voor productie: zet daar tijdelijk de `DATABASE_URL` van de productie-branch.

## Omgevingsvariabelen

| Naam | Waar | Uitleg |
|---|---|---|
| `DATABASE_URL` | Neon → Connect | **Alleen server.** Pooled connection string |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | **Alleen server.** Ondertekent de sessie-cookies |
| `BETTER_AUTH_URL` | | Publieke URL van de site (bv. `https://drmauricecards.vercel.app`) |
| `SIGNUP_ALLOWED_EMAILS` | | E-mailadressen die mogen registreren, komma-gescheiden. Leeg = niemand |
| `OPENAI_API_KEY` | platform.openai.com | **Alleen server.** Nooit met `NEXT_PUBLIC_` ervoor |
| `OPENAI_MODEL` | | Een model dat afbeeldingen, structured outputs en de `web_search`-tool ondersteunt (voor lessen met alleen lesdoelen) |
| `OPENAI_MODEL_FAST` | optioneel | Goedkoper model voor de afbeeldingskeuze; valt terug op `OPENAI_MODEL` |

## Naar GitHub en Vercel

```bash
git add -A
git commit -m "DrMauriceCards: eerste versie"
git branch -M main
git remote add origin git@github.com:<jouw-account>/drmauricecards.git
git push -u origin main
```

Dan op [vercel.com](https://vercel.com): **Add New → Project → Import** de repo. Framework wordt herkend als Next.js. Vul bij *Environment Variables* de variabelen hierboven in en klik **Deploy**. Elke push naar `main` deployt opnieuw; pull requests krijgen een preview-URL.

- Het genereren van kaarten kan 1–3 minuten duren. `app/api/generate/route.ts` vraagt `maxDuration = 300`. Controleer in Vercel (Settings → Functions) dat *Fluid compute* aan staat; anders is de limiet op het gratis plan lager.
- Verzoeken aan Vercel-functies mogen maximaal 4,5 MB zijn. Daarom worden afbeeldingen in de browser verkleind (`lib/image.ts`).

## Beveiliging in het kort

- De browser praat nooit direct met de database. Alles loopt via `app/api/data/route.ts`, dat elke query beperkt tot de ingelogde gebruiker en controleert dat een verwijzing (examen, vak, les) van die gebruiker is.
- Alle API-routes weigeren verzoeken zonder ingelogde gebruiker, dus niemand anders kan je OpenAI-tegoed gebruiken.
- AI-antwoorden en eigen kaarten worden bij het tonen gefilterd (`lib/sanitize.ts`): alleen `b`, `i`, `ul`, `li` en vergelijkbare opmaak blijft over.
- `robots: noindex` staat aan; SEO is geen doel.

## Mappen

```
app/(app)/            ingelogde schermen: dashboard, toets & vakken, les toevoegen, oefenen
app/api/              OpenAI-routes (server)
app/login             inloggen (wachtwoord wijzigen: app/(app)/wachtwoord)
app/api/auth, api/data  Better Auth en alle data-toegang (server)
components/           Dashboard, Mountain, ScoreChart, UploadLesson, Study, ExamForms, ui
lib/parse.ts          .pptx / .pages / .docx uitlezen in de browser
lib/pdf.ts            .pdf uitlezen in de browser (pdf.js); elke pagina telt als slide
lib/prompts.ts        prompts en JSON-schema's (server)
lib/normalize.ts      AI-JSON → les-concept
lib/data.tsx          alle data van de student + opslaan (via lib/backend.ts)
db/migrations/        SQL-schema (Better Auth + app)
scripts/              db:migrate en user (accounts beheren)
tests/                unit tests (vitest)
```
