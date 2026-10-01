/**
 * Reads a lecture PDF in the browser: every page becomes a "slide". Embedded images can't be
 * lifted out of a PDF reliably, so a page that shows a real figure (or has no text at all, e.g. a
 * scan) is offered as a candidate image and rendered as a whole when chosen.
 */
import type { ParsedDeck, Slide } from "./parse";

/** Share of the page an image must cover to count as content (logos and icons stay below). */
const MIN_COVER = 0.03;
const RENDER_SIDE = 1280;

export async function parsePdf(file: Blob): Promise<ParsedDeck> {
  // loaded on demand: pdf.js is large and needs browser APIs. The legacy build, because the modern
  // one calls brand-new builtins (Map#getOrInsertComputed, Math.sumPrecise) that Safari lacks.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const { OPS } = pdfjs;

  const slides: Slide[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);

    const text: string[] = [];
    let line = "";
    for (const item of (await page.getTextContent()).items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) { push(); }
    }
    push();
    function push() {
      const t = line.replace(/\s+/g, " ").trim();
      if (t) text.push(t);
      line = "";
    }

    // Image area on the page: an image fills the unit square under the current transform, so its
    // area is the transform's determinant. Only the determinant has to be tracked through save/restore.
    const [x0, y0, x1, y1] = page.view;
    const pageArea = Math.abs((x1 - x0) * (y1 - y0)) || 1;
    const ops = await page.getOperatorList();
    const stack: number[] = [];
    let det = 1, cover = 0;
    const detOf = (m: number[] | null | undefined) => (m ? m[0] * m[3] - m[1] * m[2] : 1);
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(det);
      else if (fn === OPS.restore) det = stack.pop() ?? 1;
      else if (fn === OPS.transform) det *= detOf(args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(det); det *= detOf(args?.[0]); }
      else if (fn === OPS.paintFormXObjectEnd) det = stack.pop() ?? 1;
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) cover += Math.abs(det) / pageArea;
    }
    page.cleanup();

    const words = text.join(" ").split(/\s+/).filter(Boolean).length;
    const figure = cover >= MIN_COVER || words === 0;
    slides.push({ n, text, notes: [], images: figure ? [{ path: `page:${n}`, type: "image/jpeg", size: 0 }] : [] });
  }

  async function image(path: string): Promise<Blob> {
    const page = await doc.getPage(Number(path.slice("page:".length)));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_SIDE / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("render"))), "image/jpeg", 0.85));
  }

  return { kind: "pdf", slides, image };
}
