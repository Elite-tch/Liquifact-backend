'use strict';

const API_VERSION = '0.1.0';

/**
 * Standard Success Envelope
 */
const success = (data, meta = {}) => {
  const message = meta.message || undefined;
  return {
    data,
    message,
    meta: {
      ...meta,
      timestamp: new Date().toISOString(),
      version: API_VERSION,
    },
    error: null,
  };
};

/**
 * Standard Error Envelope
 */
const error = (message, code = 'INTERNAL_ERROR', details = null) => ({
  data: null,
  message,
  meta: {
    timestamp: new Date().toISOString(),
    version: API_VERSION,
  },
  error: {
    message,
    code,
    details,
  },
});

module.exports = { success, error };
