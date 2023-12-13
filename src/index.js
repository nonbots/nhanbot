import "dotenv/config";

import websocket from "websocket";
const { client: WebSocketClient } = websocket;

import {
  parseCommand,
  parseMessage,
  parseTags,
  parseSource,
  parseParameters,
} from "./parse/index.js";

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
const defaultMoveInterval = 1000 * 60 * 1; // Set to 1 minute for testing.
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

  connection.on("message", function (ircMessage) {
    // console.log({ ircMessage });
    //onMessage me
    if (ircMessage.type === "utf8") {
      let rawIrcMessage = ircMessage.utf8Data.trimEnd();
      console.log(
        `Message received (${new Date().toISOString()}): '${rawIrcMessage}'\n`
      );

      let messages = rawIrcMessage.split("\r\n"); // The IRC message may contain one or more messages.
      messages.forEach((message) => {
        let parsedMessage = parseMessage(message); // parse the messages into different components {  // Contains the component parts.
        /*
                tags: null,
                source: null, // returns source {} 
                command: null, // {command: JOIN, channel: #bar}
                parameters: null
            };*/

        console.log("THIS IS THE PARSEDMESSAGE:", parsedMessage);

        if (parsedMessage) {
          // console.log(`Message command: ${parsedMessage.command.command}`);
          // console.log(`\n${JSON.stringify(parsedMessage, null, 3)}`)

          switch (parsedMessage.command.command) {
            case "PRIVMSG":
              console.log(parsedMessage.source.nick, channel);
              if ("ping" === parsedMessage.command.botCommand) {
                // console.log(`recieved ping `, parsedMessage.command);
                // console.log(`PRIVMSG ${parsedMessage.command.channel} : pong`);
                connection.sendUTF(
                  `PRIVMSG ${parsedMessage.command.channel} : pong`
                );
              }
              // Ignore all messages except the '!move' bot
              // command. A user can post a !move command to change the
              // interval for when the bot posts its move message.
              else if (
                "move" === parsedMessage.command.botCommand &&
                parsedMessage.source.nick === channel
              ) {
                // Assumes the command's parameter is well formed (e.g., !move 15).
                console.log(`recieved move `, parsedMessage.command);
                console.log(parsedMessage.command.channel, channel);
                let updateInterval = parsedMessage.command.botCommandParams
                  ? parseInt(parsedMessage.command.botCommandParams) * 1000 * 60
                  : defaultMoveInterval;

                if (moveInterval != updateInterval) {
                  // Valid range: 1 minute to 60 minutes
                  if (updateInterval >= 60000 && updateInterval <= 3600000) {
                    moveInterval = updateInterval;

                    // Reset the timer.
                    clearInterval(intervalObj);
                    intervalObj = null;
                    intervalObj = setInterval(moveCommandAction, moveInterval);
                  }
                }
              } else if ("moveoff" === parsedMessage.command.botCommand) {
                clearInterval(intervalObj);
                connection.sendUTF(`PART ${channel}`);
                connection.close();
              } else if ("discord" === parsedMessage.command.botCommand) {
                connection.sendUTF(
                  `PRIVMSG ${parsedMessage.command.channel} : discord community: https://discord.gg/hkEmB9KDGT`
                );
              }

              break;
            case "PING":
              connection.sendUTF("PONG " + parsedMessage.parameters);
              break;
            case "001":
              // Successfully logged in, so join the channel.
              connection.sendUTF(`JOIN ${channel}`);
              break;
            case "JOIN":
              // Send the initial move message. All other move messages are
              // sent by the timer.
              connection.sendUTF(`PRIVMSG ${channel} :${moveMessage}`);
              break;
            case "PART":
              console.log("The channel must have banned (/ban) the bot.");
              connection.close();
              break;
            case "NOTICE":
              // If the authentication failed, leave the channel.
              // The server will close the connection.
              if ("Login authentication failed" === parsedMessage.parameters) {
                console.log(`Authentication failed; left ${channel}`);
                connection.sendUTF(`PART ${channel}`);
              } else if (
                "You don’t have permission to perform that action" ===
                parsedMessage.parameters
              ) {
                console.log(
                  `No permission. Check if the access token is still valid. Left ${channel}`
                );
                connection.sendUTF(`PART ${channel}`);
              }
              break;
            default: // Ignore all other IRC messages.
          }
        }
      });
    }
  });
});

client.connect("ws://irc-ws.chat.twitch.tv:80");
