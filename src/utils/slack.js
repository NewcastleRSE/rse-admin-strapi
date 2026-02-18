//const { WebClient } = require('@slack/web-api');
import { WebClient } from '@slack/web-api';
const token = process.env.SLACK_BOT_TOKEN;
const web = new WebClient(token);

export const sendSlackMessage = async (channel, text) => {
  try {
    const result = await web.chat.postMessage({
      channel: channel,
      text: text,
    });
  } catch (error) {
    console.error('Error sending to Slack:', error.data.error);
  }
}