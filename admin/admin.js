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
const fileDrop = document.querySelector("#file-drop");
const fileLabel = document.querySelector("#file-label");
const uploadQueueEl = document.querySelector("#upload-queue");
const uploadMessage = document.querySelector("#upload-message");
const uploadSubmit = document.querySelector("#upload-submit");
const uploadClear = document.querySelector("#upload-clear");

const audioList = document.querySelector("#audio-list");
const totalCount = document.querySelector("#total-count");
const search = document.querySelector("#search");
const filter = document.querySelector("#filter");
const selectAll = document.querySelector("#select-all");
const selectionCount = document.querySelector("#selection-count");
const bulkDelete = document.querySelector("#bulk-delete");

const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
const editName = document.querySelector("#edit-name");
const editSafety = document.querySelector("#edit-safety");
const editKey = document.querySelector("#edit-key");
const editMessage = document.querySelector("#edit-message");
const editCancel = document.querySelector("#edit-cancel");
const editSave = document.querySelector("#edit-save");

const confirmDialog = document.querySelector("#confirm-dialog");
const confirmTitle = document.querySelector("#confirm-title");
const confirmCopy = document.querySelector("#confirm-copy");
const confirmDelete = document.querySelector("#confirm-delete");

const supa = window.TafazziSupabase;
const client = supa?.client;
const bucket = supa?.bucket || "audio";

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "aac"
]);

let library = [];
let isAuthenticated = false;
let preview = null;
let uploadQueue = [];
let selectedIds = new Set();
let pendingDelete = [];
let editingAudio = null;

function showMessage(el, text, type = "ok") {
  el.textContent = text;
  el.className = `message ${type}`;
}

function hideMessage(el) {
  el.textContent = "";
  el.className = "message hidden";
}

function formatBytes(bytes) {
  return (
    window.TafazziStore?.formatBytes(bytes) ||
    `${Number(bytes) || 0} B`
  );
}

function syncAuthUI() {
  loginView.classList.toggle("hidden", isAuthenticated);
  adminView.classList.toggle("hidden", !isAuthenticated);

  if (!isAuthenticated) {
    setTimeout(() => email.focus(), 50);
  }
}

function configError() {
  return "Supabase non è ancora configurato. Compila config.js e poi esegui gli script SQL inclusi nella cartella supabase/.";
}

async function verifyAdminSession() {
  if (!supa?.configured || !client) {
    return false;
  }

  const {
    data: sessionData,
    error: sessionError
  } = await client.auth.getSession();

  if (sessionError || !sessionData.session) {
    return false;
  }

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
    showMessage(
      loginError,
      configError(),
      "error"
    );
    return;
  }

  isAuthenticated = await verifyAdminSession();

  syncAuthUI();

  if (isAuthenticated) {
    await refreshLibrary();
  }
}

/* =========================
   LOGIN
========================= */

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  hideMessage(loginError);

  if (!supa?.configured || !client) {
    showMessage(
      loginError,
      configError(),
      "error"
    );
    return;
  }

  const submit = loginForm.querySelector(
    'button[type="submit"]'
  );

  submit.disabled = true;

  try {
    const { error } =
      await client.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
      });

    if (error) {
      throw error;
    }

    const allowed = await supa.isAdmin();

    if (!allowed) {
      await client.auth.signOut();

      throw new Error(
        "Questo account non è autorizzato come amministratore."
      );
    }

    isAuthenticated = true;

    password.value = "";

    syncAuthUI();

    await refreshLibrary();
  } catch (error) {
    console.error(error);

    showMessage(
      loginError,
      error.message || "Credenziali non valide.",
      "error"
    );
  } finally {
    submit.disabled = false;
  }
});

logout.addEventListener("click", async () => {
  preview?.pause();

  if (client) {
    await client.auth.signOut();
  }

  isAuthenticated = false;
  library = [];
  selectedIds.clear();

  clearUploadQueue();
  syncAuthUI();
});

/* =========================
   UTILITY AUDIO
========================= */

function fileExtension(name) {
  const match = String(name)
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);

  return match
    ? match[1]
    : "bin";
}

