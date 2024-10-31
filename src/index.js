import authInfo from "./auth.json" assert { type: 'json' }; // eslint-disable-line
import {writeFileSync } from 'node:fs';
import websocket from "websocket";
import http from 'http';
import { CommandManager } from "./commandManager.js";
import { createNewAuthToken, createFollowSubscription } from './accessToken.js';
import { isSentByStreamer } from "./permissions.js";
import {
  durationSecsToHHMMSS,
  isValidURL,
  getVidInfo
} from "./helper.js";
import express from 'express';
const app = express()
const port = 3000
const { client: WebSocketClient, server: WebSocketServer } = websocket;
const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});
const IRC_TOKEN = `oauth:${authInfo.TWITCH_TOKEN}`
const commandManager = new CommandManager();
const ircClient = new WebSocketClient();
const eventSubClient = new WebSocketClient();
const nhanbotServer = new WebSocketServer({
  httpServer: server,
});
const moveMessage = "Get up and move, your body will thank you!";
const defaultMoveInterval = 60000 * 60 * 1; 
const clientsOverlay = [];
const chatSongQueue = [];
const nhanifyPlaylistId = 607;// Afro & Indigenous Lyrics
let nhanifySongQueue = await getNhanifyPlaylist(nhanifyPlaylistId);
const COOLDOWN_DURATION = 30 * 1000;
let IRC_connection;
let moveInterval = defaultMoveInterval;
let clientNhanify;
let lastSongRequestTime = new Date() - COOLDOWN_DURATION;
let song = null;

app.use(express.static('public'));
server.listen(8080, () => {
  console.log("Websocket server is listening on ws://localhost:8080");
});

nhanbotServer.on('request', (request) => {
  const connection = request.accept(null, request.origin);
  const whoami = request.resourceURL.search;
  if (whoami === "?whoami=overlay") {
    connection.sendUTF(JSON.stringify({nhanifySongQueue, chatSongQueue, song, state:"queue_on_load"}));
    clientsOverlay.push(connection);
  } else {
    if (clientNhanify) clientNhanify.close();
    clientNhanify = connection;
  }
  connection.on('message', async (message) => {
    if (message.type === 'utf8') {
      const data = JSON.parse(message.utf8Data);
      console.log({data, nhanifySongQueue});
      if ((data.type === "playerStateEnded"|| data.type === "playerStateStarted") && chatSongQueue.length !== 0) {
        song = chatSongQueue.shift();
        clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({chatSongQueue, song, state:"play_song"})));
        IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} : @${song.addedBy}, ${song.title} is now playing.`);
        clientNhanify.sendUTF(JSON.stringify({type: "chat", data: song}));
      } else if (data.type === "playerStateEnded"  && chatSongQueue.length === 0 && song){
        console.log("NHANIFY IDX LAST SONG ENDED", data.nhanifyIdx + 1);
        const nhanifySong = nhanifySongQueue[data.nhanifyIdx + 1];
        const updatedQueue = nhanifySongQueue.slice(data.nhanifyIdx + 2);
        clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state: "end_queue", song: nhanifySong, nhanifySongQueue: updatedQueue})));
        clientNhanify.sendUTF(JSON.stringify({type: "chat", data: null}));
        song = null;
      } else if (data.type === "playerStateStarted") {
        console.log({nhanifySongQueue});
        clientNhanify.sendUTF(JSON.stringify({type: "nhanify", data: nhanifySongQueue}));
      }else {
        const nhanifySong = nhanifySongQueue[data.nhanifyIdx + 1];
        const updatedQueue = nhanifySongQueue.slice(data.nhanifyIdx + 2);
        clientNhanify.sendUTF(JSON.stringify({type: "chat", data: null}));
        clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state: "nhanify_cur_song_play", song: nhanifySong, nhanifySongQueue: updatedQueue})));
      }
    }
  });
});

async function getNhanifyPlaylist(playlistId) {
  const response = await fetch(`https://www.nhanify.com/api/playlists/${playlistId}`);
  const playlist = await response.json();
  return playlist.songs.map(song => {
    return {title:song.title, videoId:song.videoId};
  });
}

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
                let data  = await createNewAuthToken();
                authInfo.TWITCH_TOKEN = data.access_token;
                authInfo.REFRESH_TWITCH_TOKEN = data.refresh_token;
                //console.log(authInfo.TWITCH_TOKEN);
                //console.log({data});
                writeFileSync("./src/auth.json", JSON.stringify(authInfo));
                //IRC_connection.close();
                //connection.close();
                console.log("____________________GOT NEW TOKEN_______________");
                reauth(IRC_connection);
              }
            }else if (data.metadata.message_type === "session_reconnect") {
              oldConnection = connection 
              eventSubClient.connect(`${data.payload.session.reconnect_url}`);
              console.log(`Reconnected to ${data.payload.session.reconnect_url}`);
            }else if (data.metadata.message_type === "notification"){
              if (IRC_connection !== undefined) {
                IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} :${data.payload.event.user_name} has followed!`);
              }
            }
        }
    });
});

function reauth(connection) {
  connection.sendUTF(`PASS ${IRC_TOKEN}`);
  connection.sendUTF(`NICK ${authInfo.TWITCH_ACCOUNT}`);
  connection.sendUTF(`JOIN #${authInfo.TWITCH_CHANNEL}`);
}

