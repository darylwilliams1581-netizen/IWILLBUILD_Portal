import { useEffect, useState } from 'react';
import { resolveDownloadUrl } from '@/lib/native-api';

interface AuthenticatedImageState {
  src: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads a protected image with the app session, then exposes a local blob URL.
 * Direct <img> requests from capacitor://localhost do not reliably include the
 * iwillbuild.com session. The object URL is revoked whenever the source changes
 * or the component unmounts.
 */
export function useAuthenticatedImageUrl(source: string | null | undefined): AuthenticatedImageState {
  const [state, setState] = useState<AuthenticatedImageState>({
    src: null,
    loading: Boolean(source),
    error: null,
  });

  useEffect(() => {
    if (!source) {
      setState({ src: null, loading: false, error: 'Image URL is missing.' });
      return;
    }

    if (source.startsWith('blob:') || source.startsWith('data:')) {
      setState({ src: source, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    let active = true;
    setState({ src: null, loading: true, error: null });

    void fetch(resolveDownloadUrl(source), {
      credentials: 'include',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
      const blob = await response.blob();
      if (!blob.size || (blob.type && !blob.type.startsWith('image/'))) {
        throw new Error('Image request returned invalid data.');
      }
      objectUrl = URL.createObjectURL(blob);
      if (active) setState({ src: objectUrl, loading: false, error: null });
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return;
      setState({
        src: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Image could not be loaded.',
      });
    });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return state;
}