function displayNameFromFile(name) {
  return String(name)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function isAllowedAudio(file) {
  return (
    Boolean(file?.type?.startsWith("audio/")) ||
    ALLOWED_EXTENSIONS.has(
      fileExtension(file?.name)
    )
  );
}

function makeStoragePath(file) {
  const extension =
    fileExtension(file.name);

  const day =
    new Date()
      .toISOString()
      .slice(0, 10);

  return `${day}/${crypto.randomUUID()}.${extension}`;
}

function queueIdentity(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/* =========================
   UPLOAD MULTIPLO
========================= */

function addFiles(files) {
  hideMessage(uploadMessage);

  const current = new Set(
    uploadQueue.map(
      item => item.identity
    )
  );

  let rejected = 0;
  let duplicates = 0;

  [...files].forEach(file => {
    const identity =
      queueIdentity(file);

    if (current.has(identity)) {
      duplicates += 1;
      return;
    }

    if (
      !isAllowedAudio(file) ||
      file.size > MAX_FILE_SIZE
    ) {
      rejected += 1;
      return;
    }

    uploadQueue.push({
      id: crypto.randomUUID(),
      identity,
      file,
      name: displayNameFromFile(
        file.name
      ),
      safe: true,
      key: ""
    });

    current.add(identity);
  });

  renderUploadQueue();

  if (rejected || duplicates) {
    const bits = [];

    if (rejected) {
      bits.push(
        `${rejected} file non valido o oltre 30 MB`
      );
    }

    if (duplicates) {
      bits.push(
        `${duplicates} duplicato${duplicates === 1
          ? ""
          : "i"
        } ignorato${duplicates === 1
          ? ""
          : "i"
        }`
      );
    }

    showMessage(
      uploadMessage,
      bits.join(" · "),
      "error"
    );
  }
}

function clearUploadQueue() {
  uploadQueue = [];

  audioFile.value = "";

  renderUploadQueue();

  hideMessage(uploadMessage);
}

function renderUploadQueue() {
  const count =
    uploadQueue.length;

  fileLabel.textContent =
    count
      ? `${count} audio pront${count === 1
        ? "o"
        : "i"
      } per il caricamento`
      : "Trascina qui gli audio oppure clicca per sceglierli";

  uploadSubmit.disabled =
    count === 0;

  uploadSubmit.textContent =
    count > 1
      ? `CARICA ${count} AUDIO`
      : "CARICA AUDIO";

  uploadClear.classList.toggle(
    "hidden",
    count === 0
  );

  uploadQueueEl.classList.toggle(
    "hidden",
    count === 0
  );

  uploadQueueEl.replaceChildren();

  if (!count) {
    return;
  }

  const head =
    document.createElement("div");

  head.className =
    "queue-head";

  [
    "File",
    "Nome",
    "Categoria",
    "Scorciatoia",
    ""
  ].forEach(text => {
    const span =
      document.createElement("span");

    span.textContent = text;

    head.appendChild(span);
  });

  uploadQueueEl.appendChild(head);

  uploadQueue.forEach(item => {
    const row =
      document.createElement("div");

    row.className =
      "queue-row";

    const fileInfo =
      document.createElement("div");

    fileInfo.className =
      "queue-file";

    const fileName =
      document.createElement("strong");

    fileName.textContent =
      item.file.name;

    const fileMeta =
      document.createElement("small");

    fileMeta.textContent =
      formatBytes(
        item.file.size
      );

    fileInfo.append(
      fileName,
      fileMeta
    );

    const nameInput =
      document.createElement("input");

    nameInput.className =
      "queue-name";

    nameInput.value =
      item.name;

    nameInput.maxLength = 80;
    nameInput.required = true;
    nameInput.placeholder =
      "Nome audio";

    nameInput.setAttribute(
      "aria-label",
      `Nome per ${item.file.name}`
    );

    nameInput.addEventListener(
      "input",
      () => {
        item.name =
          nameInput.value;
      }
    );

    const safetySelect =
      document.createElement(
        "select"
      );

    safetySelect.setAttribute(
      "aria-label",
      `Categoria per ${item.file.name}`
    );

    safetySelect.innerHTML = `
      <option value="safe">SAFE</option>
      <option value="unsafe">NOT SAFE</option>
    `;

    safetySelect.value =
      item.safe
        ? "safe"
        : "unsafe";

    safetySelect.addEventListener(
      "change",
      () => {
        item.safe =
          safetySelect.value ===
          "safe";
      }
    );

    const keyInput =
      document.createElement(
        "input"
      );

    keyInput.maxLength = 1;
    keyInput.placeholder =
      "Opzionale";

    keyInput.value =
      item.key;

    keyInput.setAttribute(
      "aria-label",
      `Scorciatoia per ${item.file.name}`
    );

    keyInput.addEventListener(
      "input",
      () => {
        item.key =
          keyInput.value.slice(
            0,
            1
          );
      }
    );

    const remove =
      document.createElement(
        "button"
      );

    remove.type = "button";
    remove.className =
      "queue-remove";

    remove.textContent = "×";
    remove.title =
      "Rimuovi dalla coda";

    remove.setAttribute(
      "aria-label",
      `Rimuovi ${item.file.name} dalla coda`
    );

    remove.addEventListener(
      "click",
      () => {
        uploadQueue =
          uploadQueue.filter(
            candidate =>
              candidate.id !==
              item.id
          );

        renderUploadQueue();
      }
    );

    row.append(
      fileInfo,
      nameInput,
      safetySelect,
      keyInput,
      remove
    );

    uploadQueueEl.appendChild(
      row
    );
  });
}

/* =========================
   FILE INPUT
========================= */

audioFile.addEventListener(
  "change",
  () => {
    if (
      audioFile.files?.length
    ) {
      addFiles(
        audioFile.files
      );
    }

    audioFile.value = "";
  }
);

/* =========================
   DRAG & DROP
========================= */

[
  "dragenter",
  "dragover"
].forEach(type => {
  fileDrop.addEventListener(
    type,
    event => {
      event.preventDefault();
      event.stopPropagation();

      fileDrop.classList.add(
        "dragover"
      );
    }
  );
});

[
  "dragleave",
  "drop"
].forEach(type => {
  fileDrop.addEventListener(
    type,
    event => {
      event.preventDefault();
      event.stopPropagation();

      fileDrop.classList.remove(
        "dragover"
      );
    }
  );
});

fileDrop.addEventListener(
  "drop",
  event => {
    const files =
      event.dataTransfer?.files;

    if (files?.length) {
      addFiles(files);
    }
  }
);

uploadClear.addEventListener(
  "click",
  () => {
    clearUploadQueue();
  }
);

/* =========================
   UPLOAD SINGOLO
========================= */

async function uploadOne(item) {
  const storagePath =
    makeStoragePath(
      item.file
    );

  const {
    error: uploadError
  } = await client.storage
    .from(bucket)
    .upload(
      storagePath,
      item.file,
      {
        cacheControl: "3600",
        upsert: false,
        contentType:
          item.file.type ||
          undefined
      }
    );

  if (uploadError) {
    throw uploadError;
  }

  const payload = {
    name: item.name.trim(),
    safe: item.safe,
    shortcut:
      item.key.trim() ||
      null,
    storage_path:
      storagePath,
    original_filename:
      item.file.name,
    size_bytes:
      item.file.size
  };

  const {
    error: insertError
  } = await client
    .from("audios")
    .insert(payload);

  if (insertError) {
    await client.storage
      .from(bucket)
      .remove([
        storagePath
      ]);

    throw insertError;
  }
}

/* =========================
   SUBMIT UPLOAD MASSIVO
========================= */

uploadForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    hideMessage(
      uploadMessage
    );

    if (
      !uploadQueue.length
    ) {
      showMessage(
        uploadMessage,
        "Seleziona almeno un file audio.",
        "error"
      );

      return;
    }

    const invalidName =
      uploadQueue.find(
        item =>
          !item.name.trim()
      );

    if (invalidName) {
      showMessage(
        uploadMessage,
        `Inserisci il nome per “${invalidName.file.name}”.`,
        "error"
      );

      return;
    }

    uploadSubmit.disabled =
      true;

    uploadClear.disabled =
      true;

    const total =
      uploadQueue.length;

    const failed = [];

    let completed = 0;

    for (
      const item of [
        ...uploadQueue
      ]
    ) {
      uploadSubmit.textContent =
        `CARICAMENTO ${completed + 1
        }/${total}…`;

      try {
        await uploadOne(item);

        completed += 1;

        uploadQueue =
          uploadQueue.filter(
            candidate =>
              candidate.id !==
              item.id
          );
      } catch (error) {
        console.error(error);

        failed.push({
          item,
          error
        });
      }
    }

    renderUploadQueue();

    uploadClear.disabled =
      false;

    if (completed) {
      await refreshLibrary();
    }

    if (failed.length) {
      const suffix =
        completed
          ? ` ${completed} caricati correttamente.`
          : "";

      showMessage(
        uploadMessage,
        `${failed.length} audio non caricati.${suffix} Controlla i file rimasti in coda.`,
        "error"
      );
    } else {
      showMessage(
        uploadMessage,
        `${completed} audio caricati e pubblicati nel frontend.`
      );
    }
  }
);