//IRC client
ircClient.on("connectFailed", function (error) {
  console.log("Connect Error: " + error.toString());
});
ircClient.on("connect", function (connection) {
  console.log("WebSocket Client Connected");
  IRC_connection = connection;
  reauth(IRC_connection);
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
  connection.on("message", commandManager.onMessage.bind(commandManager)); ///the callback is set to new function of onMessage with the commandManager as the execution context
  //add commands to commandManger instance
  commandManager.addCommand("nhanify_pp_count", async(message) => {
    const response = await fetch("https://nhanify.com/api/playlists/public");
    const result = await response.json();
    connection.sendUTF(`PRIVMSG ${message.command.channel} : ${result.playlists.length} public playlists`)
  })
  commandManager.addCommand("song", async(message) => {
    const addedBy = message.source.nick;
    if (!song) {
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, no song currently playing in the queue.`);
    } else {
    connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${song.title} is currently playing. The video is at https://www.youtube.com/watch?v=${song.videoId}`);
    }
  });
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
              'Authorization': `Bearer ${authInfo.NHANIFY_API_KEY}`,
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
    const vidInfo = await getVidInfo(url, authInfo.YT_API_KEY);
    if (!vidInfo) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This video id is invalid.`);
      return;
    }

    if (vidInfo.durationSecs > 600){
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${vidInfo.title} is over the 10 minutes duration limit.`);
      return;
    }
    lastSongRequestTime = new Date();
    chatSongQueue.push({
      title: vidInfo.title,
      videoId: vidInfo.videoId,
      duration: durationSecsToHHMMSS(vidInfo.durationSecs),
      addedBy,
    });
     
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({chatSongQueue, song, state:"add_song"})));
    console.log({chatSongQueue, song});
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

  commandManager.addCommand("commands", (message) => {
    connection.sendUTF(`PRIVMSG ${message.command.channel} : !sr<youtubeurl>, !song`);
  });
  // Set a timer to post future 'move' messages. This timer can be
  // reset if the user passes, !move [minutes], in chat.
  let intervalObj = setInterval(moveCommandAction, moveInterval);
  function moveCommandAction() {
    connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} :${moveMessage}`);
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
    connection.sendUTF(`PART ${message.command.channel}`);
    connection.close();
  });

  commandManager.addCommand("github", (message) => {
    connection.sendUTF(
      `PRIVMSG ${message.command.channel} : Nhan's github: https://github.com/nonbots`
    );
  });

 commandManager.addCommand("discord", (message) => {
    connection.sendUTF(
      `PRIVMSG ${message.command.channel} : discord community: https://discord.gg/ku8vVEmuJY`
    );
  });

  commandManager.addCommand("youtube", (message) => {
    connection.sendUTF(
      `PRIVMSG ${message.command.channel} : cooking channel: www.youtube.com/@nhancooks`
    );
  });

});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
ircClient.connect("ws://irc-ws.chat.twitch.tv:80");
eventSubClient.connect("wss://eventsub.wss.twitch.tv/ws");
