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
    controller.on('missing_info', (bot, message) => bot.reply(message, 'Information not found in database!', () => {}))

    // listen for a user saying "add <something>", and then add it to the user's list
    // store the new list in the storage system
    controller.hears(['IP Whitelists'], 'mention', async (bot, message) => {
        async function handleApply(d) {
            try {
                let envId = (await getEnvironmentId(d.env)).toString();
                if (envId) {
                    let textQ
                    let rowId = (d.svc !== "backoffice") ? await getRemark(d.svc, d.remarkOp, envId) : false;
                    try {
                        if (rowId) {
                            // Filter IP
                            // let existRowId = await getRemark(d.svc, d.remarkOp);
                            let uniqIp = await getUniqValues(d.ip, rowId, 'ip', d.svc)
                            textQ = `
                                UPDATE ${pgDB}.${d.svc}
                                SET
                                    ip = array_cat(ip,'{${uniqIp}}')
                                WHERE id = ${rowId} AND env_id = ${envId}
                            `
                            await pgClient.query(textQ)
                        } else {
                            let colNames;
                            let colValues = [`{${d.ip}}`, envId];
                            let paramValues;
                            colNames = `operator, ip, env_id`
                            if ( d.svc === "backoffice" ) {
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
                                        INSERT INTO ${pgDB}.${d.svc}(${colNames})
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
                                                        INSERT INTO ${pgDB}.${d.svc}(${colNames})
                                                        VALUES (${paramValues.join(',')})
                                                    `
                                                    await pgClient.query(textQ, [`{${row.ip.join(',')}}`, envId, row.domain])
                                                } else {
                                                    // Old
                                                    textQ = `
                                                        UPDATE ${pgDB}.${d.svc}
                                                        SET
                                                            ip = array_cat(ip,'{${row.ip.join(',')}}')
                                                        WHERE id = ${row.id} AND env_id = ${envId}
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
                                    INSERT INTO ${pgDB}.${d.svc}(${colNames}) VALUES(${paramValues.join(',')})
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

        async function getRemark(svc, colValue, env_id) {
            try {
                let r = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE operator = LOWER('${colValue}') AND env_id = ${env_id}`)
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

        async function handleCheckDomains(convo, domainResp, callback) {
            const { domainLists, domainToBeIgnore, requestDomainToBeAdded } = await handleResultOperatorDomainIP(domainResp, { 
                ipResp: convo.vars.response_ip,
                svc: convo.vars.response_svc,
                env: convo.vars.response_env,
                env_id: convo.vars.response_env_id,
            })
            if (domainLists && domainLists.length > 0) convo.setVar('response_domain', domainLists.join(','))
            
            if (domainToBeIgnore.length > 0) convo.setVar('response_domainToBeIgnore', domainToBeIgnore)
            else convo.setVar('response_domainToBeIgnore', [])

            if (requestDomainToBeAdded.length > 0) {
                let requestDomains = flatten(requestDomainToBeAdded, 'domain')
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
            async function renderConfirmDisplay(opDomains, ipAddresses, thingRequestToBeAdd = [], thingToBeIgnore = [], { svc, env, env_id }) {
                let opDomainName;
                let opDomainKey;
                if (svc === 'backoffice') {
                    opDomainName = "Domain"
                    opDomainKey = "domain"
                } else {
                    opDomainName = "Operator"
                    opDomainKey = "operator"

                    let { requestThingAdded, thingIgnore } = await handleResultOperatorDomainIP((Array.isArray(opDomains)) ? opDomains.join(',') : opDomains, { 
                        ipResp: ipAddresses,
                        svc,
                        env,
                        env_id
                    })
                    thingRequestToBeAdd = _.cloneDeep(requestThingAdded)
                    thingToBeIgnore = _.cloneDeep(thingIgnore)
                }
                let thingToBeAdded = []
                let applyMsg;
                thingToBeAdded = thingRequestToBeAdd.concat(thingToBeIgnore)
                if (thingToBeAdded.length > 0 ) {
                    
                    // listDomainsToBeAdded = flatten(thingRequestToBeAdd, opDomainKey) // flattenDomains(thingRequestToBeAdd);

                    applyMsg = thingToBeAdded.reduce((msg, o, i) => {
                        if (!o.id) msg = msg + `- ${opDomainName}: ${o[opDomainKey]} (Will be created)\nIPs to add: ${o.ip.join(',')}\n\n`;
                        else {
                            if (o.existIPs && o.existIPs.length > 0) msg = msg + `- ${opDomainName}: ${o[opDomainKey]}\nIPs to add: ${o.ip.join(',')}\nIPs existed (Which will not apply): ${o.existIPs.join(',')}\n\n`;
                            else msg = msg + `- ${opDomainName}: ${o[opDomainKey]}\nIPs to add: ${o.ip.join(',')}\n\n`;
                        }
                        return msg
                    },'');
                } else {
                    let oldThings = flatten(thingRequestToBeAdd, opDomainKey) // flattenDomains(thingToBeIgnore)
                    applyMsg = oldThings.map(d => `- ${opDomainName}: ${d} (Will be created)\nIPs to add: ${ip}\n\n`).join('')
                }
                return Promise.resolve({
                    confirmMsg : `**Confirmation**
                        Environment: ${env}
                        Service: ${svc}
                        IP whitelist to apply:
                            ${applyMsg}
                        ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
                    `,
                    thingToBeAdded
                })
            }

            let env = convo.vars.response_env;
            let env_id = convo.vars.response_env_id;
            let ip = convo.vars.response_ip;
            let svc = convo.vars.response_svc;
            let domains = convo.vars.response_domain || 'None'
            let remarkOp = convo.vars.response_remark_op || 'None'
            let domainRequestToBeAdd = convo.vars.response_domainRequestToBeAdd || [];
            let domainToBeIgnore = convo.vars.response_domainToBeIgnore || []
            
            // opDomains, ipAddresses, { svc, env, env_id }, thingRequestToBeAdd = [], thingToBeIgnore = [],
            let { confirmMsg, thingToBeAdded } = await renderConfirmDisplay(
                (svc === "backoffice") ? domains : remarkOp, 
                ip, 
                domainRequestToBeAdd,
                domainToBeIgnore,
                { 
                    svc, env, env_id
                }
            )

            // let convoMessage;
            // let domainMessage = '';
            // let domainToBeAdded;
            // let confirmMsg
            // if (isBackoffice) {
            //     let listDomainsToBeAdded = []
            //     let domainMsg;
            //     if (domainRequestToBeAdd.length > 0) {
            //         domainToBeAdded = domainRequestToBeAdd.concat(domainToBeIgnore)
            //         listDomainsToBeAdded = flattenDomains(domainRequestToBeAdd);

            //         domainMsg = domainToBeAdded.reduce((msg, o, i) => {
            //             if (!o.id) msg = msg + `- domain: ${o.domain} (Will be created)\nIPs to add: ${o.ip.join(',')}\n\n`;
            //             else {
            //                 if (o.existIPs && o.existIPs.length > 0) msg = msg + `- domain: ${o.domain}\nIPs to add: ${o.ip.join(',')}\nIPs existed (Which will not apply): ${o.existIPs.join(',')}\n\n`;
            //                 else msg = msg + `- domain: ${o.domain}\nIPs to add: ${o.ip.join(',')}\n\n`;
            //             }
            //             return msg
            //         },'');
            //     } else {
            //         let listOldDomains = flattenDomains(domainToBeIgnore)
            //         domainMsg = listOldDomains.map(d => `- domain: ${d} (Will be created)\nIPs to add: ${ip}\n\n`).join('')
            //     }
            //     confirmMsg = `**Confirmation**
            //         Environment: ${env}
            //         Service: ${svc}
            //         IP whitelist to apply:
            //             ${domainMsg}
            //         ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
            //     `
            // } else {
            //     domainMessage = domains
            //     confirmMsg = `**Confirmation**
            //         Environment: ${env}
            //         Service: ${svc}
            //         IP whitelist will be apply to following operators: ${domainMessage}
            //         ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
            //     `
            //     confirmMsg = `**Confirmation**
            //         Environment: ${env}
            //         Service: ${svc}
            //         IP whitelist to apply:
            //             ${domainMsg}
            //         ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
            //     `
            // }

            convo.ask(confirmMsg, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                try {
                    if(response.text.toLowerCase() === "yes") {
                        await handleApply({ ip, svc, env, remarkOp, domains, domainToBeAdded: thingToBeAdded })
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
                let envId = await getExistingEnv(response.text)
                if (envId) {
                    convo.setVar('response_env_id', envId)
                }
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
            const target = (convo.vars.response_svc === "backoffice") ? 'domains' : 'operator'
            convo.ask(`What are the IPs you want to apply to these ${target}? (\`Use comma for multiple IPs\`)`, async (response, convo) => {
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
                    // handleExpressionDomains(convo, async (domainResp) => {
                        // handleIPAddresses(convo, () => {
                            if (convo.vars.response_svc === "backoffice") {
                                handleExpressionDomains(convo, (domainResp) => {
                                    handleIPAddresses(convo, () => {
                                        handleCheckDomains(convo, domainResp, async () => {
                                            await handleComplete(convo, true)
                                        })
                                    })
                                })
                            } else {
                                handleRemarkOp(convo, () => {
                                    handleIPAddresses(convo, async() => {
                                        await handleComplete(convo, false)
                                    })
                                })
                            }
                        // })
                    // })
                })
            });
        })
    });


    controller.hears(['remove'], 'mention', async(bot, message) => {
        async function handleRemove(ipAddresses, svc, opDomains, env_id) {
            try {
                await Promise.all(
                    ipAddresses.map(async ip => {
                        let textQ;
                        await Promise.all(
                            opDomains.map(async d => {
                                if (d.id) {
                                    if (svc === "backoffice") {
                                        textQ = `
                                            UPDATE ${pgDB}.${svc}
                                            SET ip = array_remove(ip,'${ip}') WHERE domain = '${d.domain}' AND env_id = ${env_id}
                                        `
                                    } else {
                                        textQ = `
                                            UPDATE ${pgDB}.${svc}
                                            SET ip = array_remove(ip,'${ip}') WHERE operator = '${d.operator}' AND env_id = ${env_id}
                                        `
                                    }
                                    await pgClient.query(textQ)
                                }
                            })
                        )
                    })
                )
                return Promise.resolve(true)
            } catch(err) {
                throw err;
            }
        }

        async function handleCompleteRemove(convo) {
            async function renderConfirmDisplay(opDomains, ipAddresses, { svc, env, env_id }) {
                let opDomainName;
                let opDomainKey;
                if (svc === 'backoffice') {
                    opDomainName = "Domain"
                    opDomainKey = "domain"
                } else {
                    opDomainName = "Operator"
                    opDomainKey = "operator"
                }
                let { thingsToBeRemove, thingMissing } = await handleResultOperatorDomainIP((Array.isArray(opDomains)) ? opDomains.join(',') : opDomains, { 
                    ipResp: ipAddresses.join(','),
                    svc,
                    env,
                    env_id
                }, 'remove')
                let removeMsg = ''
                let thingsRemove = _.cloneDeep(thingsToBeRemove.concat(thingMissing))
                if (thingsRemove.length > 0) {
                    removeMsg = thingsRemove.reduce((msg, o, i) => {
                        if (!o.id) msg = msg + `- ${opDomainName}: ${o[opDomainKey]} (Not exists, won't change)\n\n`;
                        else {
                            if (o.notExistIPs && o.notExistIPs.length > 0) msg = msg + `- ${opDomainName}: ${o[opDomainKey]}\nIPs to remove: ${o.ip.join(',')}\nIPs not exists (Which will not delete): ${o.notExistIPs.join(',')}\n\n`;
                            else msg = msg + `- ${opDomainName}: ${o[opDomainKey]}\nIPs to remove: ${o.ip.join(',')}\n\n`;
                        }
                        return msg
                    },'');
                } else {
                    let oldThings = flatten([], opDomainKey)// flattenDomains(opMissing)
                    removeMsg = oldThings.map(d => `- ${opDomainName}: ${d} (Not exists, won't change)\n\n`).join('')
                }
                return Promise.resolve({
                    confirmMsg : `**Confirmation**
                        Environment: ${env}
                        Service: ${svc}
                        IP whitelist to apply:
                            ${removeMsg}
                        ANSWER \`Yes\` TO APPLY, OR WILL CANCEL!
                    `,
                    thingsRemove
                })
            }
            const env = convo.vars.response_env;
            const env_id = convo.vars.response_env_id;
            const ipAddresses = convo.vars.response_ip;
            const svc = convo.vars.response_svc;
            let remarkOp = convo.vars.response_remark_op;
            let domains = convo.vars.response_domain || null;

            let { confirmMsg, thingsRemove } = await renderConfirmDisplay((svc === "backoffice") ? domains : remarkOp, ipAddresses, { svc, env, env_id })
            let opDomains = _.cloneDeep(thingsRemove)
            convo.ask(confirmMsg, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                try {
                    if(response.text.toLowerCase() === "yes") {
                        await handleRemove(ipAddresses, svc, opDomains, env_id)
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

        function handleRemarkOp(convo, callback) {
            convo.ask(`Which operator you want to remove IP whitelist?`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                convo.setVar('response_remark_op', response.text.trim())
                convo.next()
                callback();
            });
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
                    convo.setVar('response_ip', ipResponse.split(','))
                    convo.next()
                    callback()
                }
            })
        }

        async function handleEnv(convo ,callback) {
            convo.ask(`Which environment?\n${environments.map(env => `- ${env}\n`).join('')}`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let envId = await getExistingEnv(response.text)
                if (envId) {
                    convo.setVar('response_env', response.text)
                    convo.setVar('response_env_id', envId)
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
                const domainValid = hasExistingDomains(domainResp.split(','), convo.vars.response_svc, convo.vars.response_env_id);
                
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
        async function handleEnv(convo ,callback) {
            convo.ask(`Which environment?\n${environments.map(env => `- ${env}\n`).join('')}`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let envId = await getExistingEnv(response.text)
                if (envId) {
                    convo.setVar('response_env', response.text)
                    convo.setVar('response_env_id', envId)
                } else {
                    bot.botkit.trigger('missing_env', [bot, message])
                    convo.repeat()
                }
                convo.next()
                if(envId) callback()
            });
        }

        function handleRemarkOp(convo, callback) {
            convo.ask(`Which operator you want to show IP whitelist?`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                const remarkExists = await isRemarkOpExists(response.text, convo.vars.response_svc, convo.vars.response_env_id);
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

        async function handleService(convo, callback) {
            convo.ask(`Which service you want to show IP whitelist?\n${services.map(service => `- ${service}\n`).join('')}`, async (response, convo) => {
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
            convo.ask(`Which domain you want to show IP whitelist? (\`Use single domain only\`)`, async (response, convo) => {
                isTerminate(response, convo, bot, message)
                let domainResp = formatDomains(response.text);
                const domainValid = hasExistingDomains(domainResp.split(','), convo.vars.response_svc, convo.vars.response_env_id);
                
                if (!domainValid) {
                    bot.botkit.trigger('missing_domain', [bot, message])
                    convo.repeat()
                } else convo.setVar('response_domain', domainResp.split(','))
                convo.next()
                if(domainValid) callback()
            })
        }

        async function handleShow(convo, callback) {
            function display(d, svc, env) {
                let dataMsg = '\n';
                if (svc === "backoffice") dataMsg = dataMsg + `- Domain: ${d.domain}\nIPs: ${(d.ip && d.ip.length > 0) ? d.ip.join(',') : 'Empty'}\n\n`
                else dataMsg = dataMsg + `- Operator: ${d.operator}\nIPs: ${(d.ip && d.ip.length > 0) ? d.ip.join(',') : 'Empty'}\n\n`
                let confirmMsg = `**Information**
                    Environment: ${env}
                    Service: ${svc}
                    IP whitelist:
                        ${dataMsg}
                `
                convo.say(confirmMsg)
            }
            let env_id = convo.vars.response_env_id;
            let env = convo.vars.response_env;
            let svc = convo.vars.response_svc;
            let remarkOp = convo.vars.response_remark_op;
            let domain = convo.vars.response_domain || null;

            let opDomainCol = (svc === "backoffice") ? "domain" : "operator"
            let opDomainVal = (svc === "backoffice") ? domain : remarkOp
            try {
                let displayQ = `SELECT * FROM ${pgDB}.${svc} WHERE ${opDomainCol} = '${opDomainVal}' AND env_id = ${env_id}`
                let displayR = await pgClient.query(displayQ);
                if (displayR && displayR.rows && displayR.rows.length > 0) {
                    let d = displayR.rows[0];
                    display(d, svc, env)
                } else {
                    bot.botkit.trigger('missing_info', [bot, message])
                    convo.stop()
                }
            } catch(err) {
                bot.botkit.trigger('missing_info', [bot, message])
                convo.stop()
            }
        }

        bot.startConversation(message, async (err, convo) => {
            handleEnv(convo, () => {
                handleService(convo, (selectedService) => {
                    if (selectedService === "backoffice") {
                        handleDomain(convo, async () => {
                            await handleShow(convo);
                        })
                    } else {
                        handleRemarkOp(convo, async() => {
                            await handleShow(convo);
                        })
                    }
                })
            })
        })
    });

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

    async function getEnvironmentId(env) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.env WHERE name = '${env}'`)
            if (r) {
                if (r.rowCount === 0) {
                    const q = `INSERT INTO ${pgDB}.env(name) VALUES($1) RETURNING id`;
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

    async function isRemarkOpExists(remarkOp, svc, env_id) {
        try {
            let r = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE operator = '${remarkOp}' AND env_id = ${env_id}`)
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

    async function hasExistingIP(ipAddresses, svc, targetValue, env_id) {
        try {
            let r
            if (svc === "backoffice") {
                return ipAddresses
                // await Promise.all(
                //     targetValue.map(async domain => {
                //         r = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE ip && '{${ipAddresses}}' AND domain = '${targetValue}'`)
                //     })
                // )
                
            } else {
                r = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE ip && '{${ipAddresses}}' AND operator = '${targetValue}' AND env_id = ${env_id}`)
            }
            if (r) {
                if (r.rowCount > 0) return ipAddresses; //r.rows[0].id
                else return null;
            }
        } catch(err) {
            throw err;
        }
    }

    async function hasExistingDomains(domains, svc, env_id) {
        let domainFound = true;
        try {
            await Promise.all(
                domains.map(async domain => {
                    let r = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE domain = '${domain}' AND env_id = ${env_id}`)
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

    async function handleResultOperatorDomainIP(resp, { ipResp, svc, env, env_id }, handleType) {
        let respLists = resp.split(',');
        let ipLists = ipResp.split(',');
        let respToBeIgnore =  []
        let requestResp = []
        let uniqListIP = [];
        await Promise.all(
            respLists.map(async resp => {
                let r2 = await pgClient.query(`SELECT * FROM ${pgDB}.${svc} WHERE ${(svc === "backoffice") ? 'domain' : 'operator'} = '${resp}' AND env_id = ${env_id}`)
                if ( r2 && r2.rowCount > 0) {
                    if ( handleType === 'remove' ) {
                        if(uniqListIP.length === 0) uniqListIP = ipLists.filter(ip =>r2.rows[0].ip.includes(ip))
                        respToBeIgnore.push(Object.assign({
                            ...r2.rows[0],
                            // domain: resp,
                            ip: uniqListIP,
                            notExistIPs: _.difference(ipLists, uniqListIP),
                        }, (svc === "backoffice") ? { domain: resp } : { operator: resp }))
                    } else {
                        if(uniqListIP.length === 0) uniqListIP = ipLists.filter(ip =>!r2.rows[0].ip.includes(ip))
                        respToBeIgnore.push(Object.assign({
                            ...r2.rows[0],
                            // domain: resp,
                            ip: uniqListIP,
                            existIPs: ipLists.filter(inputIP => !uniqListIP.includes(inputIP))
                        }, (svc === "backoffice") ? { domain: resp } : { operator: resp }))
                    }
                } else {
                    requestResp.push(resp)
                }
            })
        )
        
        if( handleType === 'remove' ) {
            return {
                thingLists: respLists,
                thingsToBeRemove: respToBeIgnore,
                thingMissing: requestResp.map(d => { 
                    return (svc === "backoffice") ? { domain: d } : { operator: d }
                }) 
            }
            // return (svc === "backoffice") ? {
            //     domainLists: respLists, 
            //     domainIPToBeRemove: respToBeIgnore,
            //     domainMissing: requestResp.map(d => { return { domain: d } }) 
            // } : {
            //     opLists: respLists, 
            //     opIPToBeRemove: respToBeIgnore,
            //     opMissing: requestResp.map(d => { return { operator: d } }) 
            // }
        }
        else {
            requestResp = requestResp.map(newResp => {
                return (svc === "backoffice") ? {
                    domain: newResp,
                    ip: ipLists,
                    env
                } : {
                    operator: newResp,
                    ip: ipLists,
                    env
                }
            })
            return {
                thingLists: respLists, 
                thingIgnore: respToBeIgnore, 
                requestThingAdded: requestResp
            }
            // return (svc === "backoffice") ? {
            //     domainLists: respLists, 
            //     domainToBeIgnore: respToBeIgnore, 
            //     requestDomainToBeAdded: requestResp
            // } : {
            //     opLists: respLists, 
            //     opToBeIgnore: respToBeIgnore, 
            //     requestOperatorToBeAdded: requestResp
            // }
        }
    }

    function flattenDomains(arr) {
        return arr.reduce((a, o, i) => {
            if (o && o.domain) a = a.concat(o.domain)
            return a;
        },[]);
    }

    function flatten(arr, key) {
        return arr.reduce((a, o, i) => {
            if (o && o[key]) a = a.concat(o[key])
            return a;
        },[]);
    }

    // async function queryAll() {
    //     try {
    //         return Promise.all(
    //             services.map(async loc => {
    //                 return Promise.resolve(
    //                     { 
    //                         ...await pgClient.query(`SELECT * FROM ${pgDB}.${loc}`),
    //                         location: loc
    //                     }
    //                 )
    //             })
    //         )
    //     } catch(err) {
    //         throw err;
    //     }
    // }

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