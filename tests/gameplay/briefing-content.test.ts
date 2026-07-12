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
    expect(detection.lead).not.toMatch(/basin/i);
    expect(landfall.id).toBe("landfall");
    expect(landfall.lead).toMatch(/Basin.*shared ocean map on the TV/i);
    expect(landfall.speakerNotes.join(" ")).toMatch(/not conquering Neris/i);
    expect(landfall.callout).toMatch(/Network.*Discovery.*Dominion/i);

    const charters = BRIEFING_SLIDES.find((slide) => slide.id === "charters")!;
    expect(charters.title).toMatch(/mission shown on the TV/i);
    expect(charters.lead).toMatch(/top of the game screen/i);
    expect(charters.speakerNotes.join(" ")).toMatch(
      /exactly four connected active platforms/i,
    );
    expect(charters.speakerNotes.join(" ")).toMatch(
      /all three specimen types.*Laboratory/i,
    );
    expect(charters.speakerNotes.join(" ")).toMatch(
      /uniquely controlling every marked Dominion/i,
    );

    const dossiers = BRIEFING_SLIDES.filter((slide) =>
      slide.id.endsWith("-dossier"),
    );
    expect(dossiers.map((slide) => slide.id)).toEqual([
      "ark-dossier",
      "submarine-dossier",
      "platform-dossier",
      "devices-dossier",
    ]);
    expect(dossiers.find((slide) => slide.id === "ark-dossier")!.lead).toMatch(
      /location where you want to build.*platform.*second submarine.*repair/i,
    );
    expect(dossiers.find((slide) => slide.id === "ark-dossier")!.title).toMatch(
      /large construction ship on the TV/i,
    );
    const resources = BRIEFING_SLIDES.find(
      (slide) => slide.id === "resources",
    )!;
    expect(resources.title).toMatch(/three resources/i);
    expect(resources.lead).toMatch(/Supply builds.*Signal powers.*Silence/i);
    expect(resources.speakerNotes.join(" ")).toMatch(
      /Integrity.*health.*cargo.*not currencies/i,
    );
    const platform = dossiers.find((slide) => slide.id === "platform-dossier")!;
    expect(platform.title).toMatch(/invest in one location/i);
    expect(platform.lead).toMatch(/Move your Ark.*3 Supply.*permanent/i);
    expect(platform.callout).toMatch(
      /Extractor.*build more.*Sonar.*know more.*Laboratory.*Discovery/i,
    );
    expect(
      dossiers.find((slide) => slide.id === "devices-dossier")!.callout,
    ).toMatch(/Tag tracks.*Spill stops.*Decoy lies/i);

    const contest = BRIEFING_SLIDES.find((slide) => slide.id === "contest")!;
    expect(BRIEFING_SLIDES.indexOf(contest)).toBe(8);
    expect(contest.title).toMatch(/only when an attack finds a real target/i);
    expect(contest.lead).toMatch(/Sector 09.*Hunt.*2 Signal.*Screen/i);
    expect(contest.callout).toMatch(/Force 3.*Force 2.*loses 1 Integrity/i);
    expect(contest.speakerNotes.join(" ")).toMatch(
      /wrong location.*no public fight.*still spends/i,
    );

    const comeback = BRIEFING_SLIDES.find((slide) => slide.id === "comeback")!;
    expect(comeback.lead).toMatch(/three connected platforms.*fourth/i);
    expect(comeback.callout).toMatch(/Contest or Jam.*disable.*block/i);
    expect(comeback.speakerNotes.join(" ")).toMatch(
      /Commission is a bonus, not the attack itself/i,
    );
    expect(comeback.speakerNotes.join(" ")).toMatch(
      /Jam.*does not earn the Commission reward/i,
    );

    const finalSlide = BRIEFING_SLIDES.at(-1)!;
    expect(finalSlide.lead).toMatch(/Round 1 is setup/i);
    expect(finalSlide.lead).not.toMatch(/win in (?:the )?first round/i);
  });
});
