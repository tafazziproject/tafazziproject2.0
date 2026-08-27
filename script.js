"use strict";

let allMp3Files = [];
let currentAudio = null;
let currentFile = null;
let messageTimeout = null;
let currentMode = "safe";

const button = document.querySelector("#playButton");
const labelSwitch = document.querySelector("#switch-label");
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
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const settingsBackdrop = document.querySelector("#settings-backdrop");
const homeModeLabel = document.querySelector("#home-mode-label");
const modeDot = document.querySelector("#mode-dot");
const recentCard = document.querySelector("#recent-card");
const recentName = document.querySelector("#recent-name");
const recentState = document.querySelector("#recent-state");
const playLabel = document.querySelector("#play-label");
const modeSwitch = document.querySelector("#mode-switch");
const modeDescription = document.querySelector("#mode-description");

function randomIndex(length) {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError("Lunghezza non valida.");
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    const range = 0x100000000;
    const limit = Math.floor(range / length) * length;
    do crypto.getRandomValues(values); while (values[0] >= limit);
    return values[0] % length;
  }
  return Math.floor(Math.random() * length);
}

async function refreshAudioLibrary() {
  if (!window.TafazziStore) {
    showTemporaryMessage("Archivio audio non disponibile");
    return;
  }
  allMp3Files = await window.TafazziStore.getLibrary();
  renderAudioList();
}

function showTemporaryMessage(message, duration = 3000) {
  window.clearTimeout(messageTimeout);
  playLabel.textContent = message;
  messageTimeout = window.setTimeout(() => {
    playLabel.textContent = "Tap to Tafazzi";
  }, duration);
}

function updatePlayingItem() {
  document.querySelectorAll(".audio-item").forEach(item => {
    item.classList.toggle("playing-item", item.dataset.path === currentFile?.path && !currentAudio?.paused);
  });
}

function playAudio(file, audioData = allMp3Files.find(item => item.path === file)) {
  currentAudio?.pause();
  currentFile = audioData || { path: file, name: file.split("/").pop() };
  currentAudio = new Audio(file);
  currentAudio.addEventListener("ended", () => {
    button.classList.remove("playing");
    recentState.textContent = "Riproduzione terminata";
    updatePlayingItem();
  }, { once: true });
  currentAudio.addEventListener("error", () => {
    button.classList.remove("playing");
    recentState.textContent = "Audio non disponibile";
    updatePlayingItem();
  }, { once: true });
  button.classList.add("playing");
  recentName.textContent = currentFile.name;
  recentState.textContent = currentFile.safe === false ? "NOT SAFE" : "SAFE";
  currentAudio.play().catch(() => showTemporaryMessage("Impossibile riprodurre l'audio"));
  updatePlayingItem();
}

function matchesMode(audio) {
  if (currentMode === "all") return true;
  if (currentMode === "unsafe") return audio.safe === false;
  return audio.safe === true;
}

function playRandomMp3() {
  const files = allMp3Files.filter(matchesMode);
  if (!files.length) {
    showTemporaryMessage("Nessun MP3 configurato");
    return;
  }
  currentAudio?.pause();
  const selectedFile = files[randomIndex(files.length)];
  playAudio(selectedFile.path, selectedFile);
}

function syncModeUI() {
  const labels = { safe: "SAFE", unsafe: "NOT SAFE", all: "TUTTI" };
  const homeLabels = { safe: "SAFE MODE", unsafe: "NOT SAFE MODE", all: "ALL MODE" };
  const descriptions = {
    safe: "Riproduce soltanto gli audio contrassegnati come safe.",
    unsafe: "Riproduce soltanto gli audio contrassegnati come not safe.",
    all: "Riproduce tutti gli audio, safe e not safe."
  };
  labelSwitch.textContent = labels[currentMode];
  labelSwitch.dataset.mode = currentMode;
  homeModeLabel.textContent = homeLabels[currentMode];
  modeDescription.textContent = descriptions[currentMode];
  modeDot.dataset.mode = currentMode;
  [safeTab, nsfwTab, allTab].forEach(tab => tab.classList.toggle("active", tab.dataset.mode === currentMode));
  modeSwitch.querySelectorAll(".switch-option").forEach(option => {
    const active = option.dataset.mode === currentMode;
    option.classList.toggle("active", active);
    option.setAttribute("aria-checked", String(active));
  });
  renderAudioList();
}

