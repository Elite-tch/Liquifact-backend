const { z } = require('zod');

const MetaSchema = z.object({
    version: z.string(),
    timestamp: z.string(),
}).passthrough();

const ErrorSchema = z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z.any().nullable().optional(),
}).nullable();

const InvoiceSchema = z.object({
    id: z.union([z.string(), z.number()]),
    amount: z.number().positive(),
    customer: z.string().optional(),
    status: z.string(),
    createdAt: z.string().optional(),
}).passthrough();

const EscrowSchema = z.object({
    invoiceId: z.string(),
    status: z.enum(['pending', 'funded', 'disputed', 'released', 'initiated']),
    amountInEscrow: z.number().nonnegative(),
    contractId: z.string(),
    lastUpdated: z.string().optional(),
    governance: z.object({
        canDispute: z.boolean(),
        disputePeriodDays: z.number(),
    }).optional(),
}).passthrough();

const BaseResponseSchema = z.object({
    meta: MetaSchema,
    error: ErrorSchema,
    message: z.string().optional().nullable(),
});

const CreateInvoiceResponseSchema = BaseResponseSchema.extend({
    data: InvoiceSchema,
});

const InvoiceListResponseSchema = BaseResponseSchema.extend({
    data: z.array(InvoiceSchema),
});

const DeleteRestoreInvoiceResponseSchema = BaseResponseSchema.extend({
    data: InvoiceSchema,
});

const EscrowResponseSchema = BaseResponseSchema.extend({
    data: EscrowSchema,
});

module.exports = {
    InvoiceSchema,
    CreateInvoiceRequestSchema: z.object({
        amount: z.number().positive(),
        customer: z.string().optional(),
    }),
    CreateInvoiceResponseSchema,
    InvoiceListResponseSchema,
    DeleteRestoreInvoiceResponseSchema,
    EscrowResponseSchema,
};
