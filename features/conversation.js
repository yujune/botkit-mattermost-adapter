const { BotkitConversation } = require("botkit");


//module has an exports properties
module.exports = function (controller) {

    let convo_sample = new BotkitConversation('convo_sample', controller);

    convo_sample.say(`Hi my friends`);

    convo_sample.ask("How are you today?", async (response, convo, bot) => {
        await bot.say("Owh, so you are " + response);
    }, { key: "status" });

    convo_sample.addAction('next_thread');
    convo_sample.addMessage('You are {{ vars.status}} and I know.', 'next_thread')

    // go to confirmation
    convo_sample.addAction('confirmation', 'next_thread');

    convo_sample.addQuestion("Are you sure you are {{vars.status}} ?", [
        {
            pattern: "yes",
            type: "string",
            handler: async (response_text, convo, bot, full_message) => {
                return await bot.say("Okay, you have confirmed my question.");
            }
        },
        {
            pattern: "no",
            type: "string",
            handler: async (response_text, convo, bot, full_message) => {
                //repeat to ask the question
                return await convo.gotoThread('default');
            }
        },
        {
            pattern: "okok",
            type: "string",
            handler: async (response_text, convo, bot, full_message) => {
                //repeat to ask the question
                return await convo.gotoThread('next_thread');
            }
        },
        {
            default: true,
            handler: async (response_text, convo, bot, full_message) => {
                //repeat to ask the question
                await bot.say('I do not understand your response!');
                return await convo.repeat();
            }
        }

    ], { key: "ans" }, "confirmation");

    controller.addDialog(convo_sample);

    controller.hears('hello dear', 'message', async (bot, message) => {

        // await suspend the async function until promise from async is fulfilled. 
        await bot.beginDialog('convo_sample');

    });
}