import { useEffect, useState } from 'react';
import { isNative } from '@/lib/capacitor-plugins';
import { resolveNativeUrl } from '@/lib/native-url';

type CapHttp = {
  get: (opts: { url: string; responseType?: string; readTimeout?: number }) => Promise<{
    status: number;
    data?: unknown;
  }>;
};

export type PlanPdfFile = { data: Uint8Array };

function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false;
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]).startsWith('%PDF');
}

function decodeHttpData(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') {
    const binary = atob(data);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  throw new Error('PDF response was not binary data.');
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  if (isNative()) {
    const http = (window as unknown as { Capacitor?: { Plugins?: { CapacitorHttp?: CapHttp } } })
      .Capacitor?.Plugins?.CapacitorHttp;
    if (http?.get) {
      const response = await http.get({
        url,
        responseType: 'arraybuffer',
        readTimeout: 20000,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`PDF request failed (${response.status}).`);
      }
      const bytes = decodeHttpData(response.data);
      if (!looksLikePdf(bytes)) throw new Error('File is not a PDF.');
      return bytes;
    }
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { credentials: 'include', signal: controller.signal });
    if (!response.ok) throw new Error(`PDF request failed (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!looksLikePdf(bytes)) throw new Error('File is not a PDF.');
    return bytes;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('PDF took too long to load.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function usePlanPdfData(fileUrl: string | null | undefined): {
  file: PlanPdfFile | null;
  loading: boolean;
  error: string | null;
  openUrl: string | null;
} {
  const openUrl = fileUrl ? resolveNativeUrl(fileUrl) : null;
  const [file, setFile] = useState<PlanPdfFile | null>(null);
  const [loading, setLoading] = useState(Boolean(fileUrl));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!openUrl) {
      setFile(null);
      setLoading(false);
      setError('No PDF on this drawing.');
      return;
    }

    let cancelled = false;
    setFile(null);
    setLoading(true);
    setError(null);

    void fetchPdfBytes(openUrl)
      .then((data) => {
        if (cancelled) return;
        setFile({ data });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFile(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load PDF.');
      });

    return () => {
      cancelled = true;
    };
  }, [openUrl]);

  return { file, loading, error, openUrl };
}
