// Preserve provider monetary tokens before JavaScript can round a JSON number.
export class ProviderNumber { constructor(readonly decimal: string) {} }

export function parseProviderJson(text: string): unknown {
  if (text.length > 2_000_000) throw new Error('Provider response too large');
  let offset = 0;
  const space = () => { while (/[ \t\n\r]/.test(text[offset] ?? '') && offset < text.length) offset++; };
  function value(depth: number): unknown {
    if (depth > 64) throw new Error('Provider response too deep');
    space();
    const c = text[offset];
    if (c === '"') {
      const start = offset++;
      while (offset < text.length) {
        if (text[offset] === '\\') { offset += 2; continue; }
        if (text[offset++] === '"') return JSON.parse(text.slice(start, offset));
      }
      throw new Error('Invalid provider string');
    }
    if (c === '[' || c === '{') {
      offset++;
      const array: unknown[] = [], object: Record<string, unknown> = Object.create(null);
      const end = c === '[' ? ']' : '}';
      space();
      if (text[offset] === end) { offset++; return c === '[' ? array : object; }
      for (;;) {
        if (c === '[') array.push(value(depth + 1));
        else {
          space();
          if (text[offset] !== '"') throw new Error('Invalid provider object');
          const key = value(depth + 1) as string;
          if (Object.hasOwn(object, key)) throw new Error('Duplicate provider field');
          space();
          if (text[offset++] !== ':') throw new Error('Invalid provider object');
          object[key] = value(depth + 1);
        }
        space();
        if (text[offset] === end) { offset++; return c === '[' ? array : object; }
        if (text[offset++] !== ',') throw new Error('Invalid provider separator');
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, offset)) { offset += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(offset));
    if (!number) throw new Error('Invalid provider JSON');
    offset += number[0].length;
    return new ProviderNumber(number[0]);
  }
  const result = value(0);
  space();
  if (offset !== text.length) throw new Error('Trailing provider JSON');
  return result;
}

export function providerUsd(value: unknown, invert = false): string {
  if (!(value instanceof ProviderNumber) || value.decimal.length > 80) throw new Error('Exact provider amount required');
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value.decimal)!;
  const fraction = match[3] ?? '', exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 30) throw new Error('Provider amount outside bounds');
  let cents = BigInt(match[2] + fraction);
  const scale = 2 + exponent - fraction.length;
  if (scale >= 0) cents *= 10n ** BigInt(scale);
  else {
    const divisor = 10n ** BigInt(-scale);
    if (cents % divisor !== 0n) throw new Error('Provider amount has fractions of a cent');
    cents /= divisor;
  }
  if (cents > 999999999999999n) throw new Error('Provider amount outside bounds');
  const negative = (match[1] === '-') !== invert;
  return (negative && cents !== 0n ? '-' : '') + (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
}

export function providerObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof ProviderNumber) throw new Error('Provider object required');
  return value as Record<string, unknown>;
}

export async function limitedProviderBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing provider response');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error('Provider response too large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
