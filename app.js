/* ============================================================
   DESERT FALCONS — APP.JS
   Estado, navegação, jogador, organizador e DEV.

   REGRA CENTRAL:
   - localStorage é a memória persistente do aplicativo.
   - jogador e organizador trabalham sobre o MESMO estado.
   - trocar de função não apaga dados.
   - somente RESET no DEV limpa o estado.
   - iniciar/encerrar partida é responsabilidade do organizador.
============================================================ */


/* ============================================================
   CONFIGURAÇÃO
============================================================ */

const STORAGE_KEY = "desert_falcons_terminal_v8";

const DEMO_CENTER = {
  lat: -19.9167,
  lng: -43.9345
};

let previousScreen = "player-home";
let currentScreen = "role-select";
let unlockTimer = null;
let unlockStarted = false;
let radioPushTimer = null;


/* ============================================================
   ESTADO INICIAL
============================================================ */

function createInitialState() {
  return {
    version: 8,

    role: "player",

    match: {
      exists: false,
      name: "",
      status: "none",
      date: "",
      time: "",
      location: "",
      map: "Complexo Industrial",
      mode: "Simulação",
      duration: 60,
      checkInTime: "",
      startedAt: null,
      elapsedSeconds: 0
    },

    organizer: {
      briefingTitle: "Briefing da Operação",
      briefingText:
        "Objetivo, regras da partida, condições de participação e orientações gerais.",
      objective: "",

      teamBlueName: "Equipe Azul",
      teamBlueLimit: 20,

      teamRedName: "Equipe Vermelha",
      teamRedLimit: 20,

      participates: false
    },

    player: {
      id: "DF-001",
      name: "DANI",
      team: "azul",
      class: "Assalto",

      participation: false,
      entryRequested: false,
      briefingAck: false,

      radio: true,
      channel: 1,
      radioVolume: 70
    },

    gps: {
      lat: null,
      lng: null,
      accuracy: null,
      ready: false
    },

    objectives: {
      alfa: {
        name: "Setor Alfa",
        control: "neutro"
      },

      bravo: {
        name: "Setor Bravo",
        control: "neutro"
      }
    },

    modules: {
      medical: true,
      zone: true,
      score: false,
      tracking: false,
      objectives: true,
      events: false
    },

    simulatedPlayers: {
      perTeam: 0,
      blue: [],
      red: []
    },

    events: [],

    dev: {
      lastRole: "player"
    }
  };
}


/* ============================================================
   CARREGAMENTO / PERSISTÊNCIA
============================================================ */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createInitialState();
    }

    const saved = JSON.parse(raw);

    return mergeState(createInitialState(), saved);

  } catch (error) {
    console.warn("Falha ao carregar estado:", error);
    return createInitialState();
  }
}


function mergeState(base, saved) {
  if (!saved || typeof saved !== "object") {
    return base;
  }

  return {
    ...base,
    ...saved,

    match: {
      ...base.match,
      ...(saved.match || {})
    },

    organizer: {
      ...base.organizer,
      ...(saved.organizer || {})
    },

    player: {
      ...base.player,
      ...(saved.player || {})
    },

    gps: {
      ...base.gps,
      ...(saved.gps || {})
    },

    objectives: {
      ...base.objectives,
      ...(saved.objectives || {})
    },

    modules: {
      ...base.modules,
      ...(saved.modules || {})
    },

    simulatedPlayers: {
      ...base.simulatedPlayers,
      ...(saved.simulatedPlayers || {})
    },

    dev: {
      ...base.dev,
      ...(saved.dev || {})
    },

    events: Array.isArray(saved.events)
      ? saved.events
      : base.events
  };
}


let state = loadState();


function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    console.warn("Não foi possível persistir o estado:", error);
  }
}


/* ============================================================
   DOM
============================================================ */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [
  ...document.querySelectorAll(selector)
];


/* ============================================================
   UTILITÁRIOS
============================================================ */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDate(date) {
  if (!date) return "—";

  const parts = date.split("-");

  if (parts.length !== 3) {
    return date;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}


function formatDuration(minutes) {
  if (!minutes) return "—";

  const value = Number(minutes);

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const rest = value % 60;

  return rest
    ? `${hours}h ${rest}min`
    : `${hours}h`;
}


function formatTimer(seconds) {
  const total = Math.max(0, Number(seconds) || 0);

  const minutes = Math.floor(total / 60);
  const secs = total % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0")
  );
}


function getStatusLabel(status) {
  const labels = {
    none: "SEM PARTIDA",
    scheduled: "AGENDADA",
    live: "AO VIVO",
    ended: "ENCERRADA"
  };

  return labels[status] || "SEM PARTIDA";
}


