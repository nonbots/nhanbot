function endChatQueueHandler(queueType, song, songQueue, songsDiv, nhanifyQueueCreatorName, nhanifyQueueTitle) {
  console.log("IN END_QUEUE", {songsDiv});
  document.getElementById('queue').textContent = queueType;
  document.getElementById('nhanifyDis').children[0].textContent = nhanifyQueueTitle;
  document.getElementById('nhanifyDis').children[1].textContent = nhanifyQueueCreatorName;
  document.querySelector('.curSongCard .curSongCardDisc p').textContent = song.title;
  songsDiv.innerHTML = '';
  songQueue.forEach(song => addSongCard(song, "songCard", songsDiv));
}
 function addSongHandler(chatSongQueue) {
  //console.log({state});
  const cooldown = document.getElementsByClassName("cooldown")[0];
  const text = document.getElementById("titleDisc");
  text.style.visibility = 'hidden';
  let counter = 30;
  const counterP = document.createElement('p');
  document.getElementsByClassName('queueTitle')[0].appendChild(counterP); 
  //counterP.textContent = counter;
  console.log({counter});
  const countInterval = setInterval(() => {
    counter--;
    counterP.textContent = counter;
    if (counter <= 0) {
      text.style.visibility = 'visible';
      counterP.remove();
      clearInterval(countInterval);
    }
  }, 1000);
  console.log({text});
  //text.style.visibility = 'hidden';
  cooldown.style.animation = 'none';
  cooldown.offsetWidth;
  cooldown.style.backgroundColor = 'red';
  cooldown.style.animation = 'roundtime calc(var(--duration) * 1s) linear forwards';
  songsDiv.innerHTML = '';
  if (chatSongQueue) chatSongQueue.forEach(song => addSongCard(song, "songCard", songsDiv));
}
 function playSongHandler(queueType, queue, song, curSongCard, songsDiv, queueCreatorName, queueTitle) {
  curSongCard.innerHTML = '';
  if (song) {
    document.getElementById('queue').textContent = queueType;
    if (queueType === "Nhanify Queue") {
      document.getElementById('nhanifyDis').children[0].textContent = queueTitle;
      document.getElementById('nhanifyDis').children[1].textContent = queueCreatorName;
    } else {
    document.getElementById('nhanifyDis').children[0].textContent = '';
    document.getElementById('nhanifyDis').children[1].textContent = '';
    }
    curSongCard.appendChild(curSongImg);
    curSongCard.setAttribute("style", "padding:.5rem");
    addSongCard(song, "curSongCardDisc", curSongCard);
    document.querySelector('.curSongCard .curSongCardDisc p').textContent = song.title;
  }
  songsDiv.innerHTML = '';
  if (queue) queue.forEach(song => addSongCard(song, "songCard", songsDiv));
}
