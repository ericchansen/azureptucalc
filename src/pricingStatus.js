const PRICING_SOURCE_LABELS = {
  'azure-api-live': 'Live Azure Retail Prices API',
  'service-fallback': 'Bundled repository fallback rates',
  'static-fallback': 'Repository fallback after a pricing error',
  'mixed-live-static': 'Mixed live and repository rates',
  'repository-table': 'Repository pricing table',
  'generic-fallback': 'Generic fallback rate',
  custom: 'Custom pricing values',
  initial: 'Initial repository defaults',
  static: 'Repository pricing tables',
};

export const getPricingSourceLabel = (source, fallback = 'Repository pricing tables') =>
  PRICING_SOURCE_LABELS[source] || fallback;

export const isLivePricingResponse = pricing => pricing?.source === 'live';

export const getPricingStatusMessage = source => {
  if (source === 'live') {
    return 'Live pricing data from Azure API (prices.azure.com/api/retail/prices)';
  }
  if (source === 'live-simulated') {
    return 'Simulated pricing data for local development';
  }
  return 'Static pricing data from bundled repository rates';
};
