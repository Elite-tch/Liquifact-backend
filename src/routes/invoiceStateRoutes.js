/**
 * Invoice State Transition Routes
 * Handles invoice lifecycle state transitions with audit logging
 * 
 * @module routes/invoiceStateRoutes
 */

const express = require('express');
const router = express.Router();
const {
  INVOICE_STATES,
  executeTransition,
  getAllowedTransitions,
  getTransitionHistory,
  canLinkToEscrow,
} = require('../services/invoiceStateMachine');
const { getAuditLogs } = require('../services/auditLog');
const logger = require('../logger');
const {
  invoiceStateRequestDurationMs,
  invoiceStateRequestCount,
} = require('../metrics');

/**
 * Helper to extract actor from request
 * In production, this would come from JWT middleware
 * 
 * @param {import('express').Request} req Express request object
 * @returns {string} Actor identifier
 */
function getActorFromRequest(req) {
  if (req.user && req.user.id) {
    return req.user.id;
  }
  if (req.user && req.user.sub) {
    return req.user.sub;
  }
  // Fallback to IP for unauthenticated requests (should not happen in production)
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Mock invoice database
 * In production, this would be replaced with actual database queries
 */
const mockInvoices = new Map([
  ['inv-001', { id: 'inv-001', status: 'pending', amount: 1000, customer: 'Acme Corp' }],
  ['inv-002', { id: 'inv-002', status: 'approved', amount: 2000, customer: 'TechCo' }],
  ['inv-003', { id: 'inv-003', status: 'linked_escrow', amount: 5000, customer: 'GlobalInc' }],
]);

/**
 * Classifies an HTTP status code into a coarse status bucket.
 *
 * @param {number} statusCode - HTTP status code.
 * @returns {string} Status class label.
 */
function classifyStatus(statusCode) {
  if (statusCode >= 500) {
    return '5xx';
  }
  if (statusCode >= 400) {
    return '4xx';
  }
  return '2xx';
}

/**
 * Wraps a route handler so invoice-state requests emit metrics and logs.
 *
 * @param {string} routeName - Stable route label for telemetry.
 * @param {Function} handler - Route handler to execute.
 * @returns {Function} Wrapped Express handler.
 */
function instrumentRequest(routeName, handler) {
  return async (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    let errorCause = 'none';

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const statusClass = classifyStatus(res.statusCode);
      if (statusClass === '4xx') {
        errorCause = 'client_error';
      } else if (statusClass === '5xx') {
        errorCause = 'server_error';
      } else if (errorCause === 'unknown_error') {
        errorCause = 'none';
      }

      invoiceStateRequestDurationMs.observe({
        route: routeName,
        method: req.method,
        status_class: statusClass,
        error_cause: errorCause,
      }, durationMs);

      invoiceStateRequestCount.inc({
        route: routeName,
        method: req.method,
        status_class: statusClass,
        error_cause: errorCause,
      });

      logger.info({
        route: routeName,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        errorCause,
      }, 'Invoice-state request completed');
    });

    res.on('close', () => {
      if (res.writableEnded) {
        return;
      }
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.warn({
        route: routeName,
        method: req.method,
        path: req.path,
        durationMs,
        errorCause: 'client_disconnect',
      }, 'Invoice-state request closed before completion');
    });

    try {
      await Promise.resolve(handler(req, res, (err) => {
        if (err) {
          errorCause = classifyErrorCause(err);
        }
        next(err);
      }));
    } catch (error) {
      errorCause = classifyErrorCause(error);
      throw error;
    }
  };
}

/**
 * Maps an error object to a coarse telemetry cause label.
 *
 * @param {Error|null|undefined} error - Error raised by a handler.
 * @returns {string} Error cause label.
 */
function classifyErrorCause(error) {
  if (!error) {
    return 'none';
  }
  if (error.code && typeof error.code === 'string') {
    return error.code;
  }
  if (error.statusCode >= 500) {
    return 'server_error';
  }
  if (error.statusCode >= 400) {
    return 'client_error';
  }
  return 'unknown_error';
}

/**
 * GET /api/invoices/:id/state
 * Get current state and allowed transitions for an invoice
 */
