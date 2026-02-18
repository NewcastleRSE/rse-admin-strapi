
// import { isLastWorkday } from '../src/utils/holidays.js';
//import { sendSlackMessage } from '../src/utils/slack.js';
const { isLastWorkday } = require('../src/utils/holidays.js');
const { sendSlackMessage } = require('../src/utils/slack.js');
module.exports = {
    clockifyReminder: {
        task: ({ strapi }) => {
            if (!isLastWorkday()) return;

            try {
                sendSlackMessage(process.env.SLACK_CHANNEL_TEAM_ID,
                    'Can everyone please ensure Clockify is up to date for the current month. Invoices will be going out next week.');

            } catch (error) {
                console.log('Cron Task Failed:', error);
            }
        },
        options: {
            rule: '00 09 * * *'
        }
    }
};