function showToast(message) {
  const toast = $("#toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}


/* ============================================================
   NAVEGAÇÃO
============================================================ */

function showScreen(screenName, remember = true) {
  const target = $(`[data-screen="${screenName}"]`);

  if (!target) {
    console.warn("Tela inexistente:", screenName);
    return;
  }

  if (remember && currentScreen !== screenName) {
    previousScreen = currentScreen;
  }

  currentScreen = screenName;

  $$(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  target.classList.add("active");

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });

  render();
}


function goBack() {
  if (previousScreen === "previous") {
    showScreen(
      state.role === "organizer"
        ? "organizer"
        : "player-home",
      false
    );

    return;
  }

  showScreen(previousScreen, false);
}


/* ============================================================
   ROLE / ENTRADA
============================================================ */

function selectRole(role) {
  if (role !== "player" && role !== "organizer") {
    return;
  }

  state.role = role;
  state.dev.lastRole = role;

  persist();

  if (role === "player") {
    showScreen("player-home", false);
  } else {
    showScreen("organizer", false);
  }

  render();
}


/* ============================================================
   HEADER GLOBAL
============================================================ */

function renderGlobalHeader() {
  const status = $("#globalMatchStatus");

  if (!status) return;

  status.textContent = getStatusLabel(
    state.match.exists
      ? state.match.status
      : "none"
  );

  status.className = "match-status";

  if (state.match.status === "live") {
    status.classList.add("live");
  } else if (state.match.status === "scheduled") {
    status.classList.add("scheduled");
  } else if (state.match.status === "ended") {
    status.classList.add("ended");
  } else {
    status.classList.add("neutral");
  }
}


/* ============================================================
   RENDER PRINCIPAL
============================================================ */

function render() {
  renderGlobalHeader();
  renderPlayer();
  renderPlayerDetails();
  renderOrganizer();
  renderDev();
  renderTactical();
  renderWaiting();
}


/* ============================================================
   JOGADOR
============================================================ */

function renderPlayer() {
  const hasMatch =
    state.match.exists &&
    state.match.status !== "ended";

  const name = $("#playerMatchName");
  const stateLabel = $("#playerMatchState");

  if (!name || !stateLabel) {
    return;
  }

  if (!state.match.exists) {
    name.textContent = "Nenhuma partida cadastrada";
    stateLabel.textContent = "SEM PARTIDA";
  } else {
    name.textContent =
      state.match.name || "Partida sem nome";

    stateLabel.textContent =
      getStatusLabel(state.match.status);
  }

  setText(
    "#playerMatchDate",
    formatDate(state.match.date)
  );

  setText(
    "#playerMatchTime",
    state.match.time || "—"
  );

  setText(
    "#playerMatchLocation",
    state.match.location || "—"
  );

  setText(
    "#playerMatchMap",
    state.match.map || "—"
  );

  setText(
    "#playerMatchMode",
    state.match.mode || "—"
  );

  setText(
    "#playerMatchDuration",
    formatDuration(state.match.duration)
  );

  setText(
    "#playerDisplayName",
    state.player.name
  );

  setText(
    "#playerDisplayTeam",
    getTeamName(state.player.team)
  );


  const scheduledActions = $("#playerScheduledActions");
  const liveActions = $("#playerLiveActions");
  const enterActions = $("#playerEnterActions");

  if (scheduledActions) {
    scheduledActions.classList.toggle(
      "hidden",
      !(
        hasMatch &&
        state.match.status === "scheduled"
      )
    );
  }

  if (liveActions) {
    liveActions.classList.toggle(
      "hidden",
      !(
        hasMatch &&
        state.match.status === "live" &&
        !state.player.entryRequested &&
        !state.player.participation
      )
    );
  }

  if (enterActions) {
    enterActions.classList.toggle(
      "hidden",
      !(
        hasMatch &&
        state.match.status === "live" &&
        (
          state.player.entryRequested ||
          state.player.participation
        )
      )
    );
  }


  let participationText = "Aguardando confirmação";
  let participationBadge = "AGUARDANDO";

  if (state.player.participation) {
    participationText = "Participação confirmada";
    participationBadge = "CONFIRMADO";
  } else if (state.player.entryRequested) {
    participationText = "Entrada solicitada";
    participationBadge = "SOLICITADA";
  }

  setText(
    "#playerParticipationStatus",
    participationText
  );

  setText(
    "#playerParticipationBadge",
    participationBadge
  );
}


/* ============================================================
   CONFIRMAR PRESENÇA
============================================================ */

function confirmPresence() {
  if (!state.match.exists) {
    showToast("Não há partida cadastrada.");
    return;
  }

  if (state.match.status !== "scheduled") {
    showToast("A partida não está em estado agendado.");
    return;
  }

  state.player.participation = true;
  state.player.entryRequested = false;

  addEvent(
    "player",
    "Presença confirmada"
  );

  persist();

  showScreen("player-preparation");

  render();

  showToast("Presença confirmada.");
}


/* ============================================================
   SOLICITAR ENTRADA
============================================================ */

function requestEntry() {
  if (!state.match.exists) {
    showToast("Não há partida disponível.");
    return;
  }

  if (state.match.status !== "live") {
    showToast("A partida ainda não está ao vivo.");
    return;
  }

  state.player.entryRequested = true;

  addEvent(
    "player",
    "Entrada solicitada"
  );

  persist();

  showScreen("waiting");

  render();

  showToast("Solicitação enviada.");
}


/* ============================================================
   ENTRAR NO JOGO
============================================================ */

function enterMatch() {
  if (!state.match.exists) {
    showToast("Nenhuma partida disponível.");
    return;
  }

  if (state.match.status !== "live") {
    showToast("A partida ainda não foi iniciada.");
    return;
  }

  state.player.participation = true;
  state.player.entryRequested = false;

  addEvent(
    "player",
    "Jogador entrou na partida"
  );

  persist();

  showScreen("tactical");

  render();

  showToast("Entrada autorizada.");
}


/* ============================================================
   PREPARAÇÃO
============================================================ */

function renderPreparation() {
  setText(
    "#preparationMatchName",
    state.match.name || "—"
  );

  setText(
    "#preparationStatus",
    getStatusLabel(state.match.status)
  );

  setText(
    "#preparationBriefingTitle",
    state.organizer.briefingTitle || "Briefing"
  );

  setText(
    "#preparationBriefingText",
    state.organizer.briefingText || "—"
  );

  const checkbox = $("#playerBriefingAck");

  if (checkbox) {
    checkbox.checked = !!state.player.briefingAck;
  }
}


function acknowledgeBriefing() {
  const checkbox = $("#playerBriefingAck");

  if (!checkbox) return;

  state.player.briefingAck = checkbox.checked;

  persist();

  render();
}


function enterFromPreparation() {
  if (!state.player.briefingAck) {
    showToast("Confirme a leitura do briefing.");
    return;
  }

  if (state.match.status !== "live") {
    showToast("A partida ainda não foi iniciada.");
    return;
  }

  enterMatch();
}


/* ============================================================
   DETALHES DO JOGADOR
============================================================ */

function openPlayerDetails() {
  showScreen("player-details");
}


function renderPlayerDetails() {
  setText(
    "#detailInicioStatus",
    state.match.exists
      ? getStatusLabel(state.match.status)
      : "Aguardando partida"
  );

  setText(
    "#detailInicioText",
    state.match.exists
      ? (
        state.match.status === "live"
          ? "A partida está ao vivo."
          : "A partida está programada."
      )
      : "As informações da partida aparecerão aqui assim que o organizador salvar uma programação."
  );

  setText(
    "#detailPlayerName",
    state.player.name
  );

  setText(
    "#detailPlayerId",
    state.player.id
  );

  setText(
    "#detailPlayerTeam",
    getTeamName(state.player.team)
  );

  setText(
    "#detailPlayerClass",
    state.player.class
  );

  setText(
    "#detailBriefingTitle",
    state.organizer.briefingTitle || "Nenhum briefing disponível"
  );

  setText(
    "#detailBriefingText",
    state.organizer.briefingText || "O organizador ainda não cadastrou o briefing."
  );

  setText(
    "#profileName",
    state.player.name
  );

  setText(
    "#profileId",
    state.player.id
  );

  setText(
    "#profileTeam",
    getTeamName(state.player.team)
  );

  setText(
    "#profileClass",
    state.player.class
  );

  setText(
    "#profileRadioStatus",
    state.player.radio
      ? "ATIVO"
      : "DESATIVADO"
  );

  const ack = $("#detailBriefingAck");

  if (ack) {
    ack.checked = !!state.player.briefingAck;
  }
}


function switchDetailTab(tab) {
  const validTabs = [
    "inicio",
    "briefing",
    "perfil"
  ];

  if (!validTabs.includes(tab)) {
    return;
  }

  $$(".detail-tab").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.detailTab === tab
    );
  });

  $$("[data-detail-content]").forEach((content) => {
    content.classList.toggle(
      "active",
      content.dataset.detailContent === tab
    );
  });
}


