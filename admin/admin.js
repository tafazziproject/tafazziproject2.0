"use strict";

const loginView = document.querySelector("#login-view");
const adminView = document.querySelector("#admin-view");
const loginForm = document.querySelector("#login-form");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const loginError = document.querySelector("#login-error");
const logout = document.querySelector("#logout");
const uploadForm = document.querySelector("#upload-form");
const audioFile = document.querySelector("#audio-file");
const fileLabel = document.querySelector("#file-label");
const audioName = document.querySelector("#audio-name");
const audioSafety = document.querySelector("#audio-safety");
const audioKey = document.querySelector("#audio-key");
const uploadMessage = document.querySelector("#upload-message");
const uploadSubmit = document.querySelector("#upload-submit");
const audioList = document.querySelector("#audio-list");
const totalCount = document.querySelector("#total-count");
const search = document.querySelector("#search");
const filter = document.querySelector("#filter");
const confirmDialog = document.querySelector("#confirm-dialog");
const confirmCopy = document.querySelector("#confirm-copy");
const confirmDelete = document.querySelector("#confirm-delete");

const supa = window.TafazziSupabase;
const client = supa?.client;
const bucket = supa?.bucket || "audio";

let library = [];
let isAuthenticated = false;
let pendingDelete = null;
let preview = null;

function showMessage(el, text, type = "ok") {
  el.textContent = text;
  el.className = `message ${type}`;
}
function hideMessage(el) {
  el.textContent = "";
  el.className = "message hidden";
}
function formatBytes(bytes) {
  return window.TafazziStore?.formatBytes(bytes) || `${Number(bytes) || 0} B`;
}
function syncAuthUI() {
  loginView.classList.toggle("hidden", isAuthenticated);
  adminView.classList.toggle("hidden", !isAuthenticated);
  if (!isAuthenticated) setTimeout(() => email.focus(), 50);
}

function configError() {
  return "Supabase non è ancora configurato. Compila config.js e poi esegui gli script SQL inclusi nella cartella supabase/.";
}

async function verifyAdminSession() {
  if (!supa?.configured || !client) return false;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) return false;
  try {
    return await supa.isAdmin();
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function checkSession() {
  if (!supa?.configured || !client) {
    syncAuthUI();
    showMessage(loginError, configError(), "error");
    return;
  }
  isAuthenticated = await verifyAdminSession();
  syncAuthUI();
  if (isAuthenticated) await refreshLibrary();
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage(loginError);
  if (!supa?.configured || !client) {
    showMessage(loginError, configError(), "error");
    return;
  }

  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { error } = await client.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    });
    if (error) throw error;

    const allowed = await supa.isAdmin();
    if (!allowed) {
      await client.auth.signOut();
      throw new Error("Questo account non è autorizzato come amministratore.");
    }

    isAuthenticated = true;
    password.value = "";
    syncAuthUI();
    await refreshLibrary();
  } catch (error) {
    console.error(error);
    showMessage(loginError, error.message || "Credenziali non valide.", "error");
  } finally {
    submit.disabled = false;
  }
});

logout.addEventListener("click", async () => {
  preview?.pause();
  if (client) await client.auth.signOut();
  isAuthenticated = false;
  library = [];
  syncAuthUI();
});

audioFile.addEventListener("change", () => {
  const file = audioFile.files?.[0];
  fileLabel.textContent = file ? file.name : "Scegli un file audio";
  if (file && !audioName.value.trim()) {
    audioName.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  }
});

function fileExtension(name) {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "bin";
}

function makeStoragePath(file) {
  const extension = fileExtension(file.name);
  const day = new Date().toISOString().slice(0, 10);
  return `${day}/${crypto.randomUUID()}.${extension}`;
}

uploadForm.addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage(uploadMessage);
  const file = audioFile.files?.[0];
  if (!file) {
    showMessage(uploadMessage, "Seleziona un file audio.", "error");
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    showMessage(uploadMessage, "Il file supera 30 MB.", "error");
    return;
  }
  if (!audioName.value.trim()) {
    showMessage(uploadMessage, "Inserisci il nome dell'audio.", "error");
    return;
  }

  const storagePath = makeStoragePath(file);
  uploadSubmit.disabled = true;
  uploadSubmit.textContent = "CARICAMENTO…";

  try {
    const { error: uploadError } = await client.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
    if (uploadError) throw uploadError;

    const payload = {
      name: audioName.value.trim(),
      safe: audioSafety.value === "safe",
      shortcut: audioKey.value.trim() || null,
      storage_path: storagePath,
      original_filename: file.name,
      size_bytes: file.size,
    };

    const { error: insertError } = await client.from("audios").insert(payload);
    if (insertError) {
      await client.storage.from(bucket).remove([storagePath]);
      throw insertError;
    }

    uploadForm.reset();
    fileLabel.textContent = "Scegli un file audio";
    showMessage(uploadMessage, "Audio caricato e pubblicato nel frontend.");
    await refreshLibrary();
  } catch (error) {
    console.error(error);
    showMessage(uploadMessage, error.message || "Errore durante il caricamento.", "error");
  } finally {
    uploadSubmit.disabled = false;
    uploadSubmit.textContent = "CARICA AUDIO";
  }
});

