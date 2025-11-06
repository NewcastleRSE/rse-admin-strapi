const crypto = require('crypto')

'use strict'

module.exports = (config, { strapi }) => {

    const logger = strapi.log.child({component: 'hubspot-webhook-middleware' })

    return async (ctx, next) => {

        //logger.debug('Incoming request')

        const signature = ctx.request.headers['x-hubspot-signature']
        const secret = process.env.HUBSPOT_CLIENT_SECRET
        const source = secret + JSON.stringify(ctx.request.body)

        // Create a SHA256 hash of the source string
        const hash = crypto.createHash('sha256').update(source).digest('hex')

        if (!signature || !secret || !ctx.request.body) {
            ctx.send({ error: 'Unauthorized' }, 401)
            return
        }
        else {
            !signature ? logger.warn('Missing signature header') : null
            !secret ? logger.warn('Missing HUBSPOT_CLIENT_SECRET environment variable') : null
            !ctx.request.body ? logger.warn('Missing request body') : null
        }

        // Compare the computed hash with the signature
        if (signature === hash) {
            if(ctx.request.body.attemptNumber && ctx.request.body.attemptNumber > 0) {
                ctx.send({ message: 'Processing retry attempt' }, 102)
                return
            }
            await next()
        } else {
            ctx.send({ error: 'Unauthorized' }, 401)
        }
    }
}