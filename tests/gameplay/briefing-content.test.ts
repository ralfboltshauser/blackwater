import { describe, expect, it } from "vitest";

import { BRIEFING_SLIDE_COUNT } from "@blackwater/protocol";
import { BRIEFING_SLIDES } from "../../apps/web/src/briefing/content";

describe("crew briefing content", () => {
  it("stays aligned with the synchronized protocol deck", () => {
    expect(BRIEFING_SLIDES).toHaveLength(BRIEFING_SLIDE_COUNT);
    expect(new Set(BRIEFING_SLIDES.map((slide) => slide.id)).size).toBe(
      BRIEFING_SLIDE_COUNT,
    );
    for (const slide of BRIEFING_SLIDES) {
      expect(slide.title.length).toBeGreaterThan(8);
      expect(slide.lead.length).toBeGreaterThan(30);
      expect(slide.callout.length).toBeGreaterThan(8);
      expect(slide.speakerNotes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("teaches the implemented Charter requirements and Round-1 setup honestly", () => {
    const detection = BRIEFING_SLIDES[0]!;
    const landfall = BRIEFING_SLIDES[1]!;
    expect(detection.id).toBe("detection");
    expect(detection.lead).toMatch(/Four organizations/i);
    expect(landfall.id).toBe("landfall");
    expect(landfall.speakerNotes.join(" ")).toMatch(/not conquering Neris/i);
    expect(landfall.callout).toMatch(/Network.*Discovery.*Dominion/i);

    const charters = BRIEFING_SLIDES.find((slide) => slide.id === "charters")!;
    expect(charters.speakerNotes.join(" ")).toMatch(
      /exactly four connected active platforms/i,
    );
    expect(charters.speakerNotes.join(" ")).toMatch(
      /all three specimen types.*Laboratory/i,
    );
    expect(charters.speakerNotes.join(" ")).toMatch(
      /uniquely controlling every marked Dominion/i,
    );

    const finalSlide = BRIEFING_SLIDES.at(-1)!;
    expect(finalSlide.lead).toMatch(/Round 1 is setup/i);
    expect(finalSlide.lead).not.toMatch(/win in (?:the )?first round/i);
  });
});
