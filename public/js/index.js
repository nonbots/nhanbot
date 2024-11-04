var tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName("script")[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
var player;
const socket = new WebSocket("ws://localhost:8080/?whoami=overlay");
socket.onopen = function (_event) {
  console.log("WebSocket connection opened.");
};
socket.onclose = function (event) {
  console.log("WebSocket connection closed:", event);
};
socket.onerror = function (error) {
  console.error("WebSocket error:", error);
};
const songsDiv = document.getElementsByClassName('songsDiv')[0];
const curSongCard = document.getElementsByClassName('curSongCard')[0];
const curSongImg = document.createElement('img');
let nhanifyQueueLength;
let nhanifyQueueTitle;
let nhanifyQueueCreatorName;
curSongImg.setAttribute("src", "../img/play.png");
curSongImg.setAttribute("alt", "Playing");
socket.onmessage = function (event) {
  try {
    const {queueTitle, queueCreatorName, queueLength, nhanifyQueue, chatQueue, song, state} = JSON.parse(event.data);
    switch (state) {
      case "queue_on_load": 
        nhanifyQueueLength = queueLength;
        nhanifyQueueTitle = queueTitle;
        nhanifyQueueCreatorName = queueCreatorName;
        break;
      case "end_queue": 
        endChatQueueHandler("Nhanify Queue",song, nhanifyQueue, songsDiv, nhanifyQueueCreatorName, nhanifyQueueTitle);
        playNhanifySong(song);
        break;
      case "add_song": 
        addSongHandler(chatQueue);
        break;
      case "play_song": // play song from chat 
        playSongHandler("Chat Queue", chatQueue, song, curSongCard, songsDiv);
        playChatSong(song);
        break;
      case "nhanify_cur_song_play": 
        playSongHandler("Nhanify Queue", nhanifyQueue, song, curSongCard, songsDiv, nhanifyQueueCreatorName, nhanifyQueueTitle);
        playNhanifySong(song);
        break;
    }
  } catch (error) {
    console.error(error);
  }
};

function e(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  Object.keys(attributes).forEach(key => element.setAttribute(key, attributes[key]));
  children.forEach((child) => {
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  return element;
}

function addSongCard(song, className, parent) {
  const card = e("div", { class: className }, e("p", {}, song.title));
  parent.appendChild(card);
}

// eslint-disable-next-line no-unused-vars
function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    height: "auto",
    width: "100%",
    playerVars: {
      playsinline: 1,
      enablejsapi: 1,
      loop: 1,
      autoplay: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

function onPlayerReady(event) {
    //  event.target.playVideo();
    console.log("PLAYER STARTED");
    socket.send(JSON.stringify({ type: "playerStateStarted"}));
  }

function onPlayerStateChange(event) {
 if (event.data == YT.PlayerState.ENDED) {
    socket.send(JSON.stringify({ type: "playerStateEnded"}));
  }
}

function playChatSong(song) {
  player.loadVideoById(song.videoId);
}

function playNhanifySong(song) {
  player.loadVideoById(song.videoId);
}
