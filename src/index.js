import authInfo from "./auth.json" with { type: 'json' }; // eslint-disable-line
import commands from "./command.json" with { type: 'json' }; // eslint-disable-line
import {writeFileSync } from 'node:fs';
import websocket from "websocket";
import http from 'http';
import { CommandManager } from "./commandManager.js";
import { createNewAuthToken, createSubscription, refreshToken } from './accessToken.js';
import { isSentByStreamer } from "./permissions.js";
import {
  skipSong,
  addSavedVideoId,
  isVideoIdSaved,
  getNextNhanifyPublicPlaylist,
  isCurSong,
  getNhanifyPlaylistSong,
  getChatPlaylistSong,
  playChatQueue,
  playNhanifyQueue,
  getNhanifyPublicPlaylists,
  getNhanifyPlaylist,
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
const IRC_TOKEN = `oauth:${authInfo.BOT_TWITCH_TOKEN}`
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
let song = null;
let isSong = false;
let IRC_connection;
const nhanify = {
  playlists: await getNhanifyPublicPlaylists(),
  playlistIdx: 0,
  queueIdx: 0,
}
console.log(nhanify.playlists);
nhanify.playlistsLength = nhanify.playlists.length;
do {
  nhanify.queue = await getNhanifyPlaylist(nhanify.playlists[nhanify.playlistIdx].id, IRC_connection);
  nhanify.queueLength = nhanify.queue.songs.length;
}while (nhanify.queue.songs.length === 0); 
const COOLDOWN_DURATION = 30 * 1000;
const savedVideoIds = {};
let moveInterval = defaultMoveInterval;
let lastSongRequestTime = new Date() - COOLDOWN_DURATION;
app.use(express.static('public'));

nhanbotServer.on('request', (request) => {
  const connection = request.accept(null, request.origin);
  const whoami = request.resourceURL.search;
  if (whoami === "?whoami=overlay") {
    connection.sendUTF(JSON.stringify({ queueLength: nhanify.playlists[nhanify.playlistIdx].songCount, queueCreatorName: nhanify.playlists[nhanify.playlistIdx].creator.username, queueTitle: nhanify.queue.title, state:"queue_on_load"}));
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
      console.log("Play song in chat", {chatQueue});
      song = getChatPlaylistSong(chatQueue);
      isSong = isCurSong(song);
      playChatQueue(song, chatQueue, clientsOverlay, IRC_connection);
      return;
    }
    
    // when there are no songs on the chat queue and the last song is done playing
    const isChatQueueDone = data.type === "playerStateEnded"  && chatQueue.length === 0 && isSong;
    if (isChatQueueDone) {
      const nhanifySong = nhanify.queue.songs[nhanify.queueIdx];
      song = nhanifySong;
      const updatedQueue = nhanify.queue.songs.slice(nhanify.queueIdx + 1);
      nhanify.queueIdx = (nhanify.queueIdx === nhanify.queueLength - 1) ? 0 : nhanify.queueIdx += 1;
      if (nhanify.queueIdx === 0) {
        nhanify.queue = await getNhanifyPlaylist(nhanify.playlists[nhanify.playlistIdx].id);
        nhanify.playlistIdx = (nhanify.playlistIdx === nhanify.playlistsLength - 1) ? 0 : nhanify.playlistIdx += 1;
      }
      clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({type: "chat", data: null, state: "end_queue", song: nhanifySong, nhanifyQueue: updatedQueue})));
      isSong = false;
      return;
    }
    
    // when there are no songs in the chat queue
    song = getNhanifyPlaylistSong(nhanify.queue, nhanify.queueIdx); 
    await playNhanifyQueue(nhanify,song, clientsOverlay);
    if (nhanify.queueIdx === 0) {
      await getNextNhanifyPublicPlaylist(nhanify, clientsOverlay);
    }
  });
});


eventSubClient.on("close", (code, description) => {
    console.log(`Websocket ircClient disconnected: ${code} - ${description}`);
});

