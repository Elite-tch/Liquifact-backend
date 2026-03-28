'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { globalLimiter, sensitiveLimiter } = require('./middleware/rateLimit');
const { authenticateToken } = require('./middleware/auth');
const { validateRequest, validateResponse } = require('./middleware/validate');
const schemas = require('./schemas/apiSchemas');
const { createSecurityMiddleware } = require('./middleware/security');
const { createCorsOptions, isCorsOriginRejectedError } = require('./config/cors');
const {
  jsonBodyLimit,
  urlencodedBodyLimit,
  invoiceBodyLimit,
  payloadTooLargeHandler
} = require('./middleware/bodySizeLimits');
const { validateInvoiceQueryParams } = require('./utils/validators');
const invoiceService = require('./services/invoice.service');
const escrowService = require('./services/escrow.service');
const { success } = require('./utils/responseHelper');

const asyncHandler = require('./utils/asyncHandler');
const AppError = require('./errors/AppError');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  let invoices = [];

  // Security & Hardening
  app.use(createSecurityMiddleware());
  app.use(cors(createCorsOptions()));
  app.use(...jsonBodyLimit());
  app.use(...urlencodedBodyLimit());
  app.use(globalLimiter);

  /**
   * Root Routes
   */
  app.get('/health', (req, res) => {
    return res.json(success({
      status: 'ok',
      service: 'liquifact-api',
      version: '0.1.0',
    }));
  });

  app.get('/api', (req, res) => {
    return res.json(success({
      name: 'LiquiFact API',
      description: 'Global Invoice Liquidity Network on Stellar',
      endpoints: {
        health: 'GET /health',
        invoices: 'GET/POST /api/invoices',
        escrow: 'GET/POST /api/escrow',
      },
    }));
  });

  /**
   * Invoice Operations
   */
  app.get('/api/invoices', validateResponse(schemas.InvoiceListResponseSchema), asyncHandler(async (req, res) => {
    const v = validateInvoiceQueryParams(req.query);
    if (!v.isValid) {
      throw new AppError({
        type: 'https://liquifact.com/probs/validation-error',
        title: 'Invalid Request Parameters',
        status: 400,
        detail: v.errors.join(', '),
      });
    }

    // Combine service data (DB/Mock) with in-memory (this session)
    const sInvoices = await invoiceService.getInvoices(v.validatedParams);
    const includeDeleted = req.query.includeDeleted === 'true';
    const fInMemory = includeDeleted ? invoices : invoices.filter(i => !i.deletedAt);

    return res.json(success([...sInvoices, ...fInMemory], { message: 'Invoices retrieved successfully.' }));
  }));

  app.post('/api/invoices',
    ...invoiceBodyLimit(),
    sensitiveLimiter,
    authenticateToken,
    validateRequest(schemas.CreateInvoiceRequestSchema, 'body'),
    validateResponse(schemas.CreateInvoiceResponseSchema),
    (req, res) => {
      const { amount, customer } = req.body;
      const newInvoice = {
        id: `inv_${Date.now()}`,
        amount,
        customer: customer || 'Unknown',
        status: 'pending_verification',
        createdAt: new Date().toISOString(),
        deletedAt: null,
      };

      invoices.push(newInvoice);
      return res.status(201).json(success(newInvoice));
    }
  );

  app.delete('/api/invoices/:id', authenticateToken, sensitiveLimiter, (req, res) => {
    const { id } = req.params;
    const idx = invoices.findIndex(i => String(i.id) === id);
    if (idx === -1) {
      throw new AppError({
        type: 'https://liquifact.com/probs/not-found',
        title: 'Invoice Not Found',
        status: 404,
        detail: `Invoice ${id} not found.`,
      });
    }
    invoices[idx].deletedAt = new Date().toISOString();
    return res.json(success(invoices[idx]));
  });

  /**
   * Contract & Escrow
   */
  app.get('/api/escrow/:invoiceId',
    authenticateToken,
    validateResponse(schemas.EscrowResponseSchema),
    asyncHandler(async (req, res) => {
      const { invoiceId } = req.params;
      const data = await escrowService.getEscrowStatus(invoiceId);
      res.json(success(data, { message: 'Escrow state synchronized with Soroban blockchain.' }));
    })
  );

  /** 
   * Debug & Testing triggers
   */
  app.get('/debug/error', (req, res, next) => {
    next(new Error('Triggered Error'));
  });

  app.get('/standard', (req, res) => {
    res.json({ ok: true });
  });

  // Error Handling
  app.use((req, res, next) => {
    next(new AppError({
      type: 'https://liquifact.com/probs/not-found',
      title: 'Resource Not Found',
      status: 404,
      detail: `The path ${req.path} does not exist.`,
    }));
  });

  app.use((err, req, res, next) => {
    if (isCorsOriginRejectedError(err)) return res.status(403).json({ error: err.message });
    next(err);
  });

  app.use(payloadTooLargeHandler);
  app.use(errorHandler);

  // Helper for tests to reset local state
  app.resetStore = () => { invoices = []; };

  return app;
}

const defaultApp = createApp();
module.exports = defaultApp;
module.exports.createApp = createApp;
