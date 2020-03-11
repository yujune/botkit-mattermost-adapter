import { initBot } from './bot'
import { initPostgres } from './db/postgres'


async function main(){
    try {
        await initPostgres();
    
        await initBot();
    } catch(ex) {
        console.log('Something wrong when starting BotKit...', ex)
    }
}
main();