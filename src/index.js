import "dotenv/config";
import { readFileSync, writeFileSync } from 'node:fs';
const authInfo = JSON.parse(readFileSync("./auth.json", "utf8"));                  
import websocket from "websocket";
const { client: WebSocketClient } = websocket;

import { CommandManager } from "./commandManager.js";
const commandManager = new CommandManager();

import { isSentByStreamer } from "./permissions.js";

const client = new WebSocketClient();
const eventSubClient = new WebSocketClient();
const {
  TWITCH_TOKEN: password,
  REFRESH_TWITCH_TOKEN: refreshPassword,
  TWITCH_CHANNEL: channel,
  TWITCH_ACCOUNT: account,
  CLIENT_ID: client_id,
  CLIENT_SECRET: client_secret
} = authInfo;
const BOT_ID = "987698925";
const BROADCASTER_ID = "972045178";
const IRC_TOKEN = `oauth:${password}`
const SUB_EVENT_TOKEN = password;
console.log("CHECK THIS-------->", {
  channel,
  account
});
let IRC_connection;
const moveMessage = "Get up and move, your body will thank you!";
const defaultMoveInterval = 60000 * 60 * 1; // Set to 1 minute for testing.
let moveInterval = defaultMoveInterval;

client.on("connectFailed", function (error) {
  console.log("Connect Error: " + error.toString());
});
eventSubClient.on("close", (code, description) => {
    console.log(`Websocket client disconnected: ${code} - ${description}`);
});
//eventSubClient.onerror(evt);
eventSubClient.on("connect", function (connection) {
  console.log("____________________EventSub Client Connected________________")
    let oldConnection;
    connection.on("message", async (message) => {
        if (message.type === 'utf8') {
            let data = JSON.parse(message.utf8Data);
            if (data.metadata.message_type === "session_welcome") {
                if (oldConnection !== undefined) oldConnection.close();
                console.log(`close description: ${connection.closeDescription}`);
                let responseData = await createFollowSubscription(data.payload.session.id);
                console.log("CREATE FOLLOWSUBSCRIPTION", responseData); 
                if(responseData.message = 'Invalid OAuth token') {
                  const data = await createNewAuthToken();
                console.log("CREATE NEW AUTH TOKEN", data); 
                  const newToken = data.access_token;
                  const newRefresh = data.refresh_token;
                  authInfo.TWITCH_TOKEN = `${newToken}`;
                  authInfo.REFRESH_TWITCH_TOKEN = newRefresh;
                  writeFileSync("auth.json", JSON.stringify(authInfo))
                  //IRC_connection.close();
                  //connection.close();
                  //client.connect("ws://irc-ws.chat.twitch.tv:80");
                  //eventSubClient.connect("wss://eventsub.wss.twitch.tv/ws"); /// restart the program
                }
            }else if (data.metadata.message_type === "session_reconnect") {
              oldConnection = connection 
              eventSubClient.connect(`${data.payload.session.reconnect_url}`);
              console.log(`Reconnected to ${data.payload.session.reconnect_url}`);
            }else if (data.metadata.message_type === "notification"){
              if (IRC_connection !== undefined) {
                IRC_connection.sendUTF(`PRIVMSG #${channel} :${data.payload.event.user_name} has followed!`);
              }
            }
        }
    });
});
async function createNewAuthToken() {
  let payload = {
    "grant_type": "refresh_token",
    "refresh_token": `${refreshPassword}`,
    "client_id": `${client_id}`,
    "client_secret": `${client_secret}`
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
async function createFollowSubscription(sessionID) {
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
            'Client-Id': client_id,
            'Authorization': `Bearer ${SUB_EVENT_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    return await res.json();
};
client.on("connect", function (connection) {
  console.log("WebSocket Client Connected");
  IRC_connection = connection;
  function moveCommandAction() {
    connection.sendUTF(`PRIVMSG #${channel} :${moveMessage}`);
  }
 connection.on("message", function(message) {
    if (message.type === 'utf8') {
      if (message.utf8Data.startsWith('PING :tmi.twitch.tv')) {
        connection.sendUTF('PONG :tmi.twitch.tv');
        console.log("PONG SENT");
      } 
    }
 });
  connection.on("message", function (message) {
  });

  // This is a simple bot that doesn't need the additional
  // Twitch IRC capabilities.

  // connection.sendUTF('CAP REQ :twitch.tv/commands twitch.tv/membership twitch.tv/tags');

  // Authenticate with the Twitch IRC server and then join the channel.
  // If the authentication fails, the server drops the connection.

  connection.sendUTF(`PASS ${IRC_TOKEN}`);
  connection.sendUTF(`NICK ${account}`);
  connection.sendUTF(`JOIN #${channel}`);

  // Set a timer to post future 'move' messages. This timer can be
  // reset if the user passes, !move [minutes], in chat.
  let intervalObj = setInterval(moveCommandAction, moveInterval);

  connection.on("error", function (error) {
    console.log("Connection Error: " + error.toString());
  });

  connection.on("close", function () {
    console.log("Connection Closed");
    console.log(`close description: ${connection.closeDescription}`);
    console.log(`close reason code: ${connection.closeReasonCode}`);

    clearInterval(intervalObj);
  });

  // Process the Twitch IRC message.
  connection.on("message", commandManager.onMessage.bind(commandManager)); ///the a new function of onMessage with the commandManager as the execution context
  commandManager.addCommand("nhanify_pp_count", async(message) => {
    const response = await fetch("https://nhanify.com/api/playlists/public");
    const result = await response.json();
    connection.sendUTF(`PRIVMSG ${message.command.channel} : ${result.playlists.length} public playlists`)
  })
  commandManager.addCommand("ping", (message) => {
    console.log("PING COMMAND", message);
    connection.sendUTF(`PRIVMSG ${message.command.channel} : pong`);
  });
  commandManager.addCommand("move", (message) => {
    console.log("THE MESSAGE", message);
    if (!isSentByStreamer(message)) return;
    // Assumes the command's parameter is well formed (e.g., !move 15).
    // console.log(`recieved move `, parsedMessage.command);
    // console.log(parsedMessage.command.channel, channel);
    let updateInterval = message.command.botCommandParams
      ? parseInt(message.command.botCommandParams) * 1000 * 60
      : defaultMoveInterval;

    if (moveInterval === updateInterval) return;
    // Valid range: 1 minute to 60 minutes
    if (updateInterval < 60000 || updateInterval > 3600000) return;
    moveInterval = updateInterval;
    console.log("THIS IS THE MOVEINTERVAL", moveInterval);

    // Reset the timer.
    clearInterval(intervalObj);
    intervalObj = null;
    intervalObj = setInterval(moveCommandAction, moveInterval);
  });

  commandManager.addCommand("addsong", async(message) => {
    await fetch('http://localhost:3000/playlist/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

  });
  commandManager.addCommand("moveoff", (message) => {
    if (!isSentByStreamer(message)) return;
    clearInterval(intervalObj);
  });

  commandManager.addCommand("close", (message) => {
    if (!isSentByStreamer(message)) return;
    connection.sendUTF(`PART ${channel}`);
    connection.close();
  });

   commandManager.addCommand("github", (message) => {
    connection.sendUTF(
      `PRIVMSG ${commandManager.parsedMessage.command.channel} : Nhan's github: https://github.com/nonbots`
    );
  });

 commandManager.addCommand("discord", (message) => {
    connection.sendUTF(
      `PRIVMSG ${commandManager.parsedMessage.command.channel} : discord community: https://discord.gg/ku8vVEmuJY`
    );
  });

  commandManager.addCommand("youtube", (message) => {
    connection.sendUTF(
      `PRIVMSG ${commandManager.parsedMessage.command.channel} : cooking channel: www.youtube.com/@nhancooks`
    );
  });
});


client.connect("ws://irc-ws.chat.twitch.tv:80");
eventSubClient.connect("wss://eventsub.wss.twitch.tv/ws");
