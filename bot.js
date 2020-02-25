import Botkit from 'botkit-rocketchat-connector';
import BotOptions from './config/bot-options';

import { helpConversation } from './conversations/help';
import { ipWhitelistConversation } from './conversations/ip-whitelists';




// import debug from 'debug'
export const initBot = async () => {
    console.log('Bot had been initiated...', process.env)
    // debug = debug("botkit:main")

    if (!process.env.ROCKETCHAT_URL || !process.env.ROCKETCHAT_USER || !process.env.ROCKETCHAT_PASS) {
        usageTip()
    }

    // the environment variables from RocketChat is passed in bot_options
    // because the module it's external, so haven't access to .env file
    console.log('BotOptions: ', BotOptions)
    const controller = Botkit({}, BotOptions)

    helpConversation(controller)
    ipWhitelistConversation(controller)

    // requireAll(require.context("./conversation", true, /^\.\/.*\.js$/))(controller);
    controller.startBot()
    controller.startTicking()   

    // This captures and evaluates any message sent to the bot as a DM
    // or sent to the bot in the form "@bot message" and passes it to
    // Botkit Studio to evaluate for trigger words and patterns.
    // If a trigger is matched, the conversation will automatically fire!
    // You can tie into the execution of the script using the functions
    if (process.env.studio_token) {

    } else {
        console.log('~~~~~~~~~~')
        console.log('NOTE: Botkit Studio functionality has not been enabled')
        console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/')
    }
}


function usageTip() {
    console.log('~~~~~~~~~~')
    console.log('Botkit Studio Starter Kit')
    console.log('You problably forgot to update your environment variables')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~') 
}

function requireAll(requireContext) {
    return requireContext.keys().map(requireContext);
}