/* =========================
   FILTRI
========================= */

function getFilteredRows() {
  const q =
    search.value
      .trim()
      .toLowerCase();

  const mode =
    filter.value;

  return library.filter(
    audio => {
      const matchesSearch =
        audio.name
          .toLowerCase()
          .includes(q) ||
        (
          audio.fileName ||
          ""
        )
          .toLowerCase()
          .includes(q);

      const matchesFilter =
        mode === "all" ||
        (
          mode === "safe" &&
          audio.safe
        ) ||
        (
          mode ===
          "unsafe" &&
          !audio.safe
        );

      return (
        matchesSearch &&
        matchesFilter
      );
    }
  );
}

/* =========================
   SELEZIONE MULTIPLA
========================= */

function syncSelectionUI(
  rows = getFilteredRows()
) {
  const visibleIds =
    rows.map(
      audio =>
        String(audio.id)
    );

  const selectedVisible =
    visibleIds.filter(
      id =>
        selectedIds.has(id)
    ).length;

  selectAll.checked =
    visibleIds.length > 0 &&
    selectedVisible ===
    visibleIds.length;

  selectAll.indeterminate =
    selectedVisible > 0 &&
    selectedVisible <
    visibleIds.length;

  selectAll.disabled =
    visibleIds.length === 0;

  selectionCount.textContent =
    `${selectedIds.size
    } selezionat${selectedIds.size === 1
      ? "o"
      : "i"
    }`;

  bulkDelete.disabled =
    selectedIds.size === 0;
}

