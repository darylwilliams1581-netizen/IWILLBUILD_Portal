/**
 * IWIllBUIlD brand name renderer — lowercase l characters styled in brand purple.
 * Use wherever the brand name appears as visible display text.
 */

interface BrandNameProps {
  className?: string;
  /** Colour for the lowercase l characters. Defaults to brand purple #7C3AED */
  accentColor?: string;
}

export function BrandName({ className, accentColor = '#7C3AED' }: BrandNameProps) {
  return (
    <span className={className}>
      IWI
      <span style={{ color: accentColor }}>ll</span>
      BUI
      <span style={{ color: accentColor }}>l</span>
      D
    </span>
  );
}

/** Plain string version — for use in alt text, aria-labels, meta content, etc. */
export const BRAND_NAME = 'IWIllBUIlD';
