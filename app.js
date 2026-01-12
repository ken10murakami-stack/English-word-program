/* =========================
   English Word Program v3.1
   - 起動時にスプレッドシートを裏で自動読み込み（UI非表示）
   - 失敗時は localStorage の前回データで起動
   ========================= */

const STORAGE_KEY  = "ewp_cards_v3";
const PROGRESS_KEY = "ewp_progress_v3";
const SETTINGS_KEY = "ewp_settings_v3";

const MASTER_STREAK = 3;

/** ★先生用：ここにスプレッドシートURLを固定してください（生徒には見せない想定） */
const AUTO_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mIugH6yKzxqxoT5QCFC6IkdHHSOG_ixpmp9H5DrfNFo/edit?gid=0#gid=0";

const MODES = {
  JA_EN_CARD: "ja-en-card",
  EN_JA_CARD: "en-ja-card",
  JA_EN_TYPING: "ja-en-typing",
};

const MODE_LABEL = {
  [MODES.JA_EN_CARD]: "日→英（カード）",
  [MODES.EN_JA_CARD]: "英→日（カード）",
  [MODES.JA_EN_TYPING]: "日→英（タイピング）",
};

const SAMPLE_DATA = [
  { id: 1, word: "great", meaning: "すごい、偉大な", grade: "中１", level: 1, pos: "形容詞" },
  { id: 2, word: "really", meaning: "ほんとうに", grade: "中１", level: 1, pos: "副詞" },
  { id: 3, word: "see", meaning: "見る、会う", grade: "中１", level: 1, pos: "動詞" },
  { id: 4, word: "enjoy", meaning: "楽しむ", grade: "中１", level: 1, pos: "動詞" },
  { id: 5, word: "favorite", meaning: "お気に入りの", grade: "中１", level: 1, pos: "形容詞" },
];

const $ = (id) => document.getElementById(id);

let allCards  = loadCardsFromStorage() ?? SAMPLE_DATA.slice();
let progress  = loadProgress();
let settings  = loadSettings();

let filtered = [];
let index = 0;

const els = {
  quizMode: $("quizMode"),
  strategy: $("strategy"),
  mode: $("mode"),
  filterGrade: $("filterGrade"),
  filterLevel: $("filterLevel"),
  filterPos: $("filterPos"),
  autoSpeak: $("autoSpeak"),

  typingPanel: $("typingPanel"),
  typingInput: $("typingInput"),
  typingCheckBtn: $("typingCheckBtn"),
  typingRevealBtn: $("typingRevealBtn"),
  typingMsg: $("typingMsg"),

  stats: $("stats"),

  card: $("card"),
  frontText: $("frontText"),
  backText: $("backText"),
  metaTop: $("metaTop"),
  metaBottom: $("metaBottom"),
  frontHint: $("frontHint"),
  backHint: $("backHint"),

  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  revealBtn: $("revealBtn"),
  skipBtn: $("skipBtn"),
  markGood: $("markGood"),
  markBad: $("markBad"),
  resetProgress: $("resetProgress"),

  speakBtn: $("speakBtn"),
  stopSpeakBtn: $("stopSpeakBtn"),

  mOverallJaEnCard: $("mOverallJaEnCard"),
  mGradeJaEnCard: $("mGradeJaEnCard"),
  mLevelJaEnCard: $("mLevelJaEnCard"),
  mPosJaEnCard: $("mPosJaEnCard"),

  mOverallEnJaCard: $("mOverallEnJaCard"),
  mGradeEnJaCard: $("mGradeEnJaCard"),
  mLevelEnJaCard: $("mLevelEnJaCard"),
  mPosEnJaCard: $("mPosEnJaCard"),

  mOverallJaEnTyping: $("mOverallJaEnTyping"),
  mGradeJaEnTyping: $("mGradeJaEnTyping"),
  mLevelJaEnTyping: $("mLevelJaEnTyping"),
  mPosJaEnTyping: $("mPosJaEnTyping"),
};

init();

