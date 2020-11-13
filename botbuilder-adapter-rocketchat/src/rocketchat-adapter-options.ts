export interface RocketChatAdapterOptions {
    /**
     * Specify your instance of RocketChat.
     */
    host: string;

    /**
     * Specify the bot user name in RocketChat.
     */
    user: string;

    /**
     * Specify the bot user password in RocketChat.
     */
    password: string;

    /**
     * Specify with true or false the usage of SSL.
     */
    useSsl: boolean;

    /**
     * Specify the list of public rooms that the bot will be added.
     */
    channels: string[];

    /**
     * Specify the channels that the bot only can answer when mentioned.
     * The bot will answer all messages for default.
     */
    rooms: string[];

    /**
     * Specify if the bot it's allowed to answer direct messages.
     */
    respondToDm: boolean;

    /**
     * Specify if the bot it's allowed to answer live chat messages.
     */
    respondToLiveChat: boolean;

    /**
     * Specify if the bot it's allowed to answer edited messages.
     */
    respondToEdited: boolean;

    /**
     * Enable learning mode, a set of features that allow your bot to update
     * itself using Botkit Studio's API.
     */
    learningMode: boolean;
};

export function parseConfig(): RocketChatAdapterOptions {
    const channels = process.env.ROCKETCHAT_ROOM;
    let channelList: string[] = [];
    if (channels)
    {
        channels.split(',').forEach((channel: string) => {
            channelList.push(channel.trim().toLowerCase())
        });
    }

    const rooms = process.env.MENTION_ROOMS;
    let roomList: string[] = [];
    if (rooms)
    {
        rooms.split(',').forEach((room: string) => {
            roomList.push(room.trim().toLowerCase())
        });
    }

    return {
        host:              process.env.ROCKETCHAT_URL,
        user:              process.env.ROCKETCHAT_USER!,
        password:          process.env.ROCKETCHAT_PASSWORD!,
        useSsl:            process.env.ROCKETCHAT_USE_SSL?.toLowerCase() === "true",
        channels:          channelList,
        rooms:             roomList,
        respondToDm:       process.env.RESPOND_TO_DM?.toLowerCase() === "true",
        respondToLiveChat: process.env.RESPOND_TO_LIVECHAT?.toLowerCase() === "true",
        respondToEdited:   process.env.RESPOND_TO_EDITED?.toLowerCase() === "true",
        learningMode:      process.env.LEARNING_MODE?.toLowerCase() === "true",
    } as RocketChatAdapterOptions;
}
