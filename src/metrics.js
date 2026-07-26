'use strict';

/**
 * @fileoverview Prometheus metrics registry and /metrics route handler.
 *
 * Auth strategy (in priority order):
 *   1. If METRICS_BEARER_TOKEN is set, require `Authorization: Bearer <token>`.
 *   2. If METRICS_BEARER_TOKEN is unset, allow requests from loopback only
 *      (127.0.0.1, ::1, ::ffff:127.0.0.1) — suitable for private-network scraping.
 *   3. All other requests receive 401.
 *
 * @module metrics
 */

let client;

try {
  client = require('prom-client');
} catch (_error) {
  /* eslint-disable jsdoc/require-jsdoc */
  /**
   * Minimal registry fallback used when prom-client is unavailable in the
   * local workspace.
   */
  class FallbackRegistry {
    constructor() {
      this.contentType = 'text/plain';
    }

    resetMetrics() {}

    /**
     * Returns the current metrics payload.
     *
     * @returns {Promise<string>} Empty metrics text.
     */
    async metrics() {
      return '';
    }
  }

  /**
   * No-op counter fallback.
   */
  class FallbackCounter {
    constructor() {}

    /**
     * Increments the counter.
     */
    inc() {}
  }

  /**
   * No-op histogram fallback.
   */
  class FallbackHistogram {
    constructor() {}

    /**
     * Records an observation.
     */
    observe() {}
  }

  client = {
    Registry: FallbackRegistry,
    collectDefaultMetrics() {},
    Counter: FallbackCounter,
    Histogram: FallbackHistogram,
  };
  /* eslint-enable jsdoc/require-jsdoc */
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Shared registry — exported so tests can reset it between runs. */
const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

const configReadCacheHits = new client.Counter({
  name: 'liquifact_config_read_cache_hits_total',
  help: 'Total number of config read cache hits',
  registers: [registry],
});

const configReadCacheMisses = new client.Counter({
  name: 'liquifact_config_read_cache_misses_total',
  help: 'Total number of config read cache misses',
  registers: [registry],
});

const invoiceStateRequestDurationMs = new client.Histogram({
  name: 'liquifact_invoice_state_request_duration_ms',
  help: 'Invoice-state request duration in milliseconds',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  labelNames: ['route', 'method', 'status_class', 'error_cause'],
  registers: [registry],
});

const invoiceStateRequestCount = new client.Counter({
  name: 'liquifact_invoice_state_requests_total',
  help: 'Total invoice-state requests',
  labelNames: ['route', 'method', 'status_class', 'error_cause'],
  registers: [registry],
});

/**
 * Express middleware that enforces metrics auth.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function metricsAuth(req, res, next) {
  const token = process.env.METRICS_BEARER_TOKEN;

  if (token) {
    const auth = req.headers['authorization'] || '';
    if (auth === `Bearer ${token}`) {return next();}
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // No token configured — allow loopback only
  const ip = req.ip || req.socket.remoteAddress || '';
  if (LOOPBACK.has(ip)) {return next();}

  res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Express route handler that returns Prometheus metrics.
 *
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
async function metricsHandler(_req, res) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}

module.exports = {
  registry,
  metricsAuth,
  metricsHandler,
  configReadCacheHits,
  configReadCacheMisses,
  invoiceStateRequestDurationMs,
  invoiceStateRequestCount,
};