/* -------------------- init -------------------- */
function init() {
  buildFilterOptions();

  els.quizMode.value = settings.quizMode ?? MODES.JA_EN_CARD;
  els.strategy.value = settings.strategy ?? "weak";
  els.mode.value     = settings.mode ?? "all";
  els.autoSpeak.checked = !!settings.autoSpeak;

  syncTypingUI();
  applyFilters(true);
  render(true);
  renderMasteryAllModes();

  // ★起動時に裏で自動読み込み（UIなし・失敗してもアプリは動く）
  autoLoadFromSheet();

  els.filterGrade.addEventListener("change", () => { applyFilters(true); render(true); });
  els.filterLevel.addEventListener("change", () => { applyFilters(true); render(true); });
  els.filterPos.addEventListener("change", () => { applyFilters(true); render(true); });

  els.quizMode.addEventListener("change", () => {
    settings.quizMode = els.quizMode.value;
    saveSettings(settings);
    snapToFront();
    syncTypingUI(true);
    applyFilters(true);
    render(true);
  });

  els.strategy.addEventListener("change", () => {
    settings.strategy = els.strategy.value;
    saveSettings(settings);
    render(false);
  });

  els.mode.addEventListener("change", () => {
    settings.mode = els.mode.value;
    saveSettings(settings);
    applyFilters(true);
    snapToFront();
    render(true);
  });

  els.autoSpeak.addEventListener("change", () => {
    settings.autoSpeak = els.autoSpeak.checked;
    saveSettings(settings);
  });

  els.prevBtn.addEventListener("click", prevCard);
  els.nextBtn.addEventListener("click", () => nextCard(true));

  els.revealBtn.addEventListener("click", revealAnswer);

  els.card.addEventListener("click", () => {
    if (isTypingMode()) return;
    toggleFlip();
  });

  els.card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (isTypingMode()) return;
      e.preventDefault();
      toggleFlip();
    }
    if (e.key === "ArrowRight") nextCard(true);
    if (e.key === "ArrowLeft") prevCard();
  });

  els.skipBtn.addEventListener("click", () => nextCard(true));
  els.markGood.addEventListener("click", () => { snapToFront(); markResult("good"); });
  els.markBad.addEventListener("click", () => { snapToFront(); markResult("bad"); });

  // 進捗リセット：確認ダイアログ
  els.resetProgress.addEventListener("click", () => {
    const ok = window.confirm("本当に進捗をリセットしていいですか？（元に戻せません）");
    if (!ok) return;
    resetProgress();
  });

  els.speakBtn.addEventListener("click", speakCurrentEnglishOnly);
  els.stopSpeakBtn.addEventListener("click", stopSpeak);

  els.typingCheckBtn.addEventListener("click", checkTyping);
  els.typingRevealBtn.addEventListener("click", revealTypingAnswer);
  els.typingInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (els.typingInput.dataset.state === "correctShown") nextCard(true);
      else checkTyping();
    }
  });

  if (!("speechSynthesis" in window)) {
    els.speakBtn.disabled = true;
    els.stopSpeakBtn.disabled = true;
    els.autoSpeak.disabled = true;
  }
}

/* -------------------- auto load -------------------- */
async function autoLoadFromSheet() {
  try {
    const cards = await fetchCardsFromSheetUrl(AUTO_SHEET_URL);
    if (cards.length) {
      allCards = cards;
      saveCardsToStorage(allCards);
      buildFilterOptions();
      // フィルタは「すべて」に戻してOK（授業運用で安定）
      els.filterGrade.value = "すべて";
      els.filterLevel.value = "すべて";
      els.filterPos.value = "すべて";
      applyFilters(true);
      render(true);
      renderMasteryAllModes();
    }
  } catch (e) {
    // 失敗時は無言で継続（前回保存データで動く）
    console.warn("autoLoadFromSheet failed:", e);
  }
}

