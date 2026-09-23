import normalFontUrl from '../assets/fonts/DejaVuSans.ttf?url';
import boldFontUrl from '../assets/fonts/DejaVuSans-Bold.ttf?url';
import type jsPDF from 'jspdf';

export const REPORT_PDF_FONT = 'DejaVuSans';

let fontDataPromise: Promise<{ normal: string; bold: string }> | undefined;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fetchFont(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load the local report font (${response.status} ${response.statusText}).`);
  }
  return arrayBufferToBase64(await response.arrayBuffer());
}

export async function loadReportPdfFonts(): Promise<{ normal: string; bold: string }> {
  fontDataPromise ??= Promise.all([fetchFont(normalFontUrl), fetchFont(boldFontUrl)])
    .then(([normal, bold]) => ({ normal, bold }))
    .catch((error) => {
      fontDataPromise = undefined;
      throw error;
    });
  return fontDataPromise;
}

export function registerReportPdfFonts(
  doc: jsPDF,
  data: { normal: string; bold: string },
): void {
  doc.addFileToVFS('DejaVuSans.ttf', data.normal);
  doc.addFont('DejaVuSans.ttf', REPORT_PDF_FONT, 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', data.bold);
  doc.addFont('DejaVuSans-Bold.ttf', REPORT_PDF_FONT, 'bold');
}

interface FontMetadata {
  characterToGlyph?: (codePoint: number) => number;
}

interface PdfFontWithMetadata {
  metadata?: FontMetadata;
}

/**
 * jsPDF otherwise substitutes a missing glyph without warning. Fail explicitly
 * so an export cannot appear successful while silently corrupting report text.
 */
export function assertReportPdfTextSupported(doc: jsPDF, values: readonly string[]): void {
  doc.setFont(REPORT_PDF_FONT, 'normal');
  const font = doc.getFont() as PdfFontWithMetadata;
  const characterToGlyph = font.metadata?.characterToGlyph;
  if (!characterToGlyph) {
    throw new Error('Unable to verify local report font coverage.');
  }

  const unsupported = new Map<number, string>();
  for (const value of values) {
    for (const character of value) {
      const codePoint = character.codePointAt(0);
      if (
        codePoint === undefined
        || character === '\n'
        || character === '\r'
        || character === '\t'
        || /\p{Cf}/u.test(character)
      ) continue;
      if (characterToGlyph.call(font.metadata, codePoint) === 0) {
        unsupported.set(codePoint, character);
      }
    }
  }
  if (unsupported.size > 0) {
    const summary = [...unsupported]
      .slice(0, 8)
      .map(([codePoint, character]) => `${character} (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')})`)
      .join(', ');
    throw new Error(`The local PDF font does not support: ${summary}. Export was stopped to prevent corrupted text.`);
  }
}