/* ============================================================
   ORGANIZADOR
============================================================ */

function readOrganizerForm() {
  state.match.name =
    valueOf("#orgMatchName");

  state.match.date =
    valueOf("#orgMatchDate");

  state.match.time =
    valueOf("#orgMatchTime");

  state.match.location =
    valueOf("#orgMatchLocation");

  state.match.map =
    valueOf("#orgMatchMap") ||
    "Complexo Industrial";

  state.match.mode =
    valueOf("#orgMatchMode") ||
    "Simulação";

  state.match.duration =
    numberValue(
      "#orgMatchDuration",
      60
    );

  state.match.checkInTime =
    valueOf("#orgCheckInTime");


  state.organizer.briefingTitle =
    valueOf("#orgBriefingTitle") ||
    "Briefing da Operação";

  state.organizer.briefingText =
    valueOf("#orgBriefingText") ||
    "";

  state.organizer.objective =
    valueOf("#orgObjective") ||
    "";


  state.organizer.teamBlueName =
    valueOf("#orgTeamBlueName") ||
    "Equipe Azul";

  state.organizer.teamBlueLimit =
    numberValue(
      "#orgTeamBlueLimit",
      20
    );


  state.organizer.teamRedName =
    valueOf("#orgTeamRedName") ||
    "Equipe Vermelha";

  state.organizer.teamRedLimit =
    numberValue(
      "#orgTeamRedLimit",
      20
    );


  state.organizer.participates =
    checkedOf("#orgOrganizerParticipates");


  state.modules.medical =
    checkedOf("#moduleMedical");

  state.modules.zone =
    checkedOf("#moduleZone");

  state.modules.score =
    checkedOf("#moduleScore");

  state.modules.tracking =
    checkedOf("#moduleTracking");

  state.modules.objectives =
    checkedOf("#moduleObjectives");

  state.modules.events =
    checkedOf("#moduleEvents");
}


function writeOrganizerForm() {
  setValue(
    "#orgMatchName",
    state.match.name
  );

  setValue(
    "#orgMatchDate",
    state.match.date
  );

  setValue(
    "#orgMatchTime",
    state.match.time
  );

  setValue(
    "#orgMatchLocation",
    state.match.location
  );

  setValue(
    "#orgMatchMap",
    state.match.map
  );

  setValue(
    "#orgMatchMode",
    state.match.mode
  );

  setValue(
    "#orgMatchDuration",
    state.match.duration
  );

  setValue(
    "#orgCheckInTime",
    state.match.checkInTime
  );


  setValue(
    "#orgBriefingTitle",
    state.organizer.briefingTitle
  );

  setValue(
    "#orgBriefingText",
    state.organizer.briefingText
  );

  setValue(
    "#orgObjective",
    state.organizer.objective
  );


  setValue(
    "#orgTeamBlueName",
    state.organizer.teamBlueName
  );

  setValue(
    "#orgTeamBlueLimit",
    state.organizer.teamBlueLimit
  );

  setValue(
    "#orgTeamRedName",
    state.organizer.teamRedName
  );

  setValue(
    "#orgTeamRedLimit",
    state.organizer.teamRedLimit
  );


  setChecked(
    "#orgOrganizerParticipates",
    state.organizer.participates
  );


  setChecked(
    "#moduleMedical",
    state.modules.medical
  );

  setChecked(
    "#moduleZone",
    state.modules.zone
  );

  setChecked(
    "#moduleScore",
    state.modules.score
  );

  setChecked(
    "#moduleTracking",
    state.modules.tracking
  );

  setChecked(
    "#moduleObjectives",
    state.modules.objectives
  );

  setChecked(
    "#moduleEvents",
    state.modules.events
  );
}


