export enum RocketChatRoomType {
    DirectChat,  // 'd'
    LiveChat,    // 'l'
    Channel,     // 'c'
    Room,        // 'p'
    Mention,     // 'p' and mentioned
    Unknown      // default
}

export enum RocketChatExitCode {
    LoginFailed = 1,  // Make exit code start from 1.
    GetBotInfoFailed,
    GetRoomInfoFailed,
    SubscribeToMessagesFailed,
    RespondToMessagesFailed,
}
