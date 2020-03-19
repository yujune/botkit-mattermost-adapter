import { pgClient, pgDB } from '../db/postgres.js';
import isIp from 'is-ip';
import crypto from 'crypto'
import format from 'biguint-format'
import _ from 'lodash';
// import Bluebird from 'bluebird';
// import { integrationId } from '@rocket.chat/sdk/dist/lib/settings';

export const ipWhitelistConversation = async (controller) => {
    const locations = ["backoffice", "external", "frontend"]
    const envLoc = "env"
    const expPrefix = "capture.req.hdr(0) -m end // "
    controller.on('terminate_message', (bot, message) => bot.reply(message, 'Ok Bye!', () => {}))
    controller.on('invalid_env', (bot, message) => bot.reply(message, 'I don\'t understand! Your environment is invalid.', () => {}))
    controller.on('invalid_loc', (bot, message) => bot.reply(message, 'I don\'t understand! Your location is invalid.', () => {}))
    controller.on('invalid_ip', (bot, message) => bot.reply(message, 'I don\'t understand! Your IP is invalid.', () => {}))
    controller.on('missing_env', (bot, message) => bot.reply(message, 'Environment not found in database!', () => {}))
    controller.on('missing_loc', (bot, message) => bot.reply(message, 'Location not found in database!', () => {}))
    controller.on('missing_remarkop', (bot, message) => bot.reply(message, 'Remark/Operation not found in database!', () => {}))
    controller.on('missing_ip', (bot, message) => bot.reply(message, 'IP not found in database!', () => {}))

    // listen for a user saying "add <something>", and then add it to the user's list
    // store the new list in the storage system
    controller.hears(['IP Whitelists'], 'mention', async (bot, message) => {
        async function insertToIPEnv(d) {
            try {
                let envId = (await getEnvironmentId(d.env)).toString();
                if (envId) {
                    // external: id, remark, ip, env_id
                    // frontend: id, operator, ip, env_id
                    // backoffice: id, remark, ip, env_id, expression

                    let newIP = `{${d.ip}}`
                    let colNames;
                    let colValues = [d.remarkOp, newIP, envId];
                    let uniqCol = getRemarkOpByLoc(d.loc) // default
                    colNames = `${uniqCol}, ip, env_id`
                    if(d.loc === "backoffice") {
                        colNames = `${colNames} ,expression`
                        colValues.push(d.exp)
                    }
                    if(colNames && colValues){
                        let textQ
                        let hasRemarkId = await getRemark(d.loc, d.remarkOp)
                        let uniqIPs
                        try {
                            if (hasRemarkId) {
                                let currentIP = await pgClient.query(`
                                    SELECT * FROM ${pgDB}.${d.loc} WHERE id = ${hasRemarkId}
                                `);
                                uniqIPs =  JSON.parse(JSON.stringify(newIP));  // CloneDeep
                                if (currentIP && currentIP.rows && currentIP.rows.length >0) {
                                    let existingIPs = currentIP.rows[0].ip;
                                    if(existingIPs && existingIPs.length > 0) {
                                        let incomingIPs = d.ip.split(',')
                                        uniqIPs = `${
                                            incomingIPs.filter(d => !existingIPs.includes(d)).join(",")
                                        }`
                                    }
                                }
                                textQ = `
                                    UPDATE ${pgDB}.${d.loc}
                                    SET ip = array_cat(ip,'{${uniqIPs}}') WHERE id = ${hasRemarkId}
                                `
                                await pgClient.query(textQ)
                            } else {
                                let paramValues = colValues.map((cVal, cvIndex) => {
                                    return `$${cvIndex + 1}`
                                })
                                textQ = `
                                    INSERT INTO ${pgDB}.${d.loc}(${colNames}) VALUES(${paramValues.join(',')})
                                    ON CONFLICT (${uniqCol}) DO NOTHING
                                `
                                await pgClient.query(textQ, colValues)
                            }
                            return Promise.resolve(uniqIPs || d.ip)
                        } catch(err) {
                            throw err;
                        }
                    } 
                }
            } catch(err) {
                bot.reply(message, `There is an error insert IP to environment. ${err}`, () => {});          
            }
        }

        async function getRemark(loc, colValue) {
            try {
                let colName
                if (loc === "backoffice" || loc === "external") colName = "remark"
                if (loc === "frontend") colName = "operator"
                let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE LOWER(${colName}) = LOWER('${colValue}')`)
                if (r) {
                    if (r.rowCount > 0)
                        if(r.rows && r.rows.length > 0) return Promise.resolve(r.rows[0].id)
                    return Promise.resolve(null)
                }
            } catch(err) {
                throw err;
            }
        }

        function handleRemarkOp(convo, callback) {
            convo.ask(`[ADD] Which ${getRemarkOpByLoc(convo.vars.response_loc)}?`, (response, convo) => {
                isTerminate(response, convo, bot, message)
                convo.setVar('response_remark_op', response.text)
                convo.next()
                callback();
            });
        }

        function handleExpression(convo, callback) {
            convo.ask(`[ADD] What is your domain for expression? \`Eg. subdomain.domain.net\``, (response, convo) => {
                isTerminate(response, convo, bot, message)
                convo.setVar('response_domain_exp', `${expPrefix} //${response.text}`)
                convo.next()
                callback()
            })
        }

        async function handleComplete(convo) {
            const env = convo.vars.response_env;
            const ip = convo.vars.response_ip;
            const loc = convo.vars.response_loc;
            const exp = convo.vars.response_domain_exp;
            const remarkOp = convo.vars.response_remark_op;
            convo.ask(`**[ADD CONFIRMATION]**
                Environment: ${env}
                Location: ${loc}
                Remark/Operation: ${remarkOp}
                IP: ${ip}
                Expression: ${exp || 'None'}
                **Confirm Add:** Yes or No?
            `, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                try {
                    if(response.text.toLowerCase() === "yes") {
                        let addedIP = await insertToIPEnv({ ip, loc, env, exp, remarkOp })
                        convo.say(`Great! We had added \`${addedIP}\` for \`${remarkOp}\` on \`${env}\` environment`)
                    } else {
                        convo.stop();
                        bot.botkit.trigger('terminate_message', [bot, message])
                        throw "Bye"
                    }
                    convo.next()
                } catch(err) {
                    convo.say(`Error while adding... ${err}`)
                }
            })
        }

        async function handleEnv(convo, callback) {
            convo.ask('[ADD] Which environment?', async (response, convo) => {
                isTerminate(response, convo, bot, message)
                convo.setVar('response_env', response.text)
                convo.next()
                callback()
            })
        }

        async function handleLocation(convo, callback) {
            convo.ask(`[ADD] Where you want to be stored? \`(${locations.join(', ')})\``, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const locationValid = isLocationValid(response.text);
                if (!locationValid) {
                    bot.botkit.trigger('invalid_loc', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_loc', response.text)
                convo.next()
                if(locationValid) callback();
            })
        }

        async function handleIPAddresses(convo, callback) {
            convo.ask(`[ADD] What IP you want to add? \`Use comma for multiple IP addresses.\``, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let ipResponse = formatIPs(response.text)
                const isInvalidIP = isInvalidIPAddresses(ipResponse);
                if (isInvalidIP) {
                    bot.botkit.trigger('invalid_ip', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_ip', ipResponse)
                convo.next()
                if(!isInvalidIP) callback();
            });
        }

        async function handleRequestRemark(convo, callback) {
            convo.ask(`[ADD] Do you have remark? \`(yes, no)\``, async (response, convo) => {
                isTerminate(response, convo, bot, message);
                convo.next();
                callback(response);
            });
        }

        bot.startConversation(message, async (err, convo) => {
            handleEnv(convo, () => {
                handleLocation(convo, () => {
                    handleIPAddresses(convo, async() => {
                        if (convo.vars.response_loc === "backoffice") {
                            // convo.ask(`[ADD] Do you have remark? \`(yes, no)\``, async (response, convo) => {
                            //     isTerminate(response, convo, bot, message)
                            handleRequestRemark(convo, (response) => {
                                if (response.text.toLowerCase() === 'yes') {
                                    handleRemarkOp(convo, () => {
                                        handleExpression(convo, async () => {
                                            await handleComplete(convo)
                                        })
                                    })
                                } else {
                                    handleExpression(convo, async () => {
                                        await handleComplete(convo)
                                    })
                                }
                            })
                                // convo.next()
                            // });
                        } else {
                            handleRemarkOp(convo, async () => {
                                await handleComplete(convo)
                            })
                        }
                    })
                })
            });
        })
        // bot.startConversation(message, async (err, convo) => {
            // convo.ask('[ADD] Which environment?', async (response, convo) => {
            //     isTerminate(response, convo, bot, message)
            //     convo.setVar('response_env', response.text)
            //     convo.next()
                // convo.ask(`[ADD] Where you want to be stored? \`(${locations.join(', ')})\``, async (response, convo) => {
                //     isTerminate(response, convo, bot, message)
                //     if (!isLocationValid(response.text)) {
                //         bot.botkit.trigger('invalid_loc', [bot, message])
                //         convo.repeat()
                //     } else {
                //         convo.setVar('response_loc', response.text)
                //     }
                //     convo.next()

                    // convo.ask(`[ADD] What IP you want to add? \`Use comma for multiple IP addresses.\``, async (response, convo) => {
                    //     isTerminate(response, convo, bot, message)
                    //     let ipResponse = formatIPs(response.text)
                    //     if (isInvalidIPAddresses(ipResponse)) {
                    //         bot.botkit.trigger('invalid_ip', [bot, message])
                    //         convo.repeat()
                    //     } else {
                    //         convo.setVar('response_ip', ipResponse)
                    //     }
                    //     convo.next()
                        
                    // })
                // });
            // });
        // });
    });


    controller.hears(['remove'], 'mention', async(bot, message) => {
        function handleRemarkOp(convo, callback) {
            const remarkOpCol = getRemarkOpByLoc(convo.vars.response_loc)
            convo.ask(`[REMOVE] Which ${remarkOpCol}?`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const remarkExists = await isRemarkOpExists(response.text, convo.vars.response_loc, remarkOpCol);
                if (remarkExists) {
                    convo.setVar('response_remark_op', response.text)
                } else {
                    bot.botkit.trigger('missing_remarkop', [bot, message])
                    convo.repeat()
                }
                convo.next()
                if(remarkExists) callback();
            });
        }

        async function handleRemove(ipAddresses, loc, remarkOp) {
            try {
                await Promise.all(
                    ipAddresses.split(',').map(async ip => {
                        const textQ = `
                            UPDATE ${pgDB}.${loc}
                            SET ip = array_remove(ip,'${ip}') WHERE ${getRemarkOpByLoc(loc)} = '${remarkOp}'
                        `
                        await pgClient.query(textQ)
                    })
                )
                return Promise.resolve(true)
            } catch(err) {
                throw err;
            }
        }

        async function handleCompleteRemove(convo) {
            const env = convo.vars.response_env;
            const ipAddresses = convo.vars.response_ip;
            const loc = convo.vars.response_loc;
            const remarkOp = convo.vars.response_remark_op;
            convo.ask(`**[DELETE CONFIRMATION]**
                Environment: ${env}
                Location: ${loc}
                Remark/Operation: ${remarkOp}
                IP: ${ipAddresses} **(TO BE DELETE)**
                **Confirm Delete:** Yes or No?
            `, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                try {
                    if(response.text.toLowerCase() === "yes") {
                        await handleRemove(ipAddresses, loc, remarkOp)
                        convo.say(`Great! We had removed \`${ipAddresses}\` for \`${remarkOp}\` on \`${loc}\` in\`${env}\` environment`)
                    } else {
                        convo.stop();
                        bot.botkit.trigger('terminate_message', [bot, message])
                        throw "Bye"
                    }
                    convo.next()
                } catch(err) {
                    convo.say(`Error while removing... ${err}`)
                }
            })
          
            // const env = convo.vars.response_env;
            // const ip = convo.vars.response_ip;
            // const loc = convo.vars.response_loc;
            // const exp = convo.vars.response_domain_exp;
            // const remarkOp = convo.vars.response_remark_op;
            // convo.ask(`**[ADD CONFIRMATION]**
            //     Environment: ${env}
            //     Location: ${loc}
            //     Remark/Operation: ${remarkOp}
            //     IP: ${ip}
            //     Expression: ${exp || 'None'}
            //     **Confirm Add:** Yes or No?
            // `, async (response, convo) => {
            //     isTerminate(response, convo, bot, message)
            //     try {
            //         if(response.text.toLowerCase() === "yes") {
            //             await insertToIPEnv({ ip, loc, env, exp, remarkOp })
            //             convo.say(`Great! We had added \`${ip}\` for \`${remarkOp}\` on \`${env}\` environment`)
            //         } else {
            //             convo.stop();
            //             bot.botkit.trigger('terminate_message', [bot, message])
            //             throw "Bye"
            //         }
            //         convo.next()
            //     } catch(err) {
            //         convo.say(`Error while adding... ${err}`)
            //     }
            // })
        }

        async function handleIPAddress(convo, callback) {
            convo.ask(`[REMOVE] What IP you want to remove? \`Use comma for multiple IP addresses.\``, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let ipResponse = formatIPs(response.text)
                let existingIP;
                if (isInvalidIPAddresses(ipResponse)) {
                    bot.botkit.trigger('invalid_ip', [bot, message])
                    convo.repeat()
                } else {
                    existingIP =  await hasExistingIP(ipResponse, convo.vars.response_loc, convo.vars.response_remark_op);
                    if (existingIP) convo.setVar('response_ip', existingIP)
                    else {
                        bot.botkit.trigger('missing_ip', [bot, message])
                        convo.repeat()
                    }
                }
                convo.next()
                if(existingIP) callback()
            })
        }

        async function handleEnv(convo ,callback) {
            convo.ask('[REMOVE] Which environment?', async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let envId = await getExistingEnv(response.text)
                if (envId) {
                    convo.setVar('response_env', response.text)
                } else {
                    bot.botkit.trigger('missing_env', [bot, message])
                    convo.repeat()
                }
                convo.next()
                if(envId) callback()
            });
        }

        async function handleLocation(convo, callback) {
            convo.ask(`[REMOVE] Where is the location? \`(${locations.join(', ')})\``, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const locationValid = isLocationValid(response.text);
                if (!locationValid) {
                    bot.botkit.trigger('missing_loc', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_loc', response.text)
                convo.next()
                if(locationValid) callback()
            })
        }
        
        bot.startConversation(message, async (err, convo) => {
            handleEnv(convo, async() => {
                handleLocation(convo, async() => {
                    handleRemarkOp(convo, () => {
                        handleIPAddress(convo, async() => {
                            await handleCompleteRemove(convo);
                        })
                    })
                })
            })
        })
    })

    controller.hears(['show'], 'mention', async function(bot, message) {
        // convo.ask('Which environment?', async (response, convo) => {
        //     convo.setVar('response_env', response.text)
        //     convo.next()
        //     convo.ask(`Which location wants to be show? \`(all, ${locations.join(', ')})\``, async (response, convo) => {
        //         if (!isLocationValid(response.text)) {
        //             bot.botkit.trigger('invalid_loc', [bot, message])
        //             convo.repeat()
        //         } else {
        //             convo.setVar('response_loc', response.text)
        //         }
        //         convo.next()
        //         convo.ask(`Which remark wants to be show? \`(all)\``, async (response, convo) => {
        //             if (response.text.toLowerCase() === 'all') {
        //                 handleRemarkOp(convo, reqCol, () => {
        //                     handleExpression(convo, async () => {
        //                         await handleComplete(convo)
        //                     })
        //                 })
        //             } else {
        //                 handleExpression(convo, async () => {
        //                     await handleComplete(convo)
        //                 })
        //             }
        //             convo.next()
        //         });
        //         // convo.ask(`What IP you want to add? \`Use comma for multiple IP addresses.\``, async (response, convo) => {
        //         //     let ipResponse = formatIPs(response.text)
        //         //     if (isInvalidIPAddresses(ipResponse)) {
        //         //         bot.botkit.trigger('invalid_ip', [bot, message])
        //         //         convo.repeat()
        //         //     } else {
        //         //         convo.setVar('response_ip', ipResponse)
        //         //         convo.say('IP addresses? ' + response.text + ' ...sounds great!')
        //         //     }
        //         //     convo.next()
        //         //     let reqCol
        //         //     if (convo.vars.response_loc === "backoffice" || convo.vars.response_loc === "external") reqCol = "remark"
        //         //     if (convo.vars.response_loc === "frontend") reqCol = "operator"

        //         //     if(convo.vars.response_loc === "backoffice") {
        //         //         convo.ask(`Do you have remark? \`(yes, no)\``, async (response, convo) => {
        //         //             if (response.text.toLowerCase() === 'yes') {
        //         //                 handleRemarkOp(convo, reqCol, () => {
        //         //                     handleExpression(convo, async () => {
        //         //                         await handleComplete(convo)
        //         //                     })
        //         //                 })
        //         //             } else {
        //         //                 handleExpression(convo, async () => {
        //         //                     await handleComplete(convo)
        //         //                 })
        //         //             }
        //         //             convo.next()
        //         //         });
        //         //     } else {
        //         //         handleRemarkOp(convo, reqCol, async () => {
        //         //             await handleComplete(convo)
        //         //         })
        //         //     }
        //         // })
        //     });
        // });

        async function display() {
            const loc = message.match[1];
            let hasDocuments;
            let allDocuments;
            let envDoc;

            try {
                allDocuments = await queryAll()
                envDoc = await getEnv()
                if(allDocuments && allDocuments.length > 0) {
                    hasDocuments = allDocuments.map(d => d.rowCount !== 0).includes(true)
                }
            } catch(err) {
                bot.reply(message, `There is an error query count ipwhitelist. ${err}`, () => {});          
            }
            if (!hasDocuments) {
                bot.reply(message, 'There are no IP whitelists on your list. Say `add ip1,ip2,ip3 environment` to add something.', () => {});
            } else {
                let text = null
                if (loc === "*") text = generateDocuments(allDocuments, envDoc);
                else text = generateDocuments(allDocuments.filter(doc => doc.location === loc), envDoc);
                bot.reply(message, text, () => {});
            }
        }

        async function getExistingEnv(ipLists) {
            try {
                let r = await queryAll();
                let result = r.reduce((a, o, i) => {
                    if (o && o.rows && o.rows.length > 0) {
                        o.rows.map(r => {
                            if (r && r.ip) {
                                ipLists.split(',').map(ip => {
                                    if(r.ip.includes(ip)) a.push({ ...o, location: o.location, env: o.env })
                                })
                            }
                        })
                    }
                    return a
                },[]);

                debugger;
            } catch(err) {
                throw err;
            }
        }
        
        function handleAskIP(convo, callback) {
            convo.ask('[INFO] What IP you want to show?', async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let result = await getExistingEnv(response.text)
                if (result) {
                    convo.setVar('response_result', response.text)
                }
                convo.next()
                if(result) callback()
            });
        }
        bot.startConversation(message, async (err, convo) => {
            // const incomingIP = message.match[1];
            handleAskIP(convo, () => {})
        })
    });


    // simple function to generate the text of the task list so that
    // it can be used in various places
    function generateDocuments(documents, environments) {
        let text
        if (environments['rows'] && environments['rows'].length > 0) {
            environments['rows'].map(env => {
                text = ((text) ? text : '') + `*Environment: ${env.name}*\n`;
                if (documents && documents.length > 0) {
                    documents.map(doc => {
                        text = ((text) ? text : '') + `*Location: ${doc.location}*\n`;
                        text = text + "```\n";
                        if (doc['rows'] && doc['rows'].length > 0) {
                            doc['rows'].map(row => {
                                if (row.env_id === parseInt(env.id)) {
                                    if (doc.location === "backoffice") {
                                        text = `${text}#${row.remark}\n`
                                        text = `${text}#Expression ${row.expression}\n`
                                    }
                                    if (doc.location === "external") {
                                        text = `${text}#${row.remark}\n`
                                    }
                                    if (doc.location === "frontend") {
                                        text = `${text}#${row.operator}\n`
                                    }
                                    if(row.ip && row.ip.length > 0) {
                                        row.ip.map(ip => text = text + `- ${ip}\n`)
                                    }
                                    text = text + "\n"
                                }
                            })
                            text = text + "```\n";
                        } else {
                            text = text + ">Do not have any IP to whitelist\n"
                        }
                    })
                } else {
                    text = text + ">Do not have any documents\n"
                }
            })
        } else {
            text = text + ">Do not have any Environment\n"
        }
        return text
    }

    function isInvalidIPAddresses(ipAddresses) {
        return (ipAddresses) ? ipAddresses.split(",").map(ip => isIp(ip)).includes(false) : false;
    }

    function isLocationValid(inputLoc) {
        return (locations && locations.length > 0) ? locations.includes(inputLoc.toLowerCase()) : false;
    }

    function formatIPs(ipAddresses) {
        return ipAddresses.split(",").map(ip => ip.trim()).join(",")
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
                    const q = `INSERT INTO ${pgDB}.env(name) VALUES($1) RETURNING id`;
                    const uniqId = generateID()
                    let r2 = await pgClient.query(q, [env]);                    
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
    async function getExistingEnv(env) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.env WHERE name = '${env}'`)
            if (r) {
                if (r.rowCount === 0) return null
                else {
                    if(r.rows && r.rows.length > 0) return r.rows[0].id.toString();
                    return null
                }
            }
        } catch(err) {
            throw err;
        }
    }

    async function isRemarkOpExists(remarkOp, loc, remarkOpCol) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE ${remarkOpCol} = '${remarkOp}'`)
            if (r) {
                if (r.rowCount === 0) return null
                else {
                    if(r.rows && r.rows.length > 0) return true;
                    return null
                }
            }
        } catch(err) {
            throw err;
        }
        
    }

    async function hasExistingIP(ipAddresses, loc, remarkOp) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE ip && '{${ipAddresses}}' AND ${getRemarkOpByLoc(loc)} = '${remarkOp}'`)
            if (r) {
                if (r.rowCount > 0) return ipAddresses; //r.rows[0].id
                else return null;
            }
        } catch(err) {
            throw err;
        }
    }

    function getRemarkOpByLoc(location) {
        let uniqCol = "remark" // default
        if (location === "frontend") uniqCol = "operator"
        return uniqCol;
    }

    async function getEnv() {
        try {
            return Promise.resolve(await pgClient.query(`SELECT * FROM ${pgDB}.${envLoc}`))
        } catch(err) {
            throw err;
        }
    }

    async function queryAll() {
        try {
            return Promise.all(
                locations.map(async loc => {
                    return Promise.resolve(
                        { 
                            ...await pgClient.query(`SELECT * FROM ${pgDB}.${loc}`),
                            location: loc
                        }
                    )
                })
            )
        } catch(err) {
            throw err;
        }
    }

    function isTerminate(response, convo, bot, message) {
        if(response && response.text.toLowerCase() === "exit") {
            convo.stop();
            bot.botkit.trigger('terminate_message', [bot, message])
            throw "Bye"
        }
    }
}