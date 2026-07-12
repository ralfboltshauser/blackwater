import { z } from "zod";

import { PROTOCOL_VERSION, RevisionSchema } from "./primitives";

/** Keep this aligned with the authored deck in apps/web/src/briefing/content.ts. */
export const BRIEFING_SLIDE_COUNT = 14;

export const BriefingStateSchema = z
  .object({
    active: z.boolean(),
    slideIndex: z
      .number()
      .int()
      .min(0)
      .max(BRIEFING_SLIDE_COUNT - 1),
    revision: RevisionSchema,
  })
  .strict();

export const DEFAULT_BRIEFING_STATE = {
  active: false,
  slideIndex: 0,
  revision: 0,
} as const;

export const BriefingControlRequestSchema = z
  .object({
    protocol: z.literal(PROTOCOL_VERSION),
    action: z.enum(["open", "previous", "next", "go-to", "close"]),
    expectedRevision: RevisionSchema,
    slideIndex: z
      .number()
      .int()
      .min(0)
      .max(BRIEFING_SLIDE_COUNT - 1)
      .optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.action === "go-to" && request.slideIndex === undefined) {
      context.addIssue({
        code: "custom",
        path: ["slideIndex"],
        message: "go-to requires a slide index",
      });
    }
    if (request.action !== "go-to" && request.slideIndex !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["slideIndex"],
        message: "slideIndex is only accepted for go-to",
      });
    }
  });

export type BriefingState = z.infer<typeof BriefingStateSchema>;
export type BriefingControlRequest = z.infer<
  typeof BriefingControlRequestSchema
>;
