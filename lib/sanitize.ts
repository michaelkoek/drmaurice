import DOMPurify from "dompurify";

const ALLOWED = ["b", "strong", "i", "em", "ul", "ol", "li", "br", "sub", "sup"];

/** Generated and user text may only carry a handful of formatting tags. */
export function clean(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window === "undefined") return escapeHtml(html);
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ALLOWED, ALLOWED_ATTR: [] });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Student-typed answer → safe HTML. Lines starting with "-" become a bullet list. */
export function plainToHtml(s: string): string {
  const lines = s.replace(/\r/g, "").split("\n");
  let out = "";
  let list: string[] = [];
  const flush = () => {
    if (list.length) { out += `<ul>${list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`; list = []; }
  };
  for (const raw of lines) {
    const l = raw.trim();
    const m = l.match(/^[-•*]\s+(.*)/);
    if (m) { list.push(m[1]); continue; }
    flush();
    if (l) out += (out && !out.endsWith("</ul>") ? "<br>" : "") + escapeHtml(l);
  }
  flush();
  return out;
}
