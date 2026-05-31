/**
 * src/services/pdfHelper.ts
 * ==========================
 * PDF generation and native share sheet.
 * Renamed from pdfService to avoid conflicts.
 */

import * as Print   from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ScanResult } from '../store/appStore';
import { LANGUAGE_LABELS, type SupportedLanguage } from '../store/appStore';

// ---------------------------------------------------------------------------
// Single scan PDF
// ---------------------------------------------------------------------------
export async function generateScanPDF(scan: ScanResult): Promise<string> {
  const html = buildScanHTML([scan], 'BrailleVision Scan Report');
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

// ---------------------------------------------------------------------------
// Multi-scan history PDF
// ---------------------------------------------------------------------------
export async function generateHistoryPDF(scans: ScanResult[]): Promise<string> {
  const html = buildScanHTML(scans, 'BrailleVision Scan History');
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

// ---------------------------------------------------------------------------
// Share a PDF file via native OS share sheet
// ---------------------------------------------------------------------------
export async function sharePDF(uri: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share BrailleVision Scan',
    UTI: 'com.adobe.pdf',
  });
}

// ---------------------------------------------------------------------------
// Generate and share in one call
// ---------------------------------------------------------------------------
export async function exportAndShare(scans: ScanResult[]): Promise<void> {
  const uri = scans.length === 1
    ? await generateScanPDF(scans[0])
    : await generateHistoryPDF(scans);
  await sharePDF(uri);
}

// ---------------------------------------------------------------------------
// HTML template builder
// ---------------------------------------------------------------------------
function buildScanHTML(scans: ScanResult[], title: string): string {
  const now        = new Date().toLocaleString();
  const scanBlocks = scans.map(buildScanBlock).join('<hr style="border:1px dashed #E2E8F0;margin:24px 0">');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; background: #fff; color: #1a1a2e; font-size: 13px; line-height: 1.6; }
  .header { background: #0A0A0F; color: #fff; padding: 28px 32px 20px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .brand-name { font-size: 22px; font-weight: 700; }
  .brand-year { background: #3B82F6; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; }
  .subtitle { font-size: 13px; color: #94A3B8; }
  .body { padding: 24px 32px; }
  .meta-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 16px; }
  .meta-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
  .meta-label { font-size: 10px; color: #64748B; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #1E293B; }
  .section { margin-bottom: 14px; }
  .section-label { font-size: 10px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
  .text-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; font-size: 14px; line-height: 1.7; }
  .text-box.corrected { border-color: #BFDBFE; background: #EFF6FF; }
  .text-box.translated { border-color: #BBF7D0; background: #F0FDF4; }
  .text-box.raw { font-family: monospace; font-size: 12px; color: #64748B; }
  .openai-badge { display: inline-block; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 4px; padding: 2px 8px; font-size: 10px; color: #1D4ED8; font-weight: 500; margin-bottom: 6px; }
  .footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 14px 32px; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8; }
</style>
</head>
<body>
<div class="header">
  <div class="brand">
    <span style="font-size:24px">👁</span>
    <span class="brand-name">BrailleVision</span>
    <span class="brand-year">2026</span>
  </div>
  <div class="subtitle">${title} · ${now} · ${scans.length} scan${scans.length > 1 ? 's' : ''}</div>
</div>
<div class="body">${scanBlocks}</div>
<div class="footer">
  <span>BrailleVision 2026</span>
  <span>AI: OpenAI GPT-4o-mini · Claude (Anthropic)</span>
</div>
</body>
</html>`;
}

function buildScanBlock(scan: ScanResult): string {
  const date    = new Date(scan.scanned_at).toLocaleString();
  const confPct = (scan.confidence_avg * 100).toFixed(1);

  const translationHTML = scan.translated_text
    ? `<div class="section">
         <div class="section-label">Translation</div>
         <div class="text-box translated">${scan.translated_text}</div>
       </div>` : '';

  const noteHTML = scan.note
    ? `<div class="section">
         <div class="section-label">Note</div>
         <div class="text-box">${scan.note}</div>
       </div>` : '';

  return `
<div style="margin-bottom:24px">
  <div class="meta-grid">
    <div class="meta-card"><div class="meta-label">Scanned</div><div class="meta-value" style="font-size:11px">${date}</div></div>
    <div class="meta-card"><div class="meta-label">Cells</div><div class="meta-value">${scan.cell_count}</div></div>
    <div class="meta-card"><div class="meta-label">Confidence</div><div class="meta-value">${confPct}%</div></div>
    <div class="meta-card"><div class="meta-label">Time</div><div class="meta-value">${scan.processing_time_ms.toFixed(0)}ms</div></div>
  </div>
  <div class="section">
    <div class="section-label">Raw OCR</div>
    <div class="text-box raw">${scan.raw_braille_text || '—'}</div>
  </div>
  <div class="section">
    <div class="openai-badge">✦ GPT-4o-mini corrected</div>
    <div class="section-label">Corrected Text</div>
    <div class="text-box corrected">${scan.corrected_text || '—'}</div>
  </div>
  ${translationHTML}
  ${noteHTML}
  <p style="font-size:10px;color:#CBD5E1;margin-top:10px">Scan ID: ${scan.scan_id}</p>
</div>`;
}