function renderLibrary() {
  const q = search.value.trim().toLowerCase();
  const mode = filter.value;
  const rows = library.filter(audio => {
    const matchesSearch = audio.name.toLowerCase().includes(q) || (audio.fileName || "").toLowerCase().includes(q);
    const matchesFilter = mode === "all" ||
      (mode === "safe" && audio.safe) ||
      (mode === "unsafe" && !audio.safe);
    return matchesSearch && matchesFilter;
  });

  totalCount.textContent = library.length;
  audioList.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessun audio corrisponde ai filtri.";
    audioList.appendChild(empty);
    return;
  }

  rows.forEach(audio => {
    const row = document.createElement("div");
    row.className = "audio-row";

    const icon = document.createElement("div");
    icon.className = "audio-icon";
    icon.textContent = "♪";

    const info = document.createElement("div");
    info.className = "audio-info";
    const name = document.createElement("div");
    name.className = "audio-name";
    name.textContent = audio.name;
    const meta = document.createElement("div");
    meta.className = "audio-meta";
    const parts = [audio.fileName || "Audio Supabase"];
    if (audio.size) parts.push(formatBytes(audio.size));
    if (audio.key) parts.push(`Tasto ${audio.key.toUpperCase()}`);
    meta.textContent = parts.join(" · ");
    info.append(name, meta);

    const badge = document.createElement("span");
    badge.className = `badge ${audio.safe ? "safe" : "unsafe"}`;
    badge.textContent = audio.safe ? "SAFE" : "NOT SAFE";

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const play = document.createElement("button");
    play.type = "button";
    play.className = "icon-btn";
    play.textContent = "Ascolta";
    play.addEventListener("click", () => {
      preview?.pause();
      preview = new Audio(audio.path);
      preview.play().catch(() => alert("Impossibile riprodurre questo audio."));
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn delete";
    del.textContent = "Elimina";
    del.addEventListener("click", () => requestDelete(audio));

    actions.append(play, del);
    row.append(icon, info, badge, actions);
    audioList.appendChild(row);
  });
}

function requestDelete(audio) {
  pendingDelete = audio;
  confirmCopy.textContent = `“${audio.name}” verrà eliminato dal database e il relativo file verrà rimosso dallo Storage Supabase. L'operazione non è annullabile.`;
  if (typeof confirmDialog.showModal === "function") confirmDialog.showModal();
  else if (confirm(confirmCopy.textContent)) performDelete();
}

async function performDelete() {
  if (!pendingDelete) return;
  const audio = pendingDelete;
  pendingDelete = null;
  preview?.pause();

  try {
    const { error: deleteRowError } = await client
      .from("audios")
      .delete()
      .eq("id", audio.id);
    if (deleteRowError) throw deleteRowError;

    const { error: deleteFileError } = await client.storage
      .from(bucket)
      .remove([audio.storagePath]);

    if (deleteFileError) {
      console.error(deleteFileError);
      showMessage(uploadMessage, "Audio rimosso dalla libreria, ma il file nello Storage non è stato cancellato. Controlla le policy Storage.", "error");
    }

    await refreshLibrary();
  } catch (error) {
    console.error(error);
    alert(error.message || "Non è stato possibile eliminare l'audio.");
  }
}

confirmDelete.addEventListener("click", event => {
  event.preventDefault();
  confirmDialog.close();
  performDelete();
});
confirmDialog.addEventListener("close", () => {
  if (confirmDialog.returnValue === "cancel") pendingDelete = null;
});
search.addEventListener("input", renderLibrary);
filter.addEventListener("change", renderLibrary);
window.addEventListener("focus", () => isAuthenticated && refreshLibrary());

async function refreshLibrary() {
  try {
    library = await window.TafazziStore.getLibrary();
    renderLibrary();
  } catch (error) {
    console.error(error);
    audioList.innerHTML = '<div class="empty">Archivio audio non disponibile. Controlla config.js e le policy Supabase.</div>';
  }
}

checkSession();