async function fetchCardsFromSheetUrl(sheetLink) {
  const csvUrl = buildCsvUrlFromSheetLink(sheetLink);
  const bust = (csvUrl.includes("?") ? "&" : "?") + "ts=" + Date.now();
  const res = await fetch(csvUrl + bust, { method: "GET" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const csvText = await res.text();
  const cards = parseCsvToCards(csvText);
  if (!cards.length) throw new Error("No rows");
  return cards;
}

/* -------------------- Chira-mie prevention -------------------- */
function snapToFront() {
  els.card.classList.add("noAnim");
  els.card.classList.remove("flipped");
  void els.card.offsetHeight;
  els.card.classList.remove("noAnim");
}

/* -------------------- Mode helpers -------------------- */
function currentMode() { return els.quizMode.value; }
function isTypingMode() { return currentMode() === MODES.JA_EN_TYPING; }

function syncTypingUI(focusInput=false) {
  if (isTypingMode()) {
    els.typingPanel.classList.add("show");
    snapToFront();
    resetTypingState();
    if (focusInput) setTimeout(() => els.typingInput?.focus(), 0);
  } else {
    els.typingPanel.classList.remove("show");
    resetTypingState();
  }

  const canAutoSpeak = (currentMode() === MODES.EN_JA_CARD);
  if (!canAutoSpeak) {
    els.autoSpeak.checked = false;
    settings.autoSpeak = false;
    saveSettings(settings);
  }
}

function resetTypingState() {
  els.typingInput.value = "";
  els.typingInput.dataset.state = "";
  els.typingMsg.textContent = "";
}

/* -------------------- card text by mode -------------------- */
function frontBackFor(card) {
  const m = currentMode();
  if (m === MODES.EN_JA_CARD) {
    return { front: card.word, back: card.meaning, frontIsEnglish: true, backIsEnglish: false };
  }
  return { front: card.meaning, back: card.word, frontIsEnglish: false, backIsEnglish: true };
}

/* -------------------- rendering -------------------- */
function render(maybeAutoSpeak) {
  snapToFront();

  if (filtered.length === 0) {
    els.frontText.textContent = "該当なし";
    els.backText.textContent = modeIsWrongOnly()
      ? "不正解のカードがありません（不正解を付けると出ます）"
      : "フィルタを変更してください";
    els.metaTop.textContent = "";
    els.metaBottom.textContent = "";
    els.stats.textContent = "0件";
    els.frontHint.textContent = "";
    els.backHint.textContent = "";
    resetTypingState();
    renderMasteryAllModes();
    return;
  }

  index = clamp(index, 0, filtered.length - 1);
  const card = filtered[index];
  const { front, back, frontIsEnglish } = frontBackFor(card);

  els.frontText.textContent = front || "";
  els.backText.textContent = back || "";

  const meta = `#${card.id ?? "-"} / ${card.grade ?? "-"} / Lv${card.level ?? "-" } / ${card.pos ?? "-"}`;
  const p = getModeProgress(card, currentMode());
  const weak = weaknessScore(card, currentMode());
  const masteredText = p.mastered ? "MASTERED" : `streak:${p.streak}/${MASTER_STREAK}`;

  els.metaTop.textContent = meta;
  els.metaBottom.textContent = `${meta}  |  正解:${p.good} 不正解:${p.bad}  |  ${masteredText}  |  苦手度:${Math.round(weak*100)}%`;

  const total = filtered.length;
  const i = index + 1;
  const agg = aggregateProgress(filtered, currentMode());

  els.stats.textContent =
    `${i}/${total}  |  正解:${agg.good} 不正解:${agg.bad}  |  正答率:${agg.rate}%  |  ${MODE_LABEL[currentMode()]}  |  戦略:${labelStrategy(els.strategy.value)}  |  モード:${labelMode(els.mode.value)}`;

  if (isTypingMode()) {
    els.frontHint.textContent = "";
    els.backHint.textContent = "";
    resetTypingState();
    setTimeout(() => els.typingInput?.focus(), 0);
  } else {
    els.frontHint.textContent = "クリックで答え";
    els.backHint.textContent = "クリックで戻す";
  }

  if (maybeAutoSpeak && els.autoSpeak.checked && frontIsEnglish) {
    speakEnglish(front);
  }

  renderMasteryAllModes();
}

function labelStrategy(v){
  if (v === "weak") return "苦手優先";
  if (v === "shuffle") return "ランダム";
  if (v === "seq") return "順番";
  return v;
}
function labelMode(v){
  if (v === "all") return "全カード";
  if (v === "wrongOnly") return "不正解だけ";
  return v;
}

/* -------------------- navigation -------------------- */
function nextCard(forceNoFlip=false) {
  if (forceNoFlip) snapToFront();
  stopSpeak();
  if (!filtered.length) return;

  const strat = els.strategy.value;
  if (strat === "seq") index = (index + 1) % filtered.length;
  else if (strat === "shuffle") index = pickDifferentRandomIndex(index, filtered.length);
  else index = pickWeakestIndex(index);

  render(true);
}

function prevCard() {
  snapToFront();
  stopSpeak();
  if (!filtered.length) return;
  index = (index - 1 + filtered.length) % filtered.length;
  render(true);
}

function pickDifferentRandomIndex(current, len){
  if (len <= 1) return 0;
  let i = current;
  while (i === current) i = randInt(0, len - 1);
  return i;
}
function pickWeakestIndex(current){
  if (filtered.length <= 1) return 0;
  let max = -1, candidates = [];
  for (let i = 0; i < filtered.length; i++) {
    const s = weaknessScore(filtered[i], currentMode());
    if (s > max + 1e-12) { max = s; candidates = [i]; }
    else if (Math.abs(s - max) < 1e-12) candidates.push(i);
  }
  if (candidates.length > 1) {
    const wo = candidates.filter(i => i !== current);
    if (wo.length) candidates = wo;
  }
  return candidates[randInt(0, candidates.length - 1)];
}

/* -------------------- reveal / flip -------------------- */
function toggleFlip() { els.card.classList.toggle("flipped"); }
function revealAnswer() {
  if (isTypingMode()) { revealTypingAnswer(); return; }
  toggleFlip();
}

/* -------------------- typing check (ja-en-typing only) -------------------- */
function currentCard() {
  if (!filtered.length) return null;
  return filtered[clamp(index, 0, filtered.length - 1)];
}

function checkTyping() {
  if (!isTypingMode()) return;
  const card = currentCard();
  if (!card) return;

  const typed = (els.typingInput.value || "").trim();
  if (!typed) {
    els.typingMsg.innerHTML = `<span class="ng">入力してください。</span>`;
    return;
  }

  const ok = normalizeEn(typed) === normalizeEn(card.word);

  if (ok) {
    els.typingMsg.innerHTML = `<span class="ok">正解！</span>（Enterで次へ）`;
    els.typingInput.dataset.state = "correctShown";
    markResult("good", { stayOnCard: true });
    els.card.classList.add("flipped");
  } else {
    els.typingMsg.innerHTML = `<span class="ng">違います。</span>`;
    els.typingInput.dataset.state = "";
    markResult("bad", { stayOnCard: true });
  }
}

function revealTypingAnswer() {
  if (!isTypingMode()) return;
  const card = currentCard();
  if (!card) return;

  els.typingMsg.innerHTML = `答え：<b>${escapeHtml(card.word || "")}</b>`;
  els.typingInput.dataset.state = "revealed";
  els.card.classList.add("flipped");
}

function normalizeEn(s){
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

/* -------------------- filters -------------------- */
function modeIsWrongOnly() { return (els.mode.value === "wrongOnly"); }

function buildFilterOptions() {
  const grades = uniq(allCards.map(c => c.grade).filter(Boolean));
  const levels = uniq(allCards.map(c => c.level).filter(v => v !== undefined && v !== null && v !== ""));
  const poses  = uniq(allCards.map(c => c.pos).filter(Boolean));
  fillSelect(els.filterGrade, ["すべて", ...grades]);
  fillSelect(els.filterLevel, ["すべて", ...levels.map(String)]);
  fillSelect(els.filterPos,   ["すべて", ...poses]);
}
function fillSelect(selectEl, options) {
  selectEl.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  }
}

function applyFilters(resetIndex=false) {
  const g = els.filterGrade.value || "すべて";
  const l = els.filterLevel.value || "すべて";
  const p = els.filterPos.value || "すべて";
  const wrongOnly = modeIsWrongOnly();

  filtered = allCards.filter(c => {
    const okG = (g === "すべて") || (String(c.grade) === g);
    const okL = (l === "すべて") || (String(c.level) === l);
    const okP = (p === "すべて") || (String(c.pos) === p);
    if (!(okG && okL && okP)) return false;

    if (!wrongOnly) return true;
    const pr = getModeProgress(c, currentMode());
    return (pr.bad || 0) >= 1;
  });

  if (resetIndex) index = 0;
}

/* -------------------- progress (mastered + streak) -------------------- */
function getModeProgress(card, mode) {
  const k = progressKey(card);
  if (!progress[k]) progress[k] = { modes: {} };
  if (!progress[k].modes) progress[k].modes = {};
  if (!progress[k].modes[mode]) progress[k].modes[mode] = { good: 0, bad: 0, streak: 0, mastered: false };
  return progress[k].modes[mode];
}

function markResult(type, opts = {}) {
  if (!filtered.length) return;
  const { stayOnCard = false } = opts;

  const card = currentCard();
  const mp = getModeProgress(card, currentMode());

  if (type === "bad") {
    mp.bad += 1;
    mp.streak = 0;
  } else {
    mp.good += 1;
    mp.streak = (mp.streak || 0) + 1;
    if (mp.streak >= MASTER_STREAK) mp.mastered = true;

    if (modeIsWrongOnly()) {
      mp.bad = Math.max(0, (mp.bad || 0) - 1);
    }
  }

  saveProgress(progress);

  if (modeIsWrongOnly()) {
    const currentKey = progressKey(card);
    applyFilters(false);
    if (!filtered.length) {
      index = 0;
      render(false);
      return;
    }
    const newIndex = filtered.findIndex(c => progressKey(c) === currentKey);
    index = (newIndex >= 0) ? newIndex : clamp(index, 0, filtered.length - 1);
  }

  if (stayOnCard) {
    render(false);
    return;
  }

  nextCard(true);
}

function resetProgress() {
  progress = {};
  saveProgress(progress);
  applyFilters(true);
  render(false);
  renderMasteryAllModes();
}

function weaknessScore(card, mode) {
  const p = getModeProgress(card, mode);
  const good = p.good || 0;
  const bad  = p.bad || 0;
  return (bad + 1) / (good + bad + 2);
}

function aggregateProgress(list, mode) {
  let good = 0, bad = 0;
  for (const c of list) {
    const p = getModeProgress(c, mode);
    good += p.good || 0;
    bad  += p.bad || 0;
  }
  const total = good + bad;
  const rate = total === 0 ? 0 : Math.round((good / total) * 100);
  return { good, bad, rate };
}

function progressKey(card) {
  if (card.id !== undefined && card.id !== null && card.id !== "") return `id:${card.id}`;
  return `wm:${card.word}__${card.meaning}`;
}

/* -------------------- mastery dashboard -------------------- */
function renderMasteryAllModes() {
  renderMasteryForMode(MODES.JA_EN_CARD, els.mOverallJaEnCard, els.mGradeJaEnCard, els.mLevelJaEnCard, els.mPosJaEnCard);
  renderMasteryForMode(MODES.EN_JA_CARD, els.mOverallEnJaCard, els.mGradeEnJaCard, els.mLevelEnJaCard, els.mPosEnJaCard);
  renderMasteryForMode(MODES.JA_EN_TYPING, els.mOverallJaEnTyping, els.mGradeJaEnTyping, els.mLevelJaEnTyping, els.mPosJaEnTyping);
}

function renderMasteryForMode(mode, overallEl, gradeEl, levelEl, posEl) {
  const overall = masteryOverall(mode, allCards);
  overallEl.textContent = `全体：${overall.mastered}/${overall.total}（${overall.pct}%）`;

  gradeEl.innerHTML = renderMasteryList(masteryByKey(mode, allCards, c => c.grade ?? "-"));
  levelEl.innerHTML = renderMasteryList(masteryByKey(mode, allCards, c => (c.level ?? "-")));
  posEl.innerHTML   = renderMasteryList(masteryByKey(mode, allCards, c => c.pos ?? "-"));
}

function masteryOverall(mode, list) {
  let total = 0, mastered = 0;
  for (const c of list) {
    total += 1;
    if (getModeProgress(c, mode).mastered) mastered += 1;
  }
  const pct = total ? Math.round((mastered / total) * 100) : 0;
  return { total, mastered, pct };
}

function masteryByKey(mode, list, keyFn) {
  const map = new Map();
  for (const c of list) {
    const k = String(keyFn(c) ?? "-");
    if (!map.has(k)) map.set(k, { total: 0, mastered: 0 });
    const obj = map.get(k);
    obj.total += 1;
    if (getModeProgress(c, mode).mastered) obj.mastered += 1;
  }

  const items = Array.from(map.entries()).map(([k,v]) => ({
    key: k,
    total: v.total,
    mastered: v.mastered,
    pct: v.total ? Math.round((v.mastered / v.total) * 100) : 0,
  }));

  items.sort((a,b) => {
    const an = Number(a.key), bn = Number(b.key);
    const aNum = Number.isFinite(an) && String(an) === a.key;
    const bNum = Number.isFinite(bn) && String(bn) === b.key;
    if (aNum && bNum) return an - bn;
    return a.key.localeCompare(b.key, "ja");
  });

  return items;
}

function renderMasteryList(items) {
  return items.map(it =>
    `<div class="rowLine"><span>${escapeHtml(it.key)}：${it.mastered}/${it.total}</span><span class="pct">${it.pct}%</span></div>`
  ).join("");
}

/* -------------------- Speech (English only) -------------------- */
function speakCurrentEnglishOnly() {
  if (!filtered.length) return;
  const card = currentCard();
  const { front, back, frontIsEnglish, backIsEnglish } = frontBackFor(card);
  const isFlipped = els.card.classList.contains("flipped");

  if (!isFlipped && frontIsEnglish) speakEnglish(front);
  else if (isFlipped && backIsEnglish) speakEnglish(back);
}

function speakEnglish(text) {
  if (!("speechSynthesis" in window)) return;
  const s = (text || "").trim();
  if (!s) return;

  stopSpeak();
  const u = new SpeechSynthesisUtterance(s);
  u.lang = "en-US";

  const voices = window.speechSynthesis.getVoices?.() || [];
  const preferred = pickVoice(voices, "en-US");
  if (preferred) u.voice = preferred;

  window.speechSynthesis.speak(u);
}

function pickVoice(voices, lang) {
  const lc = (lang || "").toLowerCase();
  const short = lc.split("-")[0];
  let v = voices.find(v => (v.lang || "").toLowerCase() === lc);
  if (v) return v;
  v = voices.find(v => (v.lang || "").toLowerCase().startsWith(short));
  return v || null;
}

function stopSpeak() {
  if (!("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

/* -------------------- Sheet URL -> CSV URL -------------------- */
function buildCsvUrlFromSheetLink(sheetLink) {
  const m = sheetLink.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("Sheet ID not found");
  const id = m[1];
  const gidMatch = sheetLink.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/* -------------------- CSV parse -------------------- */
function parseCsvToCards(csvText) {
  const rows = splitCsvRows(csvText);
  const out = [];

  for (const cols of rows) {
    if (cols.length < 2) continue;

    const maybeHeader = (cols[0] || "") + (cols[1] || "");
    if (/番号|単語|意味|学年|レベル|品詞/.test(maybeHeader)) continue;

    const id = toNumberOrString(cols[0]);
    const word = (cols[1] || "").trim();
    const meaning = (cols[2] || "").trim();
    const grade = (cols[3] || "").trim();
    const level = toNumberOrString(cols[4]);
    const pos = (cols[5] || "").trim();

    if (!word && !meaning) continue;

    out.push({
      id,
      word,
      meaning,
      grade,
      level: (typeof level === "number" ? level : (level ? Number(level) : "")),
      pos
    });
  }

  for (let i = 0; i < out.length; i++) {
    if (out[i].id === "" || out[i].id === null || out[i].id === undefined) out[i].id = i + 1;
  }
  return out;
}

function splitCsvRows(text) {
  const lines = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else { inQuotes = !inQuotes; }
      continue;
    }

    if (!inQuotes && ch === ",") { row.push(cell); cell = ""; continue; }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      lines.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.length > 1 || row[0].trim() !== "") lines.push(row);

  return lines.map(r => r.map(c => (c ?? "").trim()));
}

function toNumberOrString(v) {
  const s = (v ?? "").toString().trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
}

/* -------------------- storage -------------------- */
function saveCardsToStorage(cards) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); } catch {}
}
function loadCardsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {
      quizMode: MODES.JA_EN_CARD,
      strategy: "weak",
      mode: "all",
      autoSpeak: false
    };
  } catch {
    return {
      quizMode: MODES.JA_EN_CARD,
      strategy: "weak",
      mode: "all",
      autoSpeak: false
    };
  }
}

/* -------------------- utils -------------------- */
function uniq(arr) {
  return Array.from(new Set(arr.map(String))).sort((a,b) => a.localeCompare(b, "ja"));
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
