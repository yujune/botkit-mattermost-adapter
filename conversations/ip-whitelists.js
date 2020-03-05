import { IPCollection } from '../db/mongo.js';
import isIp from 'is-ip';

export const ipWhitelistConversation = async (controller) => {
    controller.hears(['show ipwhitelist (.*)'], 'mention', async function(bot, message) {
        const env = message.match[1];
        let ipCount;
        try {
            ipCount = await IPCollection.count({});
        } catch(err) {
            bot.reply(message, `There is an error query count ipwhitelist. ${err}`, () => {});          
        }
        if (!ipCount || ipCount === 0) {
            bot.reply(message, 'There are no IP whitelists on your list. Say `add ip1,ip2,ip3 environment` to add something.', () => {});
        } else {
            let allDocuments;
            try {
                allDocuments = await IPCollection.find({}).toArray();
            } catch(err) {
                bot.reply(message, `There is an error query all ipwhitelists. ${err}`, () => {});          
            }
            let text = null
            if (env === "*") text = generateIPs(allDocuments);
            else text = generateIPs(allDocuments.filter(e => e.env === env));
            bot.reply(message, text, () => {});
        }
    });

    // listen for a user saying "add <something>", and then add it to the user's list
    // store the new list in the storage system
    controller.hears(['add (.*) (.*)'],'mention', async (bot, message) => {
        async function insertToIPEnv(newIPs, env) {
            try {
                await IPCollection.update({ env },
                    {
                        $addToSet: {
                            listIPs: {
                                $each: newIPs
                            }
                        }
                    }, 
                    {upsert: true})
            } catch(err) {
                bot.reply(message, `There is an error insert IP to environment. ${err}`, () => {});          
            }
        }
        const newIPs = formatIPs(message.match[1]);
        const newEnv = message.match[2];
        if (message.match.length != 3) {
            bot.reply(message,`Something went wrong. Are you sure you parsing the right command. \`add ip1,ip2,ip3 ${newEnv}\``, () => {});
            return;
        }

        if (newIPs && newEnv) {
            if (isInvalidIPAddresses(newIPs)) {
                bot.reply(message,`Invalid IPs. Make sure using right command. \`add ip1,ip2,ip3 ${newEnv}\``, () => {});
                return;
            }
            await insertToIPEnv(newIPs, newEnv)
            newIPs.map((ip, ipIndex) => {
                bot.reply(message,ip + ' had been added.', () => {});
                if (ipIndex === newIPs.length - 1) {
                    bot.reply(message, `*Total ${newIPs.length} had been added.*`, () => {});
                }
            })
        } else {
            bot.reply(message,`Something went wrong. Are you sure you parsing the right command. \`add ip1,ip2,ip3 ${newEnv}\``, () => {});
        }
    });

    controller.hears(['remove env (.*)'],'mention', async (bot, message) => {
        const env = message.match[1];
        if (env) {
            try {
                await IPCollection.removeOne({ env })
                bot.reply(message, `${env} environment had been removed.`, () => {});
            } catch(err) {
                bot.reply(message, `There is an error removed the environment. ${err}`, () => {});
            }
        }
    });
    
    controller.hears(['remove ip (.*) (.*)'],'mention', async (bot, message) => {
        async function removeListIPFromEnv(newIPs, env, removedAll) {
            const q = (removedAll) ? {
                $set: {
                    listIPs: []
                }
            } : {
                $pull: {
                    listIPs: {
                        $in: newIPs
                    }
                }
            }
            try {
                await IPCollection.update({ env }, q, { multi: true })
            } catch(err) {
                bot.reply(message, `There is an error to remove IP from environment. ${err}`, () => {});          
            }
        }
        const ipToBeRemoved = formatIPs(message.match[1])
        const newEnv = message.match[2];
        if(message.match.length != 3) {
            bot.reply(message,'Something went wrong. Are you sure you parsing the right command.', () => {});
            return;
        }

        if (ipToBeRemoved && newEnv) {
            let removedIPs = [];
            let removedAll = false;
            if (ipToBeRemoved.includes('*')) {
                removedAll = true
                let particularDoc;
                try {
                    particularDoc = await IPCollection.findOne({ env: newEnv });
                    removedIPs = removedIPs.concat(particularDoc.listIPs)
                } catch(err) {
                    bot.reply(message, `There is an error query ipwhitelist. ${err}`, () => {});          
                }
            } else {
                if (isInvalidIPAddresses(ipToBeRemoved)) {
                    bot.reply(message,`Invalid IPs. Make sure using right command. \`remove ip1,ip2,ip3 ${newEnv}\``, () => {});
                    return;
                }
                removedIPs = removedIPs.concat(ipToBeRemoved)
            }
            await removeListIPFromEnv(removedIPs, newEnv, removedAll)
            removedIPs.map(ip => {
                bot.reply(message,ip + ' had been removed.', () => {});
            })
        } else {
            bot.reply(message,'Something went wrong. Are you sure you parsing the right command.', () => {});
        }
    });
    

    // simple function to generate the text of the task list so that
    // it can be used in various places
    function generateIPs(documents) {
        let text
        documents.map(doc => {
            text = ((text) ? text : '') + `*Environment: ${doc.env}*\n`;
            if (doc['listIPs'] && doc['listIPs'].length > 0) {
                doc['listIPs'].map(ip => {
                    text = text + `> ${ip}\n`
                })
            }else{
                text = text + ">Do not have any IP to whitelist\n"
            }
        })
        return text
    }

    function isInvalidIPAddresses(ipAddresses) {
        return (ipAddresses) ? ipAddresses.map(ip => isIp(ip)).includes(false) : false;
    }

    function formatIPs(ipAddresses) {
        return ipAddresses.split(",").map(ip => ip.trim())
    }
}