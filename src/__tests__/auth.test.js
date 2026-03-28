const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../app');

describe('Authentication Middleware', () => {
    let app;
    const secret = process.env.JWT_SECRET || 'test-secret';
    const validPayload = { id: 1, role: 'user' };
    let validToken;
    let expiredToken;

    beforeAll(() => {
        app = createApp();
        validToken = jwt.sign(validPayload, secret, { expiresIn: '1h' });
        expiredToken = jwt.sign(validPayload, secret, { expiresIn: '-1h' });
    });

    describe('Route Protection - POST /api/invoices', () => {
        it('should return 401 when no token is provided', async () => {
            const response = await request(app).post('/api/invoices').send({});
            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Authentication Required');
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should return 401 when token format is invalid (missing Bearer)', async () => {
            const response = await request(app)
                .post('/api/invoices')
                .set('Authorization', `FakeBearer ${validToken}`)
                .send({});
            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Invalid Auth Header');
        });

        it('should return 401 when authorization header is malformed (no space)', async () => {
            const response = await request(app)
                .post('/api/invoices')
                .set('Authorization', `Bearer${validToken}`)
                .send({});
            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Invalid Auth Header');
        });

        it('should return 401 when token is invalid', async () => {
            const response = await request(app)
                .post('/api/invoices')
                .set('Authorization', 'Bearer some.invalid.token')
                .send({});
            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Invalid Token');
        });

        it('should return 401 when token is expired', async () => {
            const response = await request(app)
                .post('/api/invoices')
                .set('Authorization', `Bearer ${expiredToken}`)
                .send({});
            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Token Expired');
        });

        it('should return 201 when a valid token is provided', async () => {
            const response = await request(app)
                .post('/api/invoices')
                .set('Authorization', `Bearer ${validToken}`)
                .send({ amount: 100, customer: 'Test Corp' });
            expect(response.status).toBe(201);
            expect(response.body.data.status).toBe('pending_verification');
        });
    });

    describe('Route Protection - GET /api/escrow/:invoiceId', () => {
        it('should allow escrow read with valid token', async () => {
            const response = await request(app)
                .get('/api/escrow/test-invoice')
                .set('Authorization', `Bearer ${validToken}`);
            expect(response.status).toBe(200);
            expect(response.body.data.invoiceId).toBe('test-invoice');
        });

        it('should reject escrow read without token', async () => {
            const response = await request(app).get('/api/escrow/test-invoice');
            expect(response.status).toBe(401);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });
    });
});
