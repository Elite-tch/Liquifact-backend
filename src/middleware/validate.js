const { ZodError } = require('zod');
const AppError = require('../errors/AppError');

/**
 * Middleware to validate the request part (body, query, params) against a Zod schema.
 */
const validateRequest = (schema, part = 'body') => (req, res, next) => {
    try {
        const validatedPart = schema.parse(req[part]);
        req[part] = validatedPart;
        next();
    } catch (error) {
        if (error instanceof ZodError) {
            return next(new AppError({
                type: 'https://liquifact.com/probs/validation-error',
                title: 'Validation Failed',
                status: 400,
                detail: (error.issues || []).map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
                instance: req.originalUrl,
            }));
        }
        next(error);
    }
};

/**
 * Middleware to validate the response body against a Zod schema.
 */
const validateResponse = (schema) => (req, res, next) => {
    const originalJson = res.json;

    res.json = function (body) {
        // Skip validation for known error shapes or non-objects
        if (body && (body.title || body.error || typeof body !== 'object')) {
            return originalJson.call(this, body);
        }

        try {
            const validatedBody = schema.parse(body);
            return originalJson.call(this, validatedBody);
        } catch (error) {
            /* istanbul ignore next */
            if (error instanceof ZodError) {
                console.error('Response validation failed:', error.issues);
                return originalJson.call(this.status(500), { error: 'Internal server error: Response validation failed' });
            }
            // In rare cases where another error happens, just throw
            /* istanbul ignore next */
            return originalJson.call(this.status(500), { error: 'Internal server error' });
        }
    };

    next();
};

module.exports = {
    validateRequest,
    validateResponse,
};
