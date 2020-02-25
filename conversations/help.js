import { Botkit, BotkitConversation } from 'botkit';

let DIALOG_ID = "HELP_CONVERSATION"
export const helpConversation = async (controller) => {
    console.log('help Conversation ...')

    const yesLists = ["yes","ya","absolutely","of course","yup"]
    const noLists = ["no","nope"]

    controller.hears(['bot'], 'direct_message,live_chat,channel,private_channel', (bot, message) => {
        
        let convo = new BotkitConversation(DIALOG_ID, controller);

        // bot.startConversation(message, (err, convo) => {
            

            // send a greeting
            convo.say('Abel!');

            // ask a question, store the response in 'name'
            convo.ask('What is your name?', async(response, convo, bot) => {
                console.log(`user name is ${ response }`);
                // do something?
            }, 'name');

            // use add action to switch to a different thread, defined below...
            convo.addAction('favorite_color');

            // add a message and a prompt to a new thread called `favorite_color`
            convo.addMessage('Awesome {{vars.name}}!', 'favorite_color');
            convo.addQuestion('Now, what is your favorite color?', async(response, convo, bot) => {
                console.log(`user favorite color is ${ response }`);
            },'color', 'favorite_color');

            // go to a confirmation
            convo.addAction('confirmation' ,'favorite_color');

            // do a simple conditional branch looking for user to say "no"
            convo.addQuestion('Your name is {{vars.name}} and your favorite color is {{vars.color}}. Is that right?', [
                {
                    pattern: 'no',
                    handler: async(response, convo, bot) => {
                        // if user says no, go back to favorite color.
                        await convo.gotoThread('favorite_color');
                    }
                },
                {
                    default: true,
                    handler: async(response, convo, bot) => {
                        // do nothing, allow convo to complete.
                    }
                }
            ], 'confirm', 'confirmation');
        // })
    })
}