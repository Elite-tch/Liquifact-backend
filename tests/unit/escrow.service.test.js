/**
 * @fileoverview Unit tests for the Escrow Service Integration Layer.
 */

'use strict';

const escrowService = require('../../src/services/escrow.service');
const soroban = require('../../src/services/soroban');

// Mock the soroban utility to avoid actual retries/delays during unit tests
jest.mock('../../src/services/soroban', () => ({
    callSorobanContract: jest.fn(op => op()),
    SOROBAN_RETRY_CONFIG: { maxRetries: 3, baseDelay: 10, maxDelay: 50 }
}));

describe('Escrow Service Unit Tests', () => {
    describe('getEscrowStatus', () => {
        it('should return a funded state for even-numbered invoice IDs', async () => {
            const result = await escrowService.getEscrowStatus('inv_200');

            expect(result.status).toBe('funded');
            expect(result.amountInEscrow).toBe(1000);
            expect(result.invoiceId).toBe('inv_200');
            expect(soroban.callSorobanContract).toHaveBeenCalled();
        });

        it('should return a pending state for odd-numbered invoice IDs', async () => {
            const result = await escrowService.getEscrowStatus('inv_201');

            expect(result.status).toBe('pending');
            expect(result.amountInEscrow).toBe(0);
            expect(result.invoiceId).toBe('inv_201');
        });

        it('should handle IDs with non-numeric suffixes defaulted to zero (funded)', async () => {
            const result = await escrowService.getEscrowStatus('abc');

            expect(result.status).toBe('funded');
            expect(result.invoiceId).toBe('abc');
        });
    });

    describe('fundEscrow', () => {
        it('should initiate a new escrow lock and return a transaction hash', async () => {
            const result = await escrowService.fundEscrow('inv_400', 500);

            expect(result.status).toBe('initiated');
            expect(result.amount).toBe(500);
            expect(result.transactionHash).toMatch(/^tx_[a-z0-9]+$/);
        });
    });

    describe('Service Metadata', () => {
        it('should export the correct service info', () => {
            expect(escrowService.ESCROW_SERVICE_INFO.name).toBe('Soroban Escrow Integration');
            expect(escrowService.ESCROW_SERVICE_INFO.version).toBe('1.0.0');
        });
    });
});
