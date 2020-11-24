export interface MatterMostAdapterOptions {
    /**
     * Specify your instance of Mattermost.
     */
    host: string;

    /**
    * Specify the bot token.
    */
    token: string;

    /**
     * Overrides the default port 443 for websocket (wss://) connections
     */
    wssPort: string;

    /**
     * Specify the list of public rooms that the bot will be added.
     */
    group: string;

    /**
     * Overrides the default port (80 or 443) for http:// or https:// connections
     */
    httpPort: any;

    /**
     * (default: true) set to 'false' to allow connections when certs can not be verified (ex: self-signed, internal CA, ... - MITM risks)
     */
    tlsVerify: boolean;

    /**
     * (default: true) set to 'false' to switch to http/ws protocols
     */
    useTls: boolean;


    /**
    * (default: true) set to 'false' to stop posting reply responses as comments
    */
    mmreply: boolean;

};

export function parseConfig(): MatterMostAdapterOptions {

    return {
        host: process.env.MATTERMOST_HOST,
        token: process.env.MATTERMOST_ACCESS_TOKEN,
        wssPort: process.env.MATTERMOST_WSS_PORT,
        group: process.env.MATTERMOST_GROUP,
        httpPort: process.env.MATTERMOST_HTTP_PORT,
        tlsVerify: process.env.MATTERMOST_TLS_VERIFY?.toLowerCase() === "true",
        useTls: process.env.MATTERMOST_USE_TLS?.toLowerCase() === "true",
        mmreply: process.env.MATTERMOST_REPLY?.toLowerCase() === "true",
    } as MatterMostAdapterOptions;
}
