const request = require('supertest');
const { createApp } = require('./app');
const { CORS_REJECTION_MESSAGE } = require('./config/cors');

describe('LiquiFact app integration plus', () => {
  let app;
  beforeAll(() => { app = createApp(); });

  it('standard success response structure', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body).toHaveProperty('meta');
  });

  it('allows undefined origin (non-browser)', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });

  it('rejects blocked origins', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.com');
    expect(response.status).toBe(403);
  });

  it('trigger 500 error path', async () => {
    const response = await request(app).get('/debug/error');
    expect(response.status).toBe(500);
    expect(response.body.title).toBe('Internal Server Error');
  });

  it('unknown route 404', async () => {
    const response = await request(app).get('/not-found-anywhere');
    expect(response.status).toBe(404);
    expect(response.body.title).toBe('Resource Not Found');
  });
});
