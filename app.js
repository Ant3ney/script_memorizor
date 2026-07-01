const STORAGE_KEY = "script_memorizor_saves_v1";
const SANITY_TOKEN_KEY = "script_memorizor_sanity_token_v1";
const SANITY_CONFIG = {
  projectId: "p60eirei",
  dataset: "production",
  apiVersion: "2025-05-14",
};

const state = {
  saves: [],
  activeSaveId: null,
  isSyncing: false,
};

const refs = {
  menuView: document.getElementById("menuView"),
  practiceView: document.getElementById("practiceView"),
  newTitle: document.getElementById("newTitle"),
  newScript: document.getElementById("newScript"),
  createBtn: document.getElementById("createBtn"),
  saveList: document.getElementById("saveList"),
  saveItemTemplate: document.getElementById("saveItemTemplate"),
  importFile: document.getElementById("importFile"),
  importBtn: document.getElementById("importBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  backToMenuBtn: document.getElementById("backToMenuBtn"),
  activeTitle: document.getElementById("activeTitle"),
  progressLabel: document.getElementById("progressLabel"),
  scriptDisplay: document.getElementById("scriptDisplay"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  resetBtn: document.getElementById("resetBtn"),
  saveNowBtn: document.getElementById("saveNowBtn"),
  exportCurrentBtn: document.getElementById("exportCurrentBtn"),
  sanityToken: document.getElementById("sanityToken"),
  saveTokenBtn: document.getElementById("saveTokenBtn"),
  clearTokenBtn: document.getElementById("clearTokenBtn"),
  pullSanityBtn: document.getElementById("pullSanityBtn"),
  saveAndSyncBtn: document.getElementById("saveAndSyncBtn"),
  pushSanityBtn: document.getElementById("pushSanityBtn"),
  sanityStatus: document.getElementById("sanityStatus"),
};

init();

function init() {
  state.saves = loadSaves();
  bindEvents();
  renderSanityTokenState();
  renderSaveList();
  pullSavesFromSanity({ silent: true });
}

function bindEvents() {
  refs.createBtn.addEventListener("click", handleCreateSave);
  refs.importBtn.addEventListener("click", handleImportFromFile);
  refs.exportAllBtn.addEventListener("click", exportAllSaves);
  refs.backToMenuBtn.addEventListener("click", () => showView("menu"));
  refs.prevBtn.addEventListener("click", revealPreviousWord);
  refs.nextBtn.addEventListener("click", hideNextWord);
  refs.resetBtn.addEventListener("click", resetProgress);
  refs.saveNowBtn.addEventListener("click", handleSaveNow);
  refs.exportCurrentBtn.addEventListener("click", exportCurrentSave);
  refs.saveTokenBtn.addEventListener("click", handleSaveSanityToken);
  refs.clearTokenBtn.addEventListener("click", clearSanityToken);
  refs.pullSanityBtn.addEventListener("click", () => pullSavesFromSanity());
  refs.saveAndSyncBtn.addEventListener("click", handleSaveAndSync);
  refs.pushSanityBtn.addEventListener("click", () => syncSavesToSanity(state.saves));
}

function handleCreateSave() {
  const title = refs.newTitle.value.trim() || "Untitled Script";
  const text = refs.newScript.value;

  if (!text.trim()) {
    alert("Type your script text first.");
    return;
  }

  const save = buildSave(title, text);
  state.saves.unshift(save);
  state.activeSaveId = save.id;

  persistSaves();
  syncSaveToSanity(save, { silent: true });
  renderSaveList();
  renderPractice();
  showView("practice");

  refs.newTitle.value = "";
  refs.newScript.value = "";
}

function buildSave(title, text) {
  const tokenized = tokenize(text);
  const wordIndexes = [];

  tokenized.tokens.forEach((token, idx) => {
    if (token.type === "word") {
      wordIndexes.push(idx);
    }
  });

  return {
    id: createId(),
    title,
    text,
    tokens: tokenized.tokens,
    hideOrder: shuffle(wordIndexes),
    hiddenCount: 0,
    wordCount: wordIndexes.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function tokenize(text) {
  const tokens = [];
  const regex = /(\s+|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?|[^A-Za-z0-9\s])/g;
  const matches = text.match(regex) || [];

  matches.forEach((part) => {
    if (/^\s+$/.test(part)) {
      tokens.push({ type: "space", value: part });
    } else if (/^[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?$/.test(part)) {
      tokens.push({ type: "word", value: part });
    } else {
      tokens.push({ type: "punct", value: part });
    }
  });

  return { tokens };
}

function renderSaveList() {
  refs.saveList.innerHTML = "";

  if (state.saves.length === 0) {
    refs.saveList.innerHTML = '<li class="empty">No saves yet. Create one on the left.</li>';
    return;
  }

  for (const save of state.saves) {
    const node = refs.saveItemTemplate.content.cloneNode(true);
    const li = node.querySelector(".save-item");
    const title = node.querySelector(".save-title");
    const info = node.querySelector(".save-info");
    const loadBtn = node.querySelector(".load-btn");
    const exportBtn = node.querySelector(".export-btn");
    const deleteBtn = node.querySelector(".delete-btn");

    title.textContent = save.title;
    info.textContent = `${save.hiddenCount}/${save.wordCount} hidden | updated ${formatDate(save.updatedAt)}`;

    loadBtn.addEventListener("click", () => {
      state.activeSaveId = save.id;
      renderPractice();
      showView("practice");
    });

    exportBtn.addEventListener("click", () => exportSave(save));
    deleteBtn.addEventListener("click", () => deleteSave(save.id));

    li.dataset.id = save.id;
    refs.saveList.appendChild(node);
  }
}

function renderPractice() {
  const save = getActiveSave();

  if (!save) {
    showView("menu");
    return;
  }

  refs.activeTitle.textContent = save.title;
  refs.progressLabel.textContent = `${save.hiddenCount} / ${save.wordCount} words hidden`;

  const hiddenSet = new Set(save.hideOrder.slice(0, save.hiddenCount));
  const frag = document.createDocumentFragment();

  save.tokens.forEach((token, index) => {
    if (token.type === "word") {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = token.value;

      if (hiddenSet.has(index)) {
        span.classList.add("hidden-word");
      }

      frag.appendChild(span);
      return;
    }

    frag.appendChild(document.createTextNode(token.value));
  });

  refs.scriptDisplay.innerHTML = "";
  refs.scriptDisplay.appendChild(frag);

  refs.prevBtn.disabled = save.hiddenCount === 0;
  refs.nextBtn.disabled = save.hiddenCount >= save.wordCount;
}

function hideNextWord() {
  const save = getActiveSave();
  if (!save || save.hiddenCount >= save.wordCount) return;

  save.hiddenCount += 1;
  touchSave(save);
  persistSaves();
  syncSaveToSanity(save, { silent: true });
  renderPractice();
  renderSaveList();
}

function revealPreviousWord() {
  const save = getActiveSave();
  if (!save || save.hiddenCount <= 0) return;

  save.hiddenCount -= 1;
  touchSave(save);
  persistSaves();
  syncSaveToSanity(save, { silent: true });
  renderPractice();
  renderSaveList();
}

function resetProgress() {
  const save = getActiveSave();
  if (!save) return;

  const ok = confirm("Reset hidden progress for this script?");
  if (!ok) return;

  save.hiddenCount = 0;
  save.hideOrder = shuffle(save.hideOrder.slice());
  touchSave(save);
  persistSaves();
  syncSaveToSanity(save, { silent: true });
  renderPractice();
  renderSaveList();
}

function deleteSave(id) {
  const save = state.saves.find((item) => item.id === id);
  const ok = confirm(`Delete \"${save?.title || "this save"}\"?`);
  if (!ok) return;

  state.saves = state.saves.filter((item) => item.id !== id);

  if (state.activeSaveId === id) {
    state.activeSaveId = null;
    showView("menu");
  }

  persistSaves();
  deleteSaveFromSanity(save, { silent: true });
  renderSaveList();
}

function handleSaveNow() {
  const save = getActiveSave();
  persistSaves();

  if (!save) return;

  syncSaveToSanity(save);
}

function exportCurrentSave() {
  const save = getActiveSave();
  if (!save) return;

  exportSave(save);
}

function exportAllSaves() {
  const payload = {
    app: "script_memorizor",
    version: 1,
    exportedAt: new Date().toISOString(),
    saves: state.saves,
  };

  downloadJson(payload, `script-memorizor-all-${safeDate(new Date())}.json`);
}

function exportSave(save) {
  const payload = {
    app: "script_memorizor",
    version: 1,
    exportedAt: new Date().toISOString(),
    save,
  };

  const cleanName = save.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "script";
  downloadJson(payload, `script-memorizor-${cleanName}.json`);
}

function handleImportFromFile() {
  const file = refs.importFile.files?.[0];
  if (!file) {
    alert("Choose a JSON file to import.");
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const importedSaves = [];

    try {
      const raw = JSON.parse(String(reader.result || "{}"));
      const imported = parseImportedPayload(raw);

      if (imported.length === 0) {
        alert("No valid saves found in that file.");
        return;
      }

      const existingById = new Map(state.saves.map((item) => [item.id, item]));

      for (const save of imported) {
        const fixed = normalizeSave(save);
        if (!fixed) continue;

        if (existingById.has(fixed.id)) {
          fixed.id = createId();
        }

        state.saves.unshift(fixed);
        importedSaves.push(fixed);
      }

      persistSaves();
      renderSaveList();
      refs.importFile.value = "";
    } catch (err) {
      alert("Invalid JSON file.");
      return;
    }

    if (importedSaves.length > 0 && getSanityToken()) {
      const didSync = await syncSavesToSanity(importedSaves);
      alert(
        didSync
          ? `Imported ${importedSaves.length} save(s) and pushed them to Sanity.`
          : `Imported ${importedSaves.length} save(s) locally.`,
      );
      return;
    }

    alert(`Imported ${importedSaves.length} save(s).`);
  };

  reader.readAsText(file);
}

function parseImportedPayload(raw) {
  if (!raw || typeof raw !== "object") return [];

  if (Array.isArray(raw.saves)) {
    return raw.saves;
  }

  if (raw.save && typeof raw.save === "object") {
    return [raw.save];
  }

  if (Array.isArray(raw)) {
    return raw;
  }

  return [];
}

function normalizeSave(input) {
  if (!input || typeof input !== "object") return null;

  const title = String(input.title || "Imported Script");
  const text = String(input.text || "");

  if (!text.trim()) return null;

  const rebuilt = buildSave(title, text);
  const hiddenCount = Number.isInteger(input.hiddenCount) ? input.hiddenCount : 0;

  rebuilt.id = typeof input.id === "string" && input.id.trim() ? input.id : createId();
  rebuilt.createdAt = input.createdAt || rebuilt.createdAt;
  rebuilt.updatedAt = input.updatedAt || rebuilt.updatedAt;
  rebuilt.hiddenCount = Math.max(0, Math.min(rebuilt.wordCount, hiddenCount));

  if (Array.isArray(input.hideOrder) && input.hideOrder.length === rebuilt.wordCount) {
    const validOrder = input.hideOrder.every((n) => Number.isInteger(n));
    if (validOrder) {
      rebuilt.hideOrder = input.hideOrder.slice();
    }
  }

  return rebuilt;
}

function loadSaves() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => normalizeSave(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function persistSaves() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saves));
}

async function pullSavesFromSanity(options = {}) {
  const { silent = false } = options;
  const token = getSanityToken();

  if (!silent) {
    setSanityStatus("Sanity: pulling saves...");
  }

  try {
    const remoteSaves = await fetchSavesFromSanity({ token });
    const result = mergeRemoteSaves(remoteSaves);

    if (result.changed > 0) {
      persistSaves();
      renderSaveList();
      if (getActiveSave()) {
        renderPractice();
      }
    }

    if (!silent || remoteSaves.length > 0) {
      setSanityStatus(formatSyncStatus("pulled", remoteSaves.length, result));
    }
  } catch (err) {
    if (!silent) {
      setSanityStatus("Sanity: pull failed");
      alert("Could not pull saves from Sanity. Check the local server origin and dataset access.");
    }
  }
}

async function handleSaveAndSync() {
  persistSaves();

  const token = getSanityToken();
  if (!token) {
    setSanityStatus("Sanity: saved locally; token required to sync");
    alert("Saved locally. Paste a Sanity write token to sync with the database.");
    return;
  }

  setSyncBusy(true);
  setSanityStatus("Sanity: saving and syncing...");

  try {
    const remoteSaves = await fetchSavesFromSanity({ token });
    const result = mergeRemoteSaves(remoteSaves);

    persistSaves();
    renderSaveList();
    if (getActiveSave()) {
      renderPractice();
    }

    await syncSavesToSanity(state.saves, { silent: true });
    setSanityStatus(formatSyncStatus("saved and synced", state.saves.length, result));
  } catch (err) {
    setSanityStatus("Sanity: sync failed");
    alert("Could not save and sync. Check that the token has read and write access.");
  } finally {
    setSyncBusy(false);
  }
}

async function fetchSavesFromSanity(options = {}) {
  const { token = "" } = options;
  const query = `*[_type == "scriptSave"] | order(coalesce(updatedAt, _updatedAt) desc) {
    _id,
    _originalId,
    _createdAt,
    _updatedAt,
    localId,
    title,
    text,
    hideOrder,
    hiddenCount,
    createdAt,
    updatedAt
  }`;
  const response = await fetch(getSanityQueryUrl(query, { perspective: token ? "drafts" : "published" }), {
    headers: getSanityRequestHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Sanity query failed with ${response.status}`);
  }

  const payload = await response.json();
  return (payload.result || []).map(sanityDocumentToSave).filter(Boolean);
}

async function syncSaveToSanity(save, options = {}) {
  if (!save) return false;
  return syncSavesToSanity([save], options);
}

async function syncSavesToSanity(saves, options = {}) {
  const { silent = false } = options;
  const token = getSanityToken();

  if (!token) {
    if (!silent) {
      setSanityStatus("Sanity: token required for uploads");
      alert("Paste a Sanity write token before uploading saves.");
    }
    return false;
  }

  if (!Array.isArray(saves) || saves.length === 0) {
    if (!silent) {
      setSanityStatus("Sanity: no saves to push");
    }
    return false;
  }

  if (!silent) {
    setSanityStatus("Sanity: pushing saves...");
  }

  try {
    const mutations = saves.map((save) => ({
      createOrReplace: saveToSanityDocument(save),
    }));

    await mutateSanity(mutations, token);

    if (!silent) {
      setSanityStatus(`Sanity: pushed ${saves.length} save(s)`);
    }

    return true;
  } catch (err) {
    if (!silent) {
      setSanityStatus("Sanity: push failed");
      alert("Could not push saves to Sanity. Check that the token has write access.");
    }
    return false;
  }
}

async function deleteSaveFromSanity(save, options = {}) {
  const { silent = false } = options;
  const token = getSanityToken();

  if (!save || !token) return false;

  try {
    await mutateSanity(
      [
        {
          delete: {
            id: getSanityDocumentId(save),
          },
        },
      ],
      token,
    );

    if (!silent) {
      setSanityStatus("Sanity: deleted save");
    }

    return true;
  } catch (err) {
    if (!silent) {
      setSanityStatus("Sanity: delete failed");
    }
    return false;
  }
}

async function mutateSanity(mutations, token) {
  const response = await fetch(getSanityMutationUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mutations,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sanity mutation failed with ${response.status}: ${body.slice(0, 240)}`);
  }
}

function sanityDocumentToSave(doc) {
  if (!doc || typeof doc !== "object") return null;
  const sourceId = String(doc._originalId || doc._id || "");

  const save = normalizeSave({
    id: doc.localId || sourceId.replace(/^drafts\./, "").replace(/^scriptSave\./, ""),
    title: doc.title,
    text: doc.text,
    hideOrder: Array.isArray(doc.hideOrder) ? doc.hideOrder : [],
    hiddenCount: Number.isInteger(doc.hiddenCount) ? doc.hiddenCount : 0,
    createdAt: doc.createdAt || doc._createdAt,
    updatedAt: doc.updatedAt || doc._updatedAt,
  });

  if (save && sourceId && !sourceId.startsWith("drafts.")) {
    save.sanityDocumentId = sourceId;
  }

  return save;
}

function saveToSanityDocument(save) {
  return {
    _id: getSanityDocumentId(save),
    _type: "scriptSave",
    localId: save.id,
    title: save.title,
    text: save.text,
    hideOrder: save.hideOrder,
    hiddenCount: save.hiddenCount,
    wordCount: save.wordCount,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
  };
}

function mergeRemoteSaves(remoteSaves) {
  const result = {
    added: 0,
    updated: 0,
    duplicated: 0,
    unchanged: 0,
    changed: 0,
  };
  const byId = new Map(state.saves.map((save, index) => [save.id, { save, index }]));
  const rebuildIndex = () => {
    byId.clear();
    state.saves.forEach((save, index) => byId.set(save.id, { save, index }));
  };

  for (const remote of remoteSaves) {
    const existing = byId.get(remote.id);

    if (!existing) {
      state.saves.unshift(remote);
      rebuildIndex();
      result.added += 1;
      continue;
    }

    if (savesMatchForSync(existing.save, remote)) {
      if (!existing.save.sanityDocumentId && remote.sanityDocumentId) {
        existing.save.sanityDocumentId = remote.sanityDocumentId;
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
      continue;
    }

    const remoteTime = Date.parse(remote.updatedAt || "");
    const localTime = Date.parse(existing.save.updatedAt || "");

    if (Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime > localTime)) {
      state.saves[existing.index] = remote;
      byId.set(remote.id, { save: remote, index: existing.index });
      result.updated += 1;
      continue;
    }

    if (Number.isFinite(remoteTime) && Number.isFinite(localTime) && localTime > remoteTime) {
      if (!existing.save.sanityDocumentId && remote.sanityDocumentId) {
        existing.save.sanityDocumentId = remote.sanityDocumentId;
        result.updated += 1;
      } else {
        result.unchanged += 1;
      }
      continue;
    }

    const duplicate = duplicateSaveForConflict(remote);
    state.saves.unshift(duplicate);
    rebuildIndex();
    result.duplicated += 1;
  }

  result.changed = result.added + result.updated + result.duplicated;

  if (result.changed > 0) {
    state.saves.sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
    rebuildIndex();
  }

  return result;
}

function savesMatchForSync(a, b) {
  return (
    a.title === b.title &&
    a.text === b.text &&
    a.hiddenCount === b.hiddenCount &&
    a.wordCount === b.wordCount &&
    JSON.stringify(a.hideOrder || []) === JSON.stringify(b.hideOrder || [])
  );
}

function duplicateSaveForConflict(save) {
  const now = new Date().toISOString();
  const duplicate = normalizeSave({
    ...save,
    id: createId(),
    title: `${save.title || "Script"} (Synced Copy)`,
    createdAt: now,
    updatedAt: now,
  });

  if (duplicate) {
    delete duplicate.sanityDocumentId;
  }

  return duplicate;
}

function formatSyncStatus(action, count, result) {
  const details = [];

  if (result.added) details.push(`${result.added} added`);
  if (result.updated) details.push(`${result.updated} updated`);
  if (result.duplicated) details.push(`${result.duplicated} duplicated`);

  return details.length > 0
    ? `Sanity: ${action} ${count} save(s), ${details.join(", ")}`
    : `Sanity: ${action} ${count} save(s), no changes`;
}

function getSanityQueryUrl(query, options = {}) {
  const { projectId, dataset, apiVersion } = SANITY_CONFIG;
  const params = new URLSearchParams({ query });

  if (options.perspective) {
    params.set("perspective", options.perspective);
  }

  return `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?${params.toString()}`;
}

function getSanityMutationUrl() {
  const { projectId, dataset, apiVersion } = SANITY_CONFIG;
  return `https://${projectId}.api.sanity.io/v${apiVersion}/data/mutate/${dataset}?returnDocuments=false`;
}

function getSanityDocumentId(save) {
  if (
    typeof save.sanityDocumentId === "string" &&
    /^[A-Za-z0-9._-]+$/.test(save.sanityDocumentId) &&
    !save.sanityDocumentId.startsWith("drafts.")
  ) {
    return save.sanityDocumentId;
  }

  const cleanId = String(save.id || createId()).replace(/[^A-Za-z0-9._-]/g, "-");
  return `scriptSave.${cleanId}`;
}

function getSanityRequestHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleSaveSanityToken() {
  const token = refs.sanityToken.value.trim();

  if (!token) {
    alert("Paste a Sanity write token first.");
    return;
  }

  try {
    sessionStorage.setItem(SANITY_TOKEN_KEY, token);
    refs.sanityToken.value = "";
    renderSanityTokenState();
    setSanityStatus("Sanity: token ready");
  } catch {
    alert("Could not store the token in this browser session.");
  }
}

function clearSanityToken() {
  try {
    sessionStorage.removeItem(SANITY_TOKEN_KEY);
  } catch {
    // Ignore browsers that block session storage.
  }

  refs.sanityToken.value = "";
  renderSanityTokenState();
  setSanityStatus("Sanity: local mode");
}

function getSanityToken() {
  try {
    return sessionStorage.getItem(SANITY_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function renderSanityTokenState() {
  const hasToken = Boolean(getSanityToken());
  refs.pullSanityBtn.disabled = state.isSyncing;
  refs.saveAndSyncBtn.disabled = state.isSyncing;
  refs.pushSanityBtn.disabled = !hasToken || state.isSyncing;
  refs.clearTokenBtn.disabled = !hasToken || state.isSyncing;
  refs.sanityToken.placeholder = hasToken ? "Token active for this session" : "Paste token for uploads";
}

function setSanityStatus(message) {
  refs.sanityStatus.textContent = message;
}

function setSyncBusy(isSyncing) {
  state.isSyncing = isSyncing;
  renderSanityTokenState();
}

function getActiveSave() {
  return state.saves.find((item) => item.id === state.activeSaveId) || null;
}

function showView(name) {
  const isMenu = name === "menu";
  refs.menuView.classList.toggle("active", isMenu);
  refs.practiceView.classList.toggle("active", !isMenu);
}

function touchSave(save) {
  save.updatedAt = new Date().toISOString();
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown date";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function safeDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
