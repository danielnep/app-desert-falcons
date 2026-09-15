const STORAGE_KEY = "desert_falcons_terminal_v10";

let previousScreen = "role-select";
let currentScreen = "role-select";
let unlockTimer = null;
let gpsWatchId = null;

let state = loadState();

function createInitialState() {
  return {
    role: "player",
    match: { exists: false, name: "", status: "none", date: "", time: "", location: "", startedAt: null, elapsedSeconds: 0, blueKills: 0, redKills: 0 },
    organizer: { briefingTitle: "Briefing Oficial", briefingText: "Executar varredura no setor e neutralizar alvos hostiles.", objective: "Controlar Setor Alfa", participates: false },
    player: { id: "DF-001", name: "DANI", team: "AZUL", class: "COMANDO", participation: false, entryRequested: false, briefingAck: false, radio: true, channel: 1 },
    gps: { lat: null, lng: null, active: false }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    return { ...createInitialState(), ...JSON.parse(raw) };
  } catch (e) { return createInitialState(); }
}

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function formatTimer(s) {
  const m = Math.floor(s/60); const sec = s%60;
  return String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0");
}

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
  $("#playerMatchName").textContent = state.match.name || "Nenhuma partida cadastrada";
  $("#playerMatchState").textContent = state.match.status === "live" ? "AO VIVO" : "AGENDADA";
  $("#playerMatchDate").textContent = state.match.date || "—";
  $("#playerMatchLocation").textContent = state.match.location || "—";
  $("#playerMatchMap").textContent = "Complexo Alfa";

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
    $("#waitingTitle").textContent = "ACESSO AUTORIZADO";
    $("#waitingText").textContent = "Comando liberou seu terminal.";
    btn.textContent = "ENTRAR NO TÁTICO";
    btn.className = "primary-action";
  } else {
    $("#waitingTitle").textContent = "AGUARDANDO COMANDO";
    btn.textContent = "VOLTAR";
    btn.className = "secondary-action";
  }
}

// ORGANIZADOR
function saveMatch() {
  state.match.name = $("#orgMatchName").value || "Operação Tática";
  state.match.date = $("#orgMatchDate").value;
  state.match.location = $("#orgMatchLocation").value;
  state.organizer.briefingText = $("#orgBriefingText").value;
  state.organizer.participates = $("#orgOrganizerParticipates").checked;
  state.match.exists = true;
  if(state.match.status !== "live") state.match.status = "scheduled";
  persist();
  $("#saveConfirmModal").classList.remove("hidden");
}

