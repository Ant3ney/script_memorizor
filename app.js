const STORAGE_KEY = "script_memorizor_saves_v1";

const state = {
  saves: [],
  activeSaveId: null,
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
};

init();

function init() {
  state.saves = loadSaves();
  bindEvents();
  renderSaveList();
}

function bindEvents() {
  refs.createBtn.addEventListener("click", handleCreateSave);
  refs.importBtn.addEventListener("click", handleImportFromFile);
  refs.exportAllBtn.addEventListener("click", exportAllSaves);
  refs.backToMenuBtn.addEventListener("click", () => showView("menu"));
  refs.prevBtn.addEventListener("click", revealPreviousWord);
  refs.nextBtn.addEventListener("click", hideNextWord);
  refs.resetBtn.addEventListener("click", resetProgress);
  refs.saveNowBtn.addEventListener("click", persistSaves);
  refs.exportCurrentBtn.addEventListener("click", exportCurrentSave);
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
  renderPractice();
  renderSaveList();
}

function revealPreviousWord() {
  const save = getActiveSave();
  if (!save || save.hiddenCount <= 0) return;

  save.hiddenCount -= 1;
  touchSave(save);
  persistSaves();
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
  renderSaveList();
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
  reader.onload = () => {
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
      }

      persistSaves();
      renderSaveList();
      refs.importFile.value = "";
      alert(`Imported ${imported.length} save(s).`);
    } catch (err) {
      alert("Invalid JSON file.");
    }
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

