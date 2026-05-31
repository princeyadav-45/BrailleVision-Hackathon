/**
 * src/services/apiClient.ts
 * ==========================
 * Typed HTTP client for the BrailleVision FastAPI backend.
 *
 * All fetch calls are centralised here so:
 *   • Timeout / retry logic lives in one place
 *   • TypeScript contracts match the Pydantic schemas exactly
 *   • Error handling is consistent across all screens
 *
 * Vibe-Coding Disclosure: Client structure designed with Claude (Anthropic).
 */

import type { ScanResult, SupportedLanguage } from '../store/appStore';

// ---------------------------------------------------------------------------
// Request / response types (mirror Pydantic schemas from Phase 1)
// ---------------------------------------------------------------------------

export type ScanMode = 'standard' | 'depth' | 'interpoint';

interface ScanRequestPayload {
  image_b64:       string;
  target_language: SupportedLanguage;
  scan_mode:       ScanMode;
  depth_map_b64?:  string;
}

interface TranslateRequestPayload {
  text:            string;
  source_language: SupportedLanguage;
  target_language: SupportedLanguage;
  direction:       'text_to_braille' | 'braille_to_text';
}

export interface TranslateResponse {
  original_text:      string;
  braille_unicode:    string | null;
  decoded_text:       string | null;
  processing_time_ms: number;
}

export interface HealthResponse {
  status:       string;
  yolo_loaded:  boolean;
  openai_ready: boolean;
  version:      string;
}

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

class BrailleVisionAPIClient {
  private baseUrl: string    = 'http://192.168.1.100:8000';
  private timeoutMs: number  = 30_000;   // 30 s — CV + LLM pipeline can be slow

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');  // Strip trailing slash
  }

  // ------------------------------------------------------------------
  // Health check
  // ------------------------------------------------------------------

  async getHealth(): Promise<HealthResponse> {
    const res = await this._fetch('/api/v1/health', { method: 'GET' });
    return res.json();
  }

  // ------------------------------------------------------------------
  // Scan endpoint  ★ Primary pipeline ★
  // ------------------------------------------------------------------

  /**
   * Send a base-64 image to the backend for full Braille scanning.
   * Returns a ScanResult on success; throws on network or server error.
   */
  async scanBraille(
    imageB64:       string,
    targetLanguage: SupportedLanguage,
    scanMode:       ScanMode = 'standard',
    depthMapB64?:   string,
  ): Promise<ScanResult> {
    const payload: ScanRequestPayload = {
      image_b64:       imageB64,
      target_language: targetLanguage,
      scan_mode:       scanMode,
      depth_map_b64:   depthMapB64,
    };

    const res = await this._fetch('/api/v1/scan', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    const data = await res.json();

    // Attach client-side timestamp and empty note before returning
    return {
      ...data,
      scanned_at: new Date().toISOString(),
      note:       '',
    } as ScanResult;
  }

  // ------------------------------------------------------------------
  // Translate endpoint
  // ------------------------------------------------------------------

  async translate(
    text:           string,
    targetLanguage: SupportedLanguage,
    direction:      'text_to_braille' | 'braille_to_text' = 'text_to_braille',
    sourceLanguage: SupportedLanguage = 'en',
  ): Promise<TranslateResponse> {
    const payload: TranslateRequestPayload = {
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      direction,
    };

    const res = await this._fetch('/api/v1/translate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    return res.json();
  }

  // ------------------------------------------------------------------
  // Private: fetch with timeout
  // ------------------------------------------------------------------

  private async _fetch(path: string, init: RequestInit): Promise<Response> {
    const url        = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timerId    = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Is the backend running?');
      }
      throw err;
    } finally {
      clearTimeout(timerId);
    }
  }
}

// Singleton instance used across the entire app
export const apiClient = new BrailleVisionAPIClient();