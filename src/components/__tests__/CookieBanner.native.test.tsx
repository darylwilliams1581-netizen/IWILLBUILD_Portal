import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CookieBanner from '../CookieBanner';

vi.mock('@/lib/capacitor-plugins', () => ({ isNative: () => true }));

describe('CookieBanner in the Capacitor app', () => {
  it('shows no consent prompt and never loads the SCC tracking script', () => {
    const { container } = render(<CookieBanner />);

    expect(container.childElementCount).toBe(0);
    expect(document.querySelector('script[src*="scc-c2"]')).toBeNull();
    expect(window.__SCC_INIT__).not.toBe(true);
  });
});
