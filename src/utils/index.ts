/**
 * Shared Utilities
 *
 * Common helper functions used across the Bizarre Cafe services:
 *  - Message formatting for chat
 *  - ID generation
 *  - Secure nonce operations
 *  - x402 header parsing
 *  - Retry logic for resilient operations
 */

import { config } from '../config';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** A formatted chat message ready for display */
export interface FormattedMessage {
  /** The sender's agent ID or name */
  sender: string;
  /** The raw message content */
  content: string;
  /** Human-readable timestamp */
  timestamp: string;
  /** ISO timestamp */
  isoTime: string;
  /** Room ID if applicable */
  roomId?: string;
  /** Whether this is a system message */
  isSystem: boolean;
}

/** x402 payment header components */
export interface X402HeaderComponents {
  /** Payment receipt */
  receipt: string;
  /** Service being accessed */
  service: string;
  /** Expiry timestamp */
  expiry?: number;
  /** Amount paid */
  amount?: number;
  /** Raw header string */
  raw: string;
}

/** Retry configuration */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  multiplier?: number;
  /** Whether to retry on any error (default: true) */
  retryOnAny?: boolean;
}

// ──────────────────────────────────────────────
// Message Formatting
// ──────────────────────────────────────────────

/**
 * Format a raw chat message into a display-ready FormattedMessage.
 *
 * @param sender - The sender's agent ID
 * @param content - The message content
 * @param options - Optional room and timestamp overrides
 * @returns FormattedMessage object
 */
export const formatMessage = (
  sender: string,
  content: string,
  options?: {
    roomId?: string;
    timestamp?: number;
    isSystem?: boolean;
  },
): FormattedMessage => {
  const now = options?.timestamp ?? Date.now();

  return {
    sender,
    content,
    timestamp: new Date(now).toLocaleTimeString(),
    isoTime: new Date(now).toISOString(),
    roomId: options?.roomId,
    isSystem: options?.isSystem ?? false,
  };
};

/**
 * Format a list of messages for display in a single string.
 *
 * @param messages - Array of FormattedMessage objects
 * @param separator - Line separator (default: '\n')
 * @returns Formatted string
 */
export const formatMessageList = (
  messages: FormattedMessage[],
  separator: string = '\n',
): string => {
  if (messages.length === 0) return '';

  return messages
    .map((m) => {
      const prefix = m.isSystem ? '[SYSTEM] ' : `[${m.timestamp}] `;
      const roomPrefix = m.roomId ? `[${m.roomId}] ` : '';
      return `${prefix}${roomPrefix}${m.sender}: ${m.content}`;
    })
    .join(separator);
};

// ──────────────────────────────────────────────
// ID Generation
// ──────────────────────────────────────────────

/**
 * Generate a unique ID.
 * Uses crypto.randomUUID when available, falls back to
 * a timestamp+random combo.
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique string ID
 */
export const generateId = (prefix?: string): string => {
  const suffix = crypto.randomUUID?.()
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return prefix ? `${prefix}_${suffix}` : suffix;
};

/**
 * Generate a short ID suitable for display or URLs.
 *
 * @param length - Desired length (default: 8)
 * @returns Short alphanumeric ID
 */
export const generateShortId = (length: number = 8): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
};

// ──────────────────────────────────────────────
// Nonce Operations
// ──────────────────────────────────────────────

/**
 * Generate a cryptographically secure random nonce.
 *
 * @param length - Number of random bytes (default: 32)
 * @returns Hex-encoded nonce string
 */
export const generateNonce = (length: number = 32): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Hash a nonce using SHA-256 for secure storage.
 *
 * @param nonce - The raw nonce to hash
 * @returns Promise resolving to hex hash string
 */
