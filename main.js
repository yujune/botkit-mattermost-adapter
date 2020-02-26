import { initBot } from './bot'
import { initMongo } from './db/mongo'


async function main(){
    try {
        await initMongo();
    
        await initBot();
    } catch(ex) {
        console.log('Something wrong when starting BotKit...', ex)
    }
}
main();