import { describe, expect, it } from "vitest";
import { OPERATION_META, type OperationKind } from "./operations";
import {
  GUIDE_ARTICLES,
  GUIDE_ARTICLES_BY_ID,
  GUIDE_CATEGORIES,
  operationGuideId,
} from "./guide-content";

describe("field guide content", () => {
  it("has unique IDs and no broken related-article links", () => {
    expect(GUIDE_ARTICLES_BY_ID.size).toBe(GUIDE_ARTICLES.length);
    for (const article of GUIDE_ARTICLES) {
      expect(GUIDE_CATEGORIES).toContain(article.category);
      expect(article.sections.length).toBeGreaterThanOrEqual(3);
      for (const related of article.related ?? []) {
        expect(
          GUIDE_ARTICLES_BY_ID.has(related),
          `${article.id} links to missing article ${related}`,
        ).toBe(true);
      }
    }
  });

  it("provides one canonical article for every playable Operation", () => {
    for (const kind of Object.keys(OPERATION_META) as OperationKind[]) {
      const article = GUIDE_ARTICLES_BY_ID.get(operationGuideId(kind));
      expect(article?.title).toBe(OPERATION_META[kind].label);
      expect(article?.category).toBe("Orders");
    }
  });
});
