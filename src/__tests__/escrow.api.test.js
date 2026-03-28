'use strict';

const request = require('supertest');
const { createApp } = require('../app');
const jwt = require('jsonwebtoken');

describe('Escrow API Integration', () => {
    let app;
    let token;
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

    beforeAll(() => {
        app = createApp();
        token = jwt.sign({ id: 1, email: 'test@example.com' }, JWT_SECRET);
    });

    describe('GET /api/escrow/:invoiceId', () => {
        it('should return 401 if not authenticated', async () => {
            const res = await request(app).get('/api/escrow/inv_123');
            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should return escrow status for a valid invoice (even ID -> funded)', async () => {
            const res = await request(app)
                .get('/api/escrow/inv_100')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.invoiceId).toBe('inv_100');
            expect(res.body.data.status).toBe('funded');
            expect(res.body.data.amountInEscrow).toBe(1000);
            expect(res.body.message).toContain('synchronized');
        });

        it('should return escrow status for a pending invoice (odd ID -> pending)', async () => {
            const res = await request(app)
                .get('/api/escrow/inv_101')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('pending');
            expect(res.body.data.amountInEscrow).toBe(0);
        });

        it('should return 404 for a non-existent route (sanity check)', async () => {
            const res = await request(app)
                .get('/api/escrow-not-real/123')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });
});
