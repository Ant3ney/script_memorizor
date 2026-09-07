const STORAGE_KEY = "script_memorizor_saves_v1";
const CLOUD_SLOT_STORAGE_KEY = "script_memorizor_cloud_slot_v1";
const CLOUD_SAVE_DELAY = 600;
const CLOUD_SYNC_INTERVAL = 30_000;

const state = {
  saves: [],
  activeSaveId: null,
  activeSlotId: null,
  cloudRequests: 0,
};

let pendingCloudTimer = null;
let pendingCloudSlotId = null;
let cloudWriteQueue = Promise.resolve();
let periodicCloudSyncTimer = null;

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
  slotId: document.getElementById("slotId"),
  loadMongoBtn: document.getElementById("loadMongoBtn"),
  saveMongoBtn: document.getElementById("saveMongoBtn"),
  clearSlotBtn: document.getElementById("clearSlotBtn"),
  mongoStatus: document.getElementById("mongoStatus"),
};

init();

function init() {
  state.saves = loadLocalSaves();
  state.activeSlotId = loadRememberedCloudSlot();
  if (state.activeSlotId) refs.slotId.value = state.activeSlotId;

  bindEvents();
  renderSaveList();
  renderCloudControls();
  startPeriodicCloudSync();

  if (state.activeSlotId) {
    setMongoStatus(`Cloud ${state.activeSlotId}: remembered. Loading the latest scripts...`);
    window.setTimeout(() => handleLoadFromMongo({ automatic: true }), 0);
  }
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
  refs.loadMongoBtn.addEventListener("click", handleLoadFromMongo);
  refs.saveMongoBtn.addEventListener("click", handleSaveToMongo);
  refs.clearSlotBtn.addEventListener("click", disconnectCloudSlot);
  refs.slotId.addEventListener("input", handleSlotInput);
  refs.slotId.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleLoadFromMongo();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingCloudSave();
    } else {
      syncActiveCloudSlot();
    }
  });
  window.addEventListener("online", syncActiveCloudSlot);
}

function handleSlotInput() {
  const digits = refs.slotId.value.replace(/\D/g, "").slice(0, 4);
  if (refs.slotId.value !== digits) refs.slotId.value = digits;
  refs.slotId.setCustomValidity("");

  if (state.activeSlotId && digits !== state.activeSlotId) {
    flushPendingCloudSave();
    state.activeSlotId = null;
    renderCloudControls();
    setMongoStatus("Cloud: ID changed. Load it or save the current library to it.");
  }
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
  renderSaveList();
  renderPractice();
  showView("practice");

  refs.newTitle.value = "";
  refs.newScript.value = "";
}

function buildSave(title, text) {
  const tokens = tokenize(text);
  const wordIndexes = [];

  tokens.forEach((token, index) => {
    if (token.type === "word") wordIndexes.push(index);
  });

  const now = new Date().toISOString();
  return {
    id: createId(),
    title: String(title).slice(0, 120),
    text,
    tokens,
    hideOrder: shuffle(wordIndexes),
    hiddenCount: 0,
    wordCount: wordIndexes.length,
    createdAt: now,
    updatedAt: now,
  };
}

