const request = require('supertest');
const { createApp } = require('../app');
const invoiceService = require('../services/invoice.service');

// Mock the service
jest.mock('../services/invoice.service');

describe('Invoice API Integration', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('GET /api/invoices', () => {
    it('should return 200 and invoices when no query params are provided', async () => {
      const mockInvoices = [
        { id: 1, amount: 100, status: 'pending' },
        { id: 2, amount: 200, status: 'paid' }
      ];
      invoiceService.getInvoices.mockResolvedValue(mockInvoices);

      const res = await request(app).get('/api/invoices');

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual(mockInvoices);
      expect(res.body.message).toBe('Invoices retrieved successfully.');
      expect(invoiceService.getInvoices).toHaveBeenCalledWith({
        filters: {},
        sorting: {}
      });
    });

    it('should filter by status', async () => {
      invoiceService.getInvoices.mockResolvedValue([]);
      const res = await request(app).get('/api/invoices?status=paid');

      expect(res.statusCode).toBe(200);
      expect(invoiceService.getInvoices).toHaveBeenCalledWith(expect.objectContaining({
        filters: expect.objectContaining({
          status: 'paid'
        })
      }));
    });

    it('should filter by SME ID', async () => {
      invoiceService.getInvoices.mockResolvedValue([]);
      const res = await request(app).get('/api/invoices?smeId=sme123');

      expect(res.statusCode).toBe(200);
      expect(invoiceService.getInvoices).toHaveBeenCalledWith(expect.objectContaining({
        filters: expect.objectContaining({
          smeId: 'sme123'
        })
      }));
    });

    it('should filter by date range', async () => {
      invoiceService.getInvoices.mockResolvedValue([]);
      const res = await request(app).get('/api/invoices?dateFrom=2023-01-01&dateTo=2023-12-31');

      expect(res.statusCode).toBe(200);
      expect(invoiceService.getInvoices).toHaveBeenCalledWith(expect.objectContaining({
        filters: expect.objectContaining({
          dateFrom: '2023-01-01',
          dateTo: '2023-12-31'
        })
      }));
    });

    it('should apply sorting', async () => {
      invoiceService.getInvoices.mockResolvedValue([]);
      const res = await request(app).get('/api/invoices?sortBy=amount&order=desc');

      expect(res.statusCode).toBe(200);
      expect(invoiceService.getInvoices).toHaveBeenCalledWith(expect.objectContaining({
        sorting: expect.objectContaining({
          sortBy: 'amount',
          order: 'desc'
        })
      }));
    });

    it('should reject invalid status with 400', async () => {
      const res = await request(app).get('/api/invoices?status=invalid');

      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('Invalid status. Must be one of: paid, pending, overdue');
    });

    it('should reject invalid date format with 400', async () => {
      const res = await request(app).get('/api/invoices?dateFrom=01-01-2023');

      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('Invalid dateFrom format. Use YYYY-MM-DD');
    });

    it('should reject multiple invalid inputs with 400', async () => {
      const res = await request(app).get('/api/invoices?status=invalid&dateTo=not-a-date');

      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('Invalid status');
    });

    it('should handle service errors with 500', async () => {
      invoiceService.getInvoices.mockRejectedValue(new Error('Service failure'));

      const res = await request(app).get('/api/invoices');

      expect(res.statusCode).toBe(500);
      expect(res.body.error.message).toBe('Internal Server Error');
    });
  });
});
