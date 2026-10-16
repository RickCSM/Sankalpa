import { describe, expect, it } from 'vitest';
import { userDesignationOptions } from './userDesignations';

const active = { id: 1, name: 'Director', isActive: true };
const inactive = { id: 2, name: 'Officer', isActive: false };
describe('Manage Users designation choices', () => {
  it('only offers active designations to new users', () => {
    expect(userDesignationOptions([active, inactive])).toEqual([active]);
  });
  it('retains an inactive existing assignment without exposing other inactive choices', () => {
    expect(userDesignationOptions([active, inactive, { ...inactive, id: 3 }], { designationId: 2, designation: 'Officer' }))
      .toEqual([active, inactive]);
  });
  it('does not duplicate an active existing assignment', () => {
    expect(userDesignationOptions([active], { designationId: 1 })).toEqual([active]);
  });
  it('preserves the saved value while master data is unavailable', () => {
    expect(userDesignationOptions([], { designationId: 2, designation: 'Officer' }))
      .toEqual([inactive]);
  });
});