function setMode(mode) {
  if (!["safe", "unsafe", "all"].includes(mode)) return;
  currentMode = mode;
  syncModeUI();
}

function renderAudioList() {
  const query = librarySearch.value.trim().toLowerCase();
  const files = allMp3Files.filter(audio => matchesMode(audio) && audio.name.toLowerCase().includes(query));
  audioList.replaceChildren();
  libraryCount.textContent = `${files.length} audio`;
  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "rounded-[18px] bg-white/10 px-4 py-8 text-center text-[12px] font-semibold text-white/55";
    empty.textContent = "Nessun audio trovato";
    audioList.appendChild(empty);
    return;
  }
  files.forEach(audio => {
    const item = document.createElement("button");
    item.type = "button";
    item.dataset.path = audio.path;
    item.className = "audio-item flex w-full items-center gap-3 rounded-[18px] border border-white/10 bg-white/10 p-2.5 text-left backdrop-blur-xl transition hover:bg-white/16 active:scale-[.99]";

    const icon = document.createElement("span");
    icon.className = "grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[#0a0c0a] text-[#ff7a1a] shadow-md";
    icon.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5 fill-current" aria-hidden="true"><path d="M9 18V5l11-2v13a3.5 3.5 0 1 1-2-3.16V7.2l-7 1.27V18a3.5 3.5 0 1 1-2-3.16Z"/></svg>';

    const text = document.createElement("span");
    text.className = "min-w-0 flex-1";
    const title = document.createElement("span");
    title.className = "block truncate text-[13px] font-black text-white";
    title.textContent = audio.name;
    const meta = document.createElement("span");
    meta.className = "mt-0.5 block text-[10px] font-semibold text-white/55";
    meta.textContent = audio.key ? `Scorciatoia: ${audio.key.toUpperCase()}` : (audio.safe ? "SAFE" : "NOT SAFE");
    text.append(title, meta);

    const chevron = document.createElement("span");
    chevron.className = "text-lg font-black text-white/45";
    chevron.textContent = "›";
    item.append(icon, text, chevron);
    item.addEventListener("click", () => playAudio(audio.path, audio));
    audioList.appendChild(item);
  });
  updatePlayingItem();
}

function showScreen(screen) {
  const showHome = screen === "home";
  homeScreen.classList.toggle("hidden", !showHome);
  homeScreen.classList.toggle("flex", showHome);
  libraryScreen.classList.toggle("hidden", showHome);
  libraryScreen.classList.toggle("flex", !showHome);
  homeTab.classList.toggle("active", showHome);
  libraryTab.classList.toggle("active", !showHome);
  if (!showHome) refreshAudioLibrary();
}

function openSettings() { settingsPanel.classList.add("open"); }
function closeSettings() { settingsPanel.classList.remove("open"); }

document.body.addEventListener("keydown", event => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (event.code === "Enter") {
    playRandomMp3();
    return;
  }
  const audio = allMp3Files.find(item => item.key && event.key.toLowerCase() === item.key.toLowerCase());
  if (audio) playAudio(audio.path, audio);
});

modeSwitch.addEventListener("click", event => {
  const option = event.target.closest(".switch-option");
  if (option) setMode(option.dataset.mode);
});
button.addEventListener("click", playRandomMp3);
homeTab.addEventListener("click", () => showScreen("home"));
libraryTab.addEventListener("click", () => showScreen("library"));
safeTab.addEventListener("click", () => setMode("safe"));
nsfwTab.addEventListener("click", () => setMode("unsafe"));
allTab.addEventListener("click", () => setMode("all"));
librarySearch.addEventListener("input", renderAudioList);
settingsButton.addEventListener("click", openSettings);
settingsBackdrop.addEventListener("click", closeSettings);
recentCard.addEventListener("click", () => currentFile && playAudio(currentFile.path, currentFile));
window.addEventListener("focus", refreshAudioLibrary);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshAudioLibrary();
});

(async function init() {
  await refreshAudioLibrary();
  syncModeUI();
  showScreen("home");
})();