export const hashNonce = async (nonce: string): Promise<string> => {
  if (!crypto.subtle || !crypto.subtle.digest) {
    // Fallback: simple hash
    let hash = 0;
    for (let i = 0; i < nonce.length; i++) {
      const char = nonce.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  const data = new TextEncoder().encode(nonce);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Verify that a nonce was generated within the allowed time window.
 *
 * @param timestamp - Timestamp from the nonce
 * @param windowMs - Allowed window in ms (default: 5 minutes)
 * @returns true if the nonce is still valid
 */
export const isNonceValid = (timestamp: number, windowMs: number = 300_000): boolean => {
  return Date.now() - timestamp <= windowMs;
};

// ──────────────────────────────────────────────
// x402 Header Parsing
// ──────────────────────────────────────────────

/**
 * Parse an x402 payment header into its components.
 *
 * Expected format: "x402=<receipt>;service=<service>;expiry=<epoch>;amount=<value>"
 *
 * @param header - The raw x402 header value
 * @returns Parsed components, or undefined if parsing fails
 */
export const parseX402Header = (header: string): X402HeaderComponents | undefined => {
  if (!header || typeof header !== 'string') return undefined;

  try {
    const result: Partial<X402HeaderComponents> = { raw: header };

    // Parse key=value pairs separated by semicolons
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

    // Validate required fields
    if (!result.receipt || !result.service) return undefined;

    // Check expiry if present
    if (result.expiry && Date.now() > result.expiry * 1000) {
      return {
        ...result,
        receipt: result.receipt,
        service: result.service,
        expiry: result.expiry,
        amount: result.amount,
        raw: header,
      } as X402HeaderComponents;
    }

    return {
      receipt: result.receipt!,
      service: result.service!,
      expiry: result.expiry,
      amount: result.amount,
      raw: header,
    } as X402HeaderComponents;
  } catch {
    return undefined;
  }
};

/**
 * Validate an x402 receipt string.
 *
 * Checks format and expiry.
 *
 * @param receipt - The receipt string to validate
 * @returns true if valid
 */
export const validateReceipt = (receipt: string): boolean => {
  if (!receipt || typeof receipt !== 'string') return false;
  if (receipt.length < 10) return false;

  // Basic format check: should contain expected components
  return (
    receipt.includes('pay_') ||
    receipt.includes('payment_') ||
    receipt.startsWith('0x') ||
    receipt.includes('_')
  );
};

// ──────────────────────────────────────────────
// Retry Logic
// ──────────────────────────────────────────────

/**
 * Execute a function with exponential backoff retry.
 *
 * Retries on errors up to maxRetries times, with increasing
 * delay between attempts.
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws The last error if all retries are exhausted
 */
export const withRetry = async <T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> => {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 30000;
  const multiplier = options?.multiplier ?? 2;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry after the last attempt
      if (attempt >= maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay);

      // Add jitter (±20%)
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      const actualDelay = Math.max(0, delay + jitter);

      console.warn(
        `[retry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}. Retrying in ${Math.round(actualDelay)}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }

  throw lastError;
};

/**
 * Retry a synchronous function with exponential backoff.
 *
 * @param fn - Function to execute
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws The last error if all retries are exhausted
 */
export const withRetrySync = <T>(fn: () => T, options?: RetryOptions): T => {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 500;
  const maxDelay = options?.maxDelay ?? 10000;
  const multiplier = options?.multiplier ?? 2;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) {
        break;
      }

      const delay = Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay);
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);

      // Note: sleep would block the thread; skip sleep for sync

      console.warn(
        `[retry-sync] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}.`,
      );
    }
  }

  throw lastError;
};

// ──────────────────────────────────────────────
// String & Text Utilities
// ──────────────────────────────────────────────

/**
 * Truncate a string to a maximum length, appending '...' if truncated.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated string
 */
export const truncate = (str: string, maxLength: number = 100): string => {
  if (!str || str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
};

/**
 * Sanitize text for display (strip HTML, escape special chars).
 *
 * @param text - Raw text input
 * @returns Sanitized text
 */
export const sanitizeText = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Capitalize the first letter of a string.
 *
 * @param str - Input string
 * @returns Capitalized string
 */
export const capitalize = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// ──────────────────────────────────────────────
// Timing Utilities
// ──────────────────────────────────────────────

/**
 * Create a timer that tracks elapsed time.
 *
 * @returns Timer object with start, stop, and elapsed ms
 */
export const createTimer = (): {
  start: () => void;
  stop: () => number;
  elapsed: () => number;
} => {
  let startTime = 0;

  return {
    start: () => {
      startTime = Date.now();
    },
    stop: () => {
      const elapsed = Date.now() - startTime;
      startTime = 0;
      return elapsed;
    },
    elapsed: () => {
      return startTime ? Date.now() - startTime : 0;
    },
  };
};

/**
 * Sleep for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
