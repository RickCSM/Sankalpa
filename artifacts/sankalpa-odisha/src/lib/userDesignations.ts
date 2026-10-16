import type { Designation } from '@workspace/api-client-react';

/** Only active choices, plus an existing assignment so editing never clears it. */
export function userDesignationOptions(
  designations: Designation[],
  current?: { designationId?: number | null; designation?: string | null },
): Designation[] {
  const options = designations.filter(designation => designation.isActive);
  if (current?.designationId && !options.some(designation => designation.id === current.designationId)) {
    options.push(designations.find(designation => designation.id === current.designationId) ?? {
      id: current.designationId, name: current.designation || 'Current designation', isActive: false,
    });
  }
  return options;
}
