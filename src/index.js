import "dotenv/config";

import websocket from "websocket";
const { client: WebSocketClient } = websocket;

import { CommandManager } from "./commandManager.js";
const commandManager = new CommandManager();

import { isSentByStreamer } from "./permissions.js";

const client = new WebSocketClient();
const eventSubClient = new WebSocketClient();
const {
  TWITCH_TOKEN: password,
  TWITCH_CHANNEL: channel,
  TWITCH_ACCOUNT: account,
  CLIENT_ID: client_id
} = process.env;
const BOT_ID = "987698925";
const BROADCASTER_ID = "972045178";
const SUB_EVENT_TOKEN = password.split(':')[1];
console.log({
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
  console.log("EventSub Client Connected")
   connection.on("message", async (message) => {
        if (message.type === 'utf8') {
            let data = JSON.parse(message.utf8Data);
            if (data.metadata.message_type === "session_welcome") {
                let responseData = await createFollowSubscription(data.payload.session.id);
                console.log(responseData);
            }else if (data.metadata.message_type === "notification"){
              if (IRC_connection !== undefined) {
                IRC_connection.sendUTF(`PRIVMSG #${channel} :${data.payload.event.user_name} has followed!`);
              }
            }
        }
    });
});

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

  // This is a simple bot that doesn't need the additional
  // Twitch IRC capabilities.

  // connection.sendUTF('CAP REQ :twitch.tv/commands twitch.tv/membership twitch.tv/tags');

  // Authenticate with the Twitch IRC server and then join the channel.
  // If the authentication fails, the server drops the connection.

  connection.sendUTF(`PASS ${password}`);
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
  commandManager.addCommand("ping", (message) => {
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
      `PRIVMSG ${commandManager.parsedMessage.command.channel} : discord community: https://github.com/nonbots`
    );
  });

 commandManager.addCommand("discord", (message) => {
    connection.sendUTF(
      `PRIVMSG ${commandManager.parsedMessage.command.channel} : discord community: https://discord.gg/hkEmB9KDGT`
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
