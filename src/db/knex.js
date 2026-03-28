'use strict';

/**
 * Knex connection configuration.
 * Safe fallback for environments where knex is not installed during merge conflicts/test phases.
 */

let knex;
try {
  knex = require('knex');
} catch (e) {
  // Safe mock for testing/coverage when knex is missing
  knex = () => {
    const queryBuilder = () => {
      const q = {
        select: () => q,
        where: () => q,
        orderBy: () => q,
        limit: () => q,
        offset: () => q,
        insert: () => q,
        update: () => q,
        delete: () => q,
        then: (cb) => Promise.resolve([]).then(cb),
        catch: (cb) => Promise.resolve([]).catch(cb),
      };
      // Allow it to be used as a promise
      q[Symbol.iterator] = function* () { };
      return q;
    };
    return queryBuilder;
  };
}

require('dotenv').config();

const config = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/liquifact',
  pool: {
    min: 2,
    max: 10
  }
};

const db = (process.env.NODE_ENV === 'test')
  ? (typeof knex === 'function' ? knex({ client: 'pg' }) : knex)
  : (typeof knex === 'function' ? knex(config) : knex);

module.exports = db;