function renderOrganizer() {
  writeOrganizerForm();

  setText(
    "#organizerMatchStateText",
    state.match.exists
      ? `STATUS: ${getStatusLabel(state.match.status)}`
      : "Nenhuma partida salva."
  );

  const startButton =
    $("#organizerStartButton");

  const endButton =
    $("#organizerEndButton");

  const startTop =
    $("#organizerStartButton");

  if (startButton) {
    startButton.classList.toggle(
      "hidden",
      !(
        state.match.exists &&
        state.match.status === "scheduled"
      )
    );
  }

  if (endButton) {
    endButton.classList.toggle(
      "hidden",
      state.match.status !== "live"
    );
  }

  setText(
    "#organizerPresence",
    buildPresenceText()
  );
}


function saveMatch() {
  if (state.role !== "organizer") {
    showToast("Somente o organizador pode salvar a partida.");
    return;
  }

  readOrganizerForm();

  if (!state.match.name.trim()) {
    showToast("Informe o nome da partida.");
    return;
  }

  if (!state.match.date) {
    showToast("Informe a data da partida.");
    return;
  }

  if (!state.match.time) {
    showToast("Informe o horário da partida.");
    return;
  }

  if (!state.match.location.trim()) {
    showToast("Informe o local da partida.");
    return;
  }


  const wasLive =
    state.match.status === "live";

  state.match.exists = true;

  /*
    Salvar não inicia a partida.
    Uma partida nova/alterada fica agendada,
    salvo quando ela já estiver ao vivo.
  */
  if (!wasLive) {
    state.match.status = "scheduled";
  }

  addEvent(
    "organizer",
    "Partida salva"
  );

  persist();

  render();

  openSaveConfirmation();
}


function openSaveConfirmation() {
  const modal = $("#saveConfirmModal");

  if (!modal) return;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  setText(
    "#saveConfirmText",
    `${state.match.name} foi salva e já está disponível no painel do jogador.`
  );
}


function closeSaveConfirmation() {
  const modal = $("#saveConfirmModal");

  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}


function enterAfterSave() {
  closeSaveConfirmation();

  state.role = "organizer";

  persist();

  showScreen("organizer");
}


/* ============================================================
   ORGANIZADOR — INICIAR
============================================================ */

function startMatch(source = "organizer") {
  /*
    A regra de autoridade é explícita:
    somente o organizador pode iniciar.
  */

  if (state.role !== "organizer" && source !== "dev") {
    showToast("Somente o organizador pode iniciar a partida.");
    return;
  }

  if (!state.match.exists) {
    showToast("Salve uma partida antes de iniciar.");
    return;
  }

  if (
    state.match.status !== "scheduled" &&
    source !== "dev"
  ) {
    showToast("A partida não está agendada.");
    return;
  }

  state.match.status = "live";
  state.match.startedAt = Date.now();
  state.match.elapsedSeconds = 0;

  state.player.entryRequested = false;

  addEvent(
    "organizer",
    "Partida iniciada"
  );

  persist();

  /*
    O organizador permanece organizador.
    Nunca mudamos automaticamente para jogador.
  */
  if (state.role === "organizer") {
    showScreen("organizer");
  }

  render();

  showToast("Partida iniciada.");
}


/* ============================================================
   ORGANIZADOR — ENCERRAR
============================================================ */

function endMatch(source = "organizer") {
  if (
    state.role !== "organizer" &&
    source !== "dev"
  ) {
    showToast("Somente o organizador pode encerrar a partida.");
    return;
  }

  if (!state.match.exists) {
    showToast("Não existe partida ativa.");
    return;
  }

  if (state.match.status !== "live") {
    showToast("A partida não está ao vivo.");
    return;
  }

  state.match.status = "ended";

  updateElapsedTime();

  addEvent(
    "organizer",
    "Partida encerrada"
  );

  persist();

  render();

  showToast("Partida encerrada.");
}


/* ============================================================
   DEV
============================================================ */

function renderDev() {
  const playersInput =
    $("#devPlayersPerTeam");

  if (
    playersInput &&
    document.activeElement !== playersInput
  ) {
    playersInput.value =
      state.simulatedPlayers.perTeam;
  }

  updateDevPreview();

  $$(".dev-segment[data-dev-role]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.devRole === state.role
    );
  });

  $$(".dev-segment[data-dev-status]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.devStatus === state.match.status
    );
  });
}


function switchDevRole(role) {
  if (
    role !== "player" &&
    role !== "organizer"
  ) {
    return;
  }

  state.role = role;
  state.dev.lastRole = role;

  persist();

  render();

  showToast(
    role === "player"
      ? "DEV: jogador"
      : "DEV: organizador"
  );
}


function setDevStatus(status) {
  const valid = [
    "scheduled",
    "live",
    "ended"
  ];

  if (!valid.includes(status)) {
    return;
  }

  if (!state.match.exists) {
    generateDevMatch(false);
  }

  state.match.status = status;

  if (status === "live") {
    if (!state.match.startedAt) {
      state.match.startedAt = Date.now();
    }
  }

  if (status !== "live") {
    state.match.startedAt = null;
  }

  if (status === "ended") {
    state.match.elapsedSeconds = 0;
  }

  persist();

  render();

  showToast(
    `DEV: ${getStatusLabel(status)}`
  );
}


