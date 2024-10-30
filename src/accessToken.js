import authInfo from "./auth.json" assert { type: 'json' };
const {TWITCH_TOKEN, BOT_ID, BROADCASTER_ID, CLIENT_ID, CLIENT_SECRET, REFRESH_TWITCH_TOKEN} = authInfo;

export async function createNewAuthToken() {
  let payload = {
    "grant_type": "refresh_token",
    "refresh_token": REFRESH_TWITCH_TOKEN,
    // keys are not the same as the api, might not work
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET
  }
 let newToken = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(payload).toString()

  });
  return await newToken.json();
}
export async function createFollowSubscription(sessionID) {
    let payload = {
        "type": "channel.follow",

        "version": "2",
        "condition": {
            "broadcaster_user_id": BROADCASTER_ID,
            "moderator_user_id": BOT_ID
        },
        "transport": {
            "method": "websocket",
            "session_id": sessionID
        }
    };

     let res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            'Client-Id': CLIENT_ID,
            'Authorization': `Bearer ${TWITCH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    return await res.json();
};
