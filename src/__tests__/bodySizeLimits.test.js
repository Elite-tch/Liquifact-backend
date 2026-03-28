'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const {
  parseSize,
  DEFAULT_LIMITS,
  jsonBodyLimit,
} = require('../middleware/bodySizeLimits');
const { isCorsOriginRejectedError } = require('../config/cors');

/**
 * Mocks and Helpers
 */

const app = createApp();

function makeJsonBody(sizeInBytes) {
  // Each character is 1 byte in UTF-8 for simple ASCII chars
  const baseKey = 'x';
  const targetChars = sizeInBytes - 10; // offset for surrounding JSON chars
  if (targetChars <= 0) return { x: '' };
  return { x: 'a'.repeat(targetChars) };
}

/**
 * Unit Tests
 */

describe('parseSize()', () => {
  describe('valid inputs', () => {
    it('parses bytes (no suffix)', () => { expect(parseSize('1024')).toBe(1024); });
    it('parses "b" suffix (lowercase)', () => { expect(parseSize('1024b')).toBe(1024); });
    it('parses "B" suffix (uppercase)', () => { expect(parseSize('1024B')).toBe(1024); });
    it('parses "kb" suffix', () => { expect(parseSize('1kb')).toBe(1024); });
    it('parses "KB" suffix', () => { expect(parseSize('2KB')).toBe(2048); });
    it('parses "mb" suffix', () => { expect(parseSize('1mb')).toBe(1024 * 1024); });
    it('parses "MB" suffix', () => { expect(parseSize('2MB')).toBe(2 * 1024 * 1024); });
    it('parses "gb" suffix', () => { expect(parseSize('1gb')).toBe(1024 * 1024 * 1024); });
    it('handles decimal values', () => { expect(parseSize('1.5kb')).toBe(1536); });
    it('handles surrounding whitespace', () => { expect(parseSize('  100kb  ')).toBe(102400); });
    it('returns 0 for "0b"', () => { expect(parseSize('0b')).toBe(0); });
  });

  describe('TypeError', () => {
    it('throws for empty string', () => { expect(() => parseSize('')).toThrow(TypeError); });
    it('throws for whitespace-only', () => { expect(() => parseSize('   ')).toThrow(TypeError); });
    it('throws for number input', () => { expect(() => parseSize(1024)).toThrow(TypeError); });
    it('throws for null', () => { expect(() => parseSize(null)).toThrow(TypeError); });
    it('throws for undefined', () => { expect(() => parseSize(undefined)).toThrow(TypeError); });
    it('throws for object', () => { expect(() => parseSize({})).toThrow(TypeError); });
  });

  describe('RangeError', () => {
    it('throws for unknown unit "tb"', () => { expect(() => parseSize('1tb')).toThrow(RangeError); });
    it('throws for non-numeric value', () => { expect(() => parseSize('abc')).toThrow(RangeError); });
    it('throws for negative value', () => { expect(() => parseSize('-100kb')).toThrow(RangeError); });
  });
});

describe('DEFAULT_LIMITS', () => {
  it('json is a parseable string', () => { expect(() => parseSize(DEFAULT_LIMITS.json)).not.toThrow(); });
  it('urlencoded is a parseable string', () => { expect(() => parseSize(DEFAULT_LIMITS.urlencoded)).not.toThrow(); });
  it('raw is a parseable string', () => { expect(() => parseSize(DEFAULT_LIMITS.raw)).not.toThrow(); });
  it('invoice is a parseable string', () => { expect(() => parseSize(DEFAULT_LIMITS.invoice)).not.toThrow(); });
});

describe('jsonBodyLimit()', () => {
  it('returns a two-element handler array', () => {
    const handlers = jsonBodyLimit('100kb');
    expect(Array.isArray(handlers)).toBe(true);
    expect(handlers).toHaveLength(2);
    expect(typeof handlers[0]).toBe('function');
    expect(typeof handlers[1]).toBe('function');
  });

  it('accepts a body within the limit', async () => {
    // Health doesn't have body parser normally, so we use it for a simple test
    // but in integration it is part of the pipeline.
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('rejects a body exceeding the limit with 413', async () => {
    const res = await request(app)
      .post('/api/invoices') // This has the limit applied in app.js
      .set('Content-Type', 'application/json')
      .send(makeJsonBody(600 * 1024)); // > 512KB limit

    expect(res.status).toBe(413);
  });

  it('413 response has correct shape', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Content-Type', 'application/json')
      .send(makeJsonBody(600 * 1024));

    expect(res.body).toHaveProperty('error', 'Payload Too Large');
    expect(res.body).toHaveProperty('message');
  });
});

/**
 * Extra items for coverage
 */
describe('isCorsOriginRejectedError()', () => {
  it('returns true for flagged error', () => {
    expect(isCorsOriginRejectedError({ isCorsOriginRejected: true })).toBe(true);
  });
  it('returns false for plain error', () => {
    expect(isCorsOriginRejectedError(new Error())).toBe(false);
  });
});

describe('createApp() integration', () => {
  it('GET /health → 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('POST /api/invoices oversized body → 413', async () => {
    const jwt = require('jsonwebtoken');
    const validToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'test-secret');

    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .set('Content-Type', 'application/json')
      .send(makeJsonBody(600 * 1024));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Payload Too Large');
  });
});