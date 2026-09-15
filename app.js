const STORAGE_KEY = "desert_falcons_terminal_v8";
const DEMO_CENTER = { lat: -19.9167, lng: -43.9345 };

let previousScreen = "player-home";
let currentScreen = "role-select";
let unlockTimer = null;
let unlockStarted = false;
let radioPushTimer = null;

function createInitialState() {
  return {
    version: 8,
    role: "player",
    match: { exists: false, name: "", status: "none", date: "", time: "", location: "", map: "Complexo Industrial", mode: "Simulação", duration: 60, checkInTime: "", startedAt: null, elapsedSeconds: 0 },
    organizer: { briefingTitle: "Briefing da Operação", briefingText: "Objetivo, regras da partida, condições de participação e orientações gerais.", objective: "", teamBlueName: "Equipe Azul", teamBlueLimit: 20, teamRedName: "Equipe Vermelha", teamRedLimit: 20, participates: false },
    player: { id: "DF-001", name: "DANI", team: "azul", class: "Assalto", participation: false, entryRequested: false, briefingAck: false, radio: true, channel: 1, radioVolume: 70 },
    gps: { lat: null, lng: null, accuracy: null, ready: false },
    objectives: { alfa: { name: "Setor Alfa", control: "neutro" }, bravo: { name: "Setor Bravo", control: "neutro" } },
    modules: { medical: true, zone: true, score: false, tracking: false, objectives: true, events: false },
    simulatedPlayers: { perTeam: 0, blue: [], red: [] },
    events: [],
    dev: { lastRole: "player" }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    return mergeState(createInitialState(), JSON.parse(raw));
  } catch (error) { return createInitialState(); }
}

function mergeState(base, saved) {
  if (!saved || typeof saved !== "object") return base;
  return {
    ...base, ...saved,
    match: { ...base.match, ...(saved.match || {}) },
    organizer: { ...base.organizer, ...(saved.organizer || {}) },
    player: { ...base.player, ...(saved.player || {}) },
    gps: { ...base.gps, ...(saved.gps || {}) },
    objectives: { ...base.objectives, ...(saved.objectives || {}) },
    modules: { ...base.modules, ...(saved.modules || {}) },
    simulatedPlayers: { ...base.simulatedPlayers, ...(saved.simulatedPlayers || {}) },
    dev: { ...base.dev, ...(saved.dev || {}) },
    events: Array.isArray(saved.events) ? saved.events : base.events
  };
}

