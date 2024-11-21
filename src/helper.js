import authInfo from "./auth.json" with { type: 'json' }; // eslint-disable-line

export function addSavedVideoId(savedVideoIds,addedVideoId, addedBy) {
  if(addedBy in savedVideoIds) {
    savedVideoIds[addedBy].push(addedVideoId);
  } else {
    savedVideoIds[addedBy] = [addedVideoId];
  }
}
export function isVideoIdSaved (addedBy, savedVideoIds, addedVideoId) {
  if (!(addedBy in savedVideoIds)) return false;
  const videoId = savedVideoIds[addedBy].find(videoId => addedVideoId === videoId);
  if (videoId === undefined) return false;
  return true;
}
export function playChatQueue(song, chatQueue, clientsOverlay, IRC_connection) {
  clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({chatQueue, song, state:"play_song"})));
  IRC_connection.sendUTF(`PRIVMSG #${authInfo.TWITCH_CHANNEL} : @${song.addedBy}, ${song.title} is now playing.`);
}

export async function playNhanifyQueue(nhanify, song, clientsOverlay) {
  const updatedQueue = nhanify.queue.songs.slice(nhanify.queueIdx + 1);
  nhanify.queueIdx = (nhanify.queueIdx === nhanify.queueLength - 1) ? 0 : nhanify.queueIdx += 1;
  clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({type: "chat", data: null, state: "nhanify_cur_song_play", song , nhanifyQueue: updatedQueue})));
}

export async function getNextNhanifyPublicPlaylist(nhanify, clientsOverlay) {
  console.log("IN GET NEXT PLAYLIST");
  do {
    nhanify.playlistIdx = (nhanify.playlistIdx === nhanify.playlistsLength - 1) ? 0 : nhanify.playlistIdx += 1;
    nhanify.queue = await getNhanifyPlaylist(nhanify.playlists[nhanify.playlistIdx].id);
  }while (nhanify.queue.songs.length === 0); 
  console.log("THE NEXT PLAYLIST", nhanify.queue);
  nhanify.queueIdx = 0;
  nhanify.queueLength = nhanify.queue.songs.length;
  clientsOverlay.forEach(client => client.sendUTF(JSON.stringify({ queueLength: nhanify.playlists[nhanify.playlistIdx].songCount, queueCreatorName: nhanify.playlists[nhanify.playlistIdx].creator.username, queueTitle: nhanify.queue.title, state:"queue_on_load"})));
}
export function getChatPlaylistSong(playlist) {
  console.log({playlist});
  return playlist.shift();
}
export function isCurSong(song) {
  return (song);
}
export function getNhanifyPlaylistSong(playlist, idx) {
  console.log({playlist});
  return playlist.songs[idx];
}
export async function getNhanifyPlaylist(playlistId, IRC_connection) {
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
export async function getNhanifyPublicPlaylists() {
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
/**
 * Is the URL input a valid url by hostname, pathname and is absolute.
 * @params {String} url - The url input.
 * @returns {boolean}
 */export function isValidURL(URLInput) {
  try {
    const url = new URL(URLInput);
    const protocol = url.protocol;
    const hostname = url.hostname;
    const pathname = url.pathname;
    const videoId = url.searchParams.get("v");
    if (protocol === "https:" || protocol === "http:") {
      if (
        (hostname === "www.youtube.com" && pathname === "/watch" && videoId) ||
        (hostname === "youtu.be" && pathname) ||
        (hostname === "m.youtube.com" && pathname === "/watch" && videoId)
      )
        return true;
    }
    return false;
  } catch (error) {
    console.error(error);
    return false;
  }
}
export async function getVidInfo(vidUrl, YT_API_KEY) {
  const videoId = parseURL(vidUrl);
  return await getVidInfoByVidId(videoId, YT_API_KEY);
}

async function getVidInfoByVidId(videoId, YT_API_KEY) {
  const headers = { headers: { Accept: "application/json" } };
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({
    key: YT_API_KEY,
    id: videoId,
    part: ["liveStreamingDetails", "snippet", "contentDetails", "status"],
  }).toString();
  const response = await fetch(url, headers);
  const result = await response.json();
  if (!result.items[0]) return null;
  const regionRestriction = result.items[0].contentDetails.regionRestriction;
  const ageRestriction  = result.items[0].contentDetails.contentRating.ytRating;
  const liveStream = result.items[0].liveStreamingDetails;
  if (liveStream) {
    return  { error: "liveStreamRestriction" };
  }
  if (ageRestriction  && ageRestriction === "ytAgeRestricted") {
    return { error: "ageRestriction" };
  }
  if (regionRestriction) {
    if ((regionRestriction.allowed && !regionRestriction.allowed.includes('US')) || (regionRestriction.blocked && regionRestriction.blocked.includes('US'))) {
      return { error: "regionRestriction" };
    }
  }
  if (result.items[0].status.embeddable === false) {
    return { error: "notEmbeddable" };
  }
  const duration = convertDuration(result.items[0].contentDetails.duration);
  console.log("CONTENTDETAILS", result.items[0].contentDetails);
  const durationSecs = convertToSec(duration);
  const vidInfo = {
    title: result.items[0].snippet.title,
    videoId: result.items[0].id,
    durationSecs,
  };
  return vidInfo;
}

function parseURL(URLInput) {
  if (URLInput.includes("youtu.be")) {
    let hostPath = URLInput.split("?")[0];
    let path = hostPath.split("/");
    return path[path.length - 1];
  }
  let queryStr = URLInput.split("?")[1];
  let params = queryStr.split("&");
  let videoIdParam = getVideoIdParams(params);
  return videoIdParam.substring(2);
}
/**
 * Gets the 'v' parameter
 * @params {Array} - The collection of parameter strings.
 * @returns {String} - A 'v' string parameter.
 */
function getVideoIdParams(params) {
  for (let i = 0; i < params.length; i += 1) {
    let param = params[i];
    if (param.includes("v=")) return params[i];
  }
}
export function durationSecsToHHMMSS(secs) {
  const hrs = Math.floor(secs / 3600);
  secs -= hrs * 3600;
  const mins = Math.floor(secs / 60);
  secs -= mins * 60;
  const formatTime = `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return formatTime;
}
function convertDuration(duration) {
  const numStrs = ["00", "00", "00"];
  const durationStr = duration.split("T")[1];
  let numStr = "";

  durationStr.split("").forEach((char) => {
    if (!Number.isNaN(Number(char))) {
      numStr += char;
    } else {
      if (char === "H" && numStr.length === 1) numStrs[0] = "0" + numStr;
      if (char === "H" && numStr.length === 2) numStrs[0] = numStr;
      if (char === "M" && numStr.length === 1) numStrs[1] = "0" + numStr;
      if (char === "M" && numStr.length === 2) numStrs[1] = numStr;
      if (char === "S" && numStr.length === 1) numStrs[2] = "0" + numStr;
      if (char === "S" && numStr.length === 2) numStrs[2] = numStr;
      numStr = "";
    }
  });
  return numStrs.join(":");
  //input "12:04:23"
}

function convertToSec(duration) {
  //input "12:04:23"
  const numArr = duration.split(":").map((numStr) => Number(numStr));
  return (numArr[0] * 60 + numArr[1]) * 60 + numArr[2];
}
