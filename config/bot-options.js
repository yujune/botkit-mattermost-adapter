require('dotenv').config()
export default {
    debug: true,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
    studio_stats_uri: process.env.studio_command_uri,
    rocketchat_host: process.env.ROCKETCHAT_URL,
    rocketchat_bot_user: process.env.ROCKETCHAT_USER,
    rocketchat_bot_pass: process.env.ROCKETCHAT_PASSWORD,
    rocketchat_ssl: process.env.ROCKETCHAT_USE_SSL,
    rocketchat_bot_rooms: process.env.ROCKETCHAT_ROOM,
    rocketchat_bot_mention_rooms: process.env.MENTION_ROOMS,
    rocketchat_bot_direct_messages: process.env.RESPOND_TO_DM,
    rocketchat_bot_live_chat: process.env.RESPOND_TO_LIVECHAT,
    rocketchat_bot_edited: process.env.RESPOND_TO_EDITED
}