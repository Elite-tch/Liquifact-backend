'use strict';

/**
 * LiquiFact API Gateway Entry Point
 */

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

/* istanbul ignore next */
function startServer() {
  const server = app.listen(PORT, () => {
    console.warn(`LiquiFact API running at http://localhost:${PORT}`);
  });
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  /* istanbul ignore next */
  startServer();
}

/* istanbul ignore next */
app.startServer = startServer;
/* istanbul ignore next */
app.app = app; // For tests that require { app }

module.exports = app;
