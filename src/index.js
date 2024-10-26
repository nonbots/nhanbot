import authInfo from "./auth.json" assert { type: 'json' }; // eslint-disable-line
import {
  durationSecsToHHMMSS,
  isValidURL,
  getVidInfo
} from "./helper.js";

import {writeFileSync } from 'node:fs';
import websocket from "websocket";
import http from 'http';
import express from 'express';
const app = express()
const port = 3000
app.use(express.static('public'));
const { client: WebSocketClient, server: WebSocketServer } = websocket;
import { CommandManager } from "./commandManager.js";
import { createNewAuthToken, createFollowSubscription } from './accessToken.js';
const commandManager = new CommandManager();
import { isSentByStreamer } from "./permissions.js";

const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

server.listen(8080, () => {
  console.log("Websocket server is listening on ws://localhost:8080");
});

const ircClient = new WebSocketClient();
const eventSubClient = new WebSocketClient();
const nhanbotServer = new WebSocketServer({
  httpServer: server,
});

const {
  TWITCH_TOKEN: password,
  REFRESH_TWITCH_TOKEN: refreshPassword,
  TWITCH_CHANNEL: channel,
  TWITCH_ACCOUNT: account,
  CLIENT_ID: ircClient_id,
  CLIENT_SECRET: ircClient_secret,
  NHANIFY_API_KEY,
  BOT_ID,
  BROADCASTER_ID,
  YT_API_KEY,
} = authInfo;

const IRC_TOKEN = `oauth:${password}`
let IRC_connection;
const moveMessage = "Get up and move, your body will thank you!";
const defaultMoveInterval = 60000 * 60 * 1; 
let moveInterval = defaultMoveInterval;

let clientNhanify;
const clientsOverlay = [];
const songQueue = [];
const COOLDOWN_DURATION = 30 * 1000;
let lastSongRequestTime = new Date() - COOLDOWN_DURATION;
let song = null;
nhanbotServer.on('request', (request) => {
  const connection = request.accept(null, request.origin);
  const whoami = request.resourceURL.search;
  if (whoami === "?whoami=overlay") {
    clientsOverlay.push(connection);
  } else {
    if (clientNhanify) clientNhanify.close();
    clientNhanify = connection;
  }
  clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({songQueue, song})));
  connection.on('message', (message) => {
    if (message.type === 'utf8') {
      const data = JSON.parse(message.utf8Data);
      if ((data.type === "playerStateEnded"|| data.type === "playerStateStarted") && songQueue.length !== 0) {
        song = songQueue.shift();
        clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({songQueue, song})));
        IRC_connection.sendUTF(`PRIVMSG #${channel} : @${song.addedBy}, ${song.title} is now playing.`);
        clientNhanify.sendUTF(JSON.stringify(song));
      } else if (data.type === "playerStateEnded"  && songQueue.length === 0 && song){
        clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state: "end_queue"})));
        clientNhanify.sendUTF(JSON.stringify(null));
        song = null;
      }else {
        clientNhanify.sendUTF(JSON.stringify(null));
      }
    }
  });
});

