import { z } from "zod";

export const masterNameSchema = z.object({ name: z.string().trim().min(1).max(200) });
export const masterPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined, {
  message: "At least one of `name` or `isActive` must be provided",
});
export const designationCreateSchema = masterNameSchema.extend({
  isActive: z.boolean().default(true),
});
