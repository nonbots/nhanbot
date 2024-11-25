import {writeFileSync } from 'node:fs';
import authInfo from "./auth.json" with { type: 'json' }; // eslint-disable-line
//const {TWITCH_TOKEN, BOT_ID, BROADCASTER_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TWITCH_TOKEN} = authInfo;

export async function createNewAuthToken(REFRESH_TWITCH_TOKEN) {
  //console.log({REFRESH_TWITCH_TOKEN});
  let payload = {
    "grant_type": "refresh_token",
    "refresh_token": REFRESH_TWITCH_TOKEN,
    // keys are not the same as the api, might not work
    "client_id": authInfo.CLIENT_ID,
    "client_secret": authInfo.CLIENT_SECRET
  }
  //console.log({payload});
  let newToken = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(payload).toString()

  });
  return await newToken.json();
}

export async function refreshToken(REFRESH_TWITCH_TOKEN, entity) {
  let data  = await createNewAuthToken(REFRESH_TWITCH_TOKEN);
  if ("access_token" in data ) {
    if (entity === "bot") {
      authInfo.BOT_TWITCH_TOKEN = data.access_token;
      authInfo.BOT_REFRESH_TWITCH_TOKEN = data.refresh_token;
    }
    if (entity === "broadcaster") {
      authInfo.REFRESH_TWITCH_TOKEN = data.access_token;
      authInfo.REFRESH_TWIRCH_TOKEN = data.refresh_token;
    }
    writeFileSync("./src/auth.json", JSON.stringify(authInfo));
  } else {
    console.log(data.status);
  }
}

export async function getRewards(fetchURL) {
  const res = await fetch(fetchURL, 
    {
      headers: {
        'Client-Id': authInfo.CLIENT_ID,
        'Authorization': `Bearer ${authInfo.TWITCH_TOKEN}`,
      }
  });
  return await res.json();
}

export async function createSubscription(sessionID, payloadType, versionStr) {
   // console.log({TWITCH_TOKEN});
    let payload = {
        "type": payloadType,

        "version": versionStr,
        "condition": {
            "broadcaster_user_id": authInfo.BROADCASTER_ID,
            "moderator_user_id": authInfo.BROADCASTER_ID
        },
        "transport": {
            "method": "websocket",
            "session_id": sessionID
        }
    };
     let res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            'Client-Id': authInfo.CLIENT_ID,
            'Authorization': `Bearer ${authInfo.TWITCH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    return data;
};