function startMatch() {
  state.match.status = "live";
  state.match.startedAt = Date.now();
  if(state.player.entryRequested) state.player.participation = true;
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

function renderOrganizer() {
  $("#orgMatchName").value = state.match.name;
  $("#orgMatchDate").value = state.match.date;
  $("#orgMatchLocation").value = state.match.location;
  $("#orgBriefingText").value = state.organizer.briefingText;
  $("#orgOrganizerParticipates").checked = state.organizer.participates;
  $("#organizerEndButton").classList.toggle("hidden", state.match.status !== "live");
  $("#organizerStartButton").classList.toggle("hidden", state.match.status !== "scheduled");
}

// TÁTICO & GPS REAL
function renderTactical() {
  $("#tacticalMatchName").textContent = state.match.name || "ZONA DE COMBATE";
  $("#tacticalStatus").textContent = state.match.status === "live" ? "AO VIVO" : "AGUARDANDO";
  $("#scoreBlue").textContent = state.match.blueKills || 0;
  $("#scoreRed").textContent = state.match.redKills || 0;
  $("#tacticalKills").textContent = `${(state.match.blueKills || 0) + (state.match.redKills || 0)} Kills`;
  $("#tacticalOrganizerEnd").classList.toggle("hidden", state.role !== "organizer" || state.match.status !== "live");
  $("#tacticalPlayerLeave").classList.toggle("hidden", state.role !== "player" || state.match.status !== "live");
  
  initRealGps();
}

function initRealGps() {
  if (!navigator.geolocation) {
    $("#tacticalGpsStatus").textContent = "GPS INDISPONÍVEL";
    return;
  }
  $("#tacticalGpsStatus").textContent = "BUSCANDO SATÉLITES...";
  if (gpsWatchId) return;

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.gps.lat = pos.coords.latitude;
      state.gps.lng = pos.coords.longitude;
      state.gps.active = true;
      $("#tacticalGpsStatus").textContent = `SINAL FIXO (±${Math.round(pos.coords.accuracy)}m)`;
      
      // Simula movimento sutil do marcador no mapa com base no GPS real ou deslocamento
      const marker = $("#playerGpsMarker");
      if (marker) {
        // Converte coordenadas em pixels relativos simples para a demonstração visual no mapa
        const xPercent = 50 + ((pos.coords.longitude % 0.01) * 10000);
        const yPercent = 50 - ((pos.coords.latitude % 0.01) * 10000);
        marker.style.left = `${Math.max(10, Math.min(90, xPercent))}%`;
        marker.style.top = `${Math.max(10, Math.min(90, yPercent))}%`;
      }
    },
    (err) => {
      $("#tacticalGpsStatus").textContent = "GPS OFFLINE (MODO SIMULADO)";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

// MODAIS DE OBJETIVOS E INSTRUÇÕES FUNCIONAIS
function openModal(title, content) {
  $("#appModalTitle").textContent = title;
  $("#appModalBody").innerHTML = content;
  $("#appModal").classList.remove("hidden");
}

$("#tacticalObjectivesButton")?.addEventListener("click", () => {
  openModal("OBJETIVOS DA MISSÃO", `<p><strong>Meta Primária:</strong> ${escapeHTML(state.organizer.objective)}</p><p style="margin-top:8px;color:#888;">Mantenha o controle da zona designada e evite baixas desnecessárias.</p>`);
});

$("#tacticalInstructionsButton")?.addEventListener("click", () => {
  openModal("INSTRUÇÕES DE COMBATE", `<p><strong>Briefing:</strong></p><p style="margin-top:5px;color:#aaa;">${escapeHTML(state.organizer.briefingText || "Nenhuma instrução detalhada cadastrada pelo comando.")}</p>`);
});

// CRONÔMETRO
setInterval(() => {
  if (state.match.status === "live" && state.match.startedAt) {
    state.match.elapsedSeconds = Math.floor((Date.now() - state.match.startedAt) / 1000);
    const tmr = $("#tacticalTimer"); if(tmr) tmr.textContent = formatTimer(state.match.elapsedSeconds);
    
    // Simula pontuação orgânica subindo aos poucos para dar vida ao demo
    if (Math.random() < 0.1) {
      if (Math.random() > 0.5) state.match.blueKills = (state.match.blueKills || 0) + 1;
      else state.match.redKills = (state.match.redKills || 0) + 1;
      persist();
      if(currentScreen === "tactical") {
        $("#scoreBlue").textContent = state.match.blueKills;
        $("#scoreRed").textContent = state.match.redKills;
        $("#tacticalKills").textContent = `${state.match.blueKills + state.match.redKills} Kills`;
      }
    }
  }
}, 1000);

// LISTENERS
document.addEventListener("click", (e) => {
  const rc = e.target.closest("[data-role-choice]");
  if (rc) { state.role = rc.dataset.roleChoice; persist(); showScreen(state.role === "player" ? "player-home" : "organizer"); }
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
$("#organizerStartButton")?.addEventListener("click", startMatch);
$("#saveConfirmContinue")?.addEventListener("click", () => { $("#saveConfirmModal").classList.add("hidden"); showScreen("role-select"); });
$("#saveConfirmEnter")?.addEventListener("click", startMatch);
$("#organizerEndButton")?.addEventListener("click", endMatch);
$("#tacticalOrganizerEnd")?.addEventListener("click", endMatch);
$("#tacticalPlayerLeave")?.addEventListener("click", () => { state.player.participation = false; persist(); showScreen("player-home"); });

// TRAVA TÁTICO
$("#tacticalLockButton")?.addEventListener("click", () => $("#touchGuard").classList.remove("hidden"));
const unlockBtn = $("#unlockButton");
if(unlockBtn){
  let timerUnlock = null;
  unlockBtn.addEventListener("pointerdown", (e)=>{ e.preventDefault(); timerUnlock = setTimeout(()=>$("#touchGuard").classList.add("hidden"), 900); });
  unlockBtn.addEventListener("pointerup", ()=>clearTimeout(timerUnlock));
  unlockBtn.addEventListener("pointerleave", ()=>clearTimeout(timerUnlock));
}

// RÁDIO COM ANIMAÇÃO REALISTA DE ONDAS
const ptt = $("#pttButton");
const waves = $("#radioWaves");
const pttText = $("#pttText");
if (ptt) {
  ptt.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ptt.classList.add("transmitting");
    waves.classList.remove("hidden");
    pttText.textContent = "TRANSMITINDO SINAL...";
  });
  const stopPtt = () => {
    ptt.classList.remove("transmitting");
    waves.classList.add("hidden");
    pttText.textContent = "PRESSIONE PARA FALAR";
  };
  ptt.addEventListener("pointerup", stopPtt);
  ptt.addEventListener("pointerleave", stopPtt);
}

$("#radioToggle")?.addEventListener("click", () => {
  state.player.radio = !state.player.radio;
  persist();
  $("#radioToggle").textContent = state.player.radio ? "ON" : "OFF";
  $("#radioToggle").classList.toggle("active", state.player.radio);
});

$("#appModalClose")?.addEventListener("click", () => $("#appModal").classList.add("hidden"));
$("#waitingBackButton")?.addEventListener("click", () => {
  if(state.player.participation) enterMatch(); else showScreen("player-home");
});

// DEV
$("#devGenerateMatch")?.addEventListener("click", () => {
  state.match = { exists:true, name:"Operação Alpha", status:"scheduled", date:"2026-10-15", elapsedSeconds:0, blueKills:3, redKills:2 }; persist(); showScreen("organizer");
});
$("#devStartMatch")?.addEventListener("click", startMatch);
$("#devReset")?.addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); state = createInitialState(); showScreen("role-select", false); render(); });

function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, 
  tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
); }

showScreen("role-select", false);
