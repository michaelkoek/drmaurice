/**
 * Reads lecture files in the browser. Nothing is uploaded until the student
 * presses "Maak flashcards"; then only text and a few downscaled images go out.
 */
import JSZip from "jszip";

export interface Slide {
  n: number;
  text: string[];
  notes: string[];
  images: { path: string; type: string; size: number }[];
}
/** A lecture as slides, from a .pptx or a .pdf (lib/pdf.ts). `image` loads one of the slides' image paths. */
export interface ParsedDeck { kind: "pptx" | "pdf"; slides: Slide[]; image(path: string): Promise<Blob> }

export const DECK_EXT = /\.(pptx|pdf)$/i;

export async function parseDeck(file: File): Promise<ParsedDeck> {
  if (/\.pdf$/i.test(file.name)) return (await import("./pdf")).parsePdf(file);
  return parsePptx(file);
}
export interface ParsedGoals { text: string; preview: Blob | null }

/* ---- Apple Pages: text lives in snappy-compressed protobuf (.iwa) ---- */
export function snappyUncompress(buf: Uint8Array): Uint8Array {
  let pos = 0, len = 0, shift = 0;
  for (;;) {
    const b = buf[pos++];
    len |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  const out = new Uint8Array(len);
  let op = 0;
  while (pos < buf.length && op < len) {
    const tag = buf[pos++], t = tag & 3;
    if (t === 0) {
      let l = tag >> 2;
      if (l >= 60) { const n = l - 59; l = 0; for (let i = 0; i < n; i++) l |= buf[pos++] << (8 * i); }
      l += 1;
      out.set(buf.subarray(pos, pos + l), op);
      pos += l; op += l;
    } else {
      let l: number, off: number;
      if (t === 1) { l = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | buf[pos++]; }
      else if (t === 2) { l = (tag >> 2) + 1; off = buf[pos] | (buf[pos + 1] << 8); pos += 2; }
      else { l = (tag >> 2) + 1; off = (buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16) | (buf[pos + 3] << 24)) >>> 0; pos += 4; }
      if (!off || off > op) throw new Error("snappy: bad offset");
      for (let i = 0; i < l; i++) { out[op] = out[op - off]; op++; }
    }
  }
  return out.subarray(0, op);
}

