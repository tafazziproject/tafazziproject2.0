"use strict";

let allMp3Files = [];
let currentAudio = null;
let currentFile = null;
let messageTimeout = null;

// Home e Library hanno stati separati: i filtri della Library non toccano
// mai le categorie abilitate per la riproduzione casuale nella Home.
const homePlayback = {
  safe: true,
  unsafe: false
};

let libraryMode = "safe";

const button = document.querySelector("#playButton");
const playButtonText = document.querySelector("#play-button-text");
const pulseStage = document.querySelector("#pulse-stage");
const playStatus = document.querySelector("#play-status");

const audioList = document.querySelector("#audio-list");

const homeScreen = document.querySelector("#home-screen");
const libraryScreen = document.querySelector("#library-screen");

const homeTab = document.querySelector("#home-tab");
const libraryTab = document.querySelector("#library-tab");

const safeTab = document.querySelector("#safe-tab");
const nsfwTab = document.querySelector("#nsfw-tab");
const allTab = document.querySelector("#all-tab");

const librarySearch = document.querySelector("#library-search");
const libraryCount = document.querySelector("#library-count");

const homeSafeSwitch = document.querySelector("#home-safe-switch");
const homeUnsafeSwitch = document.querySelector("#home-unsafe-switch");


function randomIndex(length) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError("Lunghezza non valida.");
  }

  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    const range = 0x100000000;
    const limit = Math.floor(range / length) * length;

    do {
      crypto.getRandomValues(values);
    } while (values[0] >= limit);

    return values[0] % length;
  }

  return Math.floor(Math.random() * length);
}


async function refreshAudioLibrary() {
  if (!window.TafazziStore) {
    showTemporaryMessage("ARCHIVIO AUDIO NON DISPONIBILE");
    return;
  }

  try {
    allMp3Files = await window.TafazziStore.getLibrary();
    renderAudioList();
  } catch (error) {
    console.error(error);
    showTemporaryMessage("ERRORE NEL CARICAMENTO AUDIO");
  }
}


function showTemporaryMessage(message, duration = 2600) {
  window.clearTimeout(messageTimeout);

  if (!playStatus) return;

  playStatus.textContent = message;

  messageTimeout = window.setTimeout(() => {
    playStatus.textContent = "";
  }, duration);
}


function isAudioPlaying() {
  return Boolean(
    currentAudio &&
    !currentAudio.paused &&
    !currentAudio.ended
  );
}


function syncMainPlayButton() {
  const playing = isAudioPlaying();

  if (button) {
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute(
      "aria-label",
      playing ? "Ferma audio" : "Riproduci un audio casuale"
    );
  }

  if (pulseStage) {
    pulseStage.classList.toggle("is-playing", playing);
  }

  if (playButtonText) {
    playButtonText.textContent = playing ? "STOP" : "PLAY";
  }
}


function updatePlayingItem() {
  const playing = isAudioPlaying();

  document.querySelectorAll(".audio-item").forEach(item => {
    const isCurrent =
      playing &&
      item.dataset.path === currentFile?.path;

    item.classList.toggle("playing-item", isCurrent);
  });
}


function finishPlayback(message = "") {
  currentAudio = null;

  syncMainPlayButton();
  updatePlayingItem();

  if (message) {
    showTemporaryMessage(message);
  }
}


function stopAudio({
  resetTime = true,
  message = ""
} = {}) {
  if (!currentAudio) {
    syncMainPlayButton();
    return;
  }

  const audio = currentAudio;

  audio.pause();

  if (resetTime) {
    try {
      audio.currentTime = 0;
    } catch (_) {
      // Alcuni stream potrebbero non consentire il seek.
    }
  }

  currentAudio = null;

  syncMainPlayButton();
  updatePlayingItem();

  if (message) {
    showTemporaryMessage(message);
  }
}


function playAudio(
  file,
  audioData = allMp3Files.find(item => item.path === file)
) {
  if (!file) return;

  // Ferma qualsiasi audio già in riproduzione.
  stopAudio({
    resetTime: true
  });

  currentFile = audioData || {
    path: file,
    name: file.split("/").pop()
  };

  const audio = new Audio(file);

  currentAudio = audio;


  audio.addEventListener(
    "ended",
    () => {
      if (currentAudio !== audio) return;

      finishPlayback();
    },
    {
      once: true
    }
  );


  audio.addEventListener(
    "error",
    () => {
      if (currentAudio !== audio) return;

      finishPlayback("AUDIO NON DISPONIBILE");
    },
    {
      once: true
    }
  );


  const playPromise = audio.play();

  syncMainPlayButton();
  updatePlayingItem();


  if (
    playPromise &&
    typeof playPromise.catch === "function"
  ) {
    playPromise.catch(error => {
      console.error(error);

      if (currentAudio === audio) {
        finishPlayback(
          "IMPOSSIBILE RIPRODURRE L'AUDIO"
        );
      }
    });
  }
}


