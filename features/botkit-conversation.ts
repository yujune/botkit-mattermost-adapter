// this is the file that mainly used for testing

import { Botkit, BotkitConversation } from "botkit";

// module has an exports properties
module.exports = (controller: Botkit) => {

    const convo = new BotkitConversation('convo', controller);

    // send a greeting
    convo.say('Howdy!');

    //ask a question, store the response in 'name'
    convo.ask({
      "attachments": [
      {
        "pretext": "This is the attachment pretext.",
        "text": "This is the attachment text.",
        "type": "interactive_message",
        "actions": [
          //button1
          {
            "id": "button1",
            "name": "button1",
            "type": "button",
            "integration": {
              "url": "http://10.13.18.140:3000/api/messages",
              "context": {
                "text": "button1",
                "action": "do_something_ephemeral"
              }
            }
          }, 
          //default button
          {
            "id": "default",
            "name": "default",
            "type": "button",
            "integration": {
              "url": "http://10.13.18.140:3000/api/messages",
              "context": {
                "action": "do_something_update"
              }
            }
          },
          //menu
          {
            "id": "action_options",
            "name": "Select an option...",
            "integration": {
              "url": "http://10.13.18.140:3000/api/messages",
              "context": {
                "action": "do_something"
              }
            },
            "type": "select",
            "options": [
                    {
                        "text": "Option1",
                        "value": "opt1"
                    },
                    {
                        "text": "Option2",
                        "value": "opt2"
                    },
                    {
                        "text": "Option3",
                        "value": "opt3"
                    }
            ]
          }
        ]
      }
    ]        
    },
    [
      {
        pattern: "button1",
        handler: async (response, convo, bot) => {

            await bot.say("Alright, let me sent the link to your email (button1 click events).");
        }
      },
      {
        default: true,
        handler: async (response, convo, bot) => {

            await bot.say('I do not understand your response from your button clicks! :dizzy_face:');
            return await convo.repeat();

        }
      }
    ],{ key: "testbutton" });

    // convo.ask({
    //     attachments: [
    //         {
    //             "pretext": "This is the attachment pretext.",
    //             "text": "This is the attachment text.",
    //             "actions": [
    //                 {
    //                     "id": "update",
    //                     "name": "Update",
    //                     "integration": {
    //                         "url": "http://10.13.17.38:32104/api/v4/posts/",
    //                         "context": {
    //                             "channel_id": "string",
    //                             "message": "string"

    //                         }
    //                     }
    //                 }
    //             ]
    //         }
    //     ]
    // }
    // , [
    //     {
    //         pattern: 'no',
    //         handler: async (response, convo, bot) => {
    //             // if user says no, go back to favorite color.
    //             await bot.say("great");
    //             await convo.gotoThread('favorite_color');

    //         }
    //     },
    //     {
    //         default: true,
    //         handler: async (response, convo, bot, full_message) => {
    //             // do nothing, allow convo to complete.
    //         }
    //     }
    // ], "ans");

    // use add action to switch to a different thread, defined below...
    // convo.addAction('favorite_color');

    // // add a message and a prompt to a new thread called `favorite_color`
    // convo.addMessage('Awesome {{vars.name}}!', 'favorite_color');
    // convo.addQuestion('Now, what is your favorite color? {{vars.ans}}..', async (response, convo, bot) => {
    //     console.log(`user favorite color is ${response}`);
    // }, 'color', 'favorite_color');

    // // go to a confirmation
    // convo.addAction('confirmation', 'favorite_color');

    // // do a simple conditional branch looking for user to say "no"
    // convo.addQuestion('Your name is {{vars.name}} and your favorite color is {{vars.color}}. Is that right?', [
    //     {
    //         pattern: 'no',
    //         handler: async (response, convo, bot) => {
    //             // if user says no, go back to favorite color.
    //             await convo.gotoThread('favorite_color');
    //         }
    //     },
    //     {
    //         default: true,
    //         handler: async (response, convo, bot, full_message) => {
    //             // do nothing, allow convo to complete.
    //         }
    //     }
    // ], 'confirm', 'confirmation');

    controller.addDialog(convo);

    controller.hears('hello dear', 'message', async (bot, message) => {


        await bot.say("message is =>" + JSON.stringify(message.incoming_message));
        //console.log("mmmmmmmmmmmmmmmmm" + JSON.stringify(message));
        // await suspend the async function until promise from async is fulfilled.
        await bot.beginDialog('convo');

        //await bot.reply(message, 'test');

        // await bot.reply(message, {
        //     attachments: [
        //         {
        //             "pretext": "This is the attachment pretext.",
        //             "text": "This is the attachment text.",
        //             "actions": [
        //                 {
        //                     "id": "message",
        //                     "name": "Ephemeral Message",
        //                     "integration": {
        //                         "url": "http://127.0.0.1:7357",
        //                         "context": {
        //                             "action": "do_something_ephemeral"
        //                         }
        //                     }
        //                 }, {
        //                     "id": "update",
        //                     "name": "Update",
        //                     "integration": {
        //                         "url": "http://127.0.0.1:7357",
        //                         "context": {
        //                             "action": "do_something_update"
        //                         }
        //                     }
        //                 }
        //             ]
        //         }
        //     ]

        // });

    });
}
