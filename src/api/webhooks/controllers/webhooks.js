'use strict';

/**
 * Custom controller for handling webhooks and calling the HubSpot method in the webhooks service.
 */

module.exports = {
    async hubspot(ctx) {

        const { subscriptionType, associationType } = ctx.request.body

        // Route expected subscription types to the appropriate service method
        switch(subscriptionType) {
            case 'deal.creation':
                try {
                    const result = await strapi.service('api::webhooks.hubspot').createProject(ctx.request.body.objectId)
                    ctx.send({ data: result }, 201)
                }
                catch (err) {
                    if(err.message === 'Missing required fields') {
                        ctx.send({ error: { message: `Missing required fields`, error: err.message } }, 422)
                    }
                    else {
                        ctx.send({ error: { message: `Error creating project`, error: err.message } }, 500)
                    }
                }
                break
            case 'deal.propertyChange':
                try {
                    const result = await strapi.service('api::webhooks.hubspot').updateProject(ctx.request.body.objectId, ctx.request.body.propertyName, ctx.request.body.propertyValue)
                    ctx.send({ data: result }, 200)
                }
                catch (err) {
                    if(err.message === 'Missing required fields') {
                        ctx.send({ error: { message: `Missing required fields`, error: err.message } }, 422)
                    }
                    else {
                        ctx.send({ error: { message: `Error updating project`, error: err.message } }, 500)
                    }
                }
                break
            case 'deal.associationChange':
                if(associationType === 'DEAL_TO_CONTACT' || associationType === 'CONTACT_TO_DEAL') {

                    const contactId = associationType === 'DEAL_TO_CONTACT' ? ctx.request.body.toObjectId : ctx.request.body.fromObjectId

                    const result = await strapi.service('api::webhooks.hubspot').updateContact(ctx.request.body.objectId, contactId, ctx.request.body.associationRemoved)
                    
                    ctx.send({ data: result }, 200)
                }
                else if(associationType === 'DEAL_TO_LINE_ITEM' || associationType === 'LINE_ITEM_TO_DEAL') {

                    const lineItemId = associationType === 'DEAL_TO_LINE_ITEM' ? ctx.request.body.toObjectId : ctx.request.body.fromObjectId

                    const result = await strapi.service('api::webhooks.hubspot').updateLineItems(ctx.request.body.objectId, lineItemId, ctx.request.body.associationRemoved)
                }
                else {
                    ctx.send({ message: `Ignoring association type ${ctx.request.body.associationType}` }, 400)
                }
                break
            case 'deal.deletion':
                try {
                    await strapi.service('api::webhooks.hubspot').deleteProject(ctx.request.body.objectId)
                    ctx.send(null, 204)
                }
                catch (err) {
                    ctx.send({ error: { message: `Error deleting project`, error: err.message } }, 500)
                }
                break
            default:
                ctx.send({
                    message: `Ignoring webhook of type ${subscriptionType}`,
                }, 400)
                return
        }

        return

        // try {
        //     const result = await strapi.service('api::webhooks.hubspot').hubspot(ctx.request.body)
        //     ctx.status = result.status
        //     ctx.body = { data: result.data }
        //     return

        // } catch (error) {
        //     ctx.send({
        //         error: error.message,
        //     }, 500)
        // }
    },
};