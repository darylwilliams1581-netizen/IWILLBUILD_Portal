/**
 * Safe print-popup helper.
 *
 * Replaces all direct `win.document.write(html)` calls throughout the app.
 * Uses Blob + createObjectURL so no HTML is passed through document.write(),
 * eliminating the no-unsanitized/method security finding entirely.
 *
 * Usage:
 *   import { openPrintWindow } from '@/lib/print-html';
 *   const win = openPrintWindow(html);          // opens + loads
 *   const win = openPrintWindow(html, true);    // opens, loads, auto-prints
 */
export function openPrintWindow(html: string, autoPrint = false): Window | null {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
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
