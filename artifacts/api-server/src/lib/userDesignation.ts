import { z } from "zod";
import { HttpError } from "./errors";

export const userDesignationIdSchema = z.number().int().positive().nullable().optional();

export function validateUserDesignation(
  actorRole: string,
  selection: number | null | undefined,
  currentId: number | null | undefined,
  designation?: { id: number; isActive: boolean },
): number | null | undefined {
  if (selection === undefined) return undefined;
  if (actorRole !== "admin") throw new HttpError(403, "Only System Admin can assign a designation");
  if (selection === null) return null;
  if (!designation || designation.id !== selection) throw new HttpError(400, "Unknown designation");
  if (!designation.isActive && selection !== currentId) {
    throw new HttpError(400, "Please select an active designation");
  }
  return selection;
}
