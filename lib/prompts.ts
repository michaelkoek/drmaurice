import "server-only";

export interface SubjectRef { key: string; name: string; hint: string | null }

export function pickImagesPrompt(input: { goals: string; digest: string; candidates: { id: string; slide: number; title: string; kb: number }[]; max: number }) {
  return `Je helpt flashcards maken voor een geneeskundestudent. Hieronder staan de lesdoelen, de tekst per slide en een lijst afbeeldingen uit de presentatie.
Kies maximaal ${input.max} afbeeldingen die waarschijnlijk leerstof bevatten die nodig is voor de lesdoelen: gelabelde schema's, doorsneden, tabellen, diagrammen, kaarten. Kies GEEN foto's zonder uitleg, boekomslagen, titel- of decoratiebeelden, video-stills of cartoons. Let vooral op slides waar weinig tekst staat maar het onderwerp bij een lesdoel hoort.

LESDOELEN:
${input.goals || "(geen lesdoelen aangeleverd)"}

SLIDES:
${input.digest}

AFBEELDINGEN:
${input.candidates.map((c) => `${c.id}: slide ${c.slide} ("${c.title}"), ${c.kb ? `${c.kb} kB` : "hele pagina uit een pdf"}`).join("\n")}`;
}

export const pickImagesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ids"],
  properties: { ids: { type: "array", items: { type: "string" } } },
} as const;

export function cardsPrompt(input: { goals: string; goalsAsImage: boolean; digest: string; imageLabels: string[]; subjects: SubjectRef[] }) {
  const goalsBlock = input.goals
    || (input.goalsAsImage
      ? "Zie de afbeelding van het lesdoelen-document."
      : "Geen lesdoelen aangeleverd. Kies zelf de belangrijkste stof; gebruik dan lesdoel 0 voor alle kaarten en laat 'lesdoelen' leeg.");
  return `Je maakt flashcards voor een geneeskundestudent (Nederlandstalig) uit één les. De student krijgt later één toets over alle lessen.

HARDE REGELS
1. Gebruik ALLEEN informatie die in de slides, notities of meegestuurde afbeeldingen staat. Voeg geen eigen kennis toe, ook niet als je denkt dat de slide onvolledig of vereenvoudigd is. Verzin geen antwoorden.
2. Elk antwoord noemt in "bron" de slide(s) waar het staat, bijvoorbeeld "Slide 14" of "Slide 31 (afbeelding)".
3. Leg de nadruk op de LESDOELEN. Ongeveer 85% van de kaarten hoort bij een lesdoel. Stof die nergens onder een lesdoel valt krijgt "lesdoel": 0 en maximaal zo'n 15% van de kaarten.
4. Staat een lesdoel (of een deel ervan) NIET in de presentatie, maak dan precies één kaart met die vraag, "antwoord": null, en noem het in "ontbreekt". Zet de dekking van dat lesdoel op "deels" of "geen".
5. Spreken slides elkaar tegen, neem dan de duidelijkste bron (bijvoorbeeld een tabel) en zet het verschil in "letOp". Noem de tegenstrijdigheid ook in "tegenstrijdig".
6. Eén feit of één samenhang per kaart. Vraag kort en concreet. Antwoord kort; gebruik bij opsommingen <ul><li>…</li></ul> en <b> voor kernbegrippen. Geen andere HTML.
7. Maak tussen 15 en 60 kaarten, afhankelijk van hoeveel stof er is. Liever minder goede kaarten dan opvulling.
8. Kies in "vak" het vak waar deze les het best bij hoort (gebruik ook hints zoals het boek of de lessenreeks in de lesdoelen):
${input.subjects.map((s) => `- "${s.key}" = ${s.name}${s.hint ? `: ${s.hint}` : ""}`).join("\n")}
9. Neem de lesdoelen letterlijk over in "lesdoelen", genummerd vanaf 1 in de volgorde van het document.

LESDOELEN (uit het document):
${goalsBlock}

MEEGESTUURDE AFBEELDINGEN
${input.imageLabels.length ? input.imageLabels.join("\n") : "Geen."}

SLIDES
${input.digest}`;
}

export function cardsSchema(subjectKeys: string[]) {
  const nullableString = { type: ["string", "null"] };
  return {
    type: "object",
    additionalProperties: false,
    required: ["les", "vak", "vakReden", "lesdoelen", "kaarten", "ontbreekt", "tegenstrijdig"],
    properties: {
      les: { type: "string" },
      vak: { type: "string", enum: subjectKeys },
      vakReden: { type: "string" },
      lesdoelen: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["id", "tekst", "dekking"],
          properties: { id: { type: "integer" }, tekst: { type: "string" }, dekking: { type: "string", enum: ["volledig", "deels", "geen"] } },
        },
      },
      kaarten: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["lesdoel", "vraag", "antwoord", "bron", "letOp"],
          properties: { lesdoel: { type: "integer" }, vraag: { type: "string" }, antwoord: nullableString, bron: { type: "string" }, letOp: nullableString },
        },
      },
      ontbreekt: { type: "array", items: { type: "string" } },
      tegenstrijdig: { type: "array", items: { type: "string" } },
    },
  };
}
