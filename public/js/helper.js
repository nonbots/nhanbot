function endChatQueueHandler(curSongCard, songsDiv) {
  console.log("IN END_QUEUE", {songsDiv});
  curSongCard.innerHTML = '';
  curSongCard.setAttribute("style", "padding:0rem");
  nhanifyQueue.forEach(song => addSongCard(song, "songCard", songsDiv));
}
 function addSongHandler(chatSongQueue) {
  //console.log({state});
  const cooldown = document.getElementsByClassName("cooldown")[0];
  const text = document.getElementById("titleDisc");
  let counter = 30;
  const counterP = document.getElementById("counter");
  counterP.style.visibility = "visible";
  console.log({counter});
  const countInterval = setInterval(() => {
    counter--;
    counterP.textContent = counter;
    if (counter <= 0) {
      text.style.visibility = "visible";
      counterP.style.visibility = "hidden";
      clearInterval(countInterval);
    }
  }, 1000);
  console.log({text});
  text.style.visibility = 'hidden';
  cooldown.style.animation = 'none';
  cooldown.offsetWidth;
  cooldown.style.backgroundColor = 'red';
  cooldown.style.animation = 'roundtime calc(var(--duration) * 1s) linear forwards';
  songsDiv.innerHTML = '';
  if (chatSongQueue) chatSongQueue.forEach(song => addSongCard(song, "songCard", songsDiv));
}
 function playSongHandler(chatSongQueue, song, curSongCard, songsDiv) {
  curSongCard.innerHTML = '';
  if (song) {
    curSongCard.appendChild(curSongImg);
    curSongCard.setAttribute("style", "padding:.5rem");
    addSongCard(song, "curSongCardDisc", curSongCard);
    document.querySelector('.curSongCard .curSongCardDisc p').textContent = song.title;
  }
  songsDiv.innerHTML = '';
  if (chatSongQueue) chatSongQueue.forEach(song => addSongCard(song, "songCard", songsDiv));
}
