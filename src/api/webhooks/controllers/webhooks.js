'use strict';

/**
 * Custom controller for handling webhooks and calling the HubSpot method in the webhooks service.
 */

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
            if (!subscriptionType || !acceptedSubscriptionTypes.includes(subscriptionType)) {
                console.error(`Ignoring webhook of type ${subscriptionType}`)
                return
            }
            else if ((subscriptionType === 'deal.associationChange') && !associationType) {
                console.error(`Missing required field associationType for subscriptionType ${subscriptionType}`)
                return
            }
            else if (!payload.objectId) {
                console.error(`Missing required field objectId`)
                return
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
                        }
                        break
                    case 'deal.associationChange':
                        if (associationType === 'DEAL_TO_CONTACT' || associationType === 'CONTACT_TO_DEAL') {

                            const contactId = associationType === 'DEAL_TO_CONTACT' ? payload.toObjectId : payload.fromObjectId

                            await strapi.service('api::webhooks.hubspot').updateContact(payload.objectId, contactId, payload.associationRemoved)
                        }
                        else if (associationType === 'DEAL_TO_LINE_ITEM' || associationType === 'LINE_ITEM_TO_DEAL') {

                            const lineItemId = associationType === 'DEAL_TO_LINE_ITEM' ? payload.toObjectId : payload.fromObjectId

                            await strapi.service('api::webhooks.hubspot').updateLineItems(payload.objectId, lineItemId, payload.associationRemoved)
                        }
                        else {
                            console.error(`Ignoring association type ${payload.associationType}`)
                        }
                        break
                    case 'deal.deletion':
                        try {
                            await strapi.service('api::webhooks.hubspot').deleteProject(payload.objectId)
                        }
                        catch (err) {
                            console.error(`Error deleting project: ${err.message}`)
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