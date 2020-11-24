import { Botkit, BotkitConversation } from "botkit";
import exe_stackstorm_api from "./lib/sharedcode";

module.exports = (controller: Botkit) => {

    var username: string;
    var personalemail: string;
    var password_valid_days: number;

    let convo_show = new BotkitConversation('convo_show', controller); // controller is the robot 

    convo_show.ask("ALERT! Seems like your password is going to be expired. Do you want to change your password?", [
        {
            pattern: "yes",
            type: "string",
            handler: async (response_text, convo, bot, full_message) => {


                if (personalemail != undefined) {
                    personalemail = personalemail[0];
                    await bot.say("Okay, I will send an email to " + personalemail + " in a few seconds.");
                    let action_email_data = { 'action': 'freeipa.action_send_reminder', "parameters": { "receiver_name": username, "receiver_email": personalemail, "passw_daysleft": password_valid_days } };  //JSON.stringtify will convert it to json string
                    let string_action_email = JSON.stringify(action_email_data);
                    let email_response = await exe_stackstorm_api(string_action_email, 6);
                    await bot.say(email_response['result']['result']);

                } else {
                    await bot.say("I cannot find your email address in FreeIPA. Please contact your admin asap!");
                }
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

        username = message?.reference?.user?.name!;
        username = username.substring(1); //remove the '@' in the string

        let data = { 'action': 'freeipa.action_show_userinfo', "parameters": { "user_id": username } };  //JSON.stringtify will convert it to json string
        let string_data = JSON.stringify(data);

        await bot.say("Okay, " + username + ". Let me do it for you :smile:"); //await makes JavaScript wait until that promise settles and returns its result.

        //call stackstorrm api and get the result
        let account_status = await exe_stackstorm_api(string_data, 3);

        let name = account_status['result']['result']['username'];
        let status = account_status['result']['result']['status'];
        let password_expired_date = account_status['result']['result']['password_expired_date'];
        let last_failed_attempted = account_status['result']['result']['last_failed_attempted'];
        let failed_password_attempted = account_status['result']['result']['failed_password_attempted'];
        let max_password_failure = account_status['result']['result']['max_password_failure'];
        let chances_left = account_status['result']['result']['chances_left'];
        password_valid_days = account_status['result']['result']['password_valid_days'];
        personalemail = account_status['result']['result']['personalemail']

        if (name == undefined) {
            await bot.say("Hello, " + username + ". I can't find your FreeIPA details. Please make sure you already have a FreeIPA account registered.")

        } else {

            await bot.say('Here you go! This is your FreeIPA account details. :grin: \n' +
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