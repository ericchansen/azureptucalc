import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw } from 'lucide-react';
import enhancedModelConfig from '../enhanced_model_config.json';
import { getPricingSourceLabel } from '../pricingStatus.js';

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const compactNumberFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const compactCurrencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const rateCurrencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatNumber = (value) => numberFormatter.format(Number(value || 0));
const formatCurrency = (value) => currencyFormatter.format(Number(value || 0));
const formatCompactNumber = (value) => compactNumberFormatter.format(Number(value || 0));
const formatCompactCurrency = (value) => compactCurrencyFormatter.format(Number(value || 0));
const formatRateCurrency = (value) => rateCurrencyFormatter.format(Number(value || 0));
const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EXTERNAL_LINK_PROPS = { target: '_blank', rel: 'noreferrer' };
const SOURCES = {
  pricingApi: 'https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices',
  pricingEndpoint: 'https://prices.azure.com/api/retail/prices',
  pricingPage: 'https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/',
  reservations: 'https://learn.microsoft.com/en-us/azure/cost-management-billing/reservations/microsoft-foundry',
  sizing: 'https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/provisioned-throughput-sizing',
  caching: 'https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/prompt-caching',
  spillover: 'https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/spillover-traffic-management',
  modelConfig: 'https://github.com/ericchansen/azureptucalc/blob/main/src/enhanced_model_config.json',
  pricingApiImplementation: 'https://github.com/ericchansen/azureptucalc/blob/main/api/azure-pricing.js',
  pricingServiceImplementation: 'https://github.com/ericchansen/azureptucalc/blob/main/src/enhanced_pricing_service.js',
};
const PTU_PRICE_OPTIONS = [
  { value: 'yearly', label: '1-year reservation' },
  { value: 'monthly', label: '1-month reservation' },
  { value: 'hourly', label: 'Hourly' },
];
const DEPLOYMENT_LABELS = {
  global: 'Global',
  dataZone: 'Data Zone',
  regional: 'Regional',
};
const DECK_DEFAULTS = {
  rpm: 40,
  cache: 50,
  ptu: 780,
  input: 90000,
  output: 500,
  low: 30,
  high: 90,
  busy: 10,
  weekend: 0.25,
};

const FALLBACK_RATES = {
  active: 2.5,
  output: 10,
  hourlyPtu: 1,
  monthlyPtu: 260,
  yearlyMonthlyPtu: 221,
};

const deckEconomics = ({ rpm, cache, ptu, input, output }, assumptions) => {
  const cachedShare = cache / 100;
  const normalizedPerRequest = input * (1 - cachedShare) + output * assumptions.outputWeight;
  const normalizedTPM = normalizedPerRequest * rpm;
  const capacity = ptu * assumptions.throughput;
  const monthlyCalls = rpm * 60 * 730;
  const paygoPerCall = (
    input * (1 - cachedShare) * assumptions.rates.active
    + input * cachedShare * assumptions.rates.cached
    + output * assumptions.rates.output
  ) / 1e6;
  const paygoOnly = monthlyCalls * paygoPerCall;
  const ptuCost = ptu * assumptions.rates.selectedPtu;
  const aboveCapacityCalls = normalizedTPM > capacity
    ? monthlyCalls * ((normalizedTPM - capacity) / normalizedTPM)
    : 0;
  const ptuPlusPaygo = ptuCost + aboveCapacityCalls * paygoPerCall;
  return {
    normalizedPerRequest,
    normalizedTPM,
    capacity,
    paygoOnly,
    ptuPlusPaygo,
    difference: ptuPlusPaygo - paygoOnly,
  };
};

const buildHeatmap = ({ cache, rpm, ptu, input, output }, axis, assumptions) => {
  const minPtu = assumptions.minPtu;
  const ptuIncrement = assumptions.ptuIncrement;
  const maxRpm = Math.max(100, Math.ceil((rpm * 2) / 10) * 10);
  const maxNormalizedPerRequest = axis === 'cache'
    ? input + output * assumptions.outputWeight
    : input * (1 - cache / 100) + output * assumptions.outputWeight;
  const maxAxisRpm = axis === 'rpm' ? maxRpm : rpm;
  const maxRequiredPtu = maxNormalizedPerRequest * maxAxisRpm / assumptions.throughput;
  const targetMaxPtu = Math.max(
    minPtu + ptuIncrement * 17,
    Math.ceil(Math.max(ptu * 2, maxRequiredPtu * 1.1) / ptuIncrement) * ptuIncrement,
  );
  const xStep = Math.max(
    ptuIncrement,
    Math.ceil((targetMaxPtu - minPtu) / 17 / ptuIncrement) * ptuIncrement,
  );
  const xValues = Array.from({ length: 18 }, (_, index) => minPtu + index * xStep);
  const yValues = axis === 'cache'
    ? Array.from({ length: 15 }, (_, index) => index * 100 / 14)
    : Array.from({ length: 15 }, (_, index) => Math.round((index * maxRpm / 14) * 10) / 10);
  const selectedX = xValues.reduce(
    (nearest, value) => Math.abs(value - ptu) < Math.abs(nearest - ptu) ? value : nearest,
    xValues[0],
  );
  const selectedY = yValues.reduce(
    (nearest, value) => Math.abs(value - (axis === 'cache' ? cache : rpm)) < Math.abs(nearest - (axis === 'cache' ? cache : rpm)) ? value : nearest,
    yValues[0],
  );
  return [...yValues].reverse().map((y) => xValues.map((x) => {
    const economics = deckEconomics({
      cache: axis === 'cache' ? y : cache,
      rpm: axis === 'rpm' ? y : rpm,
      ptu: x,
      input,
      output,
    }, assumptions);
    return {
      x,
      y,
      value: economics.difference,
      requiredPtu: economics.normalizedTPM / assumptions.throughput,
      selected: x === selectedX && y === selectedY,
    };
  }));
};

