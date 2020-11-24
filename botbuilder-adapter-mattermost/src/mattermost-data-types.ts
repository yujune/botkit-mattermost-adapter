export enum MatterMostRoomType {
    DirectChat = "DirectChat",         // 'D'
    Public_Channel = "Public Channel",            // 'O'
    Private_Channel = "Private Channel",            // 'P'
    Event = "Event",             // RocketChat events
    Unknown = "Unknown",           // default
}

export enum MatterMostEvent {
    Invite = "invite",
    Kick = "kick",
    Unknown = "unknown"
}

export enum MatterMostExitCode {
    LoginFailed = 1,  // Make exit code start from 1.
    GetBotInfoFailed, // automatically increase 1 (2)
    GetRoomInfoFailed, //(3)
    SubscribeToMessagesFailed, //(4)
    RespondToMessagesFailed, //(5)
}
