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
curSongImg.setAttribute("src", "../img/play.png");
curSongImg.setAttribute("alt", "Playing");

socket.onmessage = function (event) {
  try {
    const {songQueue, song, state} = JSON.parse(event.data);
    if (state === "end_queue") {
      curSongCard.innerHTML = '';
      curSongCard.setAttribute("style", "padding:0rem");
    }
    curSongCard.innerHTML = '';
    if (song) {
      curSongCard.appendChild(curSongImg);
      curSongCard.setAttribute("style", "padding:.5rem");
      addSongCard(song, "songCard", curSongCard);
      document.querySelector('.curSongCard .songCard p').textContent = song.title;
    }
    songsDiv.innerHTML = '';
    if (songQueue) songQueue.forEach(song => addSongCard(song, "songCard", songsDiv));
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
