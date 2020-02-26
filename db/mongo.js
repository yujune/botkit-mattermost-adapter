
import { MongoClient } from 'mongodb';
import MongoConfig from '../config/db'

export let ipCollection;

export const initMongo = async () => {
    console.log('mongo initiated!')
    let db = await MongoClient.connect(MongoConfig.MONGO_URL);

    ipCollection = db.ipwhitelist
}
