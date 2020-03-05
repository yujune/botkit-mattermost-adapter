// import { Botkit, BotkitConversation } from 'botkit';

export const helpConversation = async (controller) => {

    controller.hears(['help'], 'mention', function(bot, message) {
        console.log('message: ', message)
        const text = `*CIRO BOT COMMANDS*:
\`\`\`
1. show ipwhitelist [ENV]
    - ENV defined name of environment or * (show all).
2. add [IPs] [ENV]
    - Add lists of IP in environment.
3. remove ip [IPs] [ENV]
    - Remove lists of IP in environment.
4. remove env [ENV]
    - Remove environment.
\`\`\`
`
        bot.reply(message, text, () => {});
    });
}