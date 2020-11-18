const { BotkitConversation } = require('botkit'); //require will automatically scan node_modules to find modules, es6 use import
const fetch = require("node-fetch");

module.exports = function (controller) {

    let convo_show = new BotkitConversation('convo_show', controller); // controller is the robot 

    convo_show.ask("ALERT! Seems like your password is going to be expired. Do you want to change your password?", [
        {
            pattern: "yes",
            type: "string",
            handler: async (response_text, convo, bot, full_message) => {
                return await bot.say("Please go to the link below to change your password. Thank you! :smile: \n https://selfservice.sige.la/");
            }
        },
        {
            pattern: "no",
            type: "string",
            handler: async (response_text, convo, bot, full_message) => {
                //repeat to ask the question
                return await bot.say("Alright! Please make sure to change your password before the expiry date ya. :smile:");
            }
        },
        {
            default: true,
            handler: async (response_text, convo, bot, full_message) => {
                //repeat to ask the question
                await bot.say('I do not understand your response! :dizzy_face:');
                return await convo.repeat();
            }
        }

    ], { key: "ans" });

    controller.addDialog(convo_show);

    // “async” before a function means one simple thing: a function always returns a promise. Other values are wrapped in a resolved promise automatically.
    controller.hears('show', 'message', async (bot, message) => {

        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
        let username = message.reference.user.name;
        let stackStormURL = process.env["STACKSTORM_URL"];
        let stackstormAPIKEY = process.env["STACKSTORM_API_KEY"];

        let data = { 'action': 'freeipa.action_show_userinfo', "parameters": { "user_id": username } };  //JSON.stringtify will convert it to json string

        await bot.say("Okay, " + username + ". Let me do it for you :smile:"); //await makes JavaScript wait until that promise settles and returns its result.

        let res = await fetch(stackStormURL, {
            method: 'POST',
            headers: {
                'St2-Api-Key': stackstormAPIKEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        let result = await res.json();

        let execution_id = result['id'];

        let execution_url = stackStormURL.concat('/', execution_id);

        let promise = new Promise((resolve) => {
            // simulate some long running process
            setTimeout(resolve, 3000);
        });

        await promise;

        let getAccount = await fetch(execution_url, {
            method: 'GET',
            headers: {
                'St2-Api-Key': stackstormAPIKEY,
                'content-type': 'application/json'
            },
        });

        let account_status = await getAccount.json();

        let name = account_status['result']['result']['username'];
        let status = account_status['result']['result']['status'];
        let password_expired_date = account_status['result']['result']['password_expired_date'];
        let last_failed_attempted = account_status['result']['result']['last_failed_attempted'];
        let password_valid_days = account_status['result']['result']['password_valid_days'];
        let failed_password_attempted = account_status['result']['result']['failed_password_attempted'];
        let max_password_failure = account_status['result']['result']['max_password_failure'];
        let chances_left = account_status['result']['result']['chances_left'];

        if (name == undefined) {

            await bot.say("Hello, " + username + ". I can't find your FreeIPA details. Please make sure you already have a FreeIPA account registered.")


        } else {

            await bot.say('Here you go! This is your FreeIPA account details. :grin: ' +
                '```Username : ' + name + '\n' +
                'Status : ' + status + '\n' +
                'Password Expired Date : ' + password_expired_date + '\n' +
                'Last Failed Attempted : ' + last_failed_attempted + '\n' +
                'Failed Password Attempted : ' + failed_password_attempted + '\n' +
                'Password Valid Days : ' + password_valid_days + '\n' + '```' + '\n\n' +
                'The maximum failure is ' + max_password_failure + ' times, you have ' + chances_left + ' chances left.'
            );

            if (password_valid_days < 7) {
                await bot.beginDialog('convo_show');
            }

        }



    });

}