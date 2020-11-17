import { Botkit } from 'botkit';
import { Activity, ActivityTypes, BotAdapter, ConversationReference, ResourceResponse, TurnContext } from 'botbuilder';
import { driver, api } from '@rocket.chat/sdk';
import { IMessage } from '@rocket.chat/sdk/dist/config/messageInterfaces';
import { RocketChatBotWorker } from './rocketchat-bot-worker';
import { RocketChatAdapterOptions } from './rocketchat-adapter-options';
import { RocketChatRoomType, RocketChatEvent, RocketChatExitCode } from './rocketchat-data-types';


/**
 * About the flow, please refer
 * [Microsoft BotFramework documentation](https://docs.microsoft.com/en-us/javascript/api/botbuilder/botframeworkadapter?view=botbuilder-ts-latest)
 * for details.
 */
export class RocketChatAdapter extends BotAdapter {
    /**
     * [Required] Name used to register this adapter with Botkit.
     * @ignore
     */
    public name = 'RocketChat Adapter';

    /**
     * RocketChatAdapter configurations.
     */
    private options: RocketChatAdapterOptions;

    /**
     * Bot information in RocketChat.
     */
    public rcBotInfo: any;

    /**
     * Configured channel(s) and room(s) information in RocketChat.
     */
    public rcRoomInfo: {[key: string]: any} = {};

    /**
     * A customized BotWorker object that exposes additional utility methods.
     * @ignore
     */
    public botkit_worker = RocketChatBotWorker;


    public constructor(options: RocketChatAdapterOptions) {
        super();
        this.options = options;
    }

    /**
     * Botkit-only: Initialization function called automatically when used with Botkit.
     * @param botkit
     */
    public init(botkit: Botkit): void {
        botkit.ready(() => {
            this.startBot(botkit.handleTurn.bind(botkit));
        });
    }

    /**
     * Standard BotBuilder adapter method to accept an incoming webhook request and convert it into a TurnContext which can be processed by the bot's logic.
     * @param req A request object from Restify or Express
     * @param res A response object from Restify or Express
     * @param logic A bot logic function in the form `async(context) => { ... }`
     */
    public async processActivity(req: any, res: any, logic: (context: TurnContext) => Promise<void>): Promise<void> {
        return Promise.reject(new Error('The method [processActivity] is not supported yet.'));
    }

    /**
     * Standard BotBuilder adapter method to resumes a conversation with a user
     * asynchronously , possibly after some time has gone by.
     * @param reference
     * @param logic
     */
    public async continueConversation(reference: ConversationReference, logic: (context: TurnContext) => Promise<void>): Promise<void> {
        return Promise.reject(new Error('The method [continueConversation] is not supported yet.'));
    }

    /**
     * Standard BotBuilder adapter method to send a message from the bot to the
     * messaging API. * [BotBuilder reference docs](https://docs.microsoft.com/en-us/javascript/api/botbuilder-core/botadapter?view=botbuilder-ts-latest#sendactivities).
     * @param context A TurnContext representing the current incoming message and environment.
     * @param activities An array of outgoing activities to be sent back to the messaging API.
     */
    public async sendActivities(context: TurnContext, activities: Partial<Activity>[]): Promise<ResourceResponse[]> {
        const responses = [];

        for (let i = 0; i < activities.length; i++)
        {
            const activity = activities[i];
            try {
                const result = await this.activityToRocketChat(activity)
                responses.push({
                    id: result._id,
                    activityId: result.ts,
                    conversation: { id: result.rid }
                });
            } catch (error) {
                this.errorHandler('Failed to send message', error);
            }
        }

        return responses;
    }

    /**
     * Standard BotBuilder adapter method to replaces a previous activity with
     * an updated version asynchronously.
     * @param context
     * @param activity
     */
    public async updateActivity(context: TurnContext, activity: Partial<Activity>): Promise<void> {
        return Promise.reject(new Error('The method [updateActivity] is not supported yet.'));
    }

    /**
     * Standard BotBuilder adapter method to deletes an existing activity asynchronously.
     * @param context
     * @param reference
     */
    public async deleteActivity(context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
        return Promise.reject(new Error('The method [deleteActivity] is not supported yet.'));
    }

    /***********************************************/
    /*************** Private Methods ***************/
    /***********************************************/

    /**
     * Error handler used in adapter.
     * @param customErrorMsg Friendly error message.
     * @param error          Error object from stack.
     * @param exitCode       Exit code, if defined, then exit bot with this exit code.
     */
    private errorHandler(customErrorMsg: string, error: Error, exitCode: RocketChatExitCode | undefined = undefined): void {
        console.error(`[${customErrorMsg}] ${error.message}`);
        if (exitCode)
            process.exit(exitCode);
    }

