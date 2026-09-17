import { describe, expect, it } from 'vitest';
import { getPricingSourceLabel, getPricingStatusMessage } from './pricingStatus.js';

describe('pricing status labels', () => {
  it('labels service fallback rates as bundled repository data', () => {
    const label = getPricingSourceLabel('service-fallback');

    expect(label).toBe('Bundled repository fallback rates');
    expect(label).not.toContain('Live');
  });

  it('describes fallback responses as static pricing', () => {
    const message = getPricingStatusMessage('fallback');

    expect(message).toBe('Static pricing data from bundled repository rates');
    expect(message).not.toContain('Live');
  });
});
