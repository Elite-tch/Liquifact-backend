const { validateRequest } = require('../middleware/validate');
const { z } = require('zod');
const AppError = require('../errors/AppError');

describe('Validation Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();
    });

    describe('validateRequest', () => {
        const schema = z.object({
            id: z.string(),
            amount: z.number().positive(),
        });

        it('should call next() if data is valid', () => {
            req = { body: { id: '123', amount: 100 } };
            const middleware = validateRequest(schema);
            middleware(req, res, next);
            expect(next).toHaveBeenCalledWith();
        });

        it('should pass AppError to next() if data is invalid', () => {
            req = { body: { id: '123', amount: -10 } };
            const middleware = validateRequest(schema);
            middleware(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            const error = next.mock.calls[0][0];
            expect(error.status).toBe(400);
            expect(error.title).toBe('Validation Failed');
            expect(error.detail).toContain('amount');
        });
    });
});
