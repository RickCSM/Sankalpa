import { z } from "zod";
import { StartAnnouncementProgressBody } from "@workspace/api-zod";

export const startProgressSchema = StartAnnouncementProgressBody.extend({
  version: z.number().int().min(0),
  comment: z.string().trim()
    .min(1, "Please enter a comment before starting progress.")
    .max(2000),
});