    /**
     * Start RocketChat bot.
     * @param logic A bot logic function in the form `async(context) => { ... }`
     */
    private startBot(logic: (context: TurnContext) => Promise<void>): void {
        let rcBotUserId: string | undefined = undefined;
        driver.connect({ host: this.options.host, useSsl: this.options.useSsl })
            .then(() => driver.login({username: this.options.user, password: this.options.password}))
            .catch((error) => {
                this.errorHandler('Failed to login', error, RocketChatExitCode.LoginFailed);
            })
            .then((credential) => {
                rcBotUserId = credential;
            })
            /* ----- Cache bot information ----- */
            .then(() => api.get('users.info', { userId: rcBotUserId }))
            .catch((error) => {
                this.errorHandler('Failed to get bot information', error, RocketChatExitCode.GetBotInfoFailed);
            })
            .then((info) => {
                if (info.success) this.rcBotInfo = info.user;
            })
            /* ----- Cache configured channel(s)/room(s) information ----- */
            .then(() => {
                const promises: Promise<any>[] = [];
                this.options.channels.concat(this.options.rooms)
                    .forEach((room) => {
                        promises.push(
                            // Call RocketChat API.
                            api.get('rooms.info', { roomName: room })
                        );
                    });
                return Promise.all(promises);
            })
            .catch((error) => {
                this.errorHandler('Failed to get room\'s info', error, RocketChatExitCode.GetRoomInfoFailed);
            })
            .then((roomResponses) => {
                roomResponses && roomResponses.forEach(rcRoomInfo => {
                    if (rcRoomInfo)
                    {
                        const room = rcRoomInfo.room;
                        this.rcRoomInfo[room._id] = room;
                    }
                });
            })
            /* ----- Subscribe to user's message stream ----- */
            .then(() => driver.subscribeToMessages())
            .catch((error) => {
                this.errorHandler('Failed to subscribe to messages', error, RocketChatExitCode.SubscribeToMessagesFailed);
            })
            .then(() => {

                driver.sendToRoomId("I'm alive!", "GENERAL");

                const options = {
                    rooms:     this.options.rooms,
                    allPublic: false,
                    dm:        this.options.respondToDm,
                    livechat:  this.options.respondToLiveChat,
                    edited:    this.options.respondToEdited
                };
                driver.respondToMessages((err, message, room) => {
                    if (err) return Promise.reject(err);

                    this.receiveRocketChatMessage(message, room, logic)
                        .catch((error) => {
                            this.errorHandler('Failed to handle received message', error);
                        })
                }, options);
            })
            .catch((error) => {
                this.errorHandler('Failed to respond to messages', error, RocketChatExitCode.RespondToMessagesFailed);
            })
            .finally(() => api.logout());
    }

    /********** Methods for receiving RocketChat Message **********/

    /**
     * Handler to call when receiving RocketChat message.
     * @param message RocketChat message object.
     * @param room    RocketChat room object.
     * @param logic   A bot logic function in the form `async(context) => { ... }`
     */
    private async receiveRocketChatMessage(message: any, room: any, logic: (context: TurnContext) => Promise<void>) {
        let rcRoomType = this.getRocketChatRoomType(message, room);

        // As `.env` file description said, `MENTION_ROOMS` are the channels
        // that the bot only can answer when mentioned. But
        // `driver.respondToMessages` didn't filter correctly, so we filter
        // it here.
        if (rcRoomType === RocketChatRoomType.Channel ||
            rcRoomType === RocketChatRoomType.Room    ||
            rcRoomType === RocketChatRoomType.Unknown)
        {
            console.warn(`[Receive Message] Invalid room type: ${rcRoomType}, ignore`);
            return;
        }

        // Convert RocketChat message to Botkit activity object.
        let activity = {
            id:        message._id,
            timestamp: message.ts.$date,
            channelId: message.rid,
            from:      { id: message.u._id, name: message.u.username },
        } as Activity;

        if (rcRoomType == RocketChatRoomType.Event)
        {
            switch (message.t)
            {
                // Invite
                case 'au':
                    activity.type = RocketChatEvent.Invite;
                    break;
                // Kick
                case 'ru':
                    activity.type = RocketChatEvent.Kick;
                    break;
                // Others
                default:
                    activity.type = RocketChatEvent.Unknown;
            }
            if (this.rcRoomInfo.hasOwnProperty(message.rid))
            {
                activity.channelData = this.rcRoomInfo[message.rid];
                // @ts-ignore
                activity.rcEvent = {
                    from: { id: message.u._id, name: message.u.username },
                    to:   { id: '', name: message.msg } // There is no receiver userId.
                };
            }
        }
        else
        {
            activity.type = ActivityTypes.Message;
            if (message.editedBy)
                activity.type = ActivityTypes.MessageUpdate;

            // We set `recipient` to identify this message comes from a private
            // group and mentioned the bot.
            if (rcRoomType === RocketChatRoomType.ChannelAndMention ||
                rcRoomType === RocketChatRoomType.RoomAndMention)
            {
                activity.recipient = {   id: this.rcBotInfo._id,
                                       name: this.rcBotInfo.username };

                // `conversation.id` is the identity of BotkitConversation.
                // @ts-ignore ignore missing fields
                activity.conversation = { id: `${message.rid}-${message.u._id}` };
            }
            else
            {
                // `conversation.id` is the identity of BotkitConversation.
                // @ts-ignore ignore missing fields
                activity.conversation = { id: message.rid };
            }

            activity.text = message.msg;
        }

        if (message.attachments)
        {
            activity.attachments = [];
            message.attachments.forEach((attachment: any) => {
                // @ts-ignore ignore missing fields
                activity.attachments?.push({
                    content: attachment
                });
            });
        }

        const context = new TurnContext(this, activity);
        this.runMiddleware(context, logic)
            .catch((error) => {
                this.errorHandler('Failed to run middleware', error);
            });
    }

