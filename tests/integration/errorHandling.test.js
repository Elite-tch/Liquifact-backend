const request = require('supertest');
const appImport = require('../../src/index');
const app = appImport.app || appImport;

describe('API Integration Tests (RFC 7807)', () => {
  test('GET /api/invoices should return 200 with data array', async () => {
    const response = await request(app).get('/api/invoices');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('POST /api/invoices without amount should return 400 Bad Request (Validation Error)', async () => {
    const jwt = require('jsonwebtoken');
    const validToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'test-secret');

    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ customer: 'Test' }); // Missing 'amount'

    expect(response.status).toBe(400);
    // Updated expectation for new unified envelope
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  test('GET /unknown-route should return 404 Not Found in RFC 7807 format', async () => {
    const response = await request(app).get('/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body.type).toBe('https://liquifact.com/probs/not-found');
    expect(response.body.title).toBe('Resource Not Found');
  });

  test('GET /health should return status ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  test('GET /api should return api info', async () => {
    const response = await request(app).get('/api');
    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('LiquiFact API');
  });

  test('GET /api/escrow/:invoiceId should return 200 with escrow data (requires auth)', async () => {
    const jwt = require('jsonwebtoken');
    const validToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'test-secret');

    const response = await request(app)
      .get('/api/escrow/test-invoice')
      .set('Authorization', `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.invoiceId).toBe('test-invoice');
  });

  test('POST /api/invoices with valid payload should succeed', async () => {
    const jwt = require('jsonwebtoken');
    const validToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'test-secret');

    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ amount: 100, customer: 'Test Corp' });

    expect(response.status).toBe(201);
  });
});
