const fetch = require("node-fetch");

export default async function exe_stackstorm_api(data: string, waiting_seconds: number) { //An async function always returns a promise

    let stackStormURL: string = process.env["STACKSTORM_URL"]!;
    let stackstormAPIKEY: string = process.env["STACKSTORM_API_KEY"]!;

    // call stackstorm's execution api by using POST method (action_check_account)
    let execution_info = await fetch(stackStormURL, {
        method: 'POST',
        headers: {
            'St2-Api-Key': stackstormAPIKEY,
            'content-type': 'application/json'
        },
        body: data
    });

    let execution_data = await execution_info.json();  //await the execution of res.json() before doing anything else

    let execution_id = execution_data['id'];

    let execution_url = stackStormURL.concat('/', execution_id);

    await wait(waiting_seconds);

    //get the action_check_account's execution result
    let getResult = await fetch(execution_url, {
        method: 'GET',
        headers: {
            'St2-Api-Key': stackstormAPIKEY,
            'content-type': 'application/json'
        },
    });

    let results = await getResult.json();

    return results

}

export async function disable_interactive_msg(post_id: string,icon: string,msg: string){

    const mattermost_host = process.env.MATTERMOST_HOST
    const mattermost_port = process.env.MATTERMOST_HTTP_PORT
    const access_token = process.env.MATTERMOST_ACCESS_TOKEN
    const data = {"id":post_id,"message":msg + "\n" + icon,"has_reactions":true}
    const matermost_api_url = "http://" + mattermost_host +  ":" + mattermost_port +"/api/v4/posts/" + post_id

    let result = await fetch(matermost_api_url,{
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + access_token,
            'content-type': 'application/json'
        },
        body: JSON.stringify(data) // parses JSON response into native JavaScript objects
    });

    return result.json(); 

}

function wait(seconds: number) {

    return new Promise((resolve) => {
        setTimeout(resolve, seconds * 1000);
    });

}
