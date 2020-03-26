
import { Pool } from 'pg';
import pgConfig from '../config/db'

export let pgClient;
export let pgDB;

export const initPostgres = async () => {
    console.log('postgres initiated!')
    pgDB = pgConfig.database
    try {
        const pool = new Pool(pgConfig)
        pgClient = await pool.connect()
        await pgClient.connect()
    } catch(err) {
        console.log('connecting postgres client: ', err)
    }
}
