import { describe, expect, it } from 'vitest';

import { SAFETY_ICON_DEFS } from './homeIcons';

describe('phone Safety page', () => {
  it('matches the website Phase 1 tile order', () => {
    expect(SAFETY_ICON_DEFS.map(({ key }) => key)).toEqual([
      'risky',
      'risk_register',
      'sds_register',
      'incidents',
      'safety',
    ]);
  });

  it('uses the mirrored labels and destinations', () => {
    expect(SAFETY_ICON_DEFS.map(({ label, href }) => [label, href])).toEqual([
      ['Risk & Permits', '?panel=risky-picker'],
      ['Hazard Register', '/risk-register'],
      ['SDS Register', '/sds-register'],
      ['Incidents', '/incidents'],
      ['Safety Docs', '/safety?safetyTab=company-documents'],
    ]);
  });
});
