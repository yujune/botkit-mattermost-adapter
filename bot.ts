import { Botkit } from 'botkit';
import { parseConfig } from './botbuilder-adapter-rocketchat/src/rocketchat-adapter-options';
/**
 * Load config from .env file.
 * NOTE: THIS SCRIPT NEED TO RUN BEFORE IMPORT @rocket.chat/sdk,
 * OR ROCKETCHAT API WON'T WORKS DUE TO ENVIRONMENT VARIABLES NOT SET.
 */
require('dotenv').config();
import { RocketChatAdapter } from './botbuilder-adapter-rocketchat/src/rocketchat-adapter';
import { RocketChatEvent } from './botbuilder-adapter-rocketchat/src/rocketchat-data-types';


const adapterConfig = parseConfig();
const adapter = new RocketChatAdapter(adapterConfig);

const controller = new Botkit({
    adapter,
    webhook_uri: '/api/messages'
});

controller.ready(() => {

    controller.loadModules(__dirname + '/features');

    controller.on(RocketChatEvent.Invite, async (bot, event) => {
        // @ts-ignore
        let eventDetail = event.incoming_message.rcEvent;
        let inviter = eventDetail.from.name;
        let invited = eventDetail.to.name;
        let channel = event.incoming_message.channelData.name;
        await bot.say(`${inviter} invite ${invited} to room: #${channel}`)
    });

    controller.on(RocketChatEvent.Kick, async (bot, event) => {
        // @ts-ignore
        let eventDetail = event.incoming_message.rcEvent;
        let kicker = eventDetail.from.name;
        let kicked = eventDetail.to.name;
        let channel = event.incoming_message.channelData.name;
        await bot.say(`${kicker} kick ${kicked} from room: #${channel}`);
    })

});
