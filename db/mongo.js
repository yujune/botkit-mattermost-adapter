
import { MongoClient } from 'mongodb';
import MongoConfig from '../config/db'

export let IPCollection;

export const initMongo = async () => {
    console.log('mongo initiated!')
    let db = await MongoClient.connect(MongoConfig.MONGO_URL);

    IPCollection = db.collection("ipwhitelist")
}
