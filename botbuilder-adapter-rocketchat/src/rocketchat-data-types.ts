export enum RocketChatRoomType {
    DirectChat        = "DirectChat",         // 'd'
    LiveChat          = "LiveChat",           // 'l'
    Channel           = "Channel",            // 'c'
    ChannelAndMention = "ChannelAndMention", // 'c' and mentioned
    Room              = "Room",              // 'p'
    RoomAndMention    = "RoomAndMention",    // 'p' and mentioned
    Event             = "Event",             // RocketChat events
    Unknown           = "Unknown",           // default
}

export enum RocketChatEvent {
    Invite  = "invite",
    Kick    = "kick",
    Unknown = "unknown"
}

export enum RocketChatExitCode {
    LoginFailed = 1,  // Make exit code start from 1.
    GetBotInfoFailed,
    GetRoomInfoFailed,
    SubscribeToMessagesFailed,
    RespondToMessagesFailed,
}
