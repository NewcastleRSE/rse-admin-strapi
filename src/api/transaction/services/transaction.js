'use strict';

/**
 * transaction service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) => ({
    async create(params) {
        
        const transaction = await super.create(params);
        // if transaction is an invoice, find invoice and connect
        if (transaction.costElementDescription == 'Recharges (Exp) - Other Dept' && transaction.name) {
            
            const nameParts = transaction.name.split(' - ');
            if (nameParts.length > 1) {
                console.log(`Extracted document number: ${nameParts[0].trim()}`);
                const documentNumber = nameParts[0].trim();
                const invoice = await strapi.entityService.findMany('api::invoice.invoice', {
                    filters: { documentNumber: documentNumber },
                    limit: 1,
                });
                if (invoice.length > 0) {
                    await strapi.entityService.update('api::invoice.invoice', invoice[0].id, {
                        data: {
                            transaction: transaction.id,
                        },
                    });
                }
            }
        }
        return transaction;
    }
}));