router.get('/:id/state', instrumentRequest('invoice-state:get', (req, res) => {
  const { id } = req.params;

  // Get invoice from database
  const invoice = mockInvoices.get(id);

  if (!invoice) {
    res.status(404).json({
      error: 'Invoice not found',
      code: 'INVOICE_NOT_FOUND',
    });
    return;
  }

  const currentState = invoice.status;
  const allowedTransitions = getAllowedTransitions(currentState);

  res.json({
    data: {
      invoiceId: id,
      currentState,
      allowedTransitions,
      isTerminal: allowedTransitions.length === 0,
    },
    message: 'Invoice state retrieved successfully',
  });
}));

/**
 * POST /api/invoices/:id/transition
 * Execute a state transition
 * 
 * Request body:
 * {
 *   "targetState": "approved",
 *   "reason": "Invoice verified and approved by finance team"
 * }
 */
router.post('/:id/transition', instrumentRequest('invoice-state:transition', (req, res, next) => {
  const { id } = req.params;
  const { targetState, reason } = req.body;

  try {
    // Validate request body
    if (!targetState) {
      res.status(400).json({
        error: 'Target state is required',
        code: 'MISSING_TARGET_STATE',
      });
      return;
    }

    // Get invoice from database
    const invoice = mockInvoices.get(id);

    if (!invoice) {
      res.status(404).json({
        error: 'Invoice not found',
        code: 'INVOICE_NOT_FOUND',
      });
      return;
    }

    const currentState = invoice.status;
    const actor = getActorFromRequest(req);
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // Execute transition
    const result = executeTransition({
      invoiceId: id,
      currentState,
      targetState,
      actor,
      reason,
      ipAddress,
      userAgent,
      metadata: {
        method: req.method,
        path: req.path,
      },
    });

    // Update invoice in database
    invoice.status = targetState;
    invoice.updatedAt = new Date().toISOString();
    invoice.updatedBy = actor;

    res.status(200).json({
      data: {
        invoiceId: id,
        previousState: result.previousState,
        currentState: result.newState,
        transitionedAt: result.transitionedAt,
        transitionedBy: result.transitionedBy,
        reason,
        auditLogId: result.auditLog.id,
      },
      message: `Invoice transitioned from ${result.previousState} to ${result.newState}`,
    });
  } catch (error) {
    // Handle validation errors
    if (error.code) {
      return res.status(400).json({
        error: error.message,
        code: error.code,
        allowedTransitions: error.allowedTransitions,
      });
    }

    // Pass unexpected errors to error handler
    next(error);
  }
}));

/**
 * POST /api/invoices/:id/approve
 * Convenience endpoint to approve an invoice
 */
router.post('/:id/approve', instrumentRequest('invoice-state:approve', (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const invoice = mockInvoices.get(id);

    if (!invoice) {
      res.status(404).json({
        error: 'Invoice not found',
        code: 'INVOICE_NOT_FOUND',
      });
      return;
    }

    const currentState = invoice.status;
    const actor = getActorFromRequest(req);
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = executeTransition({
      invoiceId: id,
      currentState,
      targetState: INVOICE_STATES.APPROVED,
      actor,
      reason: reason || 'Invoice approved',
      ipAddress,
      userAgent,
      metadata: {
        method: req.method,
        path: req.path,
        action: 'approve',
      },
    });

    invoice.status = INVOICE_STATES.APPROVED;
    invoice.updatedAt = new Date().toISOString();
    invoice.updatedBy = actor;

    res.status(200).json({
      data: {
        invoiceId: id,
        previousState: result.previousState,
        currentState: result.newState,
        transitionedAt: result.transitionedAt,
        transitionedBy: result.transitionedBy,
        auditLogId: result.auditLog.id,
      },
      message: 'Invoice approved successfully',
    });
  } catch (error) {
    if (error.code) {
      return res.status(400).json({
        error: error.message,
        code: error.code,
        allowedTransitions: error.allowedTransitions,
      });
    }
    next(error);
  }
}));

/**
 * POST /api/invoices/:id/link-escrow
 * Link an approved invoice to escrow
 */
