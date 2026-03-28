'use strict';

const AppError = require('../errors/AppError');
const formatProblemDetails = require('../utils/problemDetails');

/**
 * Global error handling middleware
 * Unifies RFC 7807 Problem Details and Issue 19 Standard Response Envelopes.
 */
function errorHandler(err, req, res, _next) {
  /* istanbul ignore next */
  if (res.headersSent) {
    return _next(err);
  }

  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Create Problem Details object
  let problem;
  if (err instanceof AppError) {
    problem = formatProblemDetails({
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.detail,
      instance: err.instance || req.originalUrl,
      stack: err.stack,
    });
  } else {
    // Log unexpected errors
    if (status === 500) {
      console.error('Unhandled Error:', err);
    }

    problem = formatProblemDetails({
      type: 'https://liquifact.com/probs/unexpected-error',
      title: status === 500 ? 'Internal Server Error' : (err.name || 'Error'),
      status: status,
      detail: (status === 500 && process.env.NODE_ENV === 'production')
        ? 'An unexpected error occurred while processing your request.'
        : (status === 500 ? err.toString() : (err.message || 'Error occurred')),
      instance: req.originalUrl,
      stack: err.stack,
    });
  }

  // Issue 19: Standard Response Envelope compatibility
  // We attach these directly to the problem object
  problem.data = null;
  problem.meta = {
    version: '0.1.0',
    timestamp: new Date().toISOString()
  };

  // The 'error' field should contain the message/code for tests
  problem.error = {
    message: problem.title, // Map title to message
    code: err.code || (status === 404 ? 'NOT_FOUND' : (status === 401 ? 'UNAUTHORIZED' : (status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'))),
    details: (process.env.NODE_ENV !== 'production' && status === 500) ? problem.detail : (status === 400 || status === 401 ? problem.detail : null)
  };

  // RFC 7807: Content-Type must be 'application/problem+json'
  res.header('Content-Type', 'application/problem+json');

  return res.status(status).json(problem);
}

module.exports = errorHandler;
