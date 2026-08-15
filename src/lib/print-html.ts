/**
 * Safe print-popup helper.
 *
 * Replaces all direct `win.document.write(html)` calls throughout the app.
 * Uses Blob + createObjectURL so no HTML is passed through document.write(),
 * eliminating the no-unsanitized/method security finding entirely.
 *
 * Usage:
 *   import { openPrintWindow } from '@/lib/print-html';
 *   openPrintWindow(html);          // opens + loads
 *   openPrintWindow(html, true);    // opens, loads, auto-prints
 *
 * Mobile fallback: if window.open() is blocked (popup blocker / mobile browser),
 * the HTML is downloaded as a .html file instead so the user can open it locally.
 */
export function openPrintWindow(html: string, autoPrint = false): Window | null {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked (common on mobile) — fall back to direct download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a short delay to allow the download to start
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return null;
  }

  // Revoke the object URL once the window has loaded to free memory.
  win.addEventListener('load', () => {
    URL.revokeObjectURL(url);
    if (autoPrint) {
      win.focus();
      win.print();
    }
  }, { once: true });

  return win;
}