router.post('/:id/link-escrow', instrumentRequest('invoice-state:link-escrow', (req, res, next) => {
  const { id } = req.params;
  const { escrowId, reason } = req.body;

  try {
    const invoice = mockInvoices.get(id);

    if (!invoice) {
      res.status(404).json({
        error: 'Invoice not found',
        code: 'INVOICE_NOT_FOUND',
      });
      return;
    }

    // Validate business rules
    const linkValidation = canLinkToEscrow(invoice);
    if (!linkValidation.canLink) {
      res.status(400).json({
        error: linkValidation.reason,
        code: 'CANNOT_LINK_TO_ESCROW',
      });
      return;
    }

    const currentState = invoice.status;
    const actor = getActorFromRequest(req);
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = executeTransition({
      invoiceId: id,
      currentState,
      targetState: INVOICE_STATES.LINKED_ESCROW,
      actor,
      reason: reason || 'Invoice linked to escrow',
      ipAddress,
      userAgent,
      metadata: {
        method: req.method,
        path: req.path,
        action: 'link-escrow',
        escrowId: escrowId || 'pending',
      },
    });

    invoice.status = INVOICE_STATES.LINKED_ESCROW;
    invoice.escrowId = escrowId;
    invoice.updatedAt = new Date().toISOString();
    invoice.updatedBy = actor;

    res.status(200).json({
      data: {
        invoiceId: id,
        previousState: result.previousState,
        currentState: result.newState,
        escrowId: escrowId || null,
        transitionedAt: result.transitionedAt,
        transitionedBy: result.transitionedBy,
        auditLogId: result.auditLog.id,
      },
      message: 'Invoice linked to escrow successfully',
    });
  } catch (error) {
    if (error.code) {
      return res.status(400).json({
        error: error.message,
        code: error.code,
        allowedTransitions: error.allowedTransitions,
      });
    }
    next(error);
  }
}));

/**
 * GET /api/invoices/:id/history
 * Get state transition history for an invoice
 */
router.get('/:id/history', instrumentRequest('invoice-state:history', (req, res) => {
  const { id } = req.params;

  // Check if invoice exists
  const invoice = mockInvoices.get(id);

  if (!invoice) {
    res.status(404).json({
      error: 'Invoice not found',
      code: 'INVOICE_NOT_FOUND',
    });
    return;
  }

  const history = getTransitionHistory(id, getAuditLogs);

  res.json({
    data: {
      invoiceId: id,
      currentState: invoice.status,
      transitions: history,
      totalTransitions: history.length,
    },
    message: 'Invoice transition history retrieved successfully',
  });
}));

/**
 * POST /api/invoices/:id/reject
 * Convenience endpoint to reject an invoice
 */
router.post('/:id/reject', instrumentRequest('invoice-state:reject', (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    if (!reason) {
      res.status(400).json({
        error: 'Reason is required for rejection',
        code: 'MISSING_REASON',
      });
      return;
    }

    const invoice = mockInvoices.get(id);

    if (!invoice) {
      res.status(404).json({
        error: 'Invoice not found',
        code: 'INVOICE_NOT_FOUND',
      });
      return;
    }

    const currentState = invoice.status;
    const actor = getActorFromRequest(req);
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = executeTransition({
      invoiceId: id,
      currentState,
      targetState: INVOICE_STATES.REJECTED,
      actor,
      reason,
      ipAddress,
      userAgent,
      metadata: {
        method: req.method,
        path: req.path,
        action: 'reject',
      },
    });

    invoice.status = INVOICE_STATES.REJECTED;
    invoice.updatedAt = new Date().toISOString();
    invoice.updatedBy = actor;

    res.status(200).json({
      data: {
        invoiceId: id,
        previousState: result.previousState,
        currentState: result.newState,
        reason,
        transitionedAt: result.transitionedAt,
        transitionedBy: result.transitionedBy,
        auditLogId: result.auditLog.id,
      },
      message: 'Invoice rejected successfully',
    });
  } catch (error) {
    if (error.code) {
      return res.status(400).json({
        error: error.message,
        code: error.code,
        allowedTransitions: error.allowedTransitions,
      });
    }
    next(error);
  }
}));

module.exports = router;
module.exports.mockInvoices = mockInvoices; // Export for testing
