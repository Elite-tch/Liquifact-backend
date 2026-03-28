/**
 * @fileoverview Soroban contract interaction wrappers for the LiquiFact API.
 *
 * Wraps raw Soroban / Horizon API calls with the project's exponential-backoff
 * retry utility so that all escrow and invoice state interactions are
 * fault-tolerant against transient network or rate-limit errors.
 *
 * @module services/soroban
 */

'use strict';

/**
 * Retry configuration used for all Soroban contract calls.
 *
 * @constant {Object} SOROBAN_RETRY_CONFIG
 * @property {number} maxRetries  - Maximum number of retry attempts (hard-capped at 10).
 * @property {number} baseDelay   - Initial back-off delay in milliseconds.
 * @property {number} maxDelay    - Maximum delay between retries in milliseconds.
 */
const SOROBAN_RETRY_CONFIG = {
  maxRetries: parseInt(process.env.SOROBAN_MAX_RETRIES || '3', 10),
  baseDelay: parseInt(process.env.SOROBAN_BASE_DELAY || '200', 10),
  maxDelay: parseInt(process.env.SOROBAN_MAX_DELAY || '5000', 10),
};

/**
 * Retryable HTTP status codes from Soroban / Horizon.
 *
 * @constant {Set<number>}
 */
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

/**
 * Sleeps for `ms` milliseconds.
 *
 * @param {number} ms - Duration to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Computes the next back-off delay using exponential backoff with ±20% jitter.
 *
 * The result is clamped to `[0, maxDelay]`.
 *
 * @param {number} attempt    - Zero-based attempt index.
 * @param {number} baseDelay  - Base delay in ms.
 * @param {number} maxDelay   - Ceiling in ms (hard-capped at 60 000 ms).
 * @returns {number} Delay in milliseconds.
 */
function computeBackoff(attempt, baseDelay, maxDelay) {
  const safeCap = Math.min(maxDelay, 60_000);
  const safeBase = Math.min(baseDelay, 10_000);
  const exp = safeBase * 2 ** attempt;
  const jitter = exp * 0.2 * (Math.random() * 2 - 1); // ±20%
  return Math.min(Math.max(0, Math.round(exp + jitter)), safeCap);
}

/**
 * Determines whether an error from a Soroban call is transient and should
 * trigger a retry.
 *
 * @param {unknown} err - Error thrown by the operation.
 * @returns {boolean} `true` if the call should be retried.
 */
function isRetryable(err) {
  if (!err) return false;

  // Check explicit code property
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true;

  // Check HTTP status code
  if (err.status != null && RETRYABLE_STATUS_CODES.has(err.status)) return true;
  if (err.response && RETRYABLE_STATUS_CODES.has(err.response.status)) return true;

  // Alias for compatibility with tests that check message content
  const msg = err.message || '';
  if (/timeout/i.test(msg)) return true;
  if (/429|502|503|504/i.test(msg)) return true;
  if (/rate limit/i.test(msg)) return true;

  return false;
}

/**
 * Executes `operation` with automatic exponential-backoff retries for
 * transient Soroban / Horizon errors.
 *
 * @template T
 * @param {() => Promise<T>} operation - Async function to execute and retry.
 * @param {Object} [config]            - Optional retry configuration override.
 * @param {number} [config.maxRetries] - Max retry attempts (default 3).
 * @param {number} [config.baseDelay]  - Base delay in ms (default 200).
 * @param {number} [config.maxDelay]   - Max delay in ms (default 5 000).
 * @returns {Promise<T>} Resolved value of `operation`.
 */
async function withRetry(operation, config) {
  const cfg = Object.assign({}, SOROBAN_RETRY_CONFIG, config);
  const maxRetries = Math.min(cfg.maxRetries, 10);

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isRetryable(err)) throw err;

      const delay = computeBackoff(attempt, cfg.baseDelay, cfg.maxDelay);
      await sleep(delay);
    }
  }

  throw lastErr;
}

/**
 * Calls a Soroban contract operation with automatic retry on transient errors.
 *
 * @template T
 * @param {() => Promise<T>} operation - Async function wrapping the contract call.
 * @param {Object} [config]            - Optional retry configuration override.
 * @returns {Promise<T>} Result of the contract call.
 */
async function callSorobanContract(operation, config) {
  return withRetry(operation, config);
}

module.exports = {
  callSorobanContract,
  withRetry,
  computeBackoff,
  isRetryable,
  isTransientError: isRetryable, // Alias for tests
  SOROBAN_RETRY_CONFIG,
  RETRYABLE_STATUS_CODES,
};