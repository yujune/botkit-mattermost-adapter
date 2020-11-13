import { Botkit } from 'botkit';
import { parseConfig } from './botbuilder-adapter-rocketchat/src/rocketchat-adapter-options';
/**
 * Load config from .env file.
 * NOTE: THIS SCRIPT NEED TO RUN BEFORE IMPORT @rocket.chat/sdk,
 * OR ROCKETCHAT API WON'T WORKS DUE TO ENVIRONMENT VARIABLES NOT SET.
 */
require('dotenv').config();
import { RocketChatAdapter } from './botbuilder-adapter-rocketchat/src/rocketchat-adapter';


const adapterConfig = parseConfig();
const adapter = new RocketChatAdapter(adapterConfig);

const controller = new Botkit({
    adapter,
    webhook_uri: '/api/messages'
});

controller.ready(() => {

    controller.hears('.*', 'message', async(bot, message) => {
        await bot.reply(message, 'I hear: ' + message.text);
    });

});