// ---------------------------------------------------------
// HOME
// SAFE e NOT SAFE sono due switch indipendenti.
// ---------------------------------------------------------

function matchesHomePlayback(audio) {
  if (audio.safe === false) {
    return homePlayback.unsafe;
  }

  return homePlayback.safe;
}


function playRandomMp3() {
  if (
    !homePlayback.safe &&
    !homePlayback.unsafe
  ) {
    showTemporaryMessage(
      "ATTIVA SAFE O NOT SAFE"
    );

    return;
  }

  const files =
    allMp3Files.filter(matchesHomePlayback);


  if (!files.length) {
    showTemporaryMessage(
      "NESSUN MP3 DISPONIBILE"
    );

    return;
  }

  const selectedFile =
    files[randomIndex(files.length)];

  playAudio(
    selectedFile.path,
    selectedFile
  );
}


function toggleMainPlayback() {
  if (isAudioPlaying()) {
    stopAudio();
    return;
  }

  playRandomMp3();
}


function syncHomeSwitch(
  buttonElement,
  enabled
) {
  if (!buttonElement) return;

  buttonElement.classList.toggle(
    "is-on",
    enabled
  );

  buttonElement.setAttribute(
    "aria-checked",
    String(enabled)
  );
}


function setHomeCategory(category) {
  if (!(category in homePlayback)) {
    return;
  }

  homePlayback[category] =
    !homePlayback[category];

  syncHomeSwitch(
    homeSafeSwitch,
    homePlayback.safe
  );

  syncHomeSwitch(
    homeUnsafeSwitch,
    homePlayback.unsafe
  );
}


// ---------------------------------------------------------
// LIBRARY
// Lo stato è completamente separato dalla Home.
// ---------------------------------------------------------

function matchesLibraryMode(audio) {
  if (libraryMode === "all") {
    return true;
  }

  if (libraryMode === "unsafe") {
    return audio.safe === false;
  }

  return audio.safe !== false;
}


function setLibraryMode(mode) {
  if (
    !["safe", "unsafe", "all"].includes(mode)
  ) {
    return;
  }

  libraryMode = mode;


  [safeTab, nsfwTab, allTab].forEach(tab => {
    if (!tab) return;

    tab.classList.toggle(
      "is-active",
      tab.dataset.mode === libraryMode
    );
  });


  renderAudioList();
}


// ---------------------------------------------------------
// ICONA PLAY LIBRARY
// ---------------------------------------------------------

