/**
 * @fileoverview CORS allowlist parsing and policy for the LiquiFact API.
 */

'use strict';

const DEV_DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const CORS_REJECTION_MESSAGE = 'The CORS policy for this site does not allow access from the specified Origin.';

/**
 * Parses `CORS_ALLOWED_ORIGINS` into a trimmed, de-duplicated array of origin
 * strings.  Returns an empty array when the variable is absent or blank.
 */
function parseAllowedOrigins(raw) {
  if (!raw || raw.trim() === '') return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Resolves the effective origin allowlist.
 */
function getAllowedOriginsFromEnv(env = process.env) {
  const fromEnv = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (fromEnv.length > 0) return fromEnv;

  if (env.NODE_ENV === 'development') return DEV_DEFAULT_ORIGINS;

  return [];
}

/**
 * Sentinel error thrown when an incoming `Origin` is not on the allowlist.
 */
function createCorsRejectionError() {
  const err = new Error(CORS_REJECTION_MESSAGE);
  err.isCorsOriginRejected = true;
  err.status = 403;
  return err;
}

/**
 * Returns `true` if `err` is the dedicated blocked-origin CORS error.
 */
function isCorsOriginRejectedError(err) {
  return err != null && err.isCorsOriginRejected === true;
}

/**
 * Builds the options object for the `cors` middleware package.
 */
function createCorsOptions(env = process.env) {
  const allowlist = getAllowedOriginsFromEnv(env);

  return {
    origin(origin, callback) {
      if (origin === undefined) {
        return callback(null, true);
      }

      if (allowlist.length > 0 && allowlist.includes(origin)) {
        return callback(null, true);
      }

      return callback(createCorsRejectionError(origin));
    },
    optionsSuccessStatus: 200,
  };
}

module.exports = {
  CORS_REJECTION_MESSAGE,
  createCorsOptions,
  createCorsRejectionError,
  getAllowedOriginsFromEnv,
  getDevelopmentFallbackOrigins: () => DEV_DEFAULT_ORIGINS,
  isCorsOriginRejectedError,
  parseAllowedOrigins,
  /* istanbul ignore next */
  resolveAllowlist: (env) => getAllowedOriginsFromEnv(env),
  DEV_DEFAULT_ORIGINS,
};