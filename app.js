const STORAGE_KEY = "desert_falcons_terminal_v9";

let previousScreen = "role-select";
let currentScreen = "role-select";
let unlockTimer = null;

function createInitialState() {
  return {
    role: "player",
    match: { exists: false, name: "", status: "none", date: "", time: "", location: "", startedAt: null, elapsedSeconds: 0 },
    organizer: { briefingText: "", participates: false },
    player: { id: "DF-001", name: "DANI", team: "AZUL", class: "COMANDO", participation: false, entryRequested: false, briefingAck: false, radio: true, channel: 1 },
    gps: { ready: false }
  };
}

let state = createInitialState();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function formatTimer(s) { const m = Math.floor(s/60); const sec = s%60; return String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0"); }

function showScreen(screenName, remember = true) {
  const target = $(`[data-screen="${screenName}"]`);
  if (!target) return;
  if (remember && currentScreen !== screenName && screenName !== 'dev') previousScreen = currentScreen;
  currentScreen = screenName;
  $$(".screen").forEach(s => s.classList.remove("active"));
  target.classList.add("active");
  render();
}

function goBack() { showScreen(previousScreen, false); }

function render() {
  const status = $("#globalMatchStatus");
  if(status) {
    status.textContent = state.match.status === "none" ? "SEM PARTIDA" : state.match.status === "live" ? "AO VIVO" : "AGENDADA";
    status.className = "match-status";
    if (state.match.status === "live") status.classList.add("live");
  }
  
  if(currentScreen === "player-home") renderPlayer();
  if(currentScreen === "organizer") renderOrganizer();
  if(currentScreen === "tactical") renderTactical();
  if(currentScreen === "waiting") renderWaiting();
}

function renderPlayer() {
  const hasMatch = state.match.exists && state.match.status !== "ended";
  $("#playerMatchName").textContent = state.match.name || "Sem nome";
  $("#playerMatchState").textContent = state.match.status === "live" ? "AO VIVO" : "AGENDADA";
  $("#playerMatchDate").textContent = state.match.date || "—";
  
  $("#playerScheduledActions").classList.toggle("hidden", !(hasMatch && state.match.status === "scheduled"));
  $("#playerLiveActions").classList.toggle("hidden", !(hasMatch && state.match.status === "live" && !state.player.entryRequested && !state.player.participation));
  $("#playerEnterActions").classList.toggle("hidden", !(hasMatch && state.match.status === "live" && (state.player.entryRequested || state.player.participation)));
}

function confirmPresence() { state.player.participation = true; state.player.entryRequested = false; persist(); showScreen("player-preparation"); }
function requestEntry() { state.player.entryRequested = true; persist(); showScreen("waiting"); }
function enterMatch() {
  if(!state.player.briefingAck && state.player.participation) return showScreen("player-preparation");
  state.player.participation = true; state.player.entryRequested = false; persist(); showScreen("tactical");
}

function renderWaiting() {
  const btn = $("#waitingBackButton");
  if (state.player.participation) {
    $("#waitingTitle").textContent = "ENTRADA AUTORIZADA";
    $("#waitingText").textContent = "Terminal liberado pelo comando.";
    btn.textContent = "IR PARA O TÁTICO";
    btn.className = "primary-action";
  } else {
    $("#waitingTitle").textContent = "AGUARDANDO COMANDO";
    btn.textContent = "VOLTAR";
    btn.className = "secondary-action";
  }
}

// ORGANIZADOR
function readOrgForm() {
  state.match.name = $("#orgMatchName").value;
  state.match.date = $("#orgMatchDate").value;
  state.organizer.participates = $("#orgOrganizerParticipates").checked;
}
function renderOrganizer() {
  $("#orgMatchName").value = state.match.name;
  $("#orgOrganizerParticipates").checked = state.organizer.participates;
  $("#organizerEndButton").classList.toggle("hidden", state.match.status !== "live");
}

function saveMatch() {
  readOrgForm();
  state.match.exists = true;
  if(state.match.status !== "live") state.match.status = "scheduled";
  persist();
  $("#saveConfirmModal").classList.remove("hidden");
}

function startMatch() {
  state.match.status = "live";
  state.match.startedAt = Date.now();
  if(state.player.entryRequested) state.player.participation = true; // Auto-aprova local
  persist();
  $("#saveConfirmModal").classList.add("hidden");
  
  if (state.organizer.participates) {
    state.player.participation = true;
    showScreen("tactical");
  } else {
    showScreen("organizer");
  }
}

function endMatch() {
  state.match.status = "ended"; persist();
  showScreen(state.role === "organizer" ? "organizer" : "player-home");
}

function leaveMatch() {
  state.player.participation = false; state.player.entryRequested = false; persist(); showScreen("player-home");
}

function renderTactical() {
  $("#tacticalMatchName").textContent = state.match.name || "OPERAÇÃO";
  $("#tacticalStatus").textContent = state.match.status === "live" ? "AO VIVO" : "AGUARDANDO";
  $("#tacticalOrganizerEnd").classList.toggle("hidden", state.role !== "organizer");
  $("#tacticalPlayerLeave").classList.toggle("hidden", state.role !== "player");
}

setInterval(() => {
  if (state.match.status === "live" && state.match.startedAt) {
    state.match.elapsedSeconds = Math.floor((Date.now() - state.match.startedAt) / 1000);
    const tmr = $("#tacticalTimer"); if(tmr) tmr.textContent = formatTimer(state.match.elapsedSeconds);
  }
}, 1000);

// LISTENERS MESTRES
document.addEventListener("click", (e) => {
  const roleChoice = e.target.closest("[data-role-choice]");
  if (roleChoice) { state.role = roleChoice.dataset.roleChoice; persist(); showScreen(state.role === "player" ? "player-home" : "organizer"); }
  
  const back = e.target.closest("[data-back-screen]");
  if(back) { const t = back.dataset.backScreen; if(t==="previous") goBack(); else showScreen(t); }
});

$("#devButton")?.addEventListener("click", () => showScreen("dev"));
$("#playerConfirmPresence")?.addEventListener("click", confirmPresence);
$("#playerRequestEntry")?.addEventListener("click", requestEntry);
$("#playerEnterMatch")?.addEventListener("click", enterMatch);
$("#playerPreparationEnter")?.addEventListener("click", enterMatch);
$("#playerBriefingAck")?.addEventListener("change", (e) => { state.player.briefingAck = e.target.checked; persist(); });

$("#organizerSaveButton")?.addEventListener("click", saveMatch);
$("#saveConfirmContinue")?.addEventListener("click", () => { $("#saveConfirmModal").classList.add("hidden"); showScreen("role-select"); });
$("#saveConfirmEnter")?.addEventListener("click", startMatch);
$("#organizerEndButton")?.addEventListener("click", endMatch);
$("#tacticalOrganizerEnd")?.addEventListener("click", endMatch);
$("#tacticalPlayerLeave")?.addEventListener("click", leaveMatch);

$("#waitingBackButton")?.addEventListener("click", () => {
  if(state.player.participation) enterMatch(); else showScreen("player-home");
});

// TRAVA TÁTICO
$("#tacticalLockButton")?.addEventListener("click", () => $("#touchGuard").classList.remove("hidden"));
const unlockBtn = $("#unlockButton");
if(unlockBtn){
  unlockBtn.addEventListener("pointerdown", (e)=>{ e.preventDefault(); unlockTimer = setTimeout(()=>$("#touchGuard").classList.add("hidden"), 900); });
  unlockBtn.addEventListener("pointerup", ()=>clearTimeout(unlockTimer));
  unlockBtn.addEventListener("pointerleave", ()=>clearTimeout(unlockTimer));
}

// DEV
$("#devGenerateMatch")?.addEventListener("click", () => {
  state.match = { exists:true, name:"Operação Teste", status:"scheduled", date:"2026-10-10", elapsedSeconds:0 }; persist(); showScreen("organizer");
});
$("#devStartMatch")?.addEventListener("click", startMatch);
$("#devReset")?.addEventListener("click", () => { state = createInitialState(); persist(); showScreen("role-select"); });

showScreen("role-select", false);
