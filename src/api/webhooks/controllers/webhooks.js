'use strict';

/**
 * Custom controller for handling webhooks and calling the HubSpot method in the webhooks service.
 */
const Sentry = require('@sentry/node');

module.exports = {
    async hubspot(ctx) {

        const acceptedSubscriptionTypes = [
            'deal.creation',
            'deal.propertyChange',
            'deal.associationChange',
            'deal.deletion'
        ]

        // Acknowledge receipt of the webhook
        ctx.send({ message: 'Processing webhook' }, 202)

        for (const payload of ctx.request.body) {

            const { subscriptionType, associationType } = payload

            // Validate the incoming webhook

            // Check if the subscription type is one we want to process and if required fields are present
            if (!subscriptionType || !acceptedSubscriptionTypes.includes(subscriptionType)) {
                const msg = `Ignoring webhook of type ${subscriptionType}`;
                console.error(msg);
                return;
            }
            // For associationChange events, associationType is required. 
            else if ((subscriptionType === 'deal.associationChange') && !associationType) {
                const msg = `Missing required field associationType for subscriptionType ${subscriptionType}`;
                console.error(msg);
                Sentry.captureMessage(msg, 'warning');
                return;
            }
            // For all other subscription types except associationChange, objectId is required
            else if (subscriptionType !== 'deal.associationChange' && !payload.objectId) {
                const msg = `Missing required field objectId for subscriptionType ${subscriptionType}`;
                console.error(msg);
                Sentry.captureMessage(msg, 'warning');
                return;
            }
            // For propertyChange events, toObjectId and fromObjectId are required
            else if (subscriptionType === 'deal.propertyChange' && (!payload.toObjectId || !payload.fromObjectId)) {
                const msg = `Missing required fields toObjectId and fromObjectId for subscriptionType ${subscriptionType}`;
                console.error(msg);
                Sentry.captureMessage(msg, 'warning');
                return;
            }
            else {

                // Route expected subscription types to the appropriate service method
                switch (subscriptionType) {
                    case 'deal.creation':
                        try {
                            await strapi.service('api::webhooks.hubspot').createProject(payload.objectId)
                        }
                        catch (err) {
                            if (err.message === 'Missing required fields') {
                                console.error(`Missing required fields: ${err.message}`)
                            }
                            else {
                                console.error(`Error creating project: ${err.message}`)
                            }
                            Sentry.withScope(scope => {
                                scope.setExtra('payload', payload);
                                Sentry.captureException(err);
                            });
                        }
                        break
                    case 'deal.propertyChange':
                        try {
                            await strapi.service('api::webhooks.hubspot').updateProject(payload.objectId, payload.propertyName, payload.propertyValue)
                        }
                        catch (err) {
                            if (err.message === 'Missing required fields') {
                                console.error(`Missing required fields: ${err.message}`)
                            }
                            else {
                                console.error(`Error updating project: ${err.message}`)
                            }
                            Sentry.withScope(scope => {
                                scope.setExtra('payload', payload);
                                Sentry.captureException(err);
                            });
                        }
                        break
                    case 'deal.associationChange':
                        try {
                            if (associationType === 'DEAL_TO_CONTACT' || associationType === 'CONTACT_TO_DEAL') {

                                const contactId = associationType === 'DEAL_TO_CONTACT' ? payload.toObjectId : payload.fromObjectId

                                await strapi.service('api::webhooks.hubspot').updateContact(payload.objectId, contactId, payload.associationRemoved)
                            }
                            else if (associationType === 'DEAL_TO_LINE_ITEM' || associationType === 'LINE_ITEM_TO_DEAL') {

                                const lineItemId = associationType === 'DEAL_TO_LINE_ITEM' ? payload.toObjectId : payload.fromObjectId

                                await strapi.service('api::webhooks.hubspot').updateLineItems(payload.objectId, lineItemId, payload.associationRemoved)
                            }
                            else {
                                const msg = `Ignoring association type ${payload.associationType}`;
                                console.error(msg);
                            }
                        }
                        catch (err) {
                            console.error(`Error processing association change: ${err.message}`);
                            Sentry.withScope(scope => {
                                scope.setExtra('payload', payload);
                                Sentry.captureException(err);
                            });
                        }
                        break
                    case 'deal.deletion':
                        try {
                            await strapi.service('api::webhooks.hubspot').deleteProject(payload.objectId)
                        }
                        catch (err) {
                            console.error(`Error deleting project: ${err.message}`)
                            Sentry.withScope(scope => {
                                scope.setExtra('payload', payload);
                                Sentry.captureException(err);
                            });
                        }
                        break
                    default:
                        return
                }

                return
            }
        }
    }
}