const buildWorkweek = ({ low, high, busy, weekend, cache, ptu, input, output }, pattern, assumptions) => {
  const dailyShape = Array.from({ length: 24 }, (_, dayHour) => {
    const phase = dayHour / 24;
    if (pattern === 'block') {
      return dayHour >= 9 && dayHour < 9 + busy ? 1 : 0;
    }
    if (pattern === 'spike') {
      const center = 14;
      return Math.max(0, 1 - Math.abs(dayHour - center) / Math.max(1, busy));
    }
    return 0.5 + 0.5 * Math.sin((phase - 0.25) * Math.PI * 2);
  });
  const shapeTotal = dailyShape.reduce((sum, value) => sum + value, 0);
  const volumeScale = shapeTotal > 0 ? busy / shapeTotal : 0;

  const points = Array.from({ length: 168 }, (_, hour) => {
    const dayHour = hour % 24;
    const isWeekend = Math.floor(hour / 24) >= 5;
    const shape = dailyShape[dayHour] * volumeScale;
    const requests = (low + (high - low) * shape) * (isWeekend ? 1 - weekend : 1);
    const economics = deckEconomics({ rpm: requests, cache, ptu, input, output }, assumptions);
    return {
      hour,
      label: `${DAY_NAMES[Math.floor(hour / 24)]} ${String(dayHour).padStart(2, '0')}:00`,
      requests,
      capacity: economics.capacity / economics.normalizedPerRequest,
      handled: Math.min(requests, economics.capacity / economics.normalizedPerRequest),
      overflow: Math.max(0, requests - economics.capacity / economics.normalizedPerRequest),
    };
  });
  return points;
};

