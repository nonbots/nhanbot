import authInfo from "./auth.json" with { type: 'json' }; // eslint-disable-line
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
const chatQueue = [];
const nhanifyPlaylists = await getNhanifyPublicPlaylists();
const nhanifyPlaylistsLength = nhanifyPlaylists.length;
let nhanifyPlaylistIdx = 0;
let nhanifyQueueIdx = 0;
let nhanifyQueue;
let nhanifyQueueLength;
do {
  nhanifyQueue = await getNhanifyPlaylist(nhanifyPlaylists[nhanifyPlaylistIdx].id);
  nhanifyQueueLength = nhanifyQueue.songs.length;
}while (nhanifyQueue.songs.length === 0); 
const COOLDOWN_DURATION = 30 * 1000;
let IRC_connection;
let moveInterval = defaultMoveInterval;
let lastSongRequestTime = new Date() - COOLDOWN_DURATION;
let song = null;
let isSong = false;
app.use(express.static('public'));

async function getNhanifyPublicPlaylists() {
  const response = await fetch(`https://www.nhanify.com/api/playlists/public`);
  const result = await response.json();
  const playlists =  result.playlists.reduce((accum,playlist) => {
    if (playlist.songCount > 0) {
      accum.push(playlist);
    }
    return accum;
  }, []);
  return shuffleArray(playlists);
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; // Swap elements
  }
  return arr;
}
nhanbotServer.on('request', (request) => {
  const connection = request.accept(null, request.origin);
  const whoami = request.resourceURL.search;
  if (whoami === "?whoami=overlay") {
    connection.sendUTF(JSON.stringify({ queueLength: nhanifyPlaylists[nhanifyPlaylistIdx].songCount, queueCreatorName: nhanifyPlaylists[nhanifyPlaylistIdx].creator.username, queueTitle: nhanifyQueue.title, state:"queue_on_load"}));
    clientsOverlay.push(connection);
  } 

  connection.on('message', async (message) => {
    if (message.type !== 'utf8') return;
    const data = JSON.parse(message.utf8Data);

    if (data.type  === "paused_song") {
      IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} : @${authInfo.TWITCH_CHANNEL}, music player has paused.`);
      return;
    }
    
    if (data.type  === "resumed_song") {
      IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} : @${authInfo.TWITCH_CHANNEL}, music player has resumed.`);
      return;
    }
    // when there are songs on the chat queue and the previous has ended or the player has just started
    const isNotEmptyQueueOnSongChange = (data.type === "playerStateEnded"|| data.type === "playerStateStarted") && chatQueue.length !== 0;
    if (isNotEmptyQueueOnSongChange) {
      playChatQueue();
      return;
    }
    
    // when there are no songs on the chat queue and the last song is done playing
    const isChatQueueDone = data.type === "playerStateEnded"  && chatQueue.length === 0 && isSong;
    if (isChatQueueDone) {
      const nhanifySong = nhanifyQueue.songs[nhanifyQueueIdx];
      song = nhanifySong;
      const updatedQueue = nhanifyQueue.songs.slice(nhanifyQueueIdx + 1);
      nhanifyQueueIdx = (nhanifyQueueIdx === nhanifyQueueLength - 1) ? 0 : nhanifyQueueIdx += 1;
      if (nhanifyQueueIdx === 0) {
        nhanifyQueue = await getNhanifyPlaylist(nhanifyPlaylists[nhanifyPlaylistIdx].id);
        nhanifyPlaylistIdx = (nhanifyPlaylistIdx === nhanifyPlaylistsLength - 1) ? 0 : nhanifyPlaylistIdx += 1;
      }
      clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({type: "chat", data: null, state: "end_queue", song: nhanifySong, nhanifyQueue: updatedQueue})));
      isSong = false;
      return;
    }
    
    // when there are no songs in the chat queue
    await playNhanifyQueue();
  });
});

