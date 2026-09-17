import { afterEach, describe, expect, it, vi } from 'vitest';
import AzureOpenAIPricingService from './enhanced_pricing_service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('AzureOpenAIPricingService static hosting', () => {
  it('uses fallback pricing without requesting the serverless proxy', async () => {
    vi.stubEnv('VITE_DISABLE_PRICING_API', 'true');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const service = new AzureOpenAIPricingService();
    const pricing = await service.refreshPricing('gpt-5.4', 'eastus2', 'global');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pricing.source).toBe('fallback');
    expect(service.getPricingStatus().apiAvailable).toBe(false);
  });
});