let state = loadState();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function escapeHTML(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function formatDate(d) { if (!d) return "—"; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
function formatDuration(m) { if (!m) return "—"; const v = Number(m); return v < 60 ? `${v} min` : `${Math.floor(v/60)}h ${v%60 ? (v%60+'min') : ''}`; }
function formatTimer(sec) { const t = Math.max(0, Number(sec)||0); return String(Math.floor(t/60)).padStart(2,"0") + ":" + String(t%60).padStart(2,"0"); }
function getStatusLabel(s) { return { none: "SEM PARTIDA", scheduled: "AGENDADA", live: "AO VIVO", ended: "ENCERRADA" }[s] || "SEM PARTIDA"; }
function showToast(msg) {
  const t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => t.classList.remove("show"), 2800);
}

function showScreen(screenName, remember = true) {
  const target = $(`[data-screen="${screenName}"]`);
  if (!target) return;
  if (remember && currentScreen !== screenName && screenName !== 'dev') previousScreen = currentScreen;
  else if (remember && screenName === 'dev') previousScreen = state.role === "organizer" ? "organizer" : "player-home";
  currentScreen = screenName;
  $$(".screen").forEach(s => s.classList.remove("active"));
  target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}

function goBack() {
  if (previousScreen === "previous" || previousScreen === currentScreen) {
    showScreen(state.role === "organizer" ? "organizer" : "player-home", false); return;
  }
  showScreen(previousScreen, false);
}

function selectRole(role) {
  if (role !== "player" && role !== "organizer") return;
  state.role = role; state.dev.lastRole = role; persist();
  showScreen(role === "player" ? "player-home" : "organizer", false);
}

function renderGlobalHeader() {
  const s = $("#globalMatchStatus"); if (!s) return;
  s.textContent = getStatusLabel(state.match.exists ? state.match.status : "none");
  s.className = "match-status";
  if (state.match.status === "live") s.classList.add("live");
  else if (state.match.status === "scheduled") s.classList.add("scheduled");
  else if (state.match.status === "ended") s.classList.add("ended");
}

function render() { renderGlobalHeader(); renderPlayer(); renderPlayerDetails(); renderOrganizer(); renderDev(); renderTactical(); }

function renderPlayer() {
  const hasMatch = state.match.exists && state.match.status !== "ended";
  setText("#playerMatchName", state.match.exists ? (state.match.name || "Partida sem nome") : "Nenhuma partida cadastrada");
  setText("#playerMatchState", getStatusLabel(state.match.status));
  setText("#playerMatchDate", formatDate(state.match.date));
  setText("#playerMatchTime", state.match.time || "—");
  setText("#playerMatchLocation", state.match.location || "—");
  setText("#playerMatchMap", state.match.map || "—");
  setText("#playerMatchMode", state.match.mode || "—");
  setText("#playerMatchDuration", formatDuration(state.match.duration));
  setText("#playerDisplayName", state.player.name);
  setText("#playerDisplayTeam", getTeamName(state.player.team));

  $("#playerScheduledActions")?.classList.toggle("hidden", !(hasMatch && state.match.status === "scheduled"));
  $("#playerLiveActions")?.classList.toggle("hidden", !(hasMatch && state.match.status === "live" && !state.player.entryRequested && !state.player.participation));
  $("#playerEnterActions")?.classList.toggle("hidden", !(hasMatch && state.match.status === "live" && (state.player.entryRequested || state.player.participation)));

  let pText = "Aguardando confirmação", pBadge = "AGUARDANDO";
  if (state.player.participation) { pText = "Participação confirmada"; pBadge = "CONFIRMADO"; }
  else if (state.player.entryRequested) { pText = "Entrada solicitada"; pBadge = "SOLICITADA"; }
  setText("#playerParticipationStatus", pText); setText("#playerParticipationBadge", pBadge);
}

function confirmPresence() {
  if (!state.match.exists) return showToast("Não há partida cadastrada.");
  state.player.participation = true; state.player.entryRequested = false; persist();
  renderPreparation(); showScreen("player-preparation"); render(); showToast("Presença confirmada.");
}

function requestEntry() {
  if (!state.match.exists) return showToast("Não há partida disponível.");
  state.player.entryRequested = true; persist(); showScreen("waiting"); render(); showToast("Solicitação enviada.");
}

function enterMatch() {
  if (!state.match.exists || state.match.status !== "live") return showToast("Partida indisponível ou não iniciada.");
  state.player.participation = true; state.player.entryRequested = false; persist(); showScreen("tactical"); render(); showToast("Entrada autorizada.");
}

function renderPreparation() {
  setText("#preparationMatchName", state.match.name || "—");
  setText("#preparationStatus", getStatusLabel(state.match.status));
  setText("#preparationBriefingTitle", state.organizer.briefingTitle || "Briefing");
  setText("#preparationBriefingText", state.organizer.briefingText || "—");
  const cb = $("#playerBriefingAck"); if (cb) cb.checked = !!state.player.briefingAck;
}

function acknowledgeBriefing() {
  const cb = $("#playerBriefingAck"); if (!cb) return;
  state.player.briefingAck = cb.checked; persist(); render();
}

function enterFromPreparation() {
  if (!state.player.briefingAck) return showToast("Confirme a leitura do briefing.");
  enterMatch();
}

function renderPlayerDetails() {
  setText("#detailInicioStatus", state.match.exists ? getStatusLabel(state.match.status) : "Aguardando partida");
  setText("#detailPlayerName", state.player.name); setText("#detailPlayerId", state.player.id);
  setText("#detailPlayerTeam", getTeamName(state.player.team)); setText("#detailPlayerClass", state.player.class);
  setText("#detailBriefingTitle", state.organizer.briefingTitle || "Nenhum briefing disponível");
  setText("#detailBriefingText", state.organizer.briefingText || "O organizador não cadastrou briefing.");
  setText("#profileName", state.player.name); setText("#profileId", state.player.id);
  setText("#profileTeam", getTeamName(state.player.team)); setText("#profileClass", state.player.class);
  setText("#profileRadioStatus", state.player.radio ? "ATIVO" : "DESATIVADO");
  const ack = $("#detailBriefingAck"); if (ack) ack.checked = !!state.player.briefingAck;
}

function switchDetailTab(tab) {
  $$(".detail-tab").forEach(b => b.classList.toggle("active", b.dataset.detailTab === tab));
  $$("[data-detail-content]").forEach(c => c.classList.toggle("active", c.dataset.detailContent === tab));
}

function readOrganizerForm() {
  state.match.name = valueOf("#orgMatchName"); state.match.date = valueOf("#orgMatchDate");
  state.match.time = valueOf("#orgMatchTime"); state.match.location = valueOf("#orgMatchLocation");
  state.match.map = valueOf("#orgMatchMap") || "Complexo Industrial"; state.match.mode = valueOf("#orgMatchMode") || "Simulação";
  state.match.duration = numberValue("#orgMatchDuration", 60); state.match.checkInTime = valueOf("#orgCheckInTime");
  state.organizer.briefingTitle = valueOf("#orgBriefingTitle") || "Briefing da Operação";
  state.organizer.briefingText = valueOf("#orgBriefingText") || ""; state.organizer.objective = valueOf("#orgObjective") || "";
  state.organizer.teamBlueName = valueOf("#orgTeamBlueName") || "Equipe Azul"; state.organizer.teamBlueLimit = numberValue("#orgTeamBlueLimit", 20);
  state.organizer.teamRedName = valueOf("#orgTeamRedName") || "Equipe Vermelha"; state.organizer.teamRedLimit = numberValue("#orgTeamRedLimit", 20);
  state.organizer.participates = checkedOf("#orgOrganizerParticipates");
}

function writeOrganizerForm() {
  setValue("#orgMatchName", state.match.name); setValue("#orgMatchDate", state.match.date); setValue("#orgMatchTime", state.match.time);
  setValue("#orgMatchLocation", state.match.location); setValue("#orgMatchMap", state.match.map); setValue("#orgMatchMode", state.match.mode);
  setValue("#orgMatchDuration", state.match.duration); setValue("#orgCheckInTime", state.match.checkInTime);
  setValue("#orgBriefingTitle", state.organizer.briefingTitle); setValue("#orgBriefingText", state.organizer.briefingText); setValue("#orgObjective", state.organizer.objective);
  setValue("#orgTeamBlueName", state.organizer.teamBlueName); setValue("#orgTeamBlueLimit", state.organizer.teamBlueLimit);
  setValue("#orgTeamRedName", state.organizer.teamRedName); setValue("#orgTeamRedLimit", state.organizer.teamRedLimit);
  setChecked("#orgOrganizerParticipates", state.organizer.participates);
}

function renderOrganizer() {
  writeOrganizerForm();
  setText("#organizerMatchStateText", state.match.exists ? `STATUS: ${getStatusLabel(state.match.status)}` : "Nenhuma partida salva.");
  $("#organizerStartButton")?.classList.toggle("hidden", !(state.match.exists && state.match.status === "scheduled"));
  $("#organizerEndButton")?.classList.toggle("hidden", state.match.status !== "live");
  setText("#organizerPresence", "Equipes configuradas e prontas.");
}

function saveMatch() {
  if (state.role !== "organizer") return showToast("Somente o organizador.");
  readOrganizerForm();
  if (!state.match.name.trim()) return showToast("Informe o nome.");
  state.match.exists = true;
  if (state.match.status !== "live") state.match.status = "scheduled";
  persist(); render();
  $("#saveConfirmModal")?.classList.remove("hidden");
}

function startMatch(source = "organizer") {
  if (state.role !== "organizer" && source !== "dev") return showToast("Apenas o organizador.");
  if (!state.match.exists) return showToast("Salve uma partida.");
  state.match.status = "live"; state.match.startedAt = Date.now(); state.match.elapsedSeconds = 0;
  persist(); render(); showToast("Partida iniciada.");
}

function endMatch(source = "organizer") {
  if (state.role !== "organizer" && source !== "dev") return showToast("Apenas o organizador.");
  state.match.status = "ended"; persist(); render(); showToast("Partida encerrada.");
}

function renderDev() {
  $$(".dev-segment[data-dev-role]").forEach(b => b.classList.toggle("active", b.dataset.devRole === state.role));
  $$(".dev-segment[data-dev-status]").forEach(b => b.classList.toggle("active", b.dataset.devStatus === state.match.status));
}

function renderTactical() {
  setText("#tacticalMatchName", state.match.name || "SEM PARTIDA");
  setText("#tacticalMapName", state.match.map || "Complexo Industrial");
  setText("#tacticalObjective", state.organizer.objective || "Aguardando briefing.");
  setText("#tacticalStatus", getStatusLabel(state.match.status));
  setText("#tacticalTimer", formatTimer(state.match.elapsedSeconds));
  setText("#tacticalPlayerCount", Number(state.simulatedPlayers.perTeam||0)*2 + (state.player.participation?1:0));
  setText("#radioChannel", String(state.player.channel).padStart(2, "0"));

  const rt = $("#radioToggle");
  if (rt) { rt.textContent = state.player.radio ? "ON" : "OFF"; rt.classList.toggle("active", state.player.radio); }
  
  $("#tacticalOrganizerStart")?.classList.toggle("hidden", !(state.role === "organizer" && state.match.status === "scheduled"));
  $("#tacticalOrganizerEnd")?.classList.toggle("hidden", !(state.role === "organizer" && state.match.status === "live"));
  $("#tacticalPlayerLeave")?.classList.toggle("hidden", !(state.role === "player" && state.match.status === "live"));
}

function unlockStart() {
  if (unlockStarted) return; unlockStarted = true;
  unlockTimer = setTimeout(() => { $("#touchGuard")?.classList.add("hidden"); unlockStarted = false; showToast("Painel desbloqueado."); }, 900);
}
function unlockCancel() { clearTimeout(unlockTimer); unlockStarted = false; }
function lockTacticalPanel() { $("#touchGuard")?.classList.remove("hidden"); }

function toggleRadio() { state.player.radio = !state.player.radio; persist(); render(); }
function changeChannel(d) { state.player.channel = Math.max(1, Math.min(99, Number(state.player.channel||1) + d)); persist(); render(); }
function leaveMatch() {
  if (!window.confirm("Abandonar a partida?")) return;
  state.player.participation = false; state.player.entryRequested = false; persist(); showScreen("player-home"); render();
}

setInterval(() => {
  if (state.match.status === "live" && state.match.startedAt) {
    state.match.elapsedSeconds = Math.floor((Date.now() - state.match.startedAt)/1000);
    setText("#tacticalTimer", formatTimer(state.match.elapsedSeconds));
  }
}, 1000);

function valueOf(s) { return $(s)?.value || ""; }
function setValue(s, v) { const el = $(s); if(el) el.value = v ?? ""; }
function checkedOf(s) { return !!$(s)?.checked; }
function setChecked(s, v) { const el = $(s); if(el) el.checked = !!v; }
function numberValue(s, f) { const n = Number(valueOf(s)); return Number.isFinite(n) ? n : f; }
function setText(s, t) { const el = $(s); if(el) el.textContent = t ?? ""; }
function getTeamName(t) { return t === "azul" ? (state.organizer.teamBlueName || "Equipe Azul") : (state.organizer.teamRedName || "Equipe Vermelha"); }

document.addEventListener("click", (e) => {
  const rc = e.target.closest("[data-role-choice]"); if (rc) { selectRole(rc.dataset.roleChoice); return; }
  const back = e.target.closest("[data-back-screen]"); if (back) { const t = back.dataset.backScreen; if (t === "previous") goBack(); else showScreen(t); return; }
  const dt = e.target.closest("[data-detail-tab]"); if (dt) { switchDetailTab(dt.dataset.detailTab); return; }
  const dr = e.target.closest("[data-dev-role]"); if (dr) { selectRole(dr.dataset.devRole); return; }
  const ds = e.target.closest("[data-dev-status]"); if (ds) {
    if(!state.match.exists) state.match.exists = true;
    state.match.status = ds.dataset.devStatus; persist(); render(); showToast("Status alterado."); return;
  }
});

$("#devButton")?.addEventListener("click", () => showScreen("dev"));
$("#playerConfirmPresence")?.addEventListener("click", confirmPresence);
$("#playerRequestEntry")?.addEventListener("click", requestEntry);
$("#playerEnterMatch")?.addEventListener("click", enterMatch);
$("#playerDetailsButton")?.addEventListener("click", () => showScreen("player-details"));
$("#playerPreparationEnter")?.addEventListener("click", enterFromPreparation);
$("#playerBriefingAck")?.addEventListener("change", acknowledgeBriefing);

$("#organizerSaveButton")?.addEventListener("click", saveMatch);
$("#organizerStartButton")?.addEventListener("click", () => startMatch("organizer"));
$("#organizerEndButton")?.addEventListener("click", () => endMatch("organizer"));
$("#saveConfirmContinue")?.addEventListener("click", () => $("#saveConfirmModal").classList.add("hidden"));
$("#saveConfirmEnter")?.addEventListener("click", () => { $("#saveConfirmModal").classList.add("hidden"); startMatch("organizer"); showScreen("tactical"); });

$("#tacticalOrganizerStart")?.addEventListener("click", () => startMatch("organizer"));
$("#tacticalOrganizerEnd")?.addEventListener("click", () => endMatch("organizer"));
$("#tacticalPlayerLeave")?.addEventListener("click", leaveMatch);
$("#tacticalLockButton")?.addEventListener("click", lockTacticalPanel);

const unlockBtn = $("#unlockButton");
if (unlockBtn) {
  unlockBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); unlockStart(); });
  unlockBtn.addEventListener("pointerup", unlockCancel);
  unlockBtn.addEventListener("pointercancel", unlockCancel);
}