    /********** Methods for delivering RocketChat Message *********/

    /**
     * Check whether bot get mentioned in message.
     * @param mentions List of mentions in message payload.
     */
    private isMentionBot(mentions: {_id: string}[]): boolean {
        var isMentionBot = false;
        if (! mentions) return isMentionBot;
        if (! this.rcBotInfo) return isMentionBot;

        mentions.every(mention => {
            if (mention._id === this.rcBotInfo._id)
            {
                isMentionBot = true;
                // Skip looping.
                return false;
            }
        })
        return isMentionBot;
    }

    /**
     * Convert RocketChat message to Botkit Activity.
     * @param rcMessage RocketChat Message object. Document: https://docs.rocket.chat/api/schema-definition/the-message-object
     * @param rcRoom RocketChat Room object. Document: https://docs.rocket.chat/api/schema-definition/the-room-object
     */
    private getRocketChatRoomType(rcMessage: any, rcRoom: any): RocketChatRoomType {
        let messageType = RocketChatRoomType.Unknown;

        // When groupable is defined, and its value equals to false,
        // it's an event message, like XXX joined channel, XXX removed by YYY etc.
        if (rcMessage.hasOwnProperty('groupable') &&
            rcMessage.groupable === false)
            return RocketChatRoomType.Event;

        let rcRoomType = rcRoom.roomType;
        let msgMentions = rcMessage.mentions;

        // RocketChat Room Types Document:
        // https://docs.rocket.chat/api/schema-definition/the-room-object#room-types
        // https://docs.rocket.chat/guides/user-guides/channels
        if (rcRoomType === 'd')
        {
            messageType = RocketChatRoomType.DirectChat;
        }
        else if (rcRoomType === 'l')
        {
            messageType = RocketChatRoomType.LiveChat;
        }
        else if (rcRoomType === 'c')
        {
            if (this.isMentionBot(msgMentions))
            {
                messageType = RocketChatRoomType.ChannelAndMention;
            }
            else
            {
                messageType = RocketChatRoomType.Channel;
            }
        }
        else if (rcRoomType === 'p')
        {
            if (this.isMentionBot(msgMentions))
            {
                messageType = RocketChatRoomType.RoomAndMention;
            }
            else
            {
                messageType = RocketChatRoomType.Room;
            }
        }
        return messageType;
    }

    /**
     * Formats a BotBuilder activity object into an outgoing RocketChat message.
     * @param activity A BotBuilder Activity object.
     */
    private async activityToRocketChat(activity: Partial<Activity>): Promise<any> {
        if (activity.channelId)
        {
            const rcRoomInfo = this.rcRoomInfo[activity.channelId!];
            if (rcRoomInfo && rcRoomInfo.hasOwnProperty('ro') && rcRoomInfo.ro)
                throw new Error('Room is read-only.');
        }

        let msgToSend = activity.text;

        // Because we set `recipient` in `receiveRocketChatMessage` function
        // when message type is `Mention`, so that we can identify this activity
        // comes from private group, not direct message. And there maybe many
        // users in a group, so we prepend `@XXX` to message to let the user
        // know this message is relate to him/her, but no need to do this in
        // direct message (because direct message is one-to-one chat).
        if (activity.from && activity.recipient)
            msgToSend = `@${activity.recipient.name} ${msgToSend}`;

        // @ts-ignore ignore missing fields
        const rcMessage = {
            msg:         msgToSend,
            attachments: activity.attachments || null
        } as IMessage;

        return await driver.sendToRoomId(rcMessage, activity.channelId!);
    }
}