function updateDevPreview() {
  const input =
    $("#devPlayersPerTeam");

  const value = input
    ? Math.max(
        0,
        Math.floor(Number(input.value) || 0)
      )
    : state.simulatedPlayers.perTeam;

  setText(
    "#devBlueCount",
    value
  );

  setText(
    "#devRedCount",
    value
  );

  setText(
    "#devTotalCount",
    value * 2
  );
}


function applyDevPlayers() {
  const input =
    $("#devPlayersPerTeam");

  if (!input) return;

  const amount = Math.max(
    0,
    Math.min(
      500,
      Math.floor(Number(input.value) || 0)
    )
  );

  state.simulatedPlayers.perTeam =
    amount;

  state.simulatedPlayers.blue =
    createSimulatedTeam(
      "AZ",
      amount
    );

  state.simulatedPlayers.red =
    createSimulatedTeam(
      "VM",
      amount
    );

  addEvent(
    "dev",
    `${amount} jogadores simulados por equipe`
  );

  persist();

  render();

  showToast(
    `${amount} por equipe aplicados.`
  );
}


function createSimulatedTeam(prefix, amount) {
  const players = [];

  for (let i = 1; i <= amount; i++) {
    players.push({
      id: `${prefix}-${String(i).padStart(3, "0")}`,
      name: `${prefix} ${String(i).padStart(3, "0")}`
    });
  }

  return players;
}


function generateDevMatch(showMessage = true) {
  state.match.exists = true;

  state.match.name =
    "Operação Red Sand";

  state.match.status =
    "scheduled";

  state.match.date =
    getTodayISO();

  state.match.time =
    "19:00";

  state.match.location =
    "Complexo Industrial";

  state.match.map =
    "Complexo Industrial";

  state.match.mode =
    "Simulação";

  state.match.duration =
    60;

  state.match.checkInTime =
    "18:30";

  state.match.startedAt =
    null;

  state.match.elapsedSeconds =
    0;


  state.organizer.briefingTitle =
    "Briefing da Operação";

  state.organizer.briefingText =
    "Objetivo, regras da partida, condições de participação e orientações gerais.";

  state.organizer.objective =
    "Acompanhar os objetivos definidos pelo organizador.";


  state.organizer.teamBlueName =
    "Equipe Azul";

  state.organizer.teamRedName =
    "Equipe Vermelha";


  addEvent(
    "dev",
    "Partida de teste gerada"
  );

  persist();

  render();

  if (showMessage) {
    showToast("Partida de teste criada.");
  }
}


function devStartMatch() {
  state.role = "organizer";

  if (!state.match.exists) {
    generateDevMatch(false);
  }

  startMatch("dev");
}


function devEndMatch() {
  endMatch("dev");
}


function resetAllState() {
  const confirmed =
    window.confirm(
      "Resetar todos os dados persistentes da partida?"
    );

  if (!confirmed) {
    return;
  }

  state = createInitialState();

  persist();

  currentScreen = "role-select";
  previousScreen = "player-home";

  showScreen(
    "role-select",
    false
  );

  render();

  showToast("Dados resetados.");
}


/* ============================================================
   PRESENÇA
============================================================ */

function buildPresenceText() {
  const blue =
    state.simulatedPlayers.blue || [];

  const red =
    state.simulatedPlayers.red || [];

  const blueName =
    state.organizer.teamBlueName ||
    "Equipe Azul";

  const redName =
    state.organizer.teamRedName ||
    "Equipe Vermelha";

  const playerStatus =
    state.player.participation
      ? "confirmado"
      : state.player.entryRequested
        ? "solicitação enviada"
        : "aguardando";


  return `
    ${escapeHTML(blueName)}:
    ${blue.length} jogadores simulados

    • ${escapeHTML(redName)}:
    ${red.length} jogadores simulados

    • ${escapeHTML(state.player.name)}:
    ${playerStatus}
  `.replace(/\s+/g, " ").trim();
}


/* ============================================================
   PAINEL TÁTICO
============================================================ */

function renderTactical() {
  setText(
    "#tacticalMatchName",
    state.match.name || "SEM PARTIDA"
  );

  setText(
    "#tacticalMapName",
    state.match.map || "Complexo Industrial"
  );

  setText(
    "#tacticalObjective",
    state.organizer.objective ||
      "Aguardando briefing."
  );

  setText(
    "#tacticalStatus",
    getStatusLabel(
      state.match.status
    )
  );

  setText(
    "#tacticalTimer",
    formatTimer(
      state.match.elapsedSeconds
    )
  );

  setText(
    "#tacticalPlayerCount",
    getTotalPlayerCount()
  );


  setText(
    "#radioChannel",
    String(
      state.player.channel
    ).padStart(2, "0")
  );


  const radioToggle =
    $("#radioToggle");

  if (radioToggle) {
    radioToggle.textContent =
      state.player.radio
        ? "ON"
        : "OFF";

    radioToggle.classList.toggle(
      "active",
      state.player.radio
    );
  }


  const volume =
    $("#radioVolume");

  if (volume) {
    volume.value =
      state.player.radioVolume;
  }


  const organizerStart =
    $("#tacticalOrganizerStart");

  const organizerEnd =
    $("#tacticalOrganizerEnd");

  const playerLeave =
    $("#tacticalPlayerLeave");


  if (organizerStart) {
    organizerStart.classList.toggle(
      "hidden",
      !(
        state.role === "organizer" &&
        state.match.exists &&
        state.match.status === "scheduled"
      )
    );
  }


  if (organizerEnd) {
    organizerEnd.classList.toggle(
      "hidden",
      !(
        state.role === "organizer" &&
        state.match.status === "live"
      )
    );
  }


  if (playerLeave) {
    playerLeave.classList.toggle(
      "hidden",
      !(
        state.role === "player" &&
        state.match.status === "live"
      )
    );
  }


  const lockButton =
    $("#tacticalLockButton");

  if (lockButton) {
    lockButton.textContent =
      "BLOQUEAR";
  }
}