function createPlayIcon() {
  const icon =
    document.createElement("span");

  icon.className = "audio-play-icon";

  icon.setAttribute(
    "aria-hidden",
    "true"
  );

  icon.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M8 5v14l11-7Z"></path>
    </svg>
  `;

  return icon;
}


// ---------------------------------------------------------
// RENDER LIBRARY
// ---------------------------------------------------------

function renderAudioList() {
  if (
    !audioList ||
    !librarySearch ||
    !libraryCount
  ) {
    return;
  }


  const query =
    librarySearch.value
      .trim()
      .toLowerCase();


  const files =
    allMp3Files.filter(audio => {
      const name =
        String(audio.name || "")
          .toLowerCase();

      return (
        matchesLibraryMode(audio) &&
        name.includes(query)
      );
    });


  audioList.replaceChildren();


  libraryCount.textContent =
    `${files.length} AUDIO`;


  if (!files.length) {
    const empty =
      document.createElement("div");

    empty.className =
      "empty-library";

    empty.textContent =
      "NESSUN AUDIO TROVATO";

    audioList.appendChild(empty);

    return;
  }


  files.forEach(audio => {

    const item =
      document.createElement("button");

    item.type = "button";

    item.dataset.path =
      audio.path;

    item.className =
      "audio-item";

    item.setAttribute(
      "aria-label",
      `Riproduci ${audio.name}`
    );


    // Testi della riga.
    const text =
      document.createElement("span");

    text.className =
      "audio-copy";


    const title =
      document.createElement("span");

    title.className =
      "audio-title";

    title.textContent =
      audio.name;


    const meta =
      document.createElement("span");

    meta.className =
      "audio-meta";


    meta.textContent =
      audio.key
        ? `SCORCIATOIA: ${String(
          audio.key
        ).toUpperCase()}`
        : (
          audio.safe === false
            ? "NOT SAFE"
            : "SAFE"
        );


    text.append(
      title,
      meta
    );


    // Icona PLAY al posto della nota.
    // Nessuna freccia alla fine.
    item.append(
      createPlayIcon(),
      text
    );


    item.addEventListener(
      "click",
      () => {

        // Se clicco sull'audio che sta già suonando,
        // lo fermo.
        if (
          isAudioPlaying() &&
          currentFile?.path === audio.path
        ) {
          stopAudio();
        } else {
          playAudio(
            audio.path,
            audio
          );
        }
      }
    );


    audioList.appendChild(item);
  });


  updatePlayingItem();
}


// ---------------------------------------------------------
// NAVIGAZIONE
// ---------------------------------------------------------

function showScreen(screen) {
  const showHome =
    screen === "home";


  if (homeScreen) {
    homeScreen.classList.toggle(
      "is-hidden",
      !showHome
    );
  }


  if (libraryScreen) {
    libraryScreen.classList.toggle(
      "is-hidden",
      showHome
    );
  }


  if (homeTab) {
    homeTab.classList.toggle(
      "is-active",
      showHome
    );

    homeTab.toggleAttribute(
      "aria-current",
      showHome
    );
  }


  if (libraryTab) {
    libraryTab.classList.toggle(
      "is-active",
      !showHome
    );

    libraryTab.toggleAttribute(
      "aria-current",
      !showHome
    );
  }


  if (!showHome) {
    refreshAudioLibrary();
  }
}


// ---------------------------------------------------------
// TASTIERA
// ---------------------------------------------------------

document.body.addEventListener(
  "keydown",
  event => {

    if (
      ["INPUT", "TEXTAREA", "SELECT"]
        .includes(
          document.activeElement?.tagName
        )
    ) {
      return;
    }


    if (
      event.code === "Enter" ||
      event.code === "Space"
    ) {
      event.preventDefault();

      toggleMainPlayback();

      return;
    }


    const audio =
      allMp3Files.find(item =>
        item.key &&
        event.key.toLowerCase() ===
        String(item.key).toLowerCase()
      );


    if (audio) {
      playAudio(
        audio.path,
        audio
      );
    }
  }
);


// ---------------------------------------------------------
// EVENTI HOME
// ---------------------------------------------------------

if (button) {
  button.addEventListener(
    "click",
    toggleMainPlayback
  );
}


if (homeSafeSwitch) {
  homeSafeSwitch.addEventListener(
    "click",
    () => setHomeCategory("safe")
  );
}


if (homeUnsafeSwitch) {
  homeUnsafeSwitch.addEventListener(
    "click",
    () => setHomeCategory("unsafe")
  );
}


// ---------------------------------------------------------
// NAVIGAZIONE
// ---------------------------------------------------------

if (homeTab) {
  homeTab.addEventListener(
    "click",
    () => showScreen("home")
  );
}


if (libraryTab) {
  libraryTab.addEventListener(
    "click",
    () => showScreen("library")
  );
}


// ---------------------------------------------------------
// FILTRI LIBRARY
// ---------------------------------------------------------

if (safeTab) {
  safeTab.addEventListener(
    "click",
    () => setLibraryMode("safe")
  );
}


if (nsfwTab) {
  nsfwTab.addEventListener(
    "click",
    () => setLibraryMode("unsafe")
  );
}


if (allTab) {
  allTab.addEventListener(
    "click",
    () => setLibraryMode("all")
  );
}


if (librarySearch) {
  librarySearch.addEventListener(
    "input",
    renderAudioList
  );
}


// ---------------------------------------------------------
// AGGIORNAMENTO LIBRARY
// ---------------------------------------------------------

window.addEventListener(
  "focus",
  refreshAudioLibrary
);


document.addEventListener(
  "visibilitychange",
  () => {
    if (!document.hidden) {
      refreshAudioLibrary();
    }
  }
);


// ---------------------------------------------------------
// INIT
// ---------------------------------------------------------

(async function init() {

  syncHomeSwitch(
    homeSafeSwitch,
    homePlayback.safe
  );

  syncHomeSwitch(
    homeUnsafeSwitch,
    homePlayback.unsafe
  );


  syncMainPlayButton();


  setLibraryMode(
    libraryMode
  );


  await refreshAudioLibrary();


  showScreen("home");

})();