function tokenize(text) {
  const parts = text.match(/(\s+|[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?|[^A-Za-z0-9\s])/g) || [];
  return parts.map((part) => {
    if (/^\s+$/.test(part)) return { type: "space", value: part };
    if (/^[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?$/.test(part)) {
      return { type: "word", value: part };
    }
    return { type: "punct", value: part };
  });
}

function renderSaveList() {
  refs.saveList.innerHTML = "";

  if (state.saves.length === 0) {
    refs.saveList.innerHTML = '<li class="empty">No saves yet. Create one on the left.</li>';
    return;
  }

  for (const save of state.saves) {
    const node = refs.saveItemTemplate.content.cloneNode(true);
    const listItem = node.querySelector(".save-item");
    node.querySelector(".save-title").textContent = save.title;
    node.querySelector(".save-info").textContent =
      `${save.hiddenCount}/${save.wordCount} hidden | updated ${formatDate(save.updatedAt)}`;

    node.querySelector(".load-btn").addEventListener("click", () => {
      state.activeSaveId = save.id;
      renderPractice();
      showView("practice");
    });
    node.querySelector(".export-btn").addEventListener("click", () => exportSave(save));
    node.querySelector(".delete-btn").addEventListener("click", () => deleteSave(save.id));

    listItem.dataset.id = save.id;
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
  const fragment = document.createDocumentFragment();

  save.tokens.forEach((token, index) => {
    if (token.type === "word") {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = token.value;
      if (hiddenSet.has(index)) span.classList.add("hidden-word");
      fragment.appendChild(span);
      return;
    }
    fragment.appendChild(document.createTextNode(token.value));
  });

  refs.scriptDisplay.replaceChildren(fragment);
  refs.prevBtn.disabled = save.hiddenCount === 0;
  refs.nextBtn.disabled = save.hiddenCount >= save.wordCount;
}

function hideNextWord() {
  const save = getActiveSave();
  if (!save || save.hiddenCount >= save.wordCount) return;
  save.hiddenCount += 1;
  saveChanged(save);
}

function revealPreviousWord() {
  const save = getActiveSave();
  if (!save || save.hiddenCount <= 0) return;
  save.hiddenCount -= 1;
  saveChanged(save);
}

function resetProgress() {
  const save = getActiveSave();
  if (!save || !confirm("Reset hidden progress for this script?")) return;
  save.hiddenCount = 0;
  save.hideOrder = shuffle(save.hideOrder);
  saveChanged(save);
}

function saveChanged(save) {
  touchSave(save);
  persistSaves();
  renderPractice();
  renderSaveList();
}

function deleteSave(id) {
  const save = state.saves.find((item) => item.id === id);
  if (!confirm(`Delete "${save?.title || "this save"}"?`)) return;

  state.saves = state.saves.filter((item) => item.id !== id);
  if (state.activeSaveId === id) {
    state.activeSaveId = null;
    showView("menu");
  }

  persistSaves();
  renderSaveList();
}

async function handleSaveNow() {
  persistSaves({ sync: false });
  if (!getActiveSave()) return;

  if (!state.activeSlotId) {
    alert("Saved in this browser. Use the main menu to choose a four-digit cloud ID.");
    return;
  }

  await saveCurrentLibraryToMongo(state.activeSlotId);
}

async function handleLoadFromMongo(options = {}) {
  const slotId = getValidatedSlotId();
  if (!slotId) return;

  await flushPendingCloudSave();
  beginCloudRequest();
  setMongoStatus(`Cloud ${slotId}: loading...`);

  try {
    await cloudWriteQueue.catch(() => {});
    const response = await fetch(`/api/scripts/${slotId}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) throw new Error(payload.error || "Could not load that save ID.");
    if (payload.found === false) throw new Error("No scripts have been saved to that ID.");
    if (!Array.isArray(payload.saves)) throw new Error("The server returned an invalid script library.");

    state.saves = payload.saves.map(normalizeSave).filter(Boolean);
    state.activeSaveId = null;
    rememberCloudSlot(slotId);
    persistSaves({ sync: false });
    renderSaveList();
    renderCloudControls();
    showView("menu");
    setMongoStatus(
      `Cloud ${slotId}: loaded ${state.saves.length} script(s). Auto-save and 30-second sync are on.`,
    );
  } catch (error) {
    setMongoStatus(`Cloud ${slotId}: ${error.message}`);
    if (!options.automatic) refs.slotId.focus();
  } finally {
    endCloudRequest();
  }
}

async function handleSaveToMongo() {
  const slotId = getValidatedSlotId();
  if (!slotId) return;

  clearPendingCloudTimer();
  state.activeSlotId = slotId;
  renderCloudControls();
  await saveCurrentLibraryToMongo(slotId);
}

async function saveCurrentLibraryToMongo(slotId, options = {}) {
  const saves = state.saves.map(toPortableSave);
  const { silent = false } = options;
  return enqueueCloudWrite(slotId, saves, { silent });
}

function enqueueCloudWrite(slotId, saves, options = {}) {
  const write = async () => {
    beginCloudRequest();
    if (state.activeSlotId === slotId) setMongoStatus(`Cloud ${slotId}: saving...`);

    try {
      const response = await fetch(`/api/scripts/${slotId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ saves }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload.error || "Could not save this script library.");

      if (state.activeSlotId === slotId) {
        rememberCloudSlot(slotId);
        setMongoStatus(
          `Cloud ${slotId}: saved ${payload.saveCount} script(s). Auto-save and 30-second sync are on.`,
        );
      }
      return true;
    } catch (error) {
      if (state.activeSlotId === slotId) {
        setMongoStatus(`Cloud ${slotId}: sync failed; changes remain saved in this browser.`);
      }
      if (!options.silent) alert(error.message);
      return false;
    } finally {
      endCloudRequest();
    }
  };

  const result = cloudWriteQueue.catch(() => {}).then(write);
  cloudWriteQueue = result;
  return result;
}

function scheduleCloudSave() {
  if (!state.activeSlotId) return;

  clearPendingCloudTimer();
  pendingCloudSlotId = state.activeSlotId;
  setMongoStatus(`Cloud ${pendingCloudSlotId}: changes waiting to sync...`);
  pendingCloudTimer = window.setTimeout(() => {
    const slotId = pendingCloudSlotId;
    pendingCloudTimer = null;
    pendingCloudSlotId = null;
    if (!slotId || state.activeSlotId !== slotId) return;
    saveCurrentLibraryToMongo(slotId, { silent: true });
  }, CLOUD_SAVE_DELAY);
}

function flushPendingCloudSave() {
  if (!pendingCloudTimer || !pendingCloudSlotId) return Promise.resolve();

  const slotId = pendingCloudSlotId;
  clearPendingCloudTimer();
  if (state.activeSlotId !== slotId) return Promise.resolve();
  return saveCurrentLibraryToMongo(slotId, { silent: true });
}

function clearPendingCloudTimer() {
  if (pendingCloudTimer) window.clearTimeout(pendingCloudTimer);
  pendingCloudTimer = null;
  pendingCloudSlotId = null;
}

function startPeriodicCloudSync() {
  if (periodicCloudSyncTimer) window.clearInterval(periodicCloudSyncTimer);
  periodicCloudSyncTimer = window.setInterval(syncActiveCloudSlot, CLOUD_SYNC_INTERVAL);
}

function syncActiveCloudSlot() {
  if (!state.activeSlotId || state.cloudRequests > 0 || document.visibilityState === "hidden") {
    return;
  }

  if (pendingCloudTimer) {
    flushPendingCloudSave();
    return;
  }

  saveCurrentLibraryToMongo(state.activeSlotId, { silent: true });
}

function rememberCloudSlot(slotId) {
  state.activeSlotId = slotId;
  refs.slotId.value = slotId;
  localStorage.setItem(CLOUD_SLOT_STORAGE_KEY, slotId);
  renderCloudControls();
}

function loadRememberedCloudSlot() {
  const slotId = localStorage.getItem(CLOUD_SLOT_STORAGE_KEY) || "";
  return /^\d{4}$/.test(slotId) ? slotId : null;
}

async function disconnectCloudSlot() {
  await flushPendingCloudSave();
  state.activeSlotId = null;
  refs.slotId.value = "";
  localStorage.removeItem(CLOUD_SLOT_STORAGE_KEY);
  renderCloudControls();
  setMongoStatus("Cloud: disconnected and the remembered ID was removed. Local saves remain available.");
}

function getValidatedSlotId() {
  const slotId = refs.slotId.value.trim();
  const isValid = /^\d{4}$/.test(slotId);
  refs.slotId.setCustomValidity(isValid ? "" : "Enter exactly four digits.");
  if (!isValid) {
    refs.slotId.reportValidity();
    setMongoStatus("Cloud: enter exactly four digits.");
    return null;
  }
  return slotId;
}

function beginCloudRequest() {
  state.cloudRequests += 1;
  renderCloudControls();
}

function endCloudRequest() {
  state.cloudRequests = Math.max(0, state.cloudRequests - 1);
  renderCloudControls();
}

function renderCloudControls() {
  const isBusy = state.cloudRequests > 0;
  refs.loadMongoBtn.disabled = isBusy;
  refs.saveMongoBtn.disabled = isBusy;
  refs.clearSlotBtn.disabled = !state.activeSlotId || isBusy;
}

function setMongoStatus(message) {
  refs.mongoStatus.textContent = message;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function handleImportFromFile() {
  const file = refs.importFile.files?.[0];
  if (!file) {
    alert("Choose a JSON file to import.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseImportedPayload(JSON.parse(String(reader.result || "{}")));
      const existingIds = new Set(state.saves.map((item) => item.id));
      const importedSaves = [];

      for (const item of imported) {
        const save = normalizeSave(item);
        if (!save) continue;
        if (existingIds.has(save.id)) save.id = createId();
        existingIds.add(save.id);
        state.saves.unshift(save);
        importedSaves.push(save);
      }

      if (importedSaves.length === 0) {
        alert("No valid saves found in that file.");
        return;
      }

      persistSaves();
      renderSaveList();
      refs.importFile.value = "";
      alert(`Imported ${importedSaves.length} save(s).`);
    } catch {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

function parseImportedPayload(raw) {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.saves)) return raw.saves;
  if (raw.save && typeof raw.save === "object") return [raw.save];
  return Array.isArray(raw) ? raw : [];
}

function normalizeSave(input) {
  if (!input || typeof input !== "object") return null;

  const title = String(input.title || "Imported Script");
  const text = String(input.text || "");
  if (!text.trim()) return null;

  const rebuilt = buildSave(title, text);
  const expectedIndexes = new Set(rebuilt.hideOrder);
  const providedOrder = Array.isArray(input.hideOrder) ? input.hideOrder : [];
  const hasValidOrder =
    providedOrder.length === rebuilt.wordCount &&
    new Set(providedOrder).size === rebuilt.wordCount &&
    providedOrder.every((index) => Number.isInteger(index) && expectedIndexes.has(index));

  rebuilt.id = normalizeClientScriptId(input.id) || createId();
  rebuilt.createdAt = normalizeDate(input.createdAt, rebuilt.createdAt);
  rebuilt.updatedAt = normalizeDate(input.updatedAt, rebuilt.updatedAt);
  if (hasValidOrder) rebuilt.hideOrder = providedOrder.slice();

  const hiddenCount = Number.isInteger(input.hiddenCount) ? input.hiddenCount : 0;
  rebuilt.hiddenCount = Math.max(0, Math.min(rebuilt.wordCount, hiddenCount));
  return rebuilt;
}

function normalizeClientScriptId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= 100 && /^[A-Za-z0-9._-]+$/.test(id) ? id : "";
}

function normalizeDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function loadLocalSaves() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeSave).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistSaves(options = {}) {
  const { sync = true } = options;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saves));
  if (sync) scheduleCloudSave();
}

function toPortableSave(save) {
  return {
    id: save.id,
    title: save.title,
    text: save.text,
    hideOrder: save.hideOrder,
    hiddenCount: save.hiddenCount,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
  };
}

function exportCurrentSave() {
  const save = getActiveSave();
  if (save) exportSave(save);
}

function exportAllSaves() {
  downloadJson(
    { app: "script_memorizor", version: 2, exportedAt: new Date().toISOString(), saves: state.saves },
    `script-memorizor-all-${safeDate(new Date())}.json`,
  );
}

function exportSave(save) {
  const cleanName =
    save.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "script";
  downloadJson(
    { app: "script_memorizor", version: 2, exportedAt: new Date().toISOString(), save },
    `script-memorizor-${cleanName}.json`,
  );
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

function getActiveSave() {
  return state.saves.find((item) => item.id === state.activeSaveId) || null;
}

function showView(name) {
  const showMenu = name === "menu";
  refs.menuView.classList.toggle("active", showMenu);
  refs.practiceView.classList.toggle("active", !showMenu);
}

function touchSave(save) {
  save.updatedAt = new Date().toISOString();
}

function shuffle(values) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function createId() {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
