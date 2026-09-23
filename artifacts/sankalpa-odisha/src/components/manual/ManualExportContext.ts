// ─── Export-mode flag for the manual ────────────────────────────────────────
// When true, interactive pieces (auto-playing lifecycle, Next/Back walkthrough)
// render as a fully-expanded, static-friendly layout so every step is visible
// in the downloadable PDF / HTML. Kept in a tiny module so both the export page
// and the interactive components can share it without a circular import.
import { createContext, useContext } from 'react';

export const ManualExportContext = createContext(false);

export function useManualExport(): boolean {
  return useContext(ManualExportContext);
}