const VisualCalculator = ({
  selectedModel,
  setSelectedModel,
  selectedDeployment,
  setSelectedDeployment,
  selectedRegion,
  setSelectedRegion,
  currentPricing,
  calculations,
  availableModels,
  regions,
}) => {
  const [deckInputs, setDeckInputs] = useState(DECK_DEFAULTS);
  const [heatmapAxis, setHeatmapAxis] = useState('rpm');
  const [workweekPattern, setWorkweekPattern] = useState('block');
  const [ptuPriceOption, setPtuPriceOption] = useState('yearly');

  const modelConfig = enhancedModelConfig.models?.[selectedModel] || {};
  const deploymentConfig = modelConfig.deployments?.[selectedDeployment] || {};
  const minPtu = Number(deploymentConfig.min_ptu || currentPricing?.minPTU || 15);
  const ptuIncrement = Number(deploymentConfig.increment || 5);
  const selectedPriceOption = PTU_PRICE_OPTIONS.find(({ value }) => value === ptuPriceOption) || PTU_PRICE_OPTIONS[0];
  const selectedRegionLabel = regions.find((region) => (region.value || region) === selectedRegion)?.label || selectedRegion;
  const pricingSourceLabel = getPricingSourceLabel(currentPricing?.pricingSource);
  const paygoSourceLabel = getPricingSourceLabel(currentPricing?.paygoPricingSource, pricingSourceLabel);
  const ptuSourceLabel = getPricingSourceLabel(currentPricing?.ptuPricingSource, pricingSourceLabel);
  const pricingTimestamp = formatDateTime(currentPricing?.livePricingTimestamp);
  const proxyRequest = `/api/azure-pricing?model=${encodeURIComponent(selectedModel)}&region=${encodeURIComponent(selectedRegion)}&deployment=${encodeURIComponent(selectedDeployment)}`;

  useEffect(() => {
    setDeckInputs((previous) => {
      const nextPtu = Math.max(minPtu, Math.ceil(previous.ptu / ptuIncrement) * ptuIncrement);
      return nextPtu === previous.ptu ? previous : { ...previous, ptu: nextPtu };
    });
  }, [minPtu, ptuIncrement]);

  const assumptions = useMemo(() => {
    const rates = {
      active: Number(currentPricing?.paygo_input || FALLBACK_RATES.active),
      cached: Number(currentPricing?.paygo_input || FALLBACK_RATES.active) * 0.1,
      output: Number(currentPricing?.paygo_output || FALLBACK_RATES.output),
      hourlyPtu: Number(currentPricing?.ptu_hourly || FALLBACK_RATES.hourlyPtu),
      monthlyPtu: Number(currentPricing?.ptu_monthly || FALLBACK_RATES.monthlyPtu),
      yearlyMonthlyPtu: Number(currentPricing?.ptu_yearly ? currentPricing.ptu_yearly / 12 : FALLBACK_RATES.yearlyMonthlyPtu),
    };
    const selectedPtu = ptuPriceOption === 'hourly'
      ? rates.hourlyPtu * 730
      : ptuPriceOption === 'monthly'
        ? rates.monthlyPtu
        : rates.yearlyMonthlyPtu;
    return {
      throughput: Number(currentPricing?.tokensPerPTUPerMinute || modelConfig.throughput_per_ptu || 2400),
      outputWeight: Number(modelConfig.output_weight || calculations?.outputWeight || 6),
      minPtu,
      ptuIncrement,
      rates: { ...rates, selectedPtu },
    };
  }, [
    calculations?.outputWeight,
    currentPricing,
    minPtu,
    modelConfig.output_weight,
    modelConfig.throughput_per_ptu,
    ptuIncrement,
    ptuPriceOption,
  ]);
  const deckEconomicsData = useMemo(() => deckEconomics(deckInputs, assumptions), [deckInputs, assumptions]);
  const heatmapData = useMemo(() => buildHeatmap(deckInputs, heatmapAxis, assumptions), [deckInputs, heatmapAxis, assumptions]);
  const workweekData = useMemo(() => buildWorkweek(deckInputs, workweekPattern, assumptions), [deckInputs, workweekPattern, assumptions]);
  const capacityRpm = deckEconomicsData.normalizedPerRequest > 0
    ? deckEconomicsData.capacity / deckEconomicsData.normalizedPerRequest
    : 0;
  const flatMaxRpm = Math.max(20, Math.ceil(Math.max(deckInputs.rpm * 2, capacityRpm * 1.5) / 10) * 10);
  const flatLoadData = useMemo(() => Array.from({ length: 31 }, (_, index) => {
    const demandRpm = flatMaxRpm * index / 30;
    const result = deckEconomics({ ...deckInputs, rpm: demandRpm }, assumptions);
    return { rpm: Number(demandRpm.toFixed(1)), paygo: result.paygoOnly, combined: result.ptuPlusPaygo };
  }), [assumptions, deckInputs, flatMaxRpm]);
  const flatTicks = Array.from({ length: 5 }, (_, index) => Number((flatMaxRpm * index / 4).toFixed(1)));
  const heatmapXValues = heatmapData[0]?.map((cell) => cell.x) || [];
  const heatmapYValues = heatmapData.map((row) => row[0]?.y).filter((value) => value !== undefined);
  const heatmapMaxPtu = heatmapXValues.at(-1) || deckInputs.ptu;
  const heatmapMinPtu = heatmapXValues[0] || minPtu;
  const heatmapMaxDifference = Math.max(1, ...heatmapData.flat().map((cell) => Math.abs(cell.value)));
  const heatmapCapacityPoints = heatmapData.map((row, index) => {
    const x = clamp(
      ((row[0]?.requiredPtu || 0) - heatmapMinPtu) / Math.max(1, heatmapMaxPtu - heatmapMinPtu) * 100,
      0,
      100,
    );
    const y = ((index + 0.5) / Math.max(1, heatmapData.length)) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const lowestCostPtu = useMemo(() => {
    const requiredPtu = deckEconomicsData.normalizedTPM / assumptions.throughput;
    const candidateMax = Math.max(deckInputs.ptu * 2, requiredPtu * 1.5, minPtu);
    const candidateCount = Math.ceil((candidateMax - minPtu) / ptuIncrement) + 1;
    const candidates = Array.from({ length: candidateCount }, (_, index) => minPtu + index * ptuIncrement);
    return candidates.reduce((best, candidate) => {
      const result = deckEconomics({ ...deckInputs, ptu: candidate }, assumptions);
      return result.ptuPlusPaygo < best.cost ? { ptu: candidate, cost: result.ptuPlusPaygo } : best;
    }, { ptu: minPtu, cost: Infinity });
  }, [assumptions, deckEconomicsData.normalizedTPM, deckInputs, minPtu, ptuIncrement]);

  const updateDeckInput = (field, value) => {
    setDeckInputs((previous) => ({ ...previous, [field]: Number(value) }));
  };

  const resetDeckInputs = () => {
    setPtuPriceOption('yearly');
    setDeckInputs({
      ...DECK_DEFAULTS,
      ptu: Math.max(minPtu, Math.ceil(DECK_DEFAULTS.ptu / ptuIncrement) * ptuIncrement),
    });
  };

  return (
    <main className="visual-calculator">
      <a className="skip-link" href="#calculator-figures">Skip to figures</a>
      <h1 className="sr-only">Microsoft Foundry PTU Calculator</h1>
      <section className="visual-controls" aria-label="Calculator controls">
        <div className="visual-control-group">
          <div className="visual-selects-row">
            <div className="visual-selects">
            <select name="model" autoComplete="off" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} aria-label="Model">
              {availableModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
            <select name="deployment" autoComplete="off" value={selectedDeployment} onChange={(event) => setSelectedDeployment(event.target.value)} aria-label="Deployment">
              <option value="global">Global</option>
              <option value="dataZone">Data Zone</option>
              <option value="regional">Regional</option>
            </select>
            <select name="region" autoComplete="off" value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)} aria-label="Region">
              {regions.map((region) => <option key={region.value || region} value={region.value || region}>{region.label || region}</option>)}
            </select>
            <select name="ptu-price" autoComplete="off" value={ptuPriceOption} onChange={(event) => setPtuPriceOption(event.target.value)} aria-label="PTU price option">
              <option value="yearly">1-year · {formatRateCurrency(assumptions.rates.yearlyMonthlyPtu)}/PTU-month</option>
              <option value="monthly">1-month · {formatRateCurrency(assumptions.rates.monthlyPtu)}/PTU-month</option>
              <option value="hourly">Hourly · {formatRateCurrency(assumptions.rates.hourlyPtu * 730)}/PTU-month</option>
            </select>
            </div>
            <button
              type="button"
              className="visual-reset"
              onClick={resetDeckInputs}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset inputs
            </button>
          </div>
          <div className="deck-input-strip sticky-inputs">
            {[
              ['rpm', 'Requests/min', 0, 100, 0.1],
              ['cache', 'Cached input', 0, 100, 0.1],
              ['ptu', 'PTUs', minPtu, 1600, ptuIncrement],
              ['input', 'Input tokens/request', 0, 180000, 100],
              ['output', 'Output tokens/request', 0, 2400, 10],
            ].map(([field, label, min, max, step]) => (
              <label key={field} className="deck-input">
                <span>{label}<output>{field === 'cache' ? `${deckInputs[field].toFixed(1)}%` : formatNumber(deckInputs[field])}</output></span>
                <input name={field} type="range" min={min} max={max} step={step} value={deckInputs[field]} onChange={(event) => updateDeckInput(field, event.target.value)} />
              </label>
            ))}
          </div>
        </div>

      </section>

      <section id="calculator-figures" className="visual-grid" aria-label="PTU analysis figures">
        <figure className="visual-panel">
          <figcaption className="figure-heading">
            <h2>Sustained demand determines the relative cost of reserved throughput</h2>
            <p>Monthly cost as a function of sustained request rate for PAYGO-only billing (gray) and {selectedPriceOption.label} PTUs with modeled PAYGO above capacity (orange). The dashed line marks the maximum rate the selected PTUs can serve for the current token mix. Values assume 730 continuous hours per month and use the selected model, deployment, region, and cache share.</p>
            <small className="figure-sources">Sources: <a href="#si-sizing-cost">SI sizing and cost</a> · <a href={modelConfig.official_source || SOURCES.sizing} {...EXTERNAL_LINK_PROPS}>PTU sizing</a> · <a href={SOURCES.caching} {...EXTERNAL_LINK_PROPS}>prompt caching</a> · <a href={SOURCES.reservations} {...EXTERNAL_LINK_PROPS}>reservations</a></small>
          </figcaption>
          <div className="chart-legend" aria-label="Flat load chart legend">
            <span><i className="legend-paygo" /> PAYGO only</span>
            <span><i className="legend-combined" /> PTU + PAYGO</span>
            <span><i className="legend-capacity-line" /> PTU capacity</span>
          </div>
          <div className="visual-chart visual-chart-tall">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flatLoadData} margin={{ top: 12, right: 20, left: 18, bottom: 32 }}>
                <CartesianGrid vertical={false} stroke="#eaecf0" />
                <XAxis
                  dataKey="rpm"
                  ticks={flatTicks}
                  domain={[0, flatMaxRpm]}
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#667085', fontSize: 11 }}
                  label={{ value: 'Sustained requests/min', position: 'insideBottom', offset: -18, fill: '#667085', fontSize: 11 }}
                />
                <YAxis
                  width={72}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: '#667085', fontSize: 11 }}
                  label={{ value: 'Monthly cost (USD)', angle: -90, position: 'insideLeft', offset: -8, fill: '#667085', fontSize: 11 }}
                />
                <Tooltip labelFormatter={(value) => `${value} requests/min`} formatter={(value, name) => [formatCurrency(value), name]} />
                <ReferenceLine
                  x={capacityRpm}
                  stroke="#12b76a"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  ifOverflow="extendDomain"
                  label={{ value: `PTU capacity · ${capacityRpm.toFixed(1)} rpm`, position: 'insideTopLeft', fill: '#087f5b', fontSize: 11 }}
                />
                <Line type="monotone" dataKey="paygo" stroke="#667085" strokeWidth={2} dot={false} name="PAYGO only" />
                <Line type="monotone" dataKey="combined" stroke="#f79009" strokeWidth={2} dot={false} name="PTU + PAYGO" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <figure className="visual-panel">
          <figcaption className="figure-heading figure-heading-with-actions">
            <h2>Workload intensity shifts the PTU economic boundary</h2>
            <p>Difference in modeled monthly cost between PTU + PAYGO and PAYGO-only billing across provisioned PTUs and {heatmapAxis === 'cache' ? 'cached-input share' : 'sustained requests per minute'}. Teal cells favor PTU; orange cells favor PAYGO, with saturation proportional to the absolute cost difference. The dashed curve traces the PTUs required to serve the modeled load without overflow, and the outlined cell marks the current inputs.</p>
            <small className="figure-sources">Sources: <a href="#si-sizing-cost">SI sizing and cost</a> · <a href={modelConfig.official_source || SOURCES.sizing} {...EXTERNAL_LINK_PROPS}>PTU sizing</a> · <a href={SOURCES.caching} {...EXTERNAL_LINK_PROPS}>prompt caching</a> · <a href={SOURCES.pricingApi} {...EXTERNAL_LINK_PROPS}>Retail Prices API</a></small>
            <div className="deck-axis-toggle">
              <button type="button" aria-pressed={heatmapAxis === 'cache'} className={heatmapAxis === 'cache' ? 'is-active' : ''} onClick={() => setHeatmapAxis('cache')}>Cached-input share</button>
              <button type="button" aria-pressed={heatmapAxis === 'rpm'} className={heatmapAxis === 'rpm' ? 'is-active' : ''} onClick={() => setHeatmapAxis('rpm')}>Requests/min</button>
            </div>
          </figcaption>
          <div className="heatmap-layout">
            <div className="heatmap-y-label">{heatmapAxis === 'cache' ? 'Cached-input share' : 'Requests/min'}</div>
            <div className="heatmap-y-ticks">
              <span>{heatmapAxis === 'cache' ? `${Math.round(heatmapYValues[0] || 100)}%` : formatNumber(heatmapYValues[0])}</span>
              <span>{heatmapAxis === 'cache' ? `${Math.round(heatmapYValues[Math.floor(heatmapYValues.length / 2)] || 50)}%` : formatNumber(heatmapYValues[Math.floor(heatmapYValues.length / 2)])}</span>
              <span>{heatmapAxis === 'cache' ? `${Math.round(heatmapYValues.at(-1) || 0)}%` : formatNumber(heatmapYValues.at(-1))}</span>
            </div>
            <div className="heatmap-shell">
              <div className="heatmap">
              {heatmapData.flat().map((cell) => {
                const intensity = clamp(Math.abs(cell.value) / heatmapMaxDifference, 0, 1);
                const color = cell.value <= 0
                  ? `rgba(18, 183, 162, ${0.22 + intensity * 0.78})`
                  : `rgba(247, 144, 9, ${0.22 + intensity * 0.78})`;
                const yDescription = heatmapAxis === 'cache'
                  ? `${Math.round(cell.y)}% cached input`
                  : `${formatNumber(cell.y)} requests/min`;
                const costDescription = cell.value <= 0
                  ? `PTU + PAYGO costs ${formatCurrency(Math.abs(cell.value))} less per month`
                  : `PAYGO costs ${formatCurrency(Math.abs(cell.value))} less per month`;
                return <div key={`${cell.x}-${cell.y}`} className={`heatmap-cell ${cell.selected ? 'is-selected' : ''}`} style={{ backgroundColor: color }} title={`${formatNumber(cell.x)} PTUs · ${yDescription} · ${costDescription}`} />;
              })}
                <svg className="heatmap-capacity-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={heatmapCapacityPoints} vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
              <div className="heatmap-x-ticks"><span>{formatNumber(heatmapXValues[0])}</span><span>{formatNumber(heatmapXValues.at(-1))}</span></div>
              <div className="heatmap-x-label">PTUs</div>
              <div className="heatmap-legend"><span className="heatmap-legend-teal" /> PTU + PAYGO lower <span className="heatmap-legend-orange" /> PAYGO lower <span className="heatmap-legend-capacity" /> PTUs required for full coverage</div>
            </div>
          </div>
        </figure>

        <figure className="visual-panel">
          <figcaption className="figure-heading figure-heading-with-actions">
            <h2>Demand shape determines how often fixed PTU capacity is exceeded</h2>
            <p>Hourly requests across a normalized Monday–Sunday week. Purple shows modeled demand served by the selected PTUs; rose appears only where modeled demand exceeds capacity; the dashed green line is the fixed request-rate capacity for the current token mix. Block, Spike, and Sine redistribute the same daily busy-volume, while the weekend control reduces Saturday and Sunday demand.</p>
            <small className="figure-sources">Sources: <a href="#si-workweek">SI workweek method</a> · <a href={SOURCES.spillover} {...EXTERNAL_LINK_PROPS}>spillover behavior</a> · <a href={SOURCES.pricingApi} {...EXTERNAL_LINK_PROPS}>Retail Prices API</a></small>
            <div className="deck-actions">
              <button type="button" onClick={() => updateDeckInput('ptu', lowestCostPtu.ptu)}>Lowest-cost PTUs</button>
              <button type="button" onClick={() => updateDeckInput('high', deckInputs.low)}>Flatten demand</button>
            </div>
          </figcaption>
          <div className="workweek-controls">
            <div className="deck-input-strip workweek-inputs">
              {[
                ['low', 'Quiet requests/min', 0, 80, 0.1],
                ['high', 'Busy requests/min', 0, 240, 0.1],
                ['busy', 'Busy hours/day', 0, 24, 0.5],
                ['weekend', 'Weekend reduction', 0, 1, 0.01],
              ].map(([field, label, min, max, step]) => (
                <label key={field} className="deck-input">
                  <span>{label}<output>{field === 'weekend' ? `${Math.round(deckInputs[field] * 100)}%` : deckInputs[field]}</output></span>
                  <input name={field} type="range" min={min} max={max} step={step} value={deckInputs[field]} onChange={(event) => updateDeckInput(field, event.target.value)} />
                </label>
              ))}
            </div>
            <div className="workweek-patterns" role="group" aria-label="Demand pattern">
              {[
                ['block', 'Block', 'quiet / busy'],
                ['spike', 'Spike', 'triangular burst'],
                ['sine', 'Sine', 'smooth cycle'],
              ].map(([value, label, description]) => (
                <button type="button" key={value} aria-pressed={workweekPattern === value} className={workweekPattern === value ? 'is-active' : ''} onClick={() => setWorkweekPattern(value)}>
                  <span className="workweek-pattern-name">{label}</span><span>{description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="chart-legend" aria-label="Workweek chart legend">
            <span><i className="legend-handled" /> Handled by PTU</span>
            <span><i className="legend-overflow" /> Above capacity</span>
            <span><i className="legend-capacity-line" /> PTU capacity</span>
          </div>
          <div className="visual-chart visual-chart-tall">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={workweekData} margin={{ top: 16, right: 20, left: 18, bottom: 12 }}>
                <defs>
                  <linearGradient id="weekFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7f56d9" stopOpacity={.45} /><stop offset="100%" stopColor="#7f56d9" stopOpacity={.04} /></linearGradient>
                  <linearGradient id="overflowFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cc6f86" stopOpacity={.7} /><stop offset="100%" stopColor="#cc6f86" stopOpacity={.25} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eaecf0" />
                <XAxis
                  dataKey="hour"
                  type="number"
                  domain={[0, 167]}
                  ticks={[0, 24, 48, 72, 96, 120, 144]}
                  tickFormatter={(hour) => DAY_NAMES[Math.floor(hour / 24)]}
                  padding={{ left: 10, right: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#667085', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="requests"
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactNumber}
                  tick={{ fill: '#667085', fontSize: 10 }}
                  label={{ value: 'Requests/min', angle: -90, position: 'insideLeft', offset: -8, fill: '#667085', fontSize: 11 }}
                />
                <Tooltip labelFormatter={(hour) => workweekData[Math.round(hour)]?.label || ''} formatter={(value, name) => [`${formatNumber(value)} rpm`, name]} />
                <Area yAxisId="requests" type={workweekPattern === 'block' ? 'stepAfter' : 'monotone'} dataKey="handled" stackId="load" stroke="#7f56d9" fill="url(#weekFill)" strokeWidth={2} name="Handled by PTU" />
                <Area yAxisId="requests" type={workweekPattern === 'block' ? 'stepAfter' : 'monotone'} dataKey="overflow" stackId="load" stroke="transparent" fill="url(#overflowFill)" name="Above PTU capacity" />
                <ReferenceLine
                  yAxisId="requests"
                  y={workweekData[0]?.capacity || 0}
                  ifOverflow="extendDomain"
                  stroke="#12b76a"
                  strokeWidth={2}
                  label={{ value: `PTU capacity · ${(workweekData[0]?.capacity || 0).toFixed(1)} requests/min`, position: 'insideTopRight', fill: '#087f5b', fontSize: 11 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <section id="supporting-information" className="visual-panel technical-reference" aria-labelledby="technical-reference-title">
          <header className="figure-heading">
            <h2 id="technical-reference-title">Supporting information</h2>
            <p>Current assumptions, equations, pricing provenance, and model limits for all three figures. Values update with the selected model, deployment, region, price option, and workload controls.</p>
          </header>
          <div className="technical-reference-grid">
            <section className="si-section" aria-labelledby="si-assumptions-title">
              <h3 id="si-assumptions-title">Selected configuration and rates</h3>
              <dl className="deck-table">
                <dt>Selected model</dt><dd><a href={modelConfig.official_source || SOURCES.sizing} {...EXTERNAL_LINK_PROPS}>{modelConfig.name || selectedModel}</a></dd>
                <dt>Deployment</dt><dd>{DEPLOYMENT_LABELS[selectedDeployment] || selectedDeployment} · {selectedRegionLabel}</dd>
                <dt>Capacity unit</dt><dd>{formatNumber(assumptions.throughput)} normalized TPM / PTU</dd>
                <dt>Output weight</dt><dd>{assumptions.outputWeight} normalized input tokens per output token</dd>
                <dt>Deployable PTUs</dt><dd>{minPtu} minimum · increments of {ptuIncrement}</dd>
                <dt>Selected PTU price</dt><dd>{selectedPriceOption.label} · {formatRateCurrency(assumptions.rates.selectedPtu)}/PTU-month</dd>
                <dt>Other PTU prices</dt><dd>{formatRateCurrency(assumptions.rates.monthlyPtu)} 1-month · {formatRateCurrency(assumptions.rates.hourlyPtu * 730)} hourly equivalent</dd>
                <dt>PAYGO rates</dt><dd>{formatRateCurrency(assumptions.rates.active)} uncached input · {formatRateCurrency(assumptions.rates.cached)} modeled cached input · {formatRateCurrency(assumptions.rates.output)} output / 1M tokens</dd>
                <dt>Pricing source</dt><dd>{pricingSourceLabel}{pricingTimestamp ? <> · <time dateTime={currentPricing.livePricingTimestamp}>{pricingTimestamp}</time></> : ''}{currentPricing?.pricingItems ? ` · ${formatNumber(currentPricing.pricingItems)} records inspected` : ''}</dd>
                <dt>Rate sources</dt><dd>PAYGO: {paygoSourceLabel} · PTU: {ptuSourceLabel}</dd>
                <dt>Cost period</dt><dd>730 hours/month · USD retail/list rates, not a quote or negotiated price</dd>
              </dl>
            </section>

            <section id="si-sizing-cost" className="si-section" aria-labelledby="si-sizing-cost-title">
              <h3 id="si-sizing-cost-title">Sizing and cost</h3>
              <div className="deck-formulas">
                <code>normalized tokens/request = input × (1 − cache share) + output × {assumptions.outputWeight}</code>
                <code>normalized TPM = requests/min × normalized tokens/request</code>
                <code>capacity/min = PTUs × {formatNumber(assumptions.throughput)} normalized tokens</code>
                <code>deployable PTUs = max({minPtu}, ceil(raw PTUs ÷ {ptuIncrement}) × {ptuIncrement})</code>
                <code>PAYGO/request = [uncached input × rate + cached input × modeled cached rate + output × rate] ÷ 1,000,000</code>
                <code>PTU + PAYGO model = PTUs × {formatRateCurrency(assumptions.rates.selectedPtu)} + modeled PAYGO above capacity</code>
                <p>Normalized tokens are a sizing measure, not billable tokens. The flat-load and heatmap figures use one constant request shape and do not add utilization headroom or burst variance.</p>
              </div>
            </section>

            <section id="si-workweek" className="si-section" aria-labelledby="si-workweek-title">
              <h3 id="si-workweek-title">Workweek calculation</h3>
              <dl className="deck-table">
                <dt>Time grid</dt><dd>168 one-hour points from Monday 00:00 through Sunday 23:00</dd>
                <dt>Block</dt><dd>Busy level from 09:00 for the selected busy-hours duration</dd>
                <dt>Spike</dt><dd>Triangular profile centered at 14:00</dd>
                <dt>Sine</dt><dd>One smooth 24-hour cycle</dd>
                <dt>Volume control</dt><dd>Each pattern is normalized so its daily shape weights sum to the selected busy hours</dd>
                <dt>Weekend</dt><dd>Saturday and Sunday requests × (1 − weekend reduction)</dd>
                <dt>Handled</dt><dd>min(requests/min, PTU request-rate capacity)</dd>
                <dt>Above capacity</dt><dd>max(requests/min − PTU request-rate capacity, 0)</dd>
                <dt>Lowest-cost PTUs</dt><dd>Minimum modeled PTU + PAYGO cost across deployable PTU quantities; PAYGO only can still cost less</dd>
              </dl>
            </section>

            <section className="si-section" aria-labelledby="si-limits-title">
              <h3 id="si-limits-title">Interpretation limits</h3>
              <ul className="si-limit-list">
                <li>Demand above capacity is an excess-demand cost approximation. Actual spillover is optional, requires a matching Standard deployment, and routes whole requests only after qualifying responses.</li>
                <li>The workweek shapes are illustrative. They do not model request arrivals, latency, retries, or error-triggered routing.</li>
                <li>Cached PAYGO input is modeled as 10% of the active-input rate. The live parser intentionally selects non-cached token meters.</li>
                <li>Pricing can fall back to repository tables when the proxy is unavailable or no suitable meter is found.</li>
              </ul>
            </section>

            <section className="si-section si-api" aria-labelledby="si-api-title">
              <h3 id="si-api-title">Pricing API provenance</h3>
              <dl className="deck-table">
                <dt>Browser request</dt><dd><code>GET {proxyRequest}</code></dd>
                <dt>Upstream endpoint</dt><dd><a href={SOURCES.pricingEndpoint} {...EXTERNAL_LINK_PROPS}>{SOURCES.pricingEndpoint}</a></dd>
                <dt>PAYGO search</dt><dd><code>contains(productName, 'OpenAI') and contains(meterName, '&lt;model meter term&gt;') and armRegionName eq '{selectedRegion}'</code>; then model-family and no-region fallbacks</dd>
                <dt>PTU hourly search</dt><dd><code>contains(productName, 'OpenAI') and contains(meterName, 'Provisioned Managed')</code></dd>
                <dt>Reservation search</dt><dd><code>contains(productName, 'Foundry Provisioned Throughput Reservation') and contains(meterName, 'Provisioned Managed')</code></dd>
                <dt>Selected fields</dt><dd><code>productName</code>, <code>skuName</code>, <code>meterName</code>, <code>armRegionName</code>, <code>retailPrice</code>, <code>unitPrice</code>, <code>unitOfMeasure</code>, <code>type</code>, <code>reservationTerm</code></dd>
                <dt>Request handling</dt><dd>10-second proxy timeout · up to 3 API pages/query via <code>NextPageLink</code> · 3-hour browser cache</dd>
                <dt>Implementation</dt><dd><a href={SOURCES.pricingApiImplementation} {...EXTERNAL_LINK_PROPS}>API route</a> · <a href={SOURCES.pricingServiceImplementation} {...EXTERNAL_LINK_PROPS}>client cache and fallback service</a></dd>
              </dl>
              {currentPricing?.pricingProvenance?.paygo_query && (
                <p className="si-live-query"><span className="si-live-query-label">Matched PAYGO call</span> <a href={currentPricing.pricingProvenance.paygo_query} {...EXTERNAL_LINK_PROPS}>{currentPricing.pricingProvenance.paygo_query}</a></p>
              )}
            </section>

            <footer className="si-source-register" aria-labelledby="si-sources-title">
              <h3 id="si-sources-title">Sources</h3>
              <ol>
                <li><a href={modelConfig.official_source || SOURCES.sizing} {...EXTERNAL_LINK_PROPS}>S1 · Provisioned throughput sizing</a><span>Throughput, output weighting, prompt-cache treatment, minimum PTUs, increments, and sizing formulas.</span></li>
                <li><a href={SOURCES.caching} {...EXTERNAL_LINK_PROPS}>S2 · Prompt caching</a><span>Cache behavior and its effect on provisioned utilization and token cost.</span></li>
                <li><a href={SOURCES.pricingApi} {...EXTERNAL_LINK_PROPS}>S3 · Azure Retail Prices API</a><span>Unauthenticated retail-rate endpoint, filter syntax, response fields, and pagination.</span></li>
                <li><a href={SOURCES.reservations} {...EXTERNAL_LINK_PROPS}>S4 · Foundry PTU reservations</a><span>One-month and one-year reservation terms, billing coverage, and limitations.</span></li>
                <li><a href={SOURCES.spillover} {...EXTERNAL_LINK_PROPS}>S5 · Spillover traffic management</a><span>Configuration prerequisites, qualifying responses, request routing, and PAYGO billing.</span></li>
                <li><a href={SOURCES.pricingPage} {...EXTERNAL_LINK_PROPS}>S6 · Microsoft Foundry pricing</a><span>Published token-rate reference; verify rates before purchase or budget approval.</span></li>
                <li><a href={SOURCES.modelConfig} {...EXTERNAL_LINK_PROPS}>S7 · Calculator model configuration</a><span>Repository values used by the charts, each linked to its stated official source.</span></li>
              </ol>
            </footer>
          </div>
        </section>
      </section>
    </main>
  );
};

export default VisualCalculator;
