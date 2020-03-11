import { pgClient, pgDB } from '../db/postgres.js';
import isIp from 'is-ip';
import crypto from 'crypto'
import format from 'biguint-format'
// import Bluebird from 'bluebird';
// import { integrationId } from '@rocket.chat/sdk/dist/lib/settings';

export const ipWhitelistConversation = async (controller) => {
    const locations = ["backoffice", "external", "frontend"]
    controller.on('invalid_ip', (bot, message) => bot.reply(message, 'I don\'t understand! Your IP is invalid.', () => {}))
    controller.on('invalid_loc', (bot, message) => bot.reply(message, 'I don\'t understand! Your location is invalid.', () => {}))

    controller.hears(['show ipwhitelist (.*)'], 'mention', async function(bot, message) {
        const env = message.match[1];
        let ipCount;
        // SELECT *
        // FROM botkit.backoffice AS bo, 
        // botkit.external AS ex,
        // botkit.frontend AS fe;
        try {
            let ipTables = await pgClient.query(`
                SELECT * FROM
                ${pgDB}.backoffice AS bo, ${pgDB}.external AS ex, ${pgDB}.frontend AS fe
            `)
            if(ipTables) {
                ipCount = ipTables["rowCount"]
            }
        } catch(err) {
            bot.reply(message, `There is an error query count ipwhitelist. ${err}`, () => {});          
        }
        if (!ipCount || ipCount === 0) {
            bot.reply(message, 'There are no IP whitelists on your list. Say `add ip1,ip2,ip3 environment` to add something.', () => {});
        } else {
            let allDocuments;
            try {
                allDocuments = await pgClient.find({}).toArray();
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
    controller.hears(['IP Whitelists'], 'mention', async (bot, message) => {
        async function insertToIPEnv(d) {
            try {
                let envId = await getEnvironmentId(d.env);
                debugger;
                if (envId) {
                    // external: id, remark, ip[], env_id
                    // frontend: id, operator, ip[], env_id
                    // backoffice: id, remark, ip[], env_id, expression

                    let colNames;
                    let colValues;
                    if (d.loc === "frontend") {
                        colNames = 'id, operator, ip, env_id'
                        colValues = [generateID(), null, d.ip, envId]
                    }
                    if (d.loc === "external") {
                        colNames = 'id, remark, ip, env_id'
                        colValues = [generateID(), null, d.ip, envId]
                    }
                    if (d.loc === "backoffice") {
                        colNames = 'id, remark, ip, env_id, expression'
                        colValues = [generateID(), null, d.ip, envId]
                    }

                    const textQ = `
                        INSERT INTO ${d.loc}(${colNames}) VALUES(value_list)
                        ON CONFLICT target action;
                    `

                    if(colNames && colValues){
                        try {
                            await pgClient.query(textQ, colValues)
                            return Promise.resolve(true)
                        } catch(err) {
                            throw err;
                        }
                    } 
                }
                
                // const textQ = `
                //     INSERT INTO ${d.env}(id, operator, env_id, ip) VALUES(value_list)
                //     ON CONFLICT target action;
                // `
                // // let bigRandId = biguint.format(random(8), 'dec');
                // const textV = [generateID(), d.op, envId, d.ip]
                // let result;
            
                // result = await pgClient.query(textQ, textV)

                // await IPCollection.update({ env },
                //     {
                //         $addToSet: {
                //             listIPs: {
                //                 $each: newIPs
                //             }
                //         }
                //     }, 
                //     {upsert: true})
            } catch(err) {
                bot.reply(message, `There is an error insert IP to environment. ${err}`, () => {});          
            }
        }

        bot.startConversation(message, async (err, convo) => {
            convo.ask('Which environment?', function (response, convo) {
                convo.setVar('response_env', response.text)
                convo.say('Cool, I like ' + response.text + ' too!')
                convo.next()
                convo.ask(`Where you want to be stored? \`(${locations.join(', ')})\``, async (response, convo) => {
                    if (!isLocationValid(response.text)) {
                        bot.botkit.trigger('invalid_loc', [bot, message])
                        convo.repeat()
                    } else {
                        convo.setVar('response_loc', response.text)
                    }
                    convo.next()
                    convo.ask(`What IP you want to add? \`Use comma for multiple IP addresses.\``, async (response, convo) => {
                        let ipResponse = formatIPs(response.text)
                        if (isInvalidIPAddresses(ipResponse)) {
                            bot.botkit.trigger('invalid_ip', [bot, message])
                            convo.repeat()
                        } else {
                            convo.setVar('response_ip', ipResponse)
                            convo.say('IP addresses? ' + response.text + ' ...sounds great!')

                            // convo.next();
                            const env = convo.vars.response_env;
                            const ip = convo.vars.response_ip;
                            const loc = convo.vars.response_loc;
                            try {
                                await insertToIPEnv({ ip, loc, env })

                                debugger;
                                convo.say(`Great! We had added \`${ip}\` for \`${op}\` on \`${env}\` environment`)
                            } catch(err) {
                                convo.say(`Error while adding... ${err}`)
                            }

                        }
                        convo.next()
                    })
                });

                // convo.ask(`What IP you want to add? \`Use comma for multiple IP addresses.\``, async (response, convo) => {
                //     let ipResponse = formatIPs(response.text)
                //     if (isInvalidIPAddresses(ipResponse)) {
                //         bot.botkit.trigger('invalid_ip', [bot, message])
                //         convo.repeat()
                //     } else {
                //         convo.setVar('response_ip', ipResponse)
                //         convo.say('IP addresses? ' + response.text + ' ...sounds great!')
                //     }
                //     convo.next()
                //     convo.ask(`Where you want to be stored? \`(${locations.join(', ')})\``, async (response, convo) => {
                        
                //         if (!isLocationValid(response.text)) {
                //             bot.botkit.trigger('invalid_loc', [bot, message])
                //             convo.repeat()
                //         } else {
                //             convo.setVar('response_loc', response.text)
                //             convo.say('Operator? ' + response.text + ' ...sounds great!')
                //             // convo.next();
                //             const env = convo.vars.response_env;
                //             const ip = convo.vars.response_ip;
                //             const loc = convo.vars.response_loc;
                //             try {
                //                 await insertToIPEnv({ ip, loc, env })

                //                 debugger;
                //                 convo.say(`Great! We had added \`${ip}\` for \`${op}\` on \`${env}\` environment`)
                //             } catch(err) {
                //                 convo.say(`Error while adding... ${err}`)
                //             }

                //             // try {
                //             //     let r = await pgClient.query(`SELECT * FROM ${pgDB}.env WHERE name = '${convo.vars.response_env}'`)
                //             //     if (r) {
                //             //         if (r.rowCount === 0) {
                //             //             const q = `INSERT INTO ${pgDB}.env(id, name) VALUES($1, $2) RETURNING id`;
                //             //             const uniqId = generateID()
                //             //             let r2 = await pgClient.query(q, [uniqId, env]);                    
                //             //             if (r2 && r2.rows && r2.rows.length > 0) return r2.rows[0].id;
                //             //         } else {
                //             //             if(r.rows && r.rows.length > 0) return r.rows[0].id
                //             //             return null
                //             //         }
                //             //     }
                //             // } catch(err) {
                //             //     throw err;
                //             // }

                            
                //         }
                //         convo.next()
                //     })
                // })
            });
        });


        // const newIPs = formatIPs(message.match[1]);
        // const newAPI = trimLower(message.match[2]);
        // const newOp = trimLower(message.match[3]);
        // const newEnv = trimLower(message.match[4]);
        // if (message.match.length != 5) {
        //     bot.reply(message,`Something went wrong. Are you sure you parsing the right command. \`add ip1,ip2,ip3 ${newEnv}\``, () => {});
        //     return;
        // }

        // if (newIPs && newEnv) {
        //     if (isInvalidIPAddresses(newIPs)) {
        //         bot.reply(message,`Invalid IPs. Make sure using right command. \`add ip1,ip2,ip3 ${newEnv}\``, () => {});
        //         return;
        //     }
        //     await insertToIPEnv({ ip: newIPs, api: newAPI, op: newOp, env: newEnv })
        //     newIPs.map((ip, ipIndex) => {
        //         bot.reply(message,ip + ' had been added.', () => {});
        //         if (ipIndex === newIPs.length - 1) {
        //             bot.reply(message, `*Total ${newIPs.length} had been added.*`, () => {});
        //         }
        //     })
        // } else { 
        //     bot.reply(message,`Something went wrong. Are you sure you parsing the right command. \`add ip1,ip2,ip3 ${newEnv}\``, () => {});
        // }
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
        return (ipAddresses && ipAddresses.length > 0) ? ipAddresses.map(ip => isIp(ip)).includes(false) : false;
    }

    function isLocationValid(inputLoc) {
        return (locations && locations.length > 0) ? locations.includes(inputLoc.toLowerCase()) : false;
    }

    function formatIPs(ipAddresses) {
        return ipAddresses.split(",").map(ip => ip.trim())
    }

    function trimLower(str){
        return str.trim().toLowerCase()
    }

    function generateID() {
        function random(qty) {
            return crypto.randomBytes(qty)
        }
        return BigInt(format(random(4), 'dec'))
    }

    async function getEnvironmentId(env) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.env WHERE name = '${env}'`)
            if (r) {
                if (r.rowCount === 0) {
                    const q = `INSERT INTO ${pgDB}.env(id, name) VALUES($1, $2) RETURNING id`;
                    const uniqId = generateID()
                    let r2 = await pgClient.query(q, [uniqId, env]);                    
                    if (r2 && r2.rows && r2.rows.length > 0) return r2.rows[0].id;
                } else {
                    if(r.rows && r.rows.length > 0) return r.rows[0].id
                    return null
                }
            }
        } catch(err) {
            throw err;
        }
    }
}