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
let songs;
const parent = document.querySelector('body');
socket.onmessage = function (event) {
  try {
    songs = JSON.parse(event.data);
    document.querySelector('body').innerHTML = '';
    songs.forEach(song => {
      addSongCard(song);
    });
    console.log({songs});
  } catch (error) {
    console.error(error);
  }
};
function e(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);

  Object.keys(attributes).forEach((key) => {
    element.setAttribute(key, attributes[key]);
  });

  children.forEach((child) => {
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  return element;
}


function addSongCard(data) {
  const card = e("div", { class: "valTitle" }, e("p", {}, data.title));
  parent.appendChild(card);
}
