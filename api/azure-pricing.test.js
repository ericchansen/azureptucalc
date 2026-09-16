import { afterEach, describe, expect, it, vi } from 'vitest';
import { isModelMatch, parsePaygoItems } from './azure-pricing.js';

const tokenMeter = ({
  meterName,
  skuName = meterName,
  retailPrice,
  productName = 'Azure OpenAI GPT5',
}) => ({
  meterName,
  skuName,
  productName,
  retailPrice,
  unitOfMeasure: '1M',
  type: 'Consumption',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Azure PAYGO model matching', () => {
  it('matches GPT-5 versions split across product and meter names', () => {
    expect(isModelMatch('5.4 inp Gl 1M Tokens', '5.4 inp Gl', 'Azure OpenAI GPT5', 'gpt-5.4')).toBe(true);
    expect(isModelMatch('5.4 mini inp Gl 1M Tokens', '5.4 mini inp Gl', 'Azure OpenAI GPT5', 'gpt-5.4')).toBe(false);
    expect(isModelMatch('5.4 mini inp Gl 1M Tokens', '5.4 mini inp Gl', 'Azure OpenAI GPT5', 'gpt-5.4-mini')).toBe(true);
  });

  it('keeps GPT-5.2 chat meters with the base model', () => {
    expect(isModelMatch('5.2 chat inp Gl 1M Tokens', '5.2 chat inp Gl', 'Azure OpenAI GPT5', 'gpt-5.2')).toBe(true);
  });

  it('keeps GPT-5 Mini meters out of the GPT-5 base model', () => {
    expect(isModelMatch('GPT 5 inpt Glbl 1M Tokens', 'GPT 5 inpt Glbl', 'Azure OpenAI GPT5', 'gpt-5')).toBe(true);
    expect(isModelMatch('GPT 5 Mini inpt Glbl 1M Tokens', 'GPT 5 Mini inpt Glbl', 'Azure OpenAI GPT5', 'gpt-5')).toBe(false);
  });

  it('selects base-model rates and classifies abbreviated Data Zone meters', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = parsePaygoItems([
      tokenMeter({ meterName: '5.4 inp Gl 1M Tokens', retailPrice: 2.5 }),
      tokenMeter({ meterName: '5.4 opt Gl 1M Tokens', retailPrice: 15 }),
      tokenMeter({ meterName: '5.4 inp Dz 1M Tokens', retailPrice: 2.75 }),
      tokenMeter({ meterName: '5.4 opt Dz 1M Tokens', retailPrice: 16.5 }),
      tokenMeter({ meterName: '5.4 mini inp Gl 1M Tokens', retailPrice: 0.4 }),
      tokenMeter({ meterName: '5.4 cd Inp Gl 1M Tokens', retailPrice: 0.25 }),
    ], 'gpt-5.4');

    expect(result.input).toBe(2.5);
    expect(result.output).toBe(15);
    expect(result.byDeployment.dataZone).toEqual({ input: 2.75, output: 16.5 });
  });
});