function getTotalPlayerCount() {
  const simulated =
    Number(
      state.simulatedPlayers.perTeam || 0
    ) * 2;

  const ownPlayer =
    state.player.participation
      ? 1
      : 0;

  return simulated + ownPlayer;
}


/* ============================================================
   TRAVA DO PAINEL
============================================================ */

function unlockStart() {
  if (unlockStarted) return;

  unlockStarted = true;

  const guard =
    $("#touchGuard");

  if (!guard) return;

  unlockTimer = setTimeout(() => {

    guard.classList.add(
      "hidden"
    );

    unlockStarted = false;

    showToast(
      "Painel desbloqueado."
    );

  }, 900);
}


function unlockCancel() {
  clearTimeout(
    unlockTimer
  );

  unlockStarted = false;
}


function lockTacticalPanel() {
  const guard =
    $("#touchGuard");

  if (!guard) return;

  guard.classList.remove(
    "hidden"
  );

  showToast(
    "Painel bloqueado."
  );
}


/* ============================================================
   RÁDIO
============================================================ */

function toggleRadio() {
  state.player.radio =
    !state.player.radio;

  persist();

  render();

  showToast(
    state.player.radio
      ? "Rádio ativado."
      : "Rádio desativado."
  );
}


function changeChannel(delta) {
  let channel =
    Number(state.player.channel) || 1;

  channel += delta;

  if (channel < 1) {
    channel = 1;
  }

  if (channel > 99) {
    channel = 99;
  }

  state.player.channel =
    channel;

  persist();

  render();
}


function changeVolume(value) {
  const volume =
    Math.max(
      0,
      Math.min(
        100,
        Number(value) || 0
      )
    );

  state.player.radioVolume =
    volume;

  persist();
}


function radioPushStart() {
  if (!state.player.radio) {
    showToast("Rádio desligado.");
    return;
  }

  clearTimeout(
    radioPushTimer
  );

  setText(
    "#radioFeedback",
    "TRANSMITINDO..."
  );

  $("#pttButton")?.classList.add(
    "transmitting"
  );
}


function radioPushEnd() {
  clearTimeout(
    radioPushTimer
  );

  setText(
    "#radioFeedback",
    "RÁDIO PRONTO"
  );

  $("#pttButton")?.classList.remove(
    "transmitting"
  );
}


/* ============================================================
   GPS
============================================================ */

function requestGPS() {
  if (!navigator.geolocation) {
    setGPSStatus(
      "GPS INDISPONÍVEL"
    );

    return;
  }

  setGPSStatus(
    "LOCALIZANDO..."
  );

  navigator.geolocation.getCurrentPosition(
    (position) => {

      state.gps.lat =
        position.coords.latitude;

      state.gps.lng =
        position.coords.longitude;

      state.gps.accuracy =
        position.coords.accuracy;

      state.gps.ready =
        true;

      persist();

      setGPSStatus(
        `GPS ±${Math.round(
          position.coords.accuracy
        )}m`
      );
    },

    () => {

      /*
        O mapa continua sendo o mapa fictício
        da partida. A ausência do GPS não quebra
        o restante do aplicativo.
      */

      state.gps.lat =
        DEMO_CENTER.lat;

      state.gps.lng =
        DEMO_CENTER.lng;

      state.gps.ready =
        false;

      persist();

      setGPSStatus(
        "GPS INDISPONÍVEL"
      );
    },

    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    }
  );
}


function setGPSStatus(text) {
  setText(
    "#tacticalGpsStatus",
    text
  );
}


/* ============================================================
   OBJETIVOS / INSTRUÇÕES
============================================================ */

function openObjectives() {
  const body = `
    <div class="modal-info-list">
      <p><strong>SETOR ALFA</strong> — ${escapeHTML(
        state.objectives.alfa.control
      )}</p>

      <p><strong>SETOR BRAVO</strong> — ${escapeHTML(
        state.objectives.bravo.control
      )}</p>
    </div>
  `;

  openAppModal(
    "OBJETIVOS",
    "OBJETIVOS DA PARTIDA",
    body
  );
}


function openInstructions() {
  const body = `
    <p>
      Consulte o briefing cadastrado pelo organizador
      para as regras e orientações da partida.
    </p>

    <p>
      <strong>Briefing:</strong>
      ${escapeHTML(
        state.organizer.briefingTitle ||
        "Não definido"
      )}
    </p>

    <p>
      ${escapeHTML(
        state.organizer.briefingText ||
        "Nenhuma orientação cadastrada."
      )}
    </p>
  `;

  openAppModal(
    "INSTRUÇÕES",
    "ORIENTAÇÕES DA PARTIDA",
    body
  );
}


/* ============================================================
   ABANDONAR PARTIDA
============================================================ */

