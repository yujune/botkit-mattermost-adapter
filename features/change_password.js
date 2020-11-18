const { BotkitConversation } = require("botkit");

module.exports = function (controller) {

    let convo_change_password = new BotkitConversation('convo_change_password', controller);
    convo_change_password.addAction('acknowledged');

    // start the typing indicator (typing indicator = '...')
    convo_change_password.addMessage('Okay, wait a second.', 'acknowledged'); // parameters: message ,thread name

    convo_change_password.addAction('thread_sendLink', 'acknowledged');

    convo_change_password.addMessage('Please go to the link below to change your password. Thank you! :smile: \n https://selfservice.sige.la/', 'thread_sendLink');

    convo_change_password.before('thread_sendLink', async () => {
        return new Promise((resolve) => {
            // simulate some long running process
            setTimeout(resolve, 3000);
        });
    });



    controller.addDialog(convo_change_password);

    controller.hears("change password", "message", async (bot, message) => {

        await bot.beginDialog('convo_change_password');

    });


}