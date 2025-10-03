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

        console.log('Signature:', signature)
        console.log('Hash:', hash)

        if (signature === hash) {
            await next()
        } else {
            ctx.status = 401
            ctx.body = { error: 'Unauthorized' }
        }
    }
}