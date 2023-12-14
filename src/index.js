import "dotenv/config";

import websocket from "websocket";
const { client: WebSocketClient } = websocket;

import { CommandManager } from "./commandManager.js";
const commandManager = new CommandManager();

import { isSentByStreamer } from "./permissions.js";

const client = new WebSocketClient();

const {
  TWITCH_TOKEN: password,
  TWITCH_CHANNEL: channel,
  TWITCH_ACCOUNT: account,
} = process.env;

console.log({
  channel,
  account,
});

const moveMessage = "Get up and move, your body will thank you!";
const defaultMoveInterval = 60000 * 60 * 1; // Set to 1 minute for testing.
let moveInterval = defaultMoveInterval;

client.on("connectFailed", function (error) {
  console.log("Connect Error: " + error.toString());
});

client.on("connect", function (connection) {
  console.log("WebSocket Client Connected");

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

  commandManager.addCommand("moveoff", (message) => {
    if (!isSentByStreamer(message)) return;
    clearInterval(intervalObj);
  });

  commandManager.addCommand("close", (message) => {
    connection.sendUTF(`PART ${channel}`);
    connection.close();
  });

  commandManager.addCommand("discord", (message) => {
    connection.sendUTF(
      `PRIVMSG ${parsedMessage.command.channel} : discord community: https://discord.gg/hkEmB9KDGT`
    );
  });

  commandManager.addCommand("youtube", (message) => {
    connection.sendUTF(
      `PRIVMSG ${parsedMessage.command.channel} : cooking channel: www.youtube.com/@nhancooks`
    );
  });
});

client.connect("ws://irc-ws.chat.twitch.tv:80");
