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
let nhanifyQueue;
curSongImg.setAttribute("src", "../img/play.png");
curSongImg.setAttribute("alt", "Playing");
socket.onmessage = function (event) {
  try {
    console.log(event.data);
    const {nhanifySongQueue, chatSongQueue, song, state} = JSON.parse(event.data);
    if(nhanifySongQueue) nhanifyQueue = nhanifySongQueue;
    console.log({state});
    switch (state) {
      case "end_queue": 
        endChatQueueHandler(curSongCard, songsDiv);
        break;
      case "add_song": 
        addSongHandler(chatSongQueue);
        break;
      case "play_song": 
        playSongHandler(chatSongQueue, song, curSongCard, songsDiv);
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
  console.log("CARD");
  parent.appendChild(card);
}
