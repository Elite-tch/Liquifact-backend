'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('./index');
const { resetStore, startServer } = app;

const TEST_SECRET = process.env.JWT_SECRET || 'test-secret';
const getToken = () => jwt.sign({ id: Math.random().toString(), role: 'user' }, TEST_SECRET, { expiresIn: '1h' });

async function req(method, path) {
  return request(app)[method](path);
}

function expectSecureHeaders(res) {
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-frame-options']).toBe('DENY');
  expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
  expect(res.headers['content-security-policy']).toContain("default-src 'self'");
}

describe('LiquiFact API', () => {
  beforeEach(() => { resetStore(); });

  describe('Health & Info', () => {
    it('GET /health - returns 200 and status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('status', 'ok');
    });

    it('GET /api - returns 200 and API info', async () => {
      const response = await request(app).get('/api');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('name', 'LiquiFact API');
    });
  });

  describe('Invoices Lifecycle', () => {
    it('POST /api/invoices - creates a new invoice', async () => {
      const token = getToken();
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000, customer: 'Test Corp' });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.amount).toBe(1000);
    });

    it('POST /api/invoices - fails if missing fields', async () => {
      const token = getToken();
      const response = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(response.status).toBe(400);
    });

    it('GET /api/invoices - lists active invoices', async () => {
      const token = getToken();
      await request(app).post('/api/invoices').set('Authorization', `Bearer ${token}`).send({ amount: 1000, customer: 'A' });
      await request(app).post('/api/invoices').set('Authorization', `Bearer ${token}`).send({ amount: 2000, customer: 'B' });

      const response = await request(app).get('/api/invoices');
      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('DELETE /api/invoices/:id - soft deletes an invoice', async () => {
      const token = getToken();
      const postRes = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500, customer: 'Delete Me' });
      const id = postRes.body.data.id;

      const delRes = await request(app).delete(`/api/invoices/${id}`).set('Authorization', `Bearer ${token}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deletedAt).not.toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('unknown route - returns 404', async () => {
      const response = await request(app).get('/unknown-really-unknown');
      expect(response.status).toBe(404);
      expect(response.body.title).toBe('Resource Not Found');
    });
  });
});

describe('Security headers — checklist', () => {
  it('GET /health has required security headers', async () => {
    const res = await req('get', '/health');
    expectSecureHeaders(res);
  });
});