/* =========================
   RENDER LIBRERIA
========================= */

function renderLibrary() {
  const rows =
    getFilteredRows();

  totalCount.textContent =
    library.length;

  audioList.replaceChildren();

  if (!rows.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className = "empty";

    empty.textContent =
      "Nessun audio corrisponde ai filtri.";

    audioList.appendChild(
      empty
    );

    syncSelectionUI(rows);

    return;
  }

  rows.forEach(audio => {
    const row =
      document.createElement(
        "div"
      );

    const audioId =
      String(audio.id);

    row.className =
      `audio-row${selectedIds.has(
        audioId
      )
        ? " selected"
        : ""
      }`;

    /* CHECKBOX */

    const checkWrap =
      document.createElement(
        "label"
      );

    checkWrap.className =
      "row-check";

    checkWrap.title =
      "Seleziona audio";

    const checkbox =
      document.createElement(
        "input"
      );

    checkbox.type =
      "checkbox";

    checkbox.checked =
      selectedIds.has(
        audioId
      );

    checkbox.setAttribute(
      "aria-label",
      `Seleziona ${audio.name}`
    );

    checkbox.addEventListener(
      "change",
      () => {
        if (
          checkbox.checked
        ) {
          selectedIds.add(
            audioId
          );
        } else {
          selectedIds.delete(
            audioId
          );
        }

        renderLibrary();
      }
    );

    checkWrap.appendChild(
      checkbox
    );

    /* ICONA */

    const icon =
      document.createElement(
        "div"
      );

    icon.className =
      "audio-icon";

    icon.textContent = "";

    /* INFO */

    const info =
      document.createElement(
        "div"
      );

    info.className =
      "audio-info";

    const name =
      document.createElement(
        "div"
      );

    name.className =
      "audio-name";

    name.textContent =
      audio.name;

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "audio-meta";

    const parts = [
      audio.fileName ||
      "Audio Supabase"
    ];

    if (audio.size) {
      parts.push(
        formatBytes(
          audio.size
        )
      );
    }

    if (audio.key) {
      parts.push(
        `Tasto ${String(
          audio.key
        ).toUpperCase()}`
      );
    }

    meta.textContent =
      parts.join(" · ");

    info.append(
      name,
      meta
    );

    /* BADGE */

    const badge =
      document.createElement(
        "span"
      );

    badge.className =
      `badge ${audio.safe
        ? "safe"
        : "unsafe"
      }`;

    badge.textContent =
      audio.safe
        ? "SAFE"
        : "NOT SAFE";

    /* AZIONI */

    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "row-actions";

    /* ASCOLTA */

    const play =
      document.createElement(
        "button"
      );

    play.type =
      "button";

    play.className =
      "icon-btn";

    play.textContent =
      "Ascolta";

    play.addEventListener(
      "click",
      () => {
        preview?.pause();

        preview =
          new Audio(
            audio.path
          );

        preview
          .play()
          .catch(() => {
            alert(
              "Impossibile riprodurre questo audio."
            );
          });
      }
    );

    /* MODIFICA */

    const edit =
      document.createElement(
        "button"
      );

    edit.type =
      "button";

    edit.className =
      "icon-btn edit";

    edit.textContent =
      "Modifica";

    edit.addEventListener(
      "click",
      () => {
        openEdit(audio);
      }
    );

    /* ELIMINA */

    const del =
      document.createElement(
        "button"
      );

    del.type =
      "button";

    del.className =
      "icon-btn delete";

    del.textContent =
      "Elimina";

    del.addEventListener(
      "click",
      () => {
        requestDelete([
          audio
        ]);
      }
    );

    actions.append(
      play,
      edit,
      del
    );

    row.append(
      checkWrap,
      icon,
      info,
      badge,
      actions
    );

    audioList.appendChild(
      row
    );
  });

  syncSelectionUI(rows);
}

