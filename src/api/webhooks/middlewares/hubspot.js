const crypto = require('crypto')

'use strict'

module.exports = (config, { strapi }) => {

    return async (ctx, next) => {
        const signature = ctx.request.headers['x-hubspot-signature']
        const secret = process.env.HUBSPOT_CLIENT_SECRET

        if (!signature || !secret) {
            ctx.status = 401
            ctx.body = { error: 'Unauthorized' }
            return
        }

        const hash = crypto.createHash('sha256').update(secret).digest('hex')

        if (signature === hash) {
            if(ctx.request.body.attemptNumber && ctx.request.body.attemptNumber > 0) {
                ctx.status = 102
                ctx.body = { message: 'Processing retry attempt' }
                return
            }
            await next()
        } else {
            ctx.status = 401
            ctx.body = { error: 'Unauthorized' }
        }
    }
}