function leaveMatch() {
  if (state.role !== "player") {
    return;
  }

  if (state.match.status !== "live") {
    showToast(
      "Não há partida ao vivo para abandonar."
    );

    return;
  }

  const confirmed =
    window.confirm(
      "Abandonar a partida atual?"
    );

  if (!confirmed) {
    return;
  }

  state.player.participation =
    false;

  state.player.entryRequested =
    false;

  addEvent(
    "player",
    "Jogador abandonou a partida"
  );

  persist();

  showScreen(
    "player-home"
  );

  render();

  showToast(
    "Você saiu da partida."
  );
}


/* ============================================================
   MODAL GENÉRICO
============================================================ */

function openAppModal(
  kicker,
  title,
  body
) {
  const modal =
    $("#appModal");

  if (!modal) return;

  setText(
    "#appModalKicker",
    kicker
  );

  setText(
    "#appModalTitle",
    title
  );

  const content =
    $("#appModalBody");

  if (content) {
    content.innerHTML = body;
  }

  modal.classList.remove(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );
}


function closeAppModal() {
  const modal =
    $("#appModal");

  if (!modal) return;

  modal.classList.add(
    "hidden"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}


/* ============================================================
   TEMPO DA PARTIDA
============================================================ */

function updateElapsedTime() {
  if (
    state.match.status !== "live" ||
    !state.match.startedAt
  ) {
    return;
  }

  const elapsed =
    Math.floor(
      (
        Date.now() -
        state.match.startedAt
      ) / 1000
    );

  state.match.elapsedSeconds =
    Math.max(
      0,
      elapsed
    );
}


setInterval(() => {

  if (
    state.match.status === "live" &&
    state.match.startedAt
  ) {

    updateElapsedTime();

    setText(
      "#tacticalTimer",
      formatTimer(
        state.match.elapsedSeconds
      )
    );
  }

}, 1000);


/* ============================================================
   EVENTOS / HISTÓRICO
============================================================ */

function addEvent(
  source,
  description
) {
  state.events.push({
    source,
    description,
    timestamp: Date.now()
  });

  /*
    Mantém somente uma quantidade razoável
    de eventos persistentes.
  */
  if (state.events.length > 200) {
    state.events =
      state.events.slice(-200);
  }
}


/* ============================================================
   HELPERS DE FORMULÁRIO
============================================================ */

function valueOf(selector) {
  const element =
    $(selector);

  return element
    ? element.value
    : "";
}


function setValue(
  selector,
  value
) {
  const element =
    $(selector);

  if (!element) return;

  element.value =
    value ?? "";
}


function checkedOf(selector) {
  const element =
    $(selector);

  return !!(
    element &&
    element.checked
  );
}


function setChecked(
  selector,
  value
) {
  const element =
    $(selector);

  if (!element) return;

  element.checked =
    !!value;
}


function numberValue(
  selector,
  fallback
) {
  const value =
    Number(
      valueOf(selector)
    );

  return Number.isFinite(value)
    ? value
    : fallback;
}


function setText(
  selector,
  text
) {
  const element =
    $(selector);

  if (!element) return;

  element.textContent =
    text ?? "";
}


/* ============================================================
   EQUIPE
============================================================ */

function getTeamName(team) {
  if (team === "azul") {
    return (
      state.organizer.teamBlueName ||
      "Equipe Azul"
    );
  }

  if (team === "vermelha") {
    return (
      state.organizer.teamRedName ||
      "Equipe Vermelha"
    );
  }

  return "—";
}


/* ============================================================
   DATA
============================================================ */

function getTodayISO() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* ============================================================
   EVENT DELEGAÇÃO
   Um único ponto de entrada para os elementos dinâmicos.
============================================================ */

document.addEventListener(
  "click",
  (event) => {

    const roleChoice =
      event.target.closest(
        "[data-role-choice]"
      );

    if (roleChoice) {
      selectRole(
        roleChoice.dataset.roleChoice
      );

      return;
    }


    const backButton =
      event.target.closest(
        "[data-back-screen]"
      );

    if (backButton) {

      const target =
        backButton.dataset.backScreen;

      if (target === "previous") {
        goBack();
      } else {
        showScreen(target);
      }

      return;
    }


    const detailTab =
      event.target.closest(
        "[data-detail-tab]"
      );

    if (detailTab) {
      switchDetailTab(
        detailTab.dataset.detailTab
      );

      return;
    }


    const devRole =
      event.target.closest(
        "[data-dev-role]"
      );

    if (devRole) {
      switchDevRole(
        devRole.dataset.devRole
      );

      return;
    }


    const devStatus =
      event.target.closest(
        "[data-dev-status]"
      );

    if (devStatus) {
      setDevStatus(
        devStatus.dataset.devStatus
      );

      return;
    }


    const orgSection =
      event.target.closest(
        "[data-org-section]"
      );

    if (orgSection) {
      /*
        As seções do organizador ficam na mesma tela.
        O clique posiciona a tela na seção correspondente
        sem trocar o modo ou perder os dados.
      */

      const section =
        orgSection.dataset.orgSection;

      const sectionMap = {
        general: ".organizer-section:nth-of-type(1)",
        briefing: ".organizer-section:nth-of-type(2)",
        teams: ".organizer-section:nth-of-type(3)",
        modules: ".organizer-section:nth-of-type(4)",
        presence: ".organizer-section:nth-of-type(5)"
      };

      const target =
        document.querySelector(
          sectionMap[section]
        );

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

      $$(".side-nav").forEach(
        (button) => {
          button.classList.toggle(
            "active",
            button === orgSection
          );
        }
      );

      return;
    }

  }
);


/* ============================================================
   BOTÃO DEV
============================================================ */

$("#devButton")?.addEventListener(
  "click",
  () => {
    showScreen("dev");
  }
);


/* ============================================================
   JOGADOR
============================================================ */

$("#playerConfirmPresence")
  ?.addEventListener(
    "click",
    confirmPresence
  );


$("#playerRequestEntry")
  ?.addEventListener(
    "click",
    requestEntry
  );


$("#playerEnterMatch")
  ?.addEventListener(
    "click",
    enterMatch
  );


$("#playerDetailsButton")
  ?.addEventListener(
    "click",
    openPlayerDetails
  );


$("#playerPreparationEnter")
  ?.addEventListener(
    "click",
    enterFromPreparation
  );


$("#playerBriefingAck")
  ?.addEventListener(
    "change",
    acknowledgeBriefing
  );


$("#detailBriefingAck")
  ?.addEventListener(
    "change",
    (event) => {

      state.player.briefingAck =
        event.target.checked;

      persist();
    }
  );


/* ============================================================
   ORGANIZADOR
============================================================ */

$("#organizerSaveButton")
  ?.addEventListener(
    "click",
    saveMatch
  );


$("#organizerStartButton")
  ?.addEventListener(
    "click",
    () => startMatch("organizer")
  );


$("#organizerEndButton")
  ?.addEventListener(
    "click",
    () => endMatch("organizer")
  );


$("#saveConfirmContinue")
  ?.addEventListener(
    "click",
    closeSaveConfirmation
  );


$("#saveConfirmEnter")
  ?.addEventListener(
    "click",
    enterAfterSave
  );


/* ============================================================
   TÁTICO
============================================================ */

$("#tacticalOrganizerStart")
  ?.addEventListener(
    "click",
    () => startMatch("organizer")
  );


$("#tacticalOrganizerEnd")
  ?.addEventListener(
    "click",
    () => endMatch("organizer")
  );


$("#tacticalPlayerLeave")
  ?.addEventListener(
    "click",
    leaveMatch
  );


$("#tacticalLockButton")
  ?.addEventListener(
    "click",
    lockTacticalPanel
  );


$("#tacticalObjectivesButton")
  ?.addEventListener(
    "click",
    openObjectives
  );


$("#tacticalInstructionsButton")
  ?.addEventListener(
    "click",
    openInstructions
  );


/* ============================================================
   TRAVA / DESBLOQUEIO
============================================================ */

const unlockButton =
  $("#unlockButton");

if (unlockButton) {

  unlockButton.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      unlockStart();
    }
  );

  unlockButton.addEventListener(
    "pointerup",
    unlockCancel
  );

  unlockButton.addEventListener(
    "pointercancel",
    unlockCancel
  );

  unlockButton.addEventListener(
    "pointerleave",
    unlockCancel
  );
}