/* =========================
   SELEZIONA TUTTI
========================= */

selectAll.addEventListener(
  "change",
  () => {
    const visibleIds =
      getFilteredRows().map(
        audio =>
          String(audio.id)
      );

    if (selectAll.checked) {
      visibleIds.forEach(
        id => {
          selectedIds.add(id);
        }
      );
    } else {
      visibleIds.forEach(
        id => {
          selectedIds.delete(id);
        }
      );
    }

    renderLibrary();
  }
);

/* =========================
   ELIMINA SELEZIONATI
========================= */

bulkDelete.addEventListener(
  "click",
  () => {
    const audios =
      library.filter(
        audio =>
          selectedIds.has(
            String(audio.id)
          )
      );

    requestDelete(audios);
  }
);

/* =========================
   MODIFICA AUDIO
========================= */

function openEdit(audio) {
  editingAudio = audio;

  editName.value =
    audio.name || "";

  editSafety.value =
    audio.safe
      ? "safe"
      : "unsafe";

  editKey.value =
    audio.key || "";

  hideMessage(
    editMessage
  );

  if (
    typeof editDialog.showModal ===
    "function"
  ) {
    editDialog.showModal();
  }
}

editCancel.addEventListener(
  "click",
  () => {
    editingAudio = null;
    editDialog.close();
  }
);

editForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    if (!editingAudio) {
      return;
    }

    hideMessage(
      editMessage
    );

    const name =
      editName.value.trim();

    if (!name) {
      showMessage(
        editMessage,
        "Inserisci il nome dell'audio.",
        "error"
      );

      return;
    }

    editSave.disabled =
      true;

    editSave.textContent =
      "SALVATAGGIO…";

    try {
      const { error } =
        await client
          .from("audios")
          .update({
            name,
            safe:
              editSafety.value ===
              "safe",
            shortcut:
              editKey.value.trim() ||
              null
          })
          .eq(
            "id",
            editingAudio.id
          );

      if (error) {
        throw error;
      }

      editingAudio = null;

      editDialog.close();

      await refreshLibrary();

      showMessage(
        uploadMessage,
        "Audio modificato correttamente."
      );
    } catch (error) {
      console.error(error);

      showMessage(
        editMessage,
        error.message ||
        "Non è stato possibile salvare le modifiche.",
        "error"
      );
    } finally {
      editSave.disabled =
        false;

      editSave.textContent =
        "SALVA MODIFICHE";
    }
  }
);