//eventSubClient.onerror(evt);
eventSubClient.on("connect", async function (connection) {
  console.log("____________________EventSub Client Connected________________")
    let oldConnection;
    let followerEvent;
    let skipSongRedemptionEvent;

    connection.on("message", async (message) => {
    if (message.type !== 'utf8') return;
    let data = JSON.parse(message.utf8Data);
    if (data.metadata.message_type === "session_welcome" ) {
      if (oldConnection !== undefined) oldConnection.close();
      console.log(`close description: ${connection.closeDescription}`);
      const sessionId = data.payload.session.id;
      followerEvent = await createSubscription(sessionId, "channel.follow", '2');
      skipSongRedemptionEvent = await createSubscription(sessionId, "channel.channel_points_custom_reward_redemption.add", '1');
      console.log({followerEvent, skipSongRedemptionEvent });
    }
    if (data.metadata.message_type === "session_welcome" && followerEvent.message === 'Invalid OAuth token') {
      console.log("IN INVALID OAUTH TOKEN");
      refreshToken(authInfo.REFRESH_TWITCH_TOKEN, "broadcaster");
      console.log("____________________GOT NEW BROADCASTER TOKEN_______________");
      //IRC_connection.close();
      ///ircClient.connect("ws://irc-ws.chat.twitch.tv:80");
      return;
    } 
      if (data.metadata.message_type === "session_reconnect") {
      oldConnection = connection 
      eventSubClient.connect(`${data.payload.session.reconnect_url}`);
      console.log(`Reconnected to ${data.payload.session.reconnect_url}`);
      return;
    }
    if (IRC_connection !== undefined && data.metadata.message_type === "notification"){
      if (data.metadata.subscription_type === "channel.follow") {
        IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} :${data.payload.event.user_name} has followed!`);
      }
      if (data.metadata.subscription_type === "channel.channel_points_custom_reward_redemption.add") {
        const title = data.payload.event.reward.title;
        if ( title  === "Skip Song") {
        skipSong(chatQueue, nhanify, clientsOverlay, song, isSong, IRC_connection );
        IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} :${data.payload.event.user_name}, redeemed the ${title} for ${data.payload.event.reward.cost}.`);
        }
        if ( title  === "Skip Playlist") {
        await getNextNhanifyPublicPlaylist(nhanify, clientsOverlay);
        song = getNhanifyPlaylistSong(nhanify.queue, nhanify.queueIdx);
        await playNhanifyQueue(nhanify, song, clientsOverlay);
        IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} :${data.payload.event.user_name}, redeemed the ${title} for ${data.payload.event.reward.cost}.`);
        }
      }
    }
  });
});

//IRC client
ircClient.on("connectFailed", function (error) {
  console.log("Connect Error: " + error.toString());
});

ircClient.on("connect", function (connection) {
  console.log("WebSocket Client Connected");
  IRC_connection = connection;
  connection.sendUTF(`PASS ${IRC_TOKEN}`);
  connection.sendUTF(`NICK ${authInfo.TWITCH_ACCOUNT}`);//nhanifybot
  connection.sendUTF(`JOIN #${authInfo.TWITCH_CHANNEL}`);//nhancodes
 // to keep the connect by responsing back with a PONG
  connection.on("message", async function(message) {
      if (message.type === 'utf8') {
        console.log(message.utf8Data);
        if (message.utf8Data.startsWith('PING :tmi.twitch.tv')) {
          connection.sendUTF('PONG :tmi.twitch.tv');
        } 
        if (message.utf8Data.includes(":tmi.twitch.tv NOTICE * :Login authentication failed")) {
          refreshToken(authInfo.BOT_REFRESH_TWITCH_TOKEN, "bot");
          console.log("____GOT NEW BOT TOKEN______");
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
  commandManager.addCommand(commands.song, async(message) => {
    const addedBy = message.source.nick;
    if (!song) {
        connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, no song currently playing in the queue.`);
    } else {
    connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${song.title} is currently playing. The video is at https://www.youtube.com/watch?v=${song.videoId}`);
    }
  });

  commandManager.addCommand(commands.skipPlaylist, async(message) => {
    if (!isSentByStreamer(message)) return;
    await getNextNhanifyPublicPlaylist(nhanify, clientsOverlay);
    song = getNhanifyPlaylistSong(nhanify.queue, nhanify.queueIdx);
    await playNhanifyQueue(nhanify, song, clientsOverlay);
  });

  commandManager.addCommand(commands.skipSong, async(message) => {
    if (!isSentByStreamer(message)) return;
      skipSong(chatQueue, nhanify, clientsOverlay, song, isSong, IRC_connection );
  });

  commandManager.addCommand(commands.pause, async(message) => {
    if (!isSentByStreamer(message)) return;
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state:"pause_song"})));
  });

  commandManager.addCommand(commands.resume, async(message) => {
    if (!isSentByStreamer(message)) return;
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({state:"resume_song"})));
  });

  commandManager.addCommand(commands.playlist, async(message) => {
    const chatter = message.source.nick;
    console.log("CHAT QUEUE LENGTH", chatQueue.length);
    if (song.playlistType !== "chat") {
      console.log("CURRENT PLAYLIST", nhanify.playlists[nhanify.playlistIdx].id);
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${chatter}, the playlist is found at https://www.nhanify.com/anon/public/playlists/1/playlist/1/${nhanify.playlists[nhanify.playlistIdx].id}.`);
    } else {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${chatter}, you are listening to chat's playlist.`);
    }
  });

 commandManager.addCommand(commands.nhanify, (message) => {
    connection.sendUTF(
      `PRIVMSG ${message.command.channel} : Learn what Nhanify is about here: https://www.youtube.com/shorts/d6Uwh81MoKM`
    );
  });
  

  commandManager.addCommand(commands.save, async(message) => {
    const addedBy = message.source.nick;
    if (isVideoIdSaved(addedBy, savedVideoIds, song.videoId)) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This song has already been added to your "Saved Songs" playlist.`);
      return;
    };
    addSavedVideoId(savedVideoIds,song.videoId, addedBy);
    try {  
      let payload = {
        url: `https://www.youtube.com/watch?v=${song.videoId}`,
        addedBy,
      }
      const response = await fetch("https://www.nhanify.com/api/playlist/addSong", {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${authInfo.NHANIFY_API_KEY}`,
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      });
      const result = await response.json();
      console.log("_______________SAVED SONG____________", {result});
      switch(result.msg) {
        case 'success':
          connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${result.song.title} was added to your "Saved Song" playlist. You can find the playlist at https://www.nhanify.com/your/playlists/1/playlist/1/${result.song.playlist_id}`);
          break;
        case 'no_user_account':
          connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, Create an account at https://www.nhanify.com.`);
          break;
        case 'playlist_max_limit':
          connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, The playlist has reached it's max number of songs.`);
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
  });

  commandManager.addCommand(commands.sr, async(message) => {
    const addedBy = message.source.nick;
    const timePassed = new Date() - lastSongRequestTime;
    if (timePassed < COOLDOWN_DURATION) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${Math.floor(COOLDOWN_DURATION / 1000) -  Math.floor(timePassed / 1000)} seconds more of cooldown.`);
      return;
    }
    const url = message.command.botCommandParams;
    if (!isValidURL(url)) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This url is invalid.`);
      return;
    }
    const vidInfo = await getVidInfo(url, authInfo.YT_API_KEY);
    console.log(vidInfo);
    if (!vidInfo) {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This url is invalid.`);
      return;
    }
    if (vidInfo.error === "liveStreamRestriction") {
      connection.sendUTF(`privmsg ${message.command.channel} : @${addedBy}, Live streams can't be added, :(.`);
      return;
    }
    if (vidInfo.error === "agerestriction") {
      connection.sendUTF(`privmsg ${message.command.channel} : @${addedBy}, This video can't be added due to age restriction, :(.`);
      return;
    }
    if (vidInfo.error === "notEmbeddable") {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This video can't be added because it can't be embedded to the Youtube player, :(.`);
      return;
    }
    if (vidInfo.error === "regionRestriction") {
      connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, This video is restricted in the US, :(.`);
      return;
    }
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
      playlistType: "chat",
    });
     
    clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({chatQueue, song, state:"add_song"})));
    connection.sendUTF(`PRIVMSG ${message.command.channel} : @${addedBy}, ${vidInfo.title} was added to the queue.`);
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

 commandManager.addCommand("internet", (message) => {
    connection.sendUTF(
      `PRIVMSG ${message.command.channel} : Tech guy came back this morning. Checked the house and climbed the electrical pole. Said we doesn't see anything wrong but said the neighbors has also been complaining and the the engineer will come later in the week and do something with the pole LUL`
    );
  });

 commandManager.addCommand("video", (message) => {
    connection.sendUTF(
      `PRIVMSG ${message.command.channel} : subscribe & like: https://youtube.com/shorts/-q5_7QtPhA8?si=U9EqUJxH7dGoPAEm`
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
