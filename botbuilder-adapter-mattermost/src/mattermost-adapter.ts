import { Botkit } from 'botkit';
import { Activity, ActivityTypes, BotAdapter, ConversationReference, ResourceResponse, TurnContext } from 'botbuilder';
import { MatterMostBotWorker } from './mattermost-bot-worker';
import { MatterMostAdapterOptions } from './mattermost-adapter-options';
import { MatterMostRoomType, MatterMostEvent, MatterMostExitCode } from './mattermost-data-types';
//import { MatterMostClient } from 'mattermost-client';

const MatterMostClient = require('mattermost-client');

/**
 * About the flow, please refer
 * [Microsoft BotFramework documentation](https://docs.microsoft.com/en-us/javascript/api/botbuilder/botframeworkadapter?view=botbuilder-ts-latest)
 * for details.
 */
export class MatterMostAdapter extends BotAdapter {
    /**
     * [Required] Name used to register this adapter with Botkit.
     * @ignore
     */
    public name = 'MatterMost Adapter';

    /**
     * MatterMostAdapter configurations.
     */
    private options: MatterMostAdapterOptions;

    /**
     * Bot information in MatterMost.
     */
    public mmBotkit: any;

    /**
     * Configured channel(s) and room(s) information in MatterMost.
     */
    public mmRoomInfo: { [key: string]: any } = {};

    /**
     * 'mattermost-client' object
     */
    public client: any;

    /**
     * logic: (context: TurnContext) => Promise<void>, to store startBot()'s parameters
     */
    public logic: any;

    /**
     * A customized BotWorker object that exposes additional utility methods.
     * @ignore
     */
    public botkit_worker = MatterMostBotWorker;


