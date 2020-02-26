

import { mongo } from '../db/mongo';

export const ipWhitelistConversation = async (controller) => {
    controller.hears(['show ipwhitelist (.*)'], 'mention', function(bot, message) {
        console.log('message: ', message)

        const env = message.match[1];

        let ipCount = await mongo.count({});
        console.log('ipCount:', ipCount)
        if(ipCount === 0){

        }
        controller.storage.users.get(message.user, function(err, user) {
            // user object can contain arbitary keys. we will store tasks in .tasks
            if (!user || !user.tasks || user.tasks.length == 0) {
                bot.reply(message, 'There are no IP whitelists on your list. Say `add _ip_ _environment_` to add something.', () => {});
            } else {
                let text = '';
                if(env === 'all'){
                    text ='Here are your current IP: \n' +
                        generateTaskList(user) +
                    'Reply with `done _IP_ _ENVIRONMENT_` to mark a IP completed.';
                }
                // var text = 'Here are your current IP: \n' +
                //     generateTaskList(user) +
                //     'Reply with `done _IP_ _ENVIRONMENT_` to mark a IP completed.';
                bot.reply(message, text, () => {});
            }
        });
    });

    // listen for a user saying "add <something>", and then add it to the user's list
    // store the new list in the storage system
    controller.hears(['add (.*) (.*)'],'mention', function(bot, message) {

        const newIP = message.match[1];
        const newEnv = message.match[2];
        controller.storage.users.get(message.user, function(err, user) {

            if (!user) {
                user = {};
                user.id = message.user;
                user.tasks = [];
            }

            user.tasks.push(newIP);

            controller.storage.users.save(user, function(err,saved) {

                if (err) {
                    bot.reply(message, 'I experienced an error adding your task: ' + err, () => {});
                } else {
                    bot.reply(message,'Got it.', () => {});
                }

            });
        });

    });


     // simple function to generate the text of the task list so that
    // it can be used in various places
    async function generateTaskList(user) {

        var text = '';

        for (var t = 0; t < user.tasks.length; t++) {
            text = text + '> `' +  (t + 1) + '`) ' +  user.tasks[t] + '\n';
        }

        return text;

    }
}