editDialog.addEventListener(
  "close",
  () => {
    editingAudio = null;

    hideMessage(
      editMessage
    );
  }
);

/* =========================
   RICHIESTA ELIMINAZIONE
========================= */

function requestDelete(
  audios
) {
  pendingDelete =
    audios.filter(Boolean);

  if (!pendingDelete.length) {
    return;
  }

  const count =
    pendingDelete.length;

  confirmTitle.textContent =
    count === 1
      ? "Eliminare questo audio?"
      : `Eliminare ${count} audio?`;

  confirmCopy.textContent =
    count === 1
      ? `“${pendingDelete[0].name}” verrà eliminato dal database e il relativo file verrà rimosso dallo Storage Supabase. L'operazione non è annullabile.`
      : `${count} audio verranno eliminati dal database e i relativi file verranno rimossi dallo Storage Supabase. L'operazione non è annullabile.`;

  if (
    typeof confirmDialog.showModal ===
    "function"
  ) {
    confirmDialog.showModal();
  } else if (
    confirm(
      confirmCopy.textContent
    )
  ) {
    performDelete();
  }
}

/* =========================
   ELIMINAZIONE SINGOLA/MASSIVA
========================= */

async function performDelete() {
  if (
    !pendingDelete.length
  ) {
    return;
  }

  const audios = [
    ...pendingDelete
  ];

  pendingDelete = [];

  preview?.pause();

  const ids =
    audios.map(
      audio => audio.id
    );

  const storagePaths =
    audios
      .map(
        audio =>
          audio.storagePath
      )
      .filter(Boolean);

  try {
    const {
      error: deleteRowError
    } = await client
      .from("audios")
      .delete()
      .in("id", ids);

    if (deleteRowError) {
      throw deleteRowError;
    }

    if (
      storagePaths.length
    ) {
      const {
        error: deleteFileError
      } =
        await client.storage
          .from(bucket)
          .remove(
            storagePaths
          );

      if (
        deleteFileError
      ) {
        console.error(
          deleteFileError
        );

        showMessage(
          uploadMessage,
          "Audio rimossi dalla libreria, ma uno o più file nello Storage non sono stati cancellati. Controlla le policy Storage.",
          "error"
        );
      }
    }

    ids.forEach(id => {
      selectedIds.delete(
        String(id)
      );
    });

    await refreshLibrary();
  } catch (error) {
    console.error(error);

    alert(
      error.message ||
      "Non è stato possibile eliminare gli audio."
    );
  }
}

confirmDelete.addEventListener(
  "click",
  event => {
    event.preventDefault();

    confirmDialog.close();

    performDelete();
  }
);

confirmDialog.addEventListener(
  "close",
  () => {
    if (
      confirmDialog.returnValue ===
      "cancel"
    ) {
      pendingDelete = [];
    }
  }
);

/* =========================
   RICERCA E FILTRI
========================= */

search.addEventListener(
  "input",
  renderLibrary
);

filter.addEventListener(
  "change",
  renderLibrary
);

window.addEventListener(
  "focus",
  () => {
    if (isAuthenticated) {
      refreshLibrary();
    }
  }
);

/* =========================
   REFRESH LIBRERIA
========================= */

async function refreshLibrary() {
  try {
    library =
      await window.TafazziStore.getLibrary();

    const existingIds =
      new Set(
        library.map(
          audio =>
            String(audio.id)
        )
      );

    selectedIds =
      new Set(
        [
          ...selectedIds
        ].filter(
          id =>
            existingIds.has(id)
        )
      );

    renderLibrary();
  } catch (error) {
    console.error(error);

    audioList.innerHTML =
      '<div class="empty">Archivio audio non disponibile. Controlla config.js e le policy Supabase.</div>';
  }
}

/* =========================
   AVVIO
========================= */

renderUploadQueue();
checkSession();