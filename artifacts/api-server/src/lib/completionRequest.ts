import { z } from "zod";

export const completionRequestSchema = z.object({
  version: z.number().int().min(0),
  remarks: z.string().trim().min(1, "Confirmation remarks are required").max(2000),
});
