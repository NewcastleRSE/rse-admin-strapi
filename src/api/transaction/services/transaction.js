'use strict';

/**
 * transaction service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::transaction.transaction', ({ strapi }) => ({
    async create(ctx) {

        const response = await super.create(ctx);
        console.log(response)
        const transaction = response;
        const transId = response.id;

        let docNumFromTrans = '';
        let rateFromTrans = 'standard'
        let transactValue = 0;

        // Extract Document Number and Rate from the new transaction's name
        // Format: "123DEC25 - Standard - Project"
        try {
            const nameParts = transaction.name.split(' - ');
            if (nameParts.length > 2) {
                docNumFromTrans = nameParts[0].trim();
                rateFromTrans = nameParts[1].trim().toLowerCase(); // "standard" or "senior"
                transactValue = transaction.value;
            }
        } catch (err) {
            console.log('cannot extract document number and rate from transaction name:', err);
            return response; // Exit early if we can't parse the name as expected, probably because it is a different type of transaction
        }
        

        // Is there a corrosponding invoice with this document number?
        const invoice = await strapi.documents('api::invoice.invoice').findFirst({
            filters: { documentNumber: docNumFromTrans },
        });

        

        if (invoice) {
            // Invoice value
            const seniorTotal = (invoice.senior_units || 0) * (invoice.senior_price || 0);
            const standardTotal = (invoice.standard_units || 0) * (invoice.standard_price || 0);

            // Check which line items actually exist on this invoice
            const hasSenior = seniorTotal > 0;
            const hasStandard = standardTotal > 0;
            const bothRatesPresent = hasSenior && hasStandard;

            //console.log(`Invoice ${invoice.id} has - Senior: ${hasSenior} (${seniorTotal}), Standard: ${hasStandard} (${standardTotal})`)

            let canMarkAsPaid = false;

            if (!bothRatesPresent) {
                // --- Single Line Item ---
                // Determine which rate we are looking for and check the value
                const targetTotal = hasSenior ? seniorTotal : standardTotal;
                if (transactValue === targetTotal) {
                    canMarkAsPaid = true;
                }
                //console.log(`Single line item scenario - Transaction value: ${transactValue}, Target total: ${targetTotal}, Can mark as paid: ${canMarkAsPaid}`)
            } else {
                // --- Both rates present on invoice ---
                // Get 'partner' transactions that share the same doc number
                const potentialPartners = await strapi.entityService.findMany('api::transaction.transaction', {
                    filters: {
                        name: { $contains: docNumFromTrans },
                        id: { $ne: transId }
                    },
                });
//console.log(`Found ${potentialPartners.length} potential partner transactions with doc number ${docNumFromTrans}`)
                // Double check in case there are other transactions with similar doc numbers - we need an exact match on the doc number part
                for (const partner of potentialPartners) {
                    const partnerParts = partner.name.split(' - ');

                    if (partnerParts.length > 2) {
                        const partnerDocNum = partnerParts[0].trim();
                        const partnerRate = partnerParts[1].trim().toLowerCase();
                        const partnerValue = partner.value;

                        // Only proceed if the document numbers are an exact match after trimming
                        if (partnerDocNum === docNumFromTrans) {

                            // Validate if Current is Senior + Partner is Standard OR vice versa
                            const currentPaidSenior = (rateFromTrans === 'senior' && transactValue === seniorTotal);
                            const currentPaidStandard = (rateFromTrans === 'standard' && transactValue === standardTotal);

                            const partnerPaidSenior = (partnerRate === 'senior' && partnerValue === seniorTotal);
                            const partnerPaidStandard = (partnerRate === 'standard' && partnerValue === standardTotal);
//console.log(`Comparing transactions - Current: ${transaction.id} (${rateFromTrans}, ${transactValue}), Partner: ${partner.id} (${partnerRate}, ${partnerValue})`)
                            // If the two transactions together cover both line items correctly
                            if ((currentPaidSenior && partnerPaidStandard) || (currentPaidStandard && partnerPaidSenior)) {
                                canMarkAsPaid = true;
                                break; // Found our match, stop searching
                            }
                        }
                    }
                }
            }

            let invoiceDate = new Date(transaction.postedDate) || new Date();
            // Update the invoice status if the payment requirements are fully met
            console.log(invoiceDate)
            if (canMarkAsPaid) {
                //console.log(`Transaction ${transaction.id} meets payment requirements for Invoice ${invoice.id}. Marking as paid.`)
                await strapi.entityService.update('api::invoice.invoice', invoice.id, {
                    data: {
                        paid: invoiceDate.toISOString(),
                    }
                })
            }
        }
        return response;
    }


}
));