    public constructor(options: MatterMostAdapterOptions) {
        super();
        this.options = options;
        //set httpPort to null to make a url with http(s)//10.13.18.140/... instead of http(s)//10.13.18.140:80/...
        //http(s)//10.13.18.140:80/... cannot be directed
        this.client = new MatterMostClient(this.options.host, this.options.group, this.options);
        console.log("Options http: " + typeof (this.options.httpPort));

        // Binding because async calls galore
        this.open = this.open.bind(this);
        this.error = this.error.bind(this);
        this.onConnected = this.onConnected.bind(this);
        this.onHello = this.onHello.bind(this);
        //this.userChange = this.userChange.bind(this);
        this.loggedIn = this.loggedIn.bind(this);
        // this.profilesLoaded = this.profilesLoaded.bind(this);
        //this.brainLoaded = this.brainLoaded.bind(this);
        this.message = this.message.bind(this);
        this.userTyping = this.userTyping.bind(this);
        this.userAdded = this.userAdded.bind(this);
        this.userRemoved = this.userRemoved.bind(this);
        this.postDeleted = this.postDeleted.bind(this);

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

        console.log("Activity: " + JSON.stringify(activities));

        const responses = [];

        for (let i = 0; i < activities.length; i++) {
            const activity = activities[i];
            try {
                const result = await this.activityToMatterMost(activity)
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
    private errorHandler(customErrorMsg: string, error: Error, exitCode: MatterMostExitCode | undefined = undefined): void {
        console.error(`[${customErrorMsg}] ${error.message}`);
        if (exitCode)
            process.exit(exitCode);
    }

    /**
     * Start RocketChat bot.
     * @param logic A bot logic function in the form `async(context) => { ... }`
     */
    private startBot(logic: (context: TurnContext) => Promise<void>): void {

        this.logic = logic;

        this.client.tokenLogin(this.options.token);

        this.client.on('open', this.open);
        this.client.on('hello', this.onHello);
        this.client.on('loggedIn', this.loggedIn);
        this.client.on('connected', this.onConnected);
        this.client.on('message', this.message);
        this.client.on('user_added', this.userAdded);
        this.client.on('user_removed', this.userRemoved);
        this.client.on('typing', this.userTyping);
        this.client.on('error', this.error);
        this.client.on('post_deleted', this.postDeleted);
    }

    // /**
    //  * Check whether bot get mentioned in message.
    //  * @param mentions List of mentions in message payload.
    //  */
    private isMentionBot(mentions: { _id: string }[]): boolean {
        var isMentionBot = false;
        if (!mentions) return isMentionBot;
        if (!this.mmBotkit) return isMentionBot;

        mentions.every(mention => {
            if (mention._id === this.mmBotkit._id) {
                isMentionBot = true;
                // Skip looping.
                return false;
            }
        })
        return isMentionBot;
    }

    /**
     * Get mattermost channel type
     */
    private getMatterMostChannelType(msg: any) {
        //------------get channel type --------------

        // When groupable is defined, and its value equals to false,
        // it's an event message, like XXX joined channel, XXX removed by YYY etc.
        if (msg.hasOwnProperty('groupable') &&
            msg.groupable === false)
            return MatterMostRoomType.Event;

        let mmChannelType = msg.data.channel_type;
        console.log(mmChannelType + ' is the type');
        let messageType = MatterMostRoomType.Unknown;

        if (mmChannelType === 'D') {
            messageType = MatterMostRoomType.DirectChat;
        }
        else if (mmChannelType === 'O') {
            messageType = MatterMostRoomType.Public_Channel;
        }
        else if (mmChannelType === 'P') {
            messageType = MatterMostRoomType.Private_Channel;
        }
        console.log("Message type: " + messageType);
    }

    // /**
    //  * Formats a BotBuilder activity object into an outgoing RocketChat message.
    //  * @param activity A BotBuilder Activity object.
    //  */
    private async activityToMatterMost(activity: Partial<Activity>): Promise<any> {
        if (activity.channelId) {

            const mmRoomInfo = this.mmRoomInfo[activity.channelId!];
            if (mmRoomInfo && mmRoomInfo.hasOwnProperty('ro') && mmRoomInfo.ro)
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

        // according to mattermost api documents, to invoke interactive message,
        // you should assign {attachments:[...]} object to the 'props' key value
        let mmattachments = { attachments: activity.attachments };

        //console.log('mmattachments =>' + JSON.stringify(mmattachments));

        // @ts-ignore ignore missing fields
        const mmMessage = {
            message: msgToSend,
            props: mmattachments || null
        };

        return await this.client.postMessage(mmMessage, activity.channelId!);
    }

    /**
     * function that will be invoked when certain event is coming.
     */

    private open() {
        return true;
    }

    private onConnected() {
        console.log('Connected to Mattermost.');
        console.log('connected');
        return true;
    }

    private onHello(event: any) {
        console.log(`Mattermost server: ${event.data.server_version}`);
        return true;
    }

    private loggedIn(user: any) {
        console.log(`Logged in as user "${user.username}" but not connected yet.`);
        this.mmBotkit = user;
        console.log(JSON.stringify(this.mmBotkit));
        return true;
    }

    private error(err: string) {
        console.log(`Error: ${err}`);
        return true;
    }

    private userTyping(msg: any) {
        //console.log('Someone is typing...', msg);
        return true;
    }

    private message(msg: any) {

        console.log("message, ", msg);

        const mmPost = JSON.parse(msg.data.post);

        if (mmPost.user_id === this.mmBotkit.id) { return; } // Ignore our own output

        // Convert RocketChat message to Botkit activity object.
        let activity = {
            id: mmPost.id,
            timestamp: mmPost.create_at,
            channelId: mmPost.channel_id,
            from: { id: mmPost.user_id, name: msg.data.sender_name.substring(1) },
        } as Activity;

        activity.type = ActivityTypes.Message;
        if (msg.editedBy) {
            activity.type = ActivityTypes.MessageUpdate;
        }

        // `conversation.id` is the identity of BotkitConversation.
        // @ts-ignore ignore missing fields

        activity.conversation = { id: `${mmPost.channel_id}-${mmPost.user_id}` };

        activity.recipient = {
            id: this.mmBotkit.id,
            name: this.mmBotkit.username
        };

        activity.text = mmPost.message;

        if (msg.attachments) {
            activity.attachments = [];
            msg.attachments.forEach((attachment: any) => {
                // @ts-ignore ignore missing fields
                activity.attachments?.push({
                    content: attachment
                });
            });
        }

        const context = new TurnContext(this, activity);
        this.runMiddleware(context, this.logic)
            .catch((error) => {
                this.errorHandler('Failed to run middleware', error);
            });
    }

    private userRemoved(msg: any) {
        //coming soon
    }

    private userAdded(msg: any) {
        // coming soon
    }

    private postDeleted(msg: any) {
        // coming soon
    }

}

