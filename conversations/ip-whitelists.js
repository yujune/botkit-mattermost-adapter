import { pgClient, pgDB } from '../db/postgres.js';
import isIp from 'is-ip';
import crypto from 'crypto'
import format from 'biguint-format'
import _ from 'lodash';
// import Bluebird from 'bluebird';
// import { integrationId } from '@rocket.chat/sdk/dist/lib/settings';

export const ipWhitelistConversation = async (controller) => {
    const services = ["backoffice", "external", "frontend"]
    const environments = ["Prod Asia", "Prod Euro"]
    const envLoc = "env"
    const expPrefix = "capture.req.hdr(0) -m end"
    controller.on('terminate_message', (bot, message) => bot.reply(message, 'Ok Bye!', () => {}))
    controller.on('invalid_env', (bot, message) => bot.reply(message, 'I don\'t understand! Your environment is invalid.', () => {}))
    controller.on('invalid_svc', (bot, message) => bot.reply(message, 'I don\'t understand! Your location is invalid.', () => {}))
    controller.on('invalid_ip', (bot, message) => bot.reply(message, 'I don\'t understand! Your IP is invalid.', () => {}))
    controller.on('missing_env', (bot, message) => bot.reply(message, 'Environment not found in database!', () => {}))
    controller.on('missing_svc', (bot, message) => bot.reply(message, 'Location not found in database!', () => {}))
    controller.on('missing_remarkop', (bot, message) => bot.reply(message, 'Remark/Operation not found in database!', () => {}))
    controller.on('missing_ip', (bot, message) => bot.reply(message, 'IP not found in database!', () => {}))
    controller.on('missing_domain', (bot, message) => bot.reply(message, 'Domain not found in database!', () => {}))

    // listen for a user saying "add <something>", and then add it to the user's list
    // store the new list in the storage system
    controller.hears(['IP Whitelists'], 'mention', async (bot, message) => {
        async function handleApply(d) {
            try {
                let envId = (await getEnvironmentId(d.env)).toString();
                if (envId) {
                    let textQ
                    let rowId = (d.loc !== "backoffice") ? await getRemark(d.loc, d.remarkOp) : false;
                    try {
                        if (rowId) {
                            // Filter IP
                            // let existRowId = await getRemark(d.loc, d.remarkOp);
                            let uniqIp = await getUniqValues(d.ip, rowId, 'ip', d.loc)
                            textQ = `
                                UPDATE ${pgDB}.${d.loc}
                                SET
                                    ip = array_cat(ip,'{${uniqIp}}')
                                WHERE id = ${rowId}
                            `
                            await pgClient.query(textQ)
                        } else {
                            let colNames;
                            let colValues = [`{${d.ip}}`, envId];
                            let paramValues;
                            colNames = `operator, ip, env_id`
                            if ( d.loc === "backoffice" ) {
                                colNames = `ip, env_id, domain`
                                let colLength = colNames.split(',').length;

                                let backendValuesQ = []
                                d.domains.split(',').map((domain) => {
                                    backendValuesQ = backendValuesQ.concat(colValues);
                                    backendValuesQ.push(domain)
                                })
                                paramValues = [...Array(backendValuesQ.length)].map((_,i) => `$${i + 1}`)
                                let formatParamValues = _.chunk(paramValues, colLength).map(p => {
                                    return `(${p.join(',')})`
                                })
                                if ( !d.domainToBeAdded ) {
                                    textQ = `
                                        INSERT INTO ${pgDB}.${d.loc}(${colNames})
                                        VALUES ${formatParamValues.join(',')}
                                    `
                                    await pgClient.query(textQ, backendValuesQ)
                                } else {
                                    if ( d.domainToBeAdded && d.domainToBeAdded.length > 0 ) {
                                        // ADD DOMAIN + APPEND IP IF EXISTS
                                        await Promise.all(
                                            d.domainToBeAdded.map(async row => {
                                                if (!row.id) {
                                                    // New
                                                    let paramValues = [...Array(colLength)].map((_,i) => `$${i + 1}`)
                                                    textQ = `
                                                        INSERT INTO ${pgDB}.${d.loc}(${colNames})
                                                        VALUES (${paramValues.join(',')})
                                                    `
                                                    await pgClient.query(textQ, [`{${row.ip.join(',')}}`, envId, row.domain])
                                                } else {
                                                    // Old
                                                    textQ = `
                                                        UPDATE ${pgDB}.${d.loc}
                                                        SET
                                                            ip = array_cat(ip,'{${row.ip.join(',')}}')
                                                        WHERE id = ${row.id}
                                                    `
                                                    await pgClient.query(textQ)
                                                }
                                            })
                                        )
                                    }
                                }
                            } else {
                                colValues.unshift(d.remarkOp);
                                paramValues = colValues.map((cVal, cvIndex) => {
                                    return `$${cvIndex + 1}`
                                })
                                textQ = `
                                    INSERT INTO ${pgDB}.${d.loc}(${colNames}) VALUES(${paramValues.join(',')})
                                    ON CONFLICT (operator) DO NOTHING
                                `
                                await pgClient.query(textQ, colValues)
                            }
                        }
                        return Promise.resolve(true)
                    } catch(err) {
                        throw err;
                    }
                }
            } catch(err) {
                bot.reply(message, `There is an error insert IP to environment. ${err}`, () => {});          
            }
        }

        async function getRemark(loc, colValue) {
            try {
                let colName = "operator" // default
                // if (loc === "backoffice" || loc === "external") colName = "remark"
                // if (loc === "frontend") colName = "operator"
                // if (true) colName = "domain"
                let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE operator = LOWER('${colValue}')`)
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
            convo.ask(`Which operator you want to apply IP whitelist?`, (response, convo) => {
                isTerminate(response, convo, bot, message)
                convo.setVar('response_remark_op', response.text)
                convo.next()
                callback();
            });
        }

        function handleExpression(convo, callback) {
            convo.ask(`[ADD] What is new expression for domain? \`Type 'no' for ${expPrefix}\``, (response, convo) => {
                isTerminate(response, convo, bot, message)
                if(response.text && response.text.toLowerCase().trim() === "no") {
                    convo.setVar('response_domain_exp', `${expPrefix}`)
                } else {
                    convo.setVar('response_domain_exp', `${response.text}`)
                }
                convo.next()
                callback()
            })
        }

        async function handleCheckDomains(convo, domainResp, callback) {
            const { domainLists, domainToBeIgnore, requestDomainToBeAdded } = await handleResultDomainIP(domainResp, { 
                ipResp: convo.vars.response_ip,
                svc: convo.vars.response_svc,
                env: convo.vars.response_env
            })
            if (domainLists && domainLists.length > 0) convo.setVar('response_domain', domainLists.join(','))
            
            if (domainToBeIgnore.length > 0) convo.setVar('response_domainToBeIgnore', domainToBeIgnore)
            else convo.setVar('response_domainToBeIgnore', [])

            if (requestDomainToBeAdded.length > 0) {
                let requestDomains = flattenDomains(requestDomainToBeAdded)
                convo.ask(`Below domains are not exists in our database, do you want to create them? (\`Yes\` / \`No\`)\n${requestDomains.map(d => `- ${d}\n`).join('')}`,
                    async (response, convo) => {
                        isTerminate(response, convo, bot, message)
                        convo.next()
                        if(response.text.trim().toLowerCase() === "yes") {
                            convo.setVar('response_domainRequestToBeAdd', requestDomainToBeAdded)
                        }   
                        callback();          
                    }
                );
            } else {
                convo.next()
                callback();
            }
        }

        function handleExpressionDomains(convo, callback) {
            convo.ask('Which domains you want to apply IP whitelist? (\`Use comma for multiple domains\`)', async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let domainResp = formatDomains(response.text)
                convo.next()
                callback(domainResp);
            });
        }

        async function handleComplete(convo, isBackoffice) {
            const env = convo.vars.response_env;
            const ip = convo.vars.response_ip;
            const loc = convo.vars.response_svc;
            const exp = convo.vars.response_domain_exp || 'None'
            const domains = convo.vars.response_domain || 'None'
            const remarkOp = convo.vars.response_remark_op || 'None'
            const domainRequestToBeAdd = convo.vars.response_domainRequestToBeAdd || [];
            const domainToBeIgnore = convo.vars.response_domainToBeIgnore;
            
            // let convoMessage;
            let domainMessage = '';
            let domainToBeAdded;
            let confirmMsg
            if (isBackoffice) {
                let listDomainsToBeAdded = []
                let domainMsg;
                if (domainRequestToBeAdd.length > 0) {
                    domainToBeAdded = domainRequestToBeAdd.concat(domainToBeIgnore)
                    listDomainsToBeAdded = flattenDomains(domainRequestToBeAdd);

                    domainMsg = domainToBeAdded.reduce((msg, o, i) => {
                        if (!o.id) msg = msg + `- domain: ${o.domain} (Will be created)\nIPs to add: ${o.ip.join(',')}\n\n`;
                        else {
                            if (o.existIPs && o.existIPs.length > 0) msg = msg + `- domain: ${o.domain}\nIPs to add: ${o.ip.join(',')}\nIPs existed (Which will not apply): ${o.existIPs.join(',')}\n\n`;
                            else msg = msg + `- domain: ${o.domain}\nIPs to add: ${o.ip.join(',')}\n\n`;
                        }
                        return msg
                    },'');
                } else {
                    let listOldDomains = flattenDomains(domainToBeIgnore)
                    domainMsg = listOldDomains.map(d => `- domain: ${d} (Will be created)\nIPs to add: ${ip}\n\n`).join('')
                }
                confirmMsg = `**Confirmation**
                    Environment: ${env}
                    Service: ${loc}
                    IP whitelist to apply:
                        ${domainMsg}
                    ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
                `
            } else {
                domainMessage = domains
                confirmMsg = `**Confirmation**
                    Environment: ${env}
                    Service: ${loc}
                    Operator: ${remarkOp}
                    IP: ${ip}
                    IP whitelist will be apply to following operators: ${domainMessage}
                    ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
                `
            }

            convo.ask(confirmMsg, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                try {
                    if(response.text.toLowerCase() === "yes") {
                        await handleApply({ ip, loc, env, exp, remarkOp, domains, domainToBeAdded })
                        convo.say(`Great! Confirmation had been made!`)
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
            convo.ask(`Which environment?\n${environments.map(env => `- ${env}\n`).join('')}`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                convo.setVar('response_env', response.text)
                convo.next()
                callback()
            })
        }

        async function handleService(convo, callback) {
            convo.ask(`Which service you want to apply IP whitelist?\n${services.map(service => `- ${service}\n`).join('')}`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const serviceValid = isServiceValid(response.text);
                if (!serviceValid) {
                    bot.botkit.trigger('invalid_svc', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_svc', response.text)
                convo.next()
                if(serviceValid) callback();
            })
        }

        async function handleIPAddresses(convo, callback) {
            convo.ask(`What are the IPs you want to apply to these domains? (\`Use comma for multiple IPs\`)`, async (response, convo) => {
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

        bot.startConversation(message, async (err, convo) => {
            handleEnv(convo, () => {
                handleService(convo, () => {
                    // handleExpression(convo,  () => {
                    handleExpressionDomains(convo, async (domainResp) => {
                        handleIPAddresses(convo, () => {
                            if (convo.vars.response_svc === "backoffice") {
                                handleCheckDomains(convo, domainResp, async () => {
                                    await handleComplete(convo, true)
                                })
                            } else {
                                handleRemarkOp(convo, async () => {
    
                                    await handleComplete(convo, false)
                                })
                            }
                        })
                    })
                    // })
                    

                    // handleIPAddresses(convo, () => {
                    //     if (convo.vars.response_svc === "backoffice") {
                    //         handleExpression(convo,  () => {
                    //             handleExpressionDomains(convo, async (domainResp) => {
                    //                 handleCheckDomains(convo, domainResp, async () => {
                    //                     await handleComplete(convo, true)
                    //                 })
                    //             })
                    //         })
                    //     } else {
                    //         handleRemarkOp(convo, async () => {

                    //             await handleComplete(convo, false)
                    //         })
                    //     }
                    // })
                })
            });
        })
        // bot.startConversation(message, async (err, convo) => {
            // convo.ask('[ADD] Which environment?', async (response, convo) => {
            //     isTerminate(response, convo, bot, message)
            //     convo.setVar('response_env', response.text)
            //     convo.next()
                // convo.ask(`[ADD] Where you want to be stored? \`(${services.join(', ')})\``, async (response, convo) => {
                //     isTerminate(response, convo, bot, message)
                //     if (!isServiceValid(response.text)) {
                //         bot.botkit.trigger('invalid_svc', [bot, message])
                //         convo.repeat()
                //     } else {
                //         convo.setVar('response_svc', response.text)
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
            // const remarkOpCol = "operator"
            convo.ask(`Which operator you want to remove IP whitelist?`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const remarkExists = await isRemarkOpExists(response.text, convo.vars.response_svc, remarkOpCol);
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

        async function handleRemove(ipAddresses, svc, remarkOp, domains) {
            try {
                await Promise.all(
                    ipAddresses.map(async ip => {
                        let textQ;
                        if (svc === "backoffice") {
                            await Promise.all(
                                domains.map(async d => {
                                    if (d.id) {
                                        textQ = `
                                            UPDATE ${pgDB}.${svc}
                                            SET ip = array_remove(ip,'${ip}') WHERE domain = '${d.domain}'
                                        `
                                        await pgClient.query(textQ)
                                    }
                                })
                            )
                        } else {
                            textQ = `
                                UPDATE ${pgDB}.${svc}
                                SET ip = array_remove(ip,'${ip}') WHERE operator = '${remarkOp}'
                            `
                            await pgClient.query(textQ)
                        }
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
            const svc = convo.vars.response_svc;
            const remarkOp = convo.vars.response_remark_op;
            let domains = convo.vars.response_domain || null;

            let confirmMsg = '';
            if (svc === "backoffice") {
                const { domainIPToBeRemove, domainMissing } = await handleResultDomainIP(domains.join(','), { 
                    ipResp: ipAddresses.join(','),
                    svc,
                    env
                }, 'remove')

                // let listDomainsToBeAdded = []
                let removeMsg = ''
                let listDomainIPToBeRemove = domainIPToBeRemove.concat(domainMissing)
                if (listDomainIPToBeRemove.length > 0) {
                    removeMsg = listDomainIPToBeRemove.reduce((msg, o, i) => {
                        if (!o.id) msg = msg + `- domain: ${o.domain} (Not exists, won't change)\n\n`;
                        else {
                            if (o.notExistIPs && o.notExistIPs.length > 0) msg = msg + `- domain: ${o.domain}\nIPs to remove: ${o.ip.join(',')}\nIPs not exists (Which will not delete): ${o.notExistIPs.join(',')}\n\n`;
                            else msg = msg + `- domain: ${o.domain}\nIPs to remove: ${o.ip.join(',')}\n\n`;
                        }
                        return msg
                    },'');
                } else {
                    let listOldDomains = flattenDomains(domainToBeIgnore)
                    removeMsg = listOldDomains.map(d => `- domain: ${d} (Not exists, won't change)\n\n`).join('')
                }

                domains = _.cloneDeep(listDomainIPToBeRemove)
                confirmMsg = `**Confirmation**
                    Environment: ${env}
                    Service: ${svc}
                    IP whitelist to apply:
                        ${removeMsg}
                    ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
                `
            } else {
                confirmMsg = `**[DELETE CONFIRMATION]**
                    Environment: ${env}
                    Location: ${svc}
                    Remark/Operation: ${remarkOp}
                    IP: ${ipAddresses.join(',')} **(TO BE DELETE)**
                    Domains: ${(domains === null) ? 'None' : domains.join(',')}
                    ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
                `
            }
            convo.ask(confirmMsg, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                try {
                    if(response.text.toLowerCase() === "yes") {
                        await handleRemove(ipAddresses, svc, remarkOp, domains)
                        convo.say(`Great! Remove confirmation had been made!`)
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
        }

        async function handleIPAddress(convo, callback) {
            convo.ask('What are the IPs you want to remove to these operator? (\`Use comma for multiple IPs\`)', async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let ipResponse = formatIPs(response.text)
                let existingIP;
                if (isInvalidIPAddresses(ipResponse)) {
                    bot.botkit.trigger('invalid_ip', [bot, message])
                    convo.repeat()
                } else {
                    if (convo.vars.response_svc === "backoffice") {
                        existingIP =  await hasExistingIP(ipResponse, convo.vars.response_svc, convo.vars.response_domain);
                    } else {
                        existingIP =  await hasExistingIP(ipResponse, convo.vars.response_svc, convo.vars.response_remark_op);
                    }
                    
                    if (existingIP) convo.setVar('response_ip', ipResponse.split(','))
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
            convo.ask(`Which environment?\n${environments.map(env => `- ${env}\n`).join('')}`, async (response, convo) => {
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

        async function handleService(convo, callback) {
            convo.ask(`Which service you want to remove IP whitelist?\n${services.map(service => `- ${service}\n`).join('')}`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const serviceValid = isServiceValid(response.text);
                if (!serviceValid) {
                    bot.botkit.trigger('missing_svc', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_svc', response.text)
                convo.next()
                if(serviceValid) callback(response.text.trim().toLowerCase())
            })
        }

        async function handleDomain(convo, callback) {
            convo.ask(`Which domains you want to remove IP whitelist? (\`Use comma for multiple domains\`)`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let domainResp = formatDomains(response.text);
                const domainValid = hasExistingDomains(domainResp.split(','), convo.vars.response_svc);
                
                if (!domainValid) {
                    bot.botkit.trigger('missing_domain', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_domain', domainResp.split(','))
                convo.next()
                if(domainValid) callback()
            })
        }
        
        bot.startConversation(message, async (err, convo) => {
            handleEnv(convo, async() => {
                handleService(convo, async(selectedLocation) => {
                    if (selectedLocation === "backoffice") {
                        handleDomain(convo, async () => {
                            handleIPAddress(convo, async() => {
                                await handleCompleteRemove(convo);
                            })
                        })
                    } else {
                        handleRemarkOp(convo, async() => {
                            handleIPAddress(convo, async() => {
                                await handleCompleteRemove(convo);
                            })
                        })
                    }
                })
            })
        })
    })

    controller.hears(['show'], 'mention', async function(bot, message) {
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

    function isServiceValid(inputLoc) {
        return (services && services.length > 0) ? services.includes(inputLoc.toLowerCase()) : false;
    }

    function formatIPs(ipAddresses) {
        return ipAddresses.split(",").map(ip => ip.trim()).join(",")
    }

    function formatDomains(domains) {
        return domains.split(",").map(ip => ip.trim()).join(",")
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

    async function isRemarkOpExists(remarkOp, loc) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE operator = '${remarkOp}'`)
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

    async function hasExistingIP(ipAddresses, loc, targetValue) {
        try {
            let r
            if (loc === "backoffice") {
                return ipAddresses
                // await Promise.all(
                //     targetValue.map(async domain => {
                //         r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE ip && '{${ipAddresses}}' AND domain = '${targetValue}'`)
                //     })
                // )
                
            } else {
                r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE ip && '{${ipAddresses}}' AND operator = '${targetValue}'`)
            }
            if (r) {
                if (r.rowCount > 0) return ipAddresses; //r.rows[0].id
                else return null;
            }
        } catch(err) {
            throw err;
        }
    }
    // async function hasExistingBackOfficeIP(ipAddresses, loc, remarkOp) {
    //     try {
    //         let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE ip && '{${ipAddresses}}' AND operator = '${remarkOp}'`)
    //         if (r) {
    //             if (r.rowCount > 0) return ipAddresses; //r.rows[0].id
    //             else return null;
    //         }
    //     } catch(err) {
    //         throw err;
    //     }
    // }

    async function hasExistingDomains(domains, loc) {
        let domainFound = true;
        try {
            await Promise.all(
                domains.map(async domain => {
                    let r = await pgClient.query(`SELECT * FROM ${pgDB}.${loc} WHERE domain = '${domain}'`)
                    if (r) {
                        if (r.rowCount === 0) domainFound = false
                    } else domainFound = false
                })
            )
        } catch(err) {
            throw err;
        }
        return domainFound
    }

    async function handleResultDomainIP(domainResp, { ipResp, svc, env }, handleType) {
        let domainLists = domainResp.split(',');
        let ipLists = ipResp.split(',');
        let domainToBeIgnore =  [] // await queryDomains(domainLists, ipLists, 'old');
        let requestDomain = [] // await queryDomains(domainLists, ipLists, 'new', domainToBeIgnore);
        let uniqListIP = [];
        await Promise.all(
            domainLists.map(async domain => {
                let r2 = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE domain = '${domain}'`)
                if ( r2 && r2.rowCount > 0) {
                    if ( handleType === 'remove' ) {
                        if(uniqListIP.length === 0) uniqListIP = ipLists.filter(ip =>r2.rows[0].ip.includes(ip))
                        domainToBeIgnore.push({
                            ...r2.rows[0],
                            domain,
                            ip: uniqListIP,
                            notExistIPs: _.difference(ipLists, uniqListIP)
                        })
                    } else {
                        if(uniqListIP.length === 0) uniqListIP = ipLists.filter(ip =>!r2.rows[0].ip.includes(ip))
                        domainToBeIgnore.push({
                            ...r2.rows[0],
                            domain,
                            ip: uniqListIP,
                            existIPs: ipLists.filter(inputIP => !uniqListIP.includes(inputIP))
                        })
                    }
                } else {
                    requestDomain.push(domain)
                }
            })
        )
        
        if( handleType === 'remove' ) {
            return { domainLists, domainIPToBeRemove: domainToBeIgnore, domainMissing: requestDomain.map(d => { return { domain: d } }) }
        }
        else {
            requestDomain = requestDomain.map(newDomain => {
                return { 
                    domain: newDomain,
                    ip: ipLists,
                    env
                }
            })
            return { domainLists, domainToBeIgnore, requestDomainToBeAdded: requestDomain }
        }
    }

    // function getRemarkOpByLoc(location) {
    //     let uniqCol = "remark" // default
    //     if (location === "frontend") uniqCol = "operator"
    //     return uniqCol;
    // }

    function flattenDomains(arr) {
        return arr.reduce((a, o, i) => {
            if (o && o.domain) a = a.concat(o.domain)
            return a;
        },[]);
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
                services.map(async loc => {
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

    async function getUniqValues(newValues, rowId, targetCol, loc) {
        let finalValues;
        let currentValue = await pgClient.query(`
            SELECT * FROM ${pgDB}.${loc} WHERE id = ${rowId}
        `);
        // finalValues =  JSON.parse(JSON.stringify(newValue));  // CloneDeep
        if (currentValue && currentValue.rows && currentValue.rows.length > 0) {
            let existingValue = currentValue.rows[0][targetCol];
            if(existingValue && existingValue.length > 0) {
                let incomingValues = newValues.split(',')
                finalValues = `${
                    incomingValues.filter(d => !existingValue.includes(d)).join(",")
                }`
            }
        }
        return Promise.resolve(finalValues)
    }
}