ircClient.on("connectFailed", function (error) {
  console.log("Connect Error: " + error.toString());
});
eventSubClient.on("close", (code, description) => {
    console.log(`Websocket ircClient disconnected: ${code} - ${description}`);
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
              if (responseData.message === 'Invalid OAuth token') {
                const data = await createNewAuthToken();
                const newToken = data.access_token;
                const newRefresh = data.refresh_token;
                authInfo.TWITCH_TOKEN = newToken;
                authInfo.REFRESH_TWITCH_TOKEN = newRefresh;
                writeFileSync("./src/auth.json", JSON.stringify(authInfo));
                //IRC_connection.close();
                //connection.close();
                //ircClient.connect("ws://irc-ws.chat.twitch.tv:80");
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
//IRC client
ircClient.on("connect", function (connection) {
  console.log("WebSocket Client Connected");
  IRC_connection = connection;
  connection.sendUTF(`PASS ${IRC_TOKEN}`);
  connection.sendUTF(`NICK ${account}`);
  connection.sendUTF(`JOIN #${channel}`);

 // to keep the connect by responsing back with a PONG
  connection.on("message", function(message) {
      if (message.type === 'utf8') {
        if (message.utf8Data.startsWith('PING :tmi.twitch.tv')) {
          connection.sendUTF('PONG :tmi.twitch.tv');
        } 
      }
  });

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
  //add commands to commandManger instance
  commandManager.addCommand("nhanify_pp_count", async(message) => {
    const response = await fetch("https://nhanify.com/api/playlists/public");
    const result = await response.json();
    connection.sendUTF(`PRIVMSG ${message.command.channel} : ${result.playlists.length} public playlists`)
  })
  commandManager.addCommand("sr", async(message) => {
  //  try {
      const addedBy = message.source.nick;
      const timePassed = new Date() - lastSongRequestTime;
      if (timePassed < COOLDOWN_DURATION) {
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${Math.floor(COOLDOWN_DURATION / 1000) -  Math.floor(timePassed / 1000)} seconds more of cooldown.`);
        return;
      }
      const url = message.command.botCommandParams;
     /*
      const playlistId = 6;
      const addedBy = message.source.nick;
      let payload = {
        url,
        playlistId,
        addedBy,
      }
      const response = await fetch("http://localhost:3002/api/playlist/addSong", {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${NHANIFY_API_KEY}`,
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      });
    const result = await response.json();
    */
    if (!isValidURL(url)) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This url is invalid.`);
      return;
    }
    const vidInfo = await getVidInfo(url, YT_API_KEY);
    if (!vidInfo) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This video id is invalid.`);
      return;
    }

    if (vidInfo.durationSecs > 600){
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${vidInfo.title} is over the 10 minutes duration limit.`);
      return;
    }
    lastSongRequestTime = new Date();
    songQueue.push({
      title: vidInfo.title,
      videoId: vidInfo.videoId,
      duration: durationSecsToHHMMSS(vidInfo.durationSecs),
      addedBy,
    });
     
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({songQueue, song})));
    console.log({songQueue, song});
    connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${vidInfo.title} was added to the queue.`);
    /*switch(result.msg) {
      case 'success':
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${result.song.title} was added to "Twitch Stream" playlist.`);
        break;
      case 'no_user_account':
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, Create an account at https://wwww.nhanify.com.`);
        break;
      case 'playlist_max_limit':
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, The playlist has has reached it's max number of songs.`);
        break;
      case 'duplicate_video_id':
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This song has already been added to the playlist.`);
        break;
      default:
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, Oops! Something went wrong.`);
    }
    } catch(error) {
      console.error(error);
      connection.sendUTF(`PRIVMSG ${message.command.channel} : Oops! Nhanify is not available.`);
    }
  */
  });

  commandManager.addCommand("ping", (message) => {
    console.log("PING COMMAND", message);
    connection.sendUTF(`PRIVMSG ${message.command.channel} : pong`);
    connection.sendUTF(`PRIVMSG ${message.command.channel} : second pong`);
  });
  // Set a timer to post future 'move' messages. This timer can be
  // reset if the user passes, !move [minutes], in chat.
  let intervalObj = setInterval(moveCommandAction, moveInterval);
  function moveCommandAction() {
    connection.sendUTF(`PRIVMSG #${channel} :${moveMessage}`);
  }
  commandManager.addCommand("move", (message) => {
    console.log("THE MESSAGE", message);
    if (!isSentByStreamer(message)) return;
    let updateInterval = message.command.botCommandParams
      ? parseInt(message.command.botCommandParams) * 1000 * 60
      : defaultMoveInterval;

    if (moveInterval === updateInterval) return;
    if (updateInterval < 60000 || updateInterval > 3600000) return;
    moveInterval = updateInterval;
    console.log("THIS IS THE MOVEINTERVAL", moveInterval);

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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
ircClient.connect("ws://irc-ws.chat.twitch.tv:80");
eventSubClient.connect("wss://eventsub.wss.twitch.tv/ws");
