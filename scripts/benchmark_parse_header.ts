import { performance } from 'node:perf_hooks';

// Original implementation
export const parseX402HeaderOriginal = (header: string) => {
  if (!header || typeof header !== 'string') return undefined;

  try {
    const result: any = { raw: header };
    const parts = header.split(';');

    for (const part of parts) {
      const trimmed = part.trim();

      if (trimmed.startsWith('x402=')) {
        result.receipt = trimmed.slice(5);
      } else if (trimmed.startsWith('service=')) {
        result.service = trimmed.slice(8);
      } else if (trimmed.startsWith('expiry=')) {
        const expiry = Number(trimmed.slice(7));
        if (!Number.isNaN(expiry)) {
          result.expiry = expiry;
        }
      } else if (trimmed.startsWith('amount=')) {
        const amount = Number(trimmed.slice(7));
        if (!Number.isNaN(amount)) {
          result.amount = amount;
        }
      }
    }

    if (!result.receipt || !result.service) return undefined;

    return {
      receipt: result.receipt,
      service: result.service,
      expiry: result.expiry,
      amount: result.amount,
      raw: header,
    };
  } catch {
    return undefined;
  }
};

// Single-pass / indexOf implementation
export const parseX402HeaderOptimized = (header: string) => {
  if (!header || typeof header !== 'string') return undefined;

  try {
    let receipt: string | undefined;
    let service: string | undefined;
    let expiry: number | undefined;
    let amount: number | undefined;

    let start = 0;
    const len = header.length;

    while (start < len) {
      let end = header.indexOf(';', start);
      if (end === -1) end = len;

      // Skip leading whitespace in part
      let pStart = start;
      while (pStart < end && header.charCodeAt(pStart) <= 32) {
        pStart++;
      }
      // Skip trailing whitespace in part
      let pEnd = end;
      while (pEnd > pStart && header.charCodeAt(pEnd - 1) <= 32) {
        pEnd--;
      }

      const partLen = pEnd - pStart;

      if (partLen > 5 && header.startsWith('x402=', pStart)) {
        receipt = header.slice(pStart + 5, pEnd);
      } else if (partLen > 8 && header.startsWith('service=', pStart)) {
        service = header.slice(pStart + 8, pEnd);
      } else if (partLen > 7 && header.startsWith('expiry=', pStart)) {
        const val = Number(header.slice(pStart + 7, pEnd));
        if (!Number.isNaN(val)) expiry = val;
      } else if (partLen > 7 && header.startsWith('amount=', pStart)) {
        const val = Number(header.slice(pStart + 7, pEnd));
        if (!Number.isNaN(val)) amount = val;
      }

      start = end + 1;
    }

    if (!receipt || !service) return undefined;

    return {
      receipt,
      service,
      expiry,
      amount,
      raw: header,
    };
  } catch {
    return undefined;
  }
};

// Verification test
const testCases = [
  'x402=pay_1234567890;service=ai-chat;expiry=1700000000;amount=10',
  '  x402=0xabc123  ;  service=mystic-oracle ; expiry=1800000000 ; amount=50  ',
  'x402=pay_123;service=test',
  'invalid_header_format',
  'x402=pay_123',
  'service=test',
  'x402=pay_123;service=test;expiry=invalid;amount=abc',
  '',
];

for (const tc of testCases) {
  const orig = parseX402HeaderOriginal(tc);
  const opt = parseX402HeaderOptimized(tc);
  if (JSON.stringify(orig) !== JSON.stringify(opt)) {
    console.error('Mismatch for:', tc);
    console.error('Orig:', orig);
    console.error('Opt:', opt);
    process.exit(1);
  }
}
console.log('All test cases matched!');

// Benchmark
const headersToBench = [
  'x402=pay_1234567890;service=ai-chat;expiry=1700000000;amount=10',
  '  x402=0xabc123  ;  service=mystic-oracle ; expiry=1800000000 ; amount=50  ',
  'x402=pay_123;service=test',
];

const iterations = 1000000;

// Warmup
for (let i = 0; i < 10000; i++) {
  parseX402HeaderOriginal(headersToBench[i % headersToBench.length]);
  parseX402HeaderOptimized(headersToBench[i % headersToBench.length]);
}

const t0 = performance.now();
for (let i = 0; i < iterations; i++) {
  parseX402HeaderOriginal(headersToBench[i % headersToBench.length]);
}
const t1 = performance.now();

const t2 = performance.now();
for (let i = 0; i < iterations; i++) {
  parseX402HeaderOptimized(headersToBench[i % headersToBench.length]);
}
const t3 = performance.now();

console.log(`Original: ${(t1 - t0).toFixed(2)} ms`);
console.log(`Optimized: ${(t3 - t2).toFixed(2)} ms`);
console.log(`Speedup: ${((t1 - t0) / (t3 - t2)).toFixed(2)}x`);
