import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openai", () => ({ TASKS: {}, cardsRequest: vi.fn(), logUsage: vi.fn(), openai: vi.fn() }));
const { hasTrustedUrl, mergeRedo, weakGoals } = await import("@/lib/research");

const card = (lesdoel: number, antwoord: string | null, bron = "Hartstichting: https://www.hartstichting.nl/hart") =>
  ({ lesdoel, vraag: `Q${lesdoel}`, antwoord, bron, letOp: null });

describe("web research check", () => {
  it("accepts only URLs on trusted Dutch domains, subdomains included", () => {
    expect(hasTrustedUrl("Hartstichting: https://www.hartstichting.nl/x")).toBe(true);
    expect(hasTrustedUrl("https://richtlijnen.nhg.org/standaarden/x")).toBe(true);
    expect(hasTrustedUrl("NHS: https://www.nhs.uk/x")).toBe(false);
    expect(hasTrustedUrl("https://fakehartstichting.nl/x")).toBe(false);
    expect(hasTrustedUrl("Hartstichting")).toBe(false);
  });

  it("flags goals that are not fully covered, have no cards or cite untrusted sources", () => {
    expect(weakGoals({
      lesdoelen: [1, 2, 3, 4, 5].map((id) => ({ id, tekst: `d${id}`, dekking: id === 2 ? "deels" : "volledig" })),
      kaarten: [card(1, "a"), card(2, "a"), card(4, "a", "geheugen"), card(5, null, "")],
    })).toEqual([2, 3, 4]);
  });

  it("swaps in the redone goals and keeps the rest of the first pass", () => {
    const first = {
      les: "Hart", vak: "v0",
      lesdoelen: [{ id: 1, tekst: "a", dekking: "volledig" }, { id: 2, tekst: "b", dekking: "geen" }],
      kaarten: [card(1, "luna"), card(2, null), card(0, "basis")],
      ontbreekt: ["b"], tegenstrijdig: ["x"],
    };
    const redo = { lesdoelen: [{ id: 2, tekst: "b", dekking: "volledig" }], kaarten: [card(2, "sol"), card(1, "dubbel")], ontbreekt: [], tegenstrijdig: ["y"] };
    const out = mergeRedo(first, redo, [2]);
    expect(out.les).toBe("Hart");
    expect(out.lesdoelen?.map((g) => g.dekking)).toEqual(["volledig", "volledig"]);
    expect(out.kaarten?.map((k) => k.antwoord)).toEqual(["luna", "sol", "basis"]);
    expect(out.ontbreekt).toEqual([]);
    expect(out.tegenstrijdig).toEqual(["x", "y"]);
  });
});