export function iwaUncompress(buf: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 0, total = 0;
  while (i + 4 <= buf.length) {
    const l = buf[i + 1] | (buf[i + 2] << 8) | (buf[i + 3] << 16);
    const c = snappyUncompress(buf.subarray(i + 4, i + 4 + l));
    parts.push(c); total += c.length; i += 4 + l;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function textRuns(bytes: Uint8Array, min: number): string[] {
  const s = new TextDecoder("utf-8").decode(bytes);
  const runs = s.match(new RegExp(`[^\\u0000-\\u0008\\u000b-\\u001f\\ufffd]{${min},}`, "g")) || [];
  return runs.map((r) => r.replace(/^[^\p{L}\p{N}•>]+/u, "").trim()).filter((r) => /\p{L}{3}/u.test(r));
}

/* ---- Office XML ---- */
const xmlDoc = (s: string) => new DOMParser().parseFromString(s, "application/xml");

function paragraphs(xml: string, pTag: string, tTag: string): string[] {
  const d = xmlDoc(xml), out: string[] = [];
  for (const p of Array.from(d.getElementsByTagName(pTag))) {
    let t = "";
    for (const r of Array.from(p.getElementsByTagName(tTag))) t += r.textContent ?? "";
    t = t.replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}

const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
function resolvePath(base: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const out: string[] = [];
  for (const x of (dirOf(base) + target).split("/")) {
    if (x === "..") out.pop();
    else if (x && x !== ".") out.push(x);
  }
  return out.join("/");
}

interface Rel { id: string; type: string; target: string; external: boolean }
async function rels(zip: JSZip, path: string): Promise<Rel[]> {
  const f = zip.file(dirOf(path) + "_rels/" + path.slice(path.lastIndexOf("/") + 1) + ".rels");
  if (!f) return [];
  const d = xmlDoc(await f.async("string"));
  return Array.from(d.getElementsByTagName("Relationship")).map((r) => {
    const external = r.getAttribute("TargetMode") === "External";
    const target = r.getAttribute("Target") || "";
    return { id: r.getAttribute("Id") || "", type: r.getAttribute("Type") || "", target: external ? target : resolvePath(path, target), external };
  });
}

const IMG_OK: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

function uncompressedSize(zip: JSZip, path: string): number {
  // JSZip keeps the size on an internal field; good enough to rank images
  const f = zip.file(path) as unknown as { _data?: { uncompressedSize?: number } } | null;
  return f?._data?.uncompressedSize ?? 0;
}

export async function parsePptx(file: Blob | ArrayBuffer | Uint8Array): Promise<ParsedDeck> {
  const zip = await JSZip.loadAsync(file);
  const pres = "ppt/presentation.xml";
  const presFile = zip.file(pres);
  if (!presFile) throw new Error("not-a-pptx");
  const prel = await rels(zip, pres);
  const pd = xmlDoc(await presFile.async("string"));
  const ids = Array.from(pd.getElementsByTagName("p:sldId")).map((n) => n.getAttribute("r:id"));
  let order = ids.map((id) => prel.find((r) => r.id === id)?.target).filter((x): x is string => !!x);
  if (!order.length) {
    order = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0]);
  }
  const slides: Slide[] = [];
  for (let i = 0; i < order.length; i++) {
    const path = order[i], f = zip.file(path);
    if (!f) continue;
    const text = paragraphs(await f.async("string"), "a:p", "a:t");
    const r = await rels(zip, path);
    let notes: string[] = [];
    const nr = r.find((x) => x.type.endsWith("/notesSlide"));
    const nf = nr && zip.file(nr.target);
    if (nf) notes = paragraphs(await nf.async("string"), "a:p", "a:t").filter((t) => !/^\d+$/.test(t));
    const images = r
      .filter((x) => x.type.endsWith("/image") && !x.external)
      .map((x) => ({ path: x.target, type: IMG_OK[x.target.split(".").pop()!.toLowerCase()], size: uncompressedSize(zip, x.target) }))
      .filter((x) => x.type && zip.file(x.path));
    slides.push({ n: i + 1, text, notes, images });
  }
  return { kind: "pptx", slides, image: (path) => zip.file(path)!.async("blob") };
}

export async function parseGoals(file: File): Promise<ParsedGoals> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return { text: await file.text(), preview: null };
  const zip = await JSZip.loadAsync(file);
  if (name.endsWith(".docx")) {
    const doc = zip.file("word/document.xml");
    return { text: doc ? paragraphs(await doc.async("string"), "w:p", "w:t").join("\n") : "", preview: null };
  }
  let text = "";
  const doc = zip.file("Index/Document.iwa");
  if (doc) {
    try {
      const runs = textRuns(iwaUncompress(await doc.async("uint8array")), 12);
      const long = runs.filter((r) => r.length >= 40); // drops locale strings and printer names
      text = (long.length ? long : runs).join("\n");
    } catch { text = ""; }
  }
  const pv = zip.file("preview.jpg");
  const preview = pv ? new Blob([await pv.async("uint8array") as BlobPart], { type: "image/jpeg" }) : null;
  return { text, preview };
}

/** Plain-text digest of the slides for the prompt. */
export function slideDigest(slides: Slide[], maxChars: number): string {
  let out = "";
  for (const s of slides) {
    const lines = s.text.filter((t) => !/^\d+$/.test(t));
    let block = `### Slide ${s.n}\n${lines.join("\n") || "(geen tekst)"}`;
    if (s.notes.length) block += `\nNotities: ${s.notes.join(" ")}`;
    if (s.images.length) block += `\n[${s.images.length} afbeelding${s.images.length > 1 ? "en" : ""}]`;
    out += block + "\n\n";
  }
  return out.length > maxChars ? out.slice(0, maxChars) + "\n[... ingekort]" : out;
}
