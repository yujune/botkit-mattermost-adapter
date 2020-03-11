require('dotenv').config()
export default {
    // MONGO_URL: 'mongodb://192.168.33.111:27017/botkit?readPreference=primary&appname=MongoDB%20Compass%20Community&ssl=false'
    host: process.env.PG_HOST || "localhost",
    user: process.env.PG_USER || "postgres", // default process.env.PGUSER || process.env.USER
    password: process.env.PG_PASS || "123123", //default process.env.PGPASSWORD
    database: process.env.PG_DB || "botkit", // default process.env.PGDATABASE || process.env.USER
    port: process.env.PG_PORT || 5432, // default process.env.PGPORT
    max: 200,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
    // connectionString: string, // e.g. postgres://user:password@host:5432/database
}