function playChatQueue() {
  song = chatQueue.shift();
  isSong = (song);
  clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({chatQueue, song, state:"play_song"})));
  IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} : @${song.addedBy}, ${song.title} is now playing.`);
}

async function playNhanifyQueue() {
  song = nhanifyQueue.songs[nhanifyQueueIdx];
  const updatedQueue = nhanifyQueue.songs.slice(nhanifyQueueIdx + 1);
  clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({type: "chat", data: null, state: "nhanify_cur_song_play", song , nhanifyQueue: updatedQueue})));
  nhanifyQueueIdx = (nhanifyQueueIdx === nhanifyQueueLength - 1) ? 0 : nhanifyQueueIdx += 1;
  if (nhanifyQueueIdx === 0) {
    do {
      nhanifyPlaylistIdx = (nhanifyPlaylistIdx === nhanifyPlaylistsLength - 1) ? 0 : nhanifyPlaylistIdx += 1;
      nhanifyQueue = await getNhanifyPlaylist(nhanifyPlaylists[nhanifyPlaylistIdx].id);
    }while (nhanifyQueue.songs.length === 0); 
    nhanifyQueueLength = nhanifyQueue.songs.length;
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({ queueLength: nhanifyPlaylists[nhanifyPlaylistIdx].songCount, queueCreatorName: nhanifyPlaylists[nhanifyPlaylistIdx].creator.username, queueTitle: nhanifyQueue.title, state:"queue_on_load"})));
  }
}

async function getNhanifyPlaylist(playlistId) {
  const response = await fetch(`https://www.nhanify.com/api/playlists/${playlistId}`);
  const playlist = await response.json();
  if (playlist.error === "404") {
    IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} : Playlist does not exist.`);
    return;
  }
  const songs = playlist.songs.reduce((accum, song) => {
    if (song.durationSec <= 600) accum.push({title:song.title, videoId:song.videoId});
    return accum;
  }, []);
  return {title: playlist.title, creatorId: playlist.creatorId, songs};
}

async function getCreatorName(creatorId) {
  const response = await fetch(`https://www.nhanify.com/api/users/${creatorId}`);
  const user = await response.json();
  return user.username;
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

  commandManager.addCommand("skipSong", async(message) => {
    if (!isSentByStreamer(message)) return;
    if (chatQueue.length === 0) {
      nhanifyPlaylistIdx = (nhanifyPlaylistIdx === nhanifyPlaylistsLength - 1) ? 0 : nhanifyPlaylistIdx += 1;
      await playNhanifyQueue();
      return;
    } 
    playChatQueue();
  });

  commandManager.addCommand("pause", async(message) => {
    if (!isSentByStreamer(message)) return;
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state:"pause_song"})));
  });

  commandManager.addCommand("resume", async(message) => {
    if (!isSentByStreamer(message)) return;
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state:"resume_song"})));
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
    chatQueue.push({
      title: vidInfo.title,
      videoId: vidInfo.videoId,
      duration: durationSecsToHHMMSS(vidInfo.durationSecs),
      addedBy,
    });
     
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({chatQueue, song, state:"add_song"})));
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
    if (!isSentByStreamer(message)) return;
    let updateInterval = message.command.botCommandParams
      ? parseInt(message.command.botCommandParams) * 1000 * 60
      : defaultMoveInterval;

    if (moveInterval === updateInterval) return;
    if (updateInterval < 60000 || updateInterval > 3600000) return;
    moveInterval = updateInterval;

    clearInterval(intervalObj);
    intervalObj = null;
    intervalObj = setInterval(moveCommandAction, moveInterval);
  });

  commandManager.addCommand("addsong", async(message) => {
    await fetch(`http://localhost:${authInfo.WEB_SERVER_PORT}/playlist/add`, {
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

server.listen(authInfo.SOCKET_PORT, () => {
  console.log(`Websocket server is listening on ws://localhost:${authInfo.SOCKET_PORT}`);
});
app.listen(authInfo.WEB_SERVER_PORT, () => {
  console.log(`Example app listening on ${authInfo.WEB_SERVER_PORT} `);
})
ircClient.connect("ws://irc-ws.chat.twitch.tv:80");
eventSubClient.connect("wss://eventsub.wss.twitch.tv/ws");
