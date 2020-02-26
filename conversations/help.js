// import { Botkit, BotkitConversation } from 'botkit';

export const helpConversation = async (controller) => {

    controller.hears(['help'], 'mention', function(bot, message) {
        console.log('message: ', message)
        const text = `*CIRO BOT COMMANDS*:
> 1. \`show ipwhitelist [ENV]\` : [ENV] can be \`all\` or any environment names
> 2. \`add [IP] [ENV]\` : Add your [IP] with [ENV]
        `
        bot.reply(message, text, () => {});
    });
}