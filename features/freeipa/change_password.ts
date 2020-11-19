import { Botkit, BotkitConversation } from "botkit";
import exe_stackstorm_api from "./lib/sharedcode";

module.exports = (controller: Botkit) => {

    var username: string;

    const change_password = new BotkitConversation('change_password', controller);

    change_password.ask("Are you sure you want to change your password ? ", [
        {
            pattern: "yes",
            handler: async (response, change_password, bot) => {

                await bot.say("Alright, let me sent the link to your email.");

                let data = { 'action': 'freeipa.action_check_account', "parameters": { "user_id": username } };  //JSON.stringtify will convert it to json string
                let string_data = JSON.stringify(data)

                // call the stackstorm api and get the execution results
                let account_status = await exe_stackstorm_api(string_data, 2);

                let execution_status = account_status['status'];

                if (execution_status == "succeeded") {

                    let personalemail = account_status['result']['result']['personalemail'][0];
                    await bot.say(personalemail);

                    let password_valid_days = account_status['result']['result']['password_valid_days'];

                    if (personalemail != 'undefined') {

                        let action_email_data = { 'action': 'freeipa.action_send_reminder', "parameters": { "receiver_name": username, "receiver_email": personalemail, "passw_daysleft": password_valid_days } };  //JSON.stringtify will convert it to json string
                        let string_action_email = JSON.stringify(action_email_data);

                        //it needs 6 seconds to wait because action_send_reminder action need at least 5 seconds to process
                        let email_response = await exe_stackstorm_api(string_action_email, 6);

                        await bot.say(email_response['result']['result']);

                    } else {
                        await bot.say("You did not provide your email in FreeIPA account. I can't send you the link.");
                    }
                }
            }
        },
        {
            pattern: "no",
            handler: async (response, change_password, bot) => {

                return await bot.say("Okay, change password request has been cancelled.");
            }
        },
        {
            default: true,
            handler: async (response, change_password, bot) => {

                await bot.say('I do not understand your response! :dizzy_face:');
                return await change_password.repeat();

            }
        }
    ], { key: "ans" })

    controller.addDialog(change_password);

    controller.hears("change password", "message", async (bot, message) => {

        username = message?.reference?.user?.name!; // ! =  tells TypeScript that even though something looks like it could be null, it can trust you that it's not

        await bot.beginDialog('change_password');

    });

}