/* ============================================================
   RÁDIO
============================================================ */

$("#radioToggle")
  ?.addEventListener(
    "click",
    toggleRadio
  );


$("#channelDown")
  ?.addEventListener(
    "click",
    () => changeChannel(-1)
  );


$("#channelUp")
  ?.addEventListener(
    "click",
    () => changeChannel(1)
  );


$("#radioVolume")
  ?.addEventListener(
    "input",
    (event) => {
      changeVolume(
        event.target.value
      );
    }
  );


const pttButton =
  $("#pttButton");

if (pttButton) {

  pttButton.addEventListener(
    "pointerdown",
    (event) => {
      event.preventDefault();
      radioPushStart();
    }
  );

  pttButton.addEventListener(
    "pointerup",
    radioPushEnd
  );

  pttButton.addEventListener(
    "pointercancel",
    radioPushEnd
  );

  pttButton.addEventListener(
    "pointerleave",
    radioPushEnd
  );
}


/* ============================================================
   ESPERA
============================================================ */

$("#waitingBackButton")
  ?.addEventListener(
    "click",
    () => showScreen("player-home")
  );


/* ============================================================
   DEV
============================================================ */

$("#devPlayersPerTeam")
  ?.addEventListener(
    "input",
    updateDevPreview
  );


$("#devApplyPlayers")
  ?.addEventListener(
    "click",
    applyDevPlayers
  );


$("#devGenerateMatch")
  ?.addEventListener(
    "click",
    () => generateDevMatch(true)
  );


$("#devStartMatch")
  ?.addEventListener(
    "click",
    devStartMatch
  );


$("#devEndMatch")
  ?.addEventListener(
    "click",
    devEndMatch
  );


$("#devReset")
  ?.addEventListener(
    "click",
    resetAllState
  );


/* ============================================================
   MODAL GENÉRICO
============================================================ */

$("#appModalClose")
  ?.addEventListener(
    "click",
    closeAppModal
  );


$("#appModal .modal-backdrop")
  ?.addEventListener(
    "click",
    closeAppModal
  );


/* ============================================================
   TECLADO / ACESSIBILIDADE
============================================================ */

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape"
    ) {
      closeAppModal();
      closeSaveConfirmation();
    }

  }
);


/* ============================================================
   INICIALIZAÇÃO
============================================================ */

function initialize() {

  /*
    Se já houver estado persistente, não mostramos novamente
    a seleção inicial. O último papel utilizado é restaurado.
  */

  const hasPersistentSession =
    localStorage.getItem(
      STORAGE_KEY
    );

  if (hasPersistentSession) {

    if (state.role === "organizer") {
      showScreen(
        "organizer",
        false
      );
    } else {
      showScreen(
        "player-home",
        false
      );
    }

  } else {

    /*
      Primeira utilização:
      jogador é o fluxo padrão.
      A tela de escolha ainda permite selecionar organizador.
    */

    state.role = "player";

    showScreen(
      "role-select",
      false
    );
  }


  persist();

  requestGPS();

  render();

}


/* ============================================================
   START
============================================================ */

initialize();