$("#radioToggle")?.addEventListener("click", toggleRadio);
$("#channelDown")?.addEventListener("click", () => changeChannel(-1));
$("#channelUp")?.addEventListener("click", () => changeChannel(1));
$("#radioVolume")?.addEventListener("input", (e) => { state.player.radioVolume = e.target.value; persist(); });

const ptt = $("#pttButton");
if (ptt) {
  ptt.addEventListener("pointerdown", (e) => { e.preventDefault(); setText("#radioFeedback", "TRANSMITINDO..."); ptt.classList.add("transmitting"); });
  ptt.addEventListener("pointerup", () => { setText("#radioFeedback", "RÁDIO PRONTO"); ptt.classList.remove("transmitting"); });
}

$("#waitingBackButton")?.addEventListener("click", () => showScreen("player-home"));
$("#devGenerateMatch")?.addEventListener("click", () => {
  state.match = { exists: true, name: "Operação Red Sand", status: "scheduled", date: "2026-10-10", elapsedSeconds: 0 }; persist(); render(); showToast("Criada!");
});
$("#devStartMatch")?.addEventListener("click", () => startMatch("dev"));
$("#devEndMatch")?.addEventListener("click", () => endMatch("dev"));
$("#devReset")?.addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); state = createInitialState(); showScreen("role-select", false); render(); });

$("#appModalClose")?.addEventListener("click", () => $("#appModal").classList.add("hidden"));

function initialize() {
  const has = localStorage.getItem(STORAGE_KEY);
  if (has) { showScreen(state.role === "organizer" ? "organizer" : "player-home", false); }
  else { state.role = "player"; showScreen("role-select", false); }
  persist(); render();
}

initialize();
