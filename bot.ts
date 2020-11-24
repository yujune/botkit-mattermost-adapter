import { Botkit } from 'botkit';
import { parseConfig } from './botbuilder-adapter-mattermost/src/mattermost-adapter-options';
/**
 * Load config from .env file.
 * NOTE: THIS SCRIPT NEED TO RUN BEFORE IMPORT @rocket.chat/sdk,
 * OR ROCKETCHAT API WON'T WORKS DUE TO ENVIRONMENT VARIABLES NOT SET.
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { MatterMostAdapter } from './botbuilder-adapter-mattermost/src/mattermost-adapter';

const adapterConfig = parseConfig();
const adapter = new MatterMostAdapter(adapterConfig);

const controller = new Botkit({
    adapter,
    webhook_uri: '/api/messages'
});

controller.ready(() => {
    controller.loadModules(__dirname + '/features');
    controller.loadModules(__dirname + '/features/freeipa');
    controller.loadModules(__dirname + '/features/freeipa/lib');
});
