/* ================================================================
   DESERT FALCONS — APP PRINCIPAL
   Estado compartilhado + DEV + jogador + organizador.
   Persistência: localStorage.
================================================================ */

const STORAGE_KEY = "desert-falcons-terminal-v7";

/* ================================================================
   UTILITÁRIOS
================================================================ */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowTime() {
  const d = new Date();
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateBr(date) {
  if (!date) return "—";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function toast(message) {
  const el = $("#toast");

  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

/* ================================================================
   ESTADO INICIAL
================================================================ */

function initialState() {
  return {
    version: 7,

    firstRun: true,

    currentRole: "player",

    currentScreen: "role",

    previousScreen: "playerLobby",

    detailTab: "inicio",

    organizerSection: "general",

    match: {
      exists: false,
      saved: false,

      name: "Operação Red Sand",
      date: "",
      time: "",
      location: "A definir",

      map: "Complexo Industrial",
      mode: "Simulação",

      objective: "Capturar e manter os setores Alfa e Bravo.",

      briefingTitle: "Briefing da Operação",
      briefingText:
        "Objetivo, regras da partida, condições de participação e orientações gerais.",

      teamA: "AZUL",
      teamB: "VERMELHA",

      teamAColor: "#4f9be8",
      teamBColor: "#df5f66",

      duration: 120,
      checkInTime: "",

      status: "scheduled",
      seconds: 0,

      organizerParticipates: true,

      modules: {
        medical: true,
        zones: true,
        score: false,
        tracking: false,
        objectives: true,
        events: false
      }
    },

    player: {
      id: "DF-001",
      name: "DANIEL",

      team: "AZUL",

      roleClass: "Assalto",

      participation: false,

      entryRequest: "none",

      briefingAck: false,

      locked: true,

      radio: true,
      channel: "01",
      radioVolume: 70
    },

    simulated: {
      playersPerTeam: 10,
      players: []
    },

    dev: {
      role: "player",
      status: "scheduled"
    },

    gps: {
      lat: null,
      lng: null,
      accuracy: null,
      ready: false
    }
  };
}

/* ================================================================
   PERSISTÊNCIA
================================================================ */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return initialState();
    }

    const saved = JSON.parse(raw);

    return normalizeState(saved);
  } catch (error) {
    console.warn("Não foi possível carregar o estado persistente.", error);
    return initialState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Não foi possível salvar o estado persistente.", error);
  }
}

function normalizeState(saved) {
  const base = initialState();

  const merged = {
    ...base,
    ...saved,

    match: {
      ...base.match,
      ...(saved.match || {}),
      modules: {
        ...base.match.modules,
        ...(saved.match?.modules || {})
      }
    },

    player: {
      ...base.player,
      ...(saved.player || {})
    },

    simulated: {
      ...base.simulated,
      ...(saved.simulated || {})
    },

    dev: {
      ...base.dev,
      ...(saved.dev || {})
    },

    gps: {
      ...base.gps,
      ...(saved.gps || {})
    }
  };

  if (!merged.match.exists && merged.firstRun === false) {
    merged.currentScreen =
      merged.currentScreen === "role" ? "playerLobby" : merged.currentScreen;
  }

  return merged;
}

let state = loadState();

/* ================================================================
   NAVEGAÇÃO
================================================================ */

function showScreen(screenId) {
  $$(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const target = $(`#screen${capitalize(screenId)}`);

  if (!target) {
    console.warn(`Tela não encontrada: ${screenId}`);
    return;
  }

  target.classList.add("active");

  if (state.currentScreen !== screenId) {
    state.previousScreen = state.currentScreen;
  }

  state.currentScreen = screenId;

  saveState();
  render();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function goBack(target) {
  if (target === "previous") {
    const fallback = state.previousScreen || "playerLobby";
    showScreen(fallback);
    return;
  }

  showScreen(target);
}

/* ================================================================
   ROLE
================================================================ */

function chooseRole(role) {
  state.firstRun = false;
  state.currentRole = role;

  if (role === "organizer") {
    showScreen("organizer");
  } else {
    showScreen("playerLobby");
  }

  saveState();
  render();
}

function setDevRole(role) {
  state.dev.role = role;
  state.currentRole = role;

  if (role === "organizer") {
    showScreen("organizer");
  } else {
    showScreen("playerLobby");
  }

  saveState();
  render();
}

/* ================================================================
   PARTIDA
================================================================ */

function hasMatch() {
  return Boolean(state.match.exists);
}

function createDefaultMatch() {
  state.match.exists = true;
  state.match.saved = true;

  if (!state.match.date) {
    const d = new Date();
    d.setDate(d.getDate() + 1);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    state.match.date = `${yyyy}-${mm}-${dd}`;
  }

  if (!state.match.time) {
    state.match.time = "09:00";
  }

  if (!state.match.checkInTime) {
    state.match.checkInTime = "08:30";
  }

  state.match.status = state.dev.status;

  saveState();
  render();
  toast("Partida de teste criada.");
}

function startMatch(origin = "organizer") {
  if (!state.match.exists) {
    toast("Salve ou gere uma partida antes de iniciar.");
    return;
  }

  /*
    Regra principal:
    jogador NÃO inicia partida.
    DEV pode iniciar para testes.
  */
  if (origin !== "dev" && state.currentRole !== "organizer") {
    toast("Somente o organizador pode iniciar a partida.");
    return;
  }

  state.match.status = "live";
  state.match.saved = true;
  state.match.seconds = 0;

  /*
    Se o organizador participa, ele entra como participante.
  */
  if (state.match.organizerParticipates) {
    ensureOrganizerPlayerSimulation();
  }

  saveState();

  if (state.currentRole === "organizer") {
    showScreen("tactical");
  } else {
    state.player.entryRequest = "accepted";
    state.player.locked = true;
    showScreen("tactical");
  }

  toast("Partida iniciada.");
}

function endMatch(origin = "organizer") {
  if (!state.match.exists) return;

  if (origin !== "dev" && state.currentRole !== "organizer") {
    toast("Somente o organizador pode encerrar a partida.");
    return;
  }

  state.match.status = "ended";
  state.player.locked = true;

  saveState();
  render();

  toast("Partida encerrada.");
}

function abandonMatch() {
  if (state.match.status !== "live") {
    toast("Não há partida ao vivo para abandonar.");
    return;
  }

  state.player.entryRequest = "none";
  state.player.participation = false;
  state.player.locked = true;

  saveState();

  showScreen("playerLobby");

  toast("Você saiu da partida.");
}

/* ================================================================
   JOGADOR
================================================================ */

function confirmPresence() {
  if (!hasMatch()) {
    toast("Nenhuma partida disponível.");
    return;
  }

  if (state.match.status !== "scheduled") {
    toast("A partida não está em fase de confirmação.");
    return;
  }

  state.player.participation = true;
  state.player.entryRequest = "confirmed";

  saveState();
  render();

  toast("Presença confirmada.");
}

function requestEntry() {
  if (!hasMatch()) {
    toast("Nenhuma partida disponível.");
    return;
  }

  if (state.match.status !== "live") {
    toast("A partida ainda não está ao vivo.");
    return;
  }

  /*
    Sem backend, o ambiente DEV trata a solicitação como aceita
    para permitir testar o fluxo inteiro no celular.
  */
  state.player.entryRequest = "accepted";
  state.player.participation = true;
  state.player.locked = true;

  saveState();
  render();

  showScreen("tactical");
}

function enterScheduledMatch() {
  if (!state.player.participation) {
    toast("Confirme sua presença primeiro.");
    return;
  }

  if (state.match.status === "live") {
    state.player.entryRequest = "accepted";
    state.player.locked = true;

    saveState();
    showScreen("tactical");

    return;
  }

  toast("A partida ainda está agendada.");
}

/* ================================================================
   BRIEFING
================================================================ */

function acknowledgeBriefing() {
  state.player.briefingAck = !state.player.briefingAck;
  saveState();
  render();
}

/* ================================================================
   ORGANIZADOR — FORMULÁRIO
================================================================ */

const ORGANIZER_FIELDS = {
  matchName: "match-name",
  date: "match-date",
  time: "match-time",
  location: "match-location",
  map: "match-map",
  mode: "match-mode",
  objective: "match-objective",
  briefingTitle: "briefing-title",
  briefingText: "briefing-text",
  teamA: "team-a",
  teamB: "team-b",
  teamAColor: "team-a-color",
  teamBColor: "team-b-color",
  duration: "match-duration",
  checkIn: "match-checkin"
};

function fieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function saveOrganizerFormToState() {
  state.match.name = fieldValue(ORGANIZER_FIELDS.matchName) || "Partida sem nome";
  state.match.date = fieldValue(ORGANIZER_FIELDS.date);
  state.match.time = fieldValue(ORGANIZER_FIELDS.time);
  state.match.location = fieldValue(ORGANIZER_FIELDS.location) || "A definir";

  state.match.map = fieldValue(ORGANIZER_FIELDS.map) || "Área de Operação";
  state.match.mode = fieldValue(ORGANIZER_FIELDS.mode) || "Simulação";

  state.match.objective =
    fieldValue(ORGANIZER_FIELDS.objective) ||
    "Objetivo definido pelo organizador.";

  state.match.briefingTitle =
    fieldValue(ORGANIZER_FIELDS.briefingTitle) ||
    "Briefing da Operação";

  state.match.briefingText =
    fieldValue(ORGANIZER_FIELDS.briefingText) ||
    "Briefing ainda não preenchido.";

  state.match.teamA = fieldValue(ORGANIZER_FIELDS.teamA) || "AZUL";
  state.match.teamB = fieldValue(ORGANIZER_FIELDS.teamB) || "VERMELHA";

  state.match.teamAColor =
    fieldValue(ORGANIZER_FIELDS.teamAColor) || "#4f9be8";

  state.match.teamBColor =
    fieldValue(ORGANIZER_FIELDS.teamBColor) || "#df5f66";

  state.match.duration =
    Number(fieldValue(ORGANIZER_FIELDS.duration)) || 120;

  state.match.checkInTime =
    fieldValue(ORGANIZER_FIELDS.checkIn) || "";
}

function renderOrganizerForm() {
  const root = $("#organizerForm");

  if (!root) return;

  const section = state.organizerSection;

  const headerData = {
    general: {
      title: "DADOS PRINCIPAIS",
      text: "Defina quando, onde e qual partida será apresentada aos jogadores."
    },

    briefing: {
      title: "BRIEFING E OBJETIVO",
      text: "Tudo que o jogador precisa saber antes de confirmar e entrar."
    },

    teams: {
      title: "EQUIPES",
      text: "Identificação visual das equipes e configuração de participação."
    },

    modules: {
      title: "MÓDULOS DA PARTIDA",
      text: "Ative somente os recursos que realmente serão utilizados."
    },

    presence: {
      title: "PRESENÇA DO ORGANIZADOR",
      text: "O organizador pode participar da partida ou permanecer apenas no comando."
    }
  };

  const meta = headerData[section];

  let html = `
    <div class="organizer-form-scroll">

      <div class="form-section-title">
        <div>
          <div class="eyebrow">CONFIGURAÇÃO</div>
          <h3>${meta.title}</h3>
        </div>
        <small>${meta.text}</small>
      </div>
  `;

  if (section === "general") {
    html += `
      <div class="form-section">
        <div class="form-grid">
          <div class="form-field full">
            <label class="field-label" for="match-name">NOME DA PARTIDA</label>
            <input id="match-name" type="text" value="${escapeHtml(state.match.name)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="match-date">DATA</label>
            <input id="match-date" type="date" value="${escapeHtml(state.match.date)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="match-time">HORÁRIO DE INÍCIO</label>
            <input id="match-time" type="time" value="${escapeHtml(state.match.time)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="match-checkin">HORÁRIO DE CHECK-IN</label>
            <input id="match-checkin" type="time" value="${escapeHtml(state.match.checkInTime)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="match-duration">DURAÇÃO ESTIMADA (MIN)</label>
            <input id="match-duration" type="number" min="1" max="1440"
              value="${state.match.duration}">
          </div>

          <div class="form-field full">
            <label class="field-label" for="match-location">LOCAL DA PARTIDA</label>
            <input id="match-location" type="text" value="${escapeHtml(state.match.location)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="match-map">MAPA / ÁREA</label>
            <input id="match-map" type="text" value="${escapeHtml(state.match.map)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="match-mode">MODO DE PARTIDA</label>
            <select id="match-mode">
              ${selectOption("Simulação", state.match.mode)}
              ${selectOption("Conquista", state.match.mode)}
              ${selectOption("Objetivos", state.match.mode)}
              ${selectOption("Livre", state.match.mode)}
              ${selectOption("Outro", state.match.mode)}
            </select>
          </div>
        </div>
      </div>

      <div class="info-card">
        <div class="eyebrow">FLUXO</div>
        <h3 style="margin-top:6px;">Como o jogador verá isso</h3>
        <p class="field-help">
          A partida salva aparecerá no painel do jogador como agendada. Quando o organizador
          iniciar, ela passa automaticamente para AO VIVO.
        </p>
      </div>
    `;
  }

  if (section === "briefing") {
    html += `
      <div class="form-section">
        <div class="form-grid">
          <div class="form-field full">
            <label class="field-label" for="briefing-title">TÍTULO DO BRIEFING</label>
            <input id="briefing-title" type="text"
              value="${escapeHtml(state.match.briefingTitle)}">
          </div>

          <div class="form-field full">
            <label class="field-label" for="match-objective">OBJETIVO PRINCIPAL</label>
            <textarea id="match-objective">${escapeHtml(state.match.objective)}</textarea>
          </div>

          <div class="form-field full">
            <label class="field-label" for="briefing-text">BRIEFING COMPLETO</label>
            <textarea id="briefing-text" style="min-height:230px;">${escapeHtml(state.match.briefingText)}</textarea>
          </div>
        </div>
      </div>

      <div class="info-card">
        <div class="eyebrow">VISIBILIDADE</div>
        <h3 style="margin-top:6px;">O jogador verá exatamente este conteúdo</h3>
        <p class="field-help">
          O briefing é exibido no modo jogador antes da confirmação. A confirmação serve
          apenas para registrar que o jogador leu as informações.
        </p>
      </div>
    `;
  }

  if (section === "teams") {
    html += `
      <div class="form-section">
        <div class="form-grid">
          <div class="form-field">
            <label class="field-label" for="team-a">EQUIPE 1</label>
            <input id="team-a" type="text" value="${escapeHtml(state.match.teamA)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="team-b">EQUIPE 2</label>
            <input id="team-b" type="text" value="${escapeHtml(state.match.teamB)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="team-a-color">COR EQUIPE 1</label>
            <input id="team-a-color" type="color" value="${escapeHtml(state.match.teamAColor)}">
          </div>

          <div class="form-field">
            <label class="field-label" for="team-b-color">COR EQUIPE 2</label>
            <input id="team-b-color" type="color" value="${escapeHtml(state.match.teamBColor)}">
          </div>
        </div>
      </div>

      <div class="summary-card" style="padding:18px;">
        <div class="eyebrow">IDENTIFICAÇÃO</div>
        <h3 style="margin-top:6px;">Equipes definidas para a partida</h3>

        <div class="match-meta">
          <div class="meta-box">
            <span>EQUIPE 1</span>
            <strong>${escapeHtml(state.match.teamA)}</strong>
          </div>

          <div class="meta-box">
            <span>EQUIPE 2</span>
            <strong>${escapeHtml(state.match.teamB)}</strong>
          </div>

          <div class="meta-box">
            <span>SIMULAÇÃO DEV</span>
            <strong>${state.simulated.playersPerTeam} POR EQUIPE</strong>
          </div>
        </div>
      </div>
    `;
  }

  if (section === "modules") {
    html += `
      <div class="form-section">
        <div class="toggle-list">

          ${moduleToggle("medical", "MÓDULO MÉDICO", state.match.modules.medical)}
          ${moduleToggle("zones", "ZONAS / SETORES", state.match.modules.zones)}
          ${moduleToggle("score", "PLACAR", state.match.modules.score)}
          ${moduleToggle("tracking", "RASTREAMENTO", state.match.modules.tracking)}
          ${moduleToggle("objectives", "OBJETIVOS", state.match.modules.objectives)}
          ${moduleToggle("events", "EVENTOS", state.match.modules.events)}

        </div>
      </div>

      <div class="info-card">
        <div class="eyebrow">CONTROLE</div>
        <h3 style="margin-top:6px;">Módulos opcionais</h3>
        <p class="field-help">
          Esses interruptores apenas definem o que o painel apresenta durante o teste.
          Eles não alteram a lógica de início e encerramento da partida.
        </p>
      </div>
    `;
  }

  if (section === "presence") {
    html += `
      <div class="form-section">
        <div class="participation-card">
          <div>
            <div class="participation-title">
              ORGANIZADOR PARTICIPA DA PARTIDA
            </div>

            <div class="participation-sub">
              ${state.match.organizerParticipates
                ? "O organizador será considerado participante da partida."
                : "O organizador permanecerá somente no comando."}
            </div>
          </div>

          <label class="switch">
            <input id="organizer-participates"
              type="checkbox"
              ${state.match.organizerParticipates ? "checked" : ""}>
            <span class="switch-track"></span>
          </label>
        </div>
      </div>

      <div class="info-card">
        <div class="eyebrow">AUTORIDADE DA PARTIDA</div>
        <h3 style="margin-top:6px;">Somente o organizador inicia e encerra</h3>
        <p class="field-help">
          O jogador poderá confirmar presença, solicitar entrada e abandonar a partida,
          mas não terá o comando de iniciar ou encerrar a operação.
        </p>
      </div>
    `;
  }

  html += `
      <div style="height:30px;"></div>
    </div>
  `;

  root.innerHTML = html;

  bindOrganizerFormInputs();
}

function bindOrganizerFormInputs() {
  const all = [
    ...Object.values(ORGANIZER_FIELDS),
    "organizer-participates"
  ];

  all.forEach((id) => {
    const element = document.getElementById(id);

    if (!element) return;

    element.addEventListener("change", () => {
      saveOrganizerFormToState();

      const participation = document.getElementById("organizer-participates");

      if (participation) {
        state.match.organizerParticipates = participation.checked;
      }

      saveState();
      render();
    });

    element.addEventListener("input", () => {
      saveOrganizerFormToState();

      const participation = document.getElementById("organizer-participates");

      if (participation) {
        state.match.organizerParticipates = participation.checked;
      }

      saveState();
    });
  });

  $$("[data-module]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const moduleName = checkbox.dataset.module;

      if (moduleName in state.match.modules) {
        state.match.modules[moduleName] = checkbox.checked;
        saveState();
      }
    });
  });
}

function saveMatchFromOrganizer() {
  saveOrganizerFormToState();

  const participation = document.getElementById("organizer-participates");

  if (participation) {
    state.match.organizerParticipates = participation.checked;
  }

  state.match.exists = true;
  state.match.saved = true;

  if (state.match.status === "ended") {
    state.match.status = "scheduled";
    state.match.seconds = 0;
  }

  saveState();
  render();

  openSaveModal();
}

function openSaveModal() {
  const modal = $("#modalRoot");
  const text = $("#saveModalText");

  if (!modal) return;

  text.textContent =
    `A partida "${state.match.name}" foi salva. ` +
    `Ela já está disponível no painel do jogador.`;

  modal.classList.remove("hidden");
}

function closeSaveModal() {
  $("#modalRoot")?.classList.add("hidden");
}

function enterGameFromModal() {
  closeSaveModal();

  state.currentRole = "organizer";

  if (state.match.status === "live") {
    state.player.locked = true;
    showScreen("tactical");
    return;
  }

  showScreen("organizer");
}

/* ================================================================
   DEV
================================================================ */

function updateDevPreview() {
  const field = $("#devPlayersPerTeam");

  if (!field) return;

  let amount = Number(field.value);

  if (!Number.isFinite(amount) || amount < 0) {
    amount = 0;
  }

  amount = Math.floor(amount);

  $("#devBluePreview").textContent = amount;
  $("#devRedPreview").textContent = amount;
  $("#devTotalPreview").textContent = amount * 2;
}

function applyDevSimulation() {
  const field = $("#devPlayersPerTeam");

  let amount = Number(field?.value);

  if (!Number.isFinite(amount) || amount < 0) {
    amount = 0;
  }

  amount = Math.floor(amount);

  state.simulated.playersPerTeam = amount;

  state.simulated.players = [];

  for (let i = 1; i <= amount; i++) {
    state.simulated.players.push({
      id: `AZ-${String(i).padStart(3, "0")}`,
      name: `AZUL ${i}`,
      team: state.match.teamA
    });
  }

  for (let i = 1; i <= amount; i++) {
    state.simulated.players.push({
      id: `VM-${String(i).padStart(3, "0")}`,
      name: `VERMELHA ${i}`,
      team: state.match.teamB
    });
  }

  /*
    Ao aplicar a simulação, o estado atual da partida também é atualizado.
    Isso permite que o jogador veja os efeitos da configuração sem resetar.
  */

  saveState();
  render();

  toast(`${amount} jogador(es) simulados por equipe.`);
}

function devSetStatus(status) {
  state.dev.status = status;

  if (status === "scheduled") {
    state.match.status = "scheduled";
  }

  if (status === "live") {
    state.match.status = "live";
  }

  if (status === "ended") {
    state.match.status = "ended";
  }

  saveState();
  render();
}

function devGenerateMatch() {
  state.match.exists = true;
  state.match.saved = true;

  state.match.name = "Operação Red Sand";
  state.match.date = tomorrowDate();
  state.match.time = "09:00";
  state.match.location = "Área de Treinamento";
  state.match.map = "Complexo Industrial";
  state.match.mode = "Simulação";
  state.match.objective =
    "Capturar e manter os setores Alfa e Bravo.";
  state.match.briefingTitle =
    "Briefing da Operação";
  state.match.briefingText =
    "Partida de teste criada pelo modo DEV.\n\n" +
    "Leia o briefing, confirme presença e utilize o painel tático para validar o fluxo.";

  state.match.status = state.dev.status;

  saveState();
  render();

  toast("Partida DEV configurada.");
}

function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function ensureOrganizerPlayerSimulation() {
  /*
    O organizador pode participar como participante único.
    Não depende da quantidade simulada no DEV.
  */

  const already = state.simulated.players.some(
    (player) => player.id === "ORG-001"
  );

  if (!already && state.match.organizerParticipates) {
    state.simulated.players.push({
      id: "ORG-001",
      name: "ORGANIZADOR",
      team: state.match.teamA
    });
  }
}

function resetEverything() {
  const confirmed = window.confirm(
    "Isso apagará a partida, simulações, configurações e estado persistente deste aparelho. Continuar?"
  );

  if (!confirmed) return;

  state = initialState();

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn(error);
  }

  showScreen("role");

  toast("Ambiente resetado.");
}

/* ================================================================
   TÁTICO
================================================================ */

let inactivityTimer = null;

function unlockPanel() {
  state.player.locked = false;

  const guard = $("#touchGuard");

  if (guard) {
    guard.classList.remove("visible");
  }

  $("#tacticalLockButton")?.classList.remove("hidden");

  saveState();
  resetInactivity();
  render();

  toast("Painel desbloqueado.");
}

function lockPanel() {
  state.player.locked = true;

  const guard = $("#touchGuard");

  if (guard) {
    guard.classList.add("visible");
  }

  $("#tacticalLockButton")?.classList.add("hidden");

  saveState();
  render();
}

function resetInactivity() {
  clearTimeout(inactivityTimer);

  if (!state.player.locked && state.match.status === "live") {
    inactivityTimer = setTimeout(() => {
      lockPanel();
    }, 45000);
  }
}

function setupUnlockHold() {
  const button = $("#unlockButton");

  if (!button) return;

  let timer = null;

  const start = (event) => {
    event.preventDefault();

    clearTimeout(timer);

    timer = setTimeout(() => {
      unlockPanel();
    }, 900);
  };

  const cancel = () => {
    clearTimeout(timer);
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", cancel);
  button.addEventListener("pointerleave", cancel);
  button.addEventListener("pointercancel", cancel);
}

function manualLock() {
  lockPanel();
}

function cycleChannel(direction) {
  let channel = Number(state.player.channel);

  channel += direction;

  if (channel < 1) channel = 16;
  if (channel > 16) channel = 1;

  state.player.channel = String(channel).padStart(2, "0");

  saveState();
  render();
}

function toggleRadio() {
  state.player.radio = !state.player.radio;

  saveState();
  render();
}

function pttStart() {
  if (state.player.locked) return;

  if (!state.player.radio) {
    toast("Rádio desligado.");
    return;
  }

  const button = $("#pttButton");

  button?.classList.add("pressed");

  const feedback = $("#radioFeedback");

  if (feedback) {
    feedback.textContent = "TRANSMITINDO...";
  }
}

function pttStop() {
  const button = $("#pttButton");
  button?.classList.remove("pressed");

  const feedback = $("#radioFeedback");

  if (feedback) {
    feedback.textContent = "RÁDIO PRONTO";
  }
}

function showInstructions() {
  /*
    O pedido anterior exigia telas completas para conteúdo.
    Aqui abrimos o conteúdo em uma tela dedicada usando o player prep
    sem transformar a página em modal.
  */

  state.previousScreen = state.currentScreen;

  showScreen("playerPrep");
  renderInstructionsInsteadOfPrep = true;
  render();
}

let renderInstructionsInsteadOfPrep = false;

/* ================================================================
   GPS
================================================================ */

function startGps() {
  if (!navigator.geolocation) {
    state.gps.ready = false;
    saveState();
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      state.gps.lat = position.coords.latitude;
      state.gps.lng = position.coords.longitude;
      state.gps.accuracy = position.coords.accuracy;
      state.gps.ready = true;

      saveState();
      render();
    },
    () => {
      state.gps.ready = false;
      saveState();
      render();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    }
  );
}

/* ================================================================
   RENDER PLAYER
================================================================ */

function renderPlayerLobby() {
  const root = $("#playerLobbyContent");

  if (!root) return;

  if (!hasMatch()) {
    root.innerHTML = `
      <div class="empty-panel">
        <div>
          <div class="eyebrow">SEM PARTIDA DISPONÍVEL</div>
          <h2 style="margin-top:8px;">Nenhuma partida cadastrada</h2>
          <p>
            Quando o organizador salvar uma partida, ela aparecerá aqui automaticamente.
          </p>
        </div>
      </div>
    `;

    return;
  }

  const status = state.match.status;

  const badge =
    status === "live"
      ? `<span class="status-badge live">AO VIVO</span>`
      : status === "ended"
      ? `<span class="status-badge ended">ENCERRADA</span>`
      : `<span class="status-badge scheduled">AGENDADA</span>`;

  let mainAction = "";

  if (status === "scheduled") {
    if (state.player.participation) {
      mainAction = `
        <button id="playerOpenMatch" class="primary-action big-action" type="button">
          VER PREPARAÇÃO
        </button>
      `;
    } else {
      mainAction = `
        <button id="playerConfirmPresence" class="primary-action big-action" type="button">
          CONFIRMAR PRESENÇA
        </button>
      `;
    }
  }

  if (status === "live") {
    if (state.player.entryRequest === "accepted") {
      mainAction = `
        <button id="playerEnterLive" class="primary-action big-action" type="button">
          ENTRAR NA PARTIDA
        </button>
      `;
    } else {
      mainAction = `
        <button id="playerRequestEntry" class="primary-action big-action" type="button">
          SOLICITAR ENTRADA
        </button>
      `;
    }
  }

  if (status === "ended") {
    mainAction = `
      <button class="secondary-action big-action" type="button" disabled>
        PARTIDA ENCERRADA
      </button>
    `;
  }

  root.innerHTML = `
    <div class="player-hero">

      <div class="match-card ${status}-card">
        <div class="eyebrow">OPERAÇÃO DISPONÍVEL</div>

        <h2 style="margin-top:7px;">
          ${escapeHtml(state.match.name)}
        </h2>

        <p style="margin-bottom:0;">
          ${escapeHtml(state.match.objective)}
        </p>

        <div class="match-meta">
          <div class="meta-box">
            <span>STATUS</span>
            <strong>${status === "live" ? "AO VIVO" : status === "ended" ? "ENCERRADA" : "AGENDADA"}</strong>
          </div>

          <div class="meta-box">
            <span>DATA</span>
            <strong>${formatDateBr(state.match.date)}</strong>
          </div>

          <div class="meta-box">
            <span>HORÁRIO</span>
            <strong>${escapeHtml(state.match.time || "—")}</strong>
          </div>

          <div class="meta-box">
            <span>LOCAL</span>
            <strong>${escapeHtml(state.match.location)}</strong>
          </div>

          <div class="meta-box">
            <span>MAPA</span>
            <strong>${escapeHtml(state.match.map)}</strong>
          </div>

          <div class="meta-box">
            <span>MODO</span>
            <strong>${escapeHtml(state.match.mode)}</strong>
          </div>
        </div>
      </div>

      <div class="player-side-grid">
        <div class="info-card">
          <div class="eyebrow">SEU STATUS</div>

          <div class="info-row">
            <span>JOGADOR</span>
            <strong>${escapeHtml(state.player.name)}</strong>
          </div>

          <div class="info-row">
            <span>EQUIPE</span>
            <strong>${escapeHtml(state.player.team)}</strong>
          </div>

          <div class="info-row">
            <span>PRESENÇA</span>
            <strong>${state.player.participation ? "CONFIRMADA" : "NÃO CONFIRMADA"}</strong>
          </div>

          <div class="info-row">
            <span>BRIEFING</span>
            <strong>${state.player.briefingAck ? "LIDO" : "PENDENTE"}</strong>
          </div>
        </div>

        <div class="player-actions-grid">
          ${mainAction}

          <button id="playerOpenDetails" class="secondary-action big-action" type="button">
            DETALHES
          </button>
        </div>
      </div>

    </div>

    <div class="summary-card" style="padding:18px;">
      <div class="eyebrow">BRIEFING</div>
      <h3 style="margin-top:7px;">${escapeHtml(state.match.briefingTitle)}</h3>
      <p style="white-space:pre-line;margin-bottom:0;">
        ${escapeHtml(state.match.briefingText)}
      </p>
    </div>
  `;

  $("#playerConfirmPresence")?.addEventListener("click", () => {
    confirmPresence();
  });

  $("#playerOpenMatch")?.addEventListener("click", () => {
    state.currentScreen = "playerPrep";
    renderInstructionsInsteadOfPrep = false;
    showScreen("playerPrep");
  });

  $("#playerRequestEntry")?.addEventListener("click", () => {
    requestEntry();
  });

  $("#playerEnterLive")?.addEventListener("click", () => {
    requestEntry();
  });

  $("#playerOpenDetails")?.addEventListener("click", () => {
    showScreen("playerDetails");
  });
}

/* ================================================================
   PREP / BRIEFING
================================================================ */

function renderPlayerPrep() {
  const root = $("#playerPrepContent");

  if (!root) return;

  if (renderInstructionsInsteadOfPrep) {
    root.innerHTML = `
      <div class="prep-card panel-card" style="max-width:900px;margin:0 auto;">
        <div class="eyebrow">INSTRUÇÕES</div>
        <h2 style="margin-top:7px;">ORIENTAÇÕES DO PAINEL</h2>

        <div class="briefing-box" style="margin-top:18px;">
          <strong>1. PAINEL BLOQUEADO</strong><br>
          O painel tático começa protegido contra toques acidentais.
          Segure o botão central para liberar os comandos.
          <br><br>

          <strong>2. RÁDIO</strong><br>
          O botão PTT permite testar a transmissão no ambiente simulado.
          O canal e o volume ficam disponíveis no próprio painel.
          <br><br>

          <strong>3. OBJETIVOS</strong><br>
          Os setores mostrados no mapa são elementos de visualização da partida.
          <br><br>

          <strong>4. SAÍDA</strong><br>
          No modo jogador, o comando disponível é ABANDONAR PARTIDA.
          Início e encerramento pertencem ao organizador.
        </div>
      </div>
    `;

    return;
  }

  root.innerHTML = `
    <div class="prep-grid">

      <div class="prep-card panel-card">
        <div class="eyebrow">BRIEFING</div>
        <h2 style="margin-top:7px;">
          ${escapeHtml(state.match.briefingTitle)}
        </h2>

        <div class="briefing-box" style="margin-top:16px;">
          ${escapeHtml(state.match.briefingText)}
        </div>

        <label class="check-row">
          <input id="briefingAckInput" type="checkbox"
            ${state.player.briefingAck ? "checked" : ""}>
          <span>Confirmo que li o briefing da partida.</span>
        </label>
      </div>

      <div class="prep-card panel-card">
        <div class="eyebrow">PARTIDA</div>
        <h3 style="margin-top:7px;">
          ${escapeHtml(state.match.name)}
        </h3>

        <div class="info-row">
          <span>OBJETIVO</span>
          <strong>${escapeHtml(state.match.objective)}</strong>
        </div>

        <div class="info-row">
          <span>LOCAL</span>
          <strong>${escapeHtml(state.match.location)}</strong>
        </div>

        <div class="info-row">
          <span>DATA / HORA</span>
          <strong>${formatDateBr(state.match.date)} — ${escapeHtml(state.match.time)}</strong>
        </div>

        <button id="prepConfirmButton"
          class="primary-action big-action"
          style="width:100%;margin-top:16px;"
          type="button">
          ${state.player.participation ? "PRESENÇA CONFIRMADA" : "CONFIRMAR PRESENÇA"}
        </button>
      </div>

    </div>
  `;

  $("#briefingAckInput")?.addEventListener("change", () => {
    state.player.briefingAck = $("#briefingAckInput").checked;

    saveState();
    render();
  });

  $("#prepConfirmButton")?.addEventListener("click", () => {
    confirmPresence();
  });
}

/* ================================================================
   DETALHES
================================================================ */

function renderPlayerDetails() {
  const root = $("#playerDetailsContent");

  if (!root) return;

  if (state.detailTab === "inicio") {
    root.innerHTML = `
      <div class="info-card" style="max-width:900px;">
        <div class="eyebrow">VISÃO GERAL</div>
        <h2 style="margin-top:7px;">${escapeHtml(state.player.name)}</h2>

        <div class="match-meta">
          <div class="meta-box">
            <span>ID</span>
            <strong>${escapeHtml(state.player.id)}</strong>
          </div>

          <div class="meta-box">
            <span>EQUIPE</span>
            <strong>${escapeHtml(state.player.team)}</strong>
          </div>

          <div class="meta-box">
            <span>CLASSE</span>
            <strong>${escapeHtml(state.player.roleClass)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  if (state.detailTab === "briefing") {
    root.innerHTML = `
      <div class="info-card" style="max-width:900px;">
        <div class="eyebrow">BRIEFING</div>
        <h2 style="margin-top:7px;">
          ${escapeHtml(state.match.briefingTitle)}
        </h2>

        <div class="briefing-box" style="margin-top:17px;">
          ${escapeHtml(state.match.briefingText)}
        </div>

        <div style="margin-top:15px;">
          <strong>
            ${state.player.briefingAck
              ? "BRIEFING LIDO"
              : "BRIEFING AINDA NÃO CONFIRMADO"}
          </strong>
        </div>
      </div>
    `;
  }

  if (state.detailTab === "perfil") {
    root.innerHTML = `
      <div class="info-card" style="max-width:680px;">
        <div class="eyebrow">PERFIL</div>

        <div class="profile-list" style="margin-top:14px;">
          <div class="info-row">
            <span>NOME</span>
            <strong>${escapeHtml(state.player.name)}</strong>
          </div>

          <div class="info-row">
            <span>ID</span>
            <strong>${escapeHtml(state.player.id)}</strong>
          </div>

          <div class="info-row">
            <span>EQUIPE</span>
            <strong>${escapeHtml(state.player.team)}</strong>
          </div>

          <div class="info-row">
            <span>CLASSE</span>
            <strong>${escapeHtml(state.player.roleClass)}</strong>
          </div>
        </div>
      </div>
    `;
  }
}

/* ================================================================
   TÁTICO
================================================================ */

function renderTactical() {
  $("#tacticalMatchName").textContent =
    state.match.exists ? state.match.name : "SEM PARTIDA";

  $("#mapName").textContent =
    state.match.map || "Complexo Industrial";

  $("#objectiveText").textContent =
    state.match.objective || "Aguardando briefing.";

  $("#tacticalStatus").textContent =
    state.match.status === "live"
      ? "AO VIVO"
      : state.match.status === "ended"
      ? "ENCERRADA"
      : "AGUARDANDO";

  $("#tacticalTimer").textContent =
    formatTimer(state.match.seconds || 0);

  const totalSimulated =
    state.simulated.players?.length || 0;

  const organizerCount =
    state.match.organizerParticipates ? 1 : 0;

  $("#tacticalPlayers").textContent =
    totalSimulated + organizerCount;

  $("#radioChannel").textContent = state.player.channel;

  const radioToggle = $("#radioToggle");

  if (radioToggle) {
    radioToggle.textContent = state.player.radio ? "ON" : "OFF";
    radioToggle.style.opacity = state.player.radio ? "1" : ".55";
  }

  const radioVolume = $("#radioVolume");

  if (radioVolume) {
    radioVolume.value = state.player.radioVolume;
  }

  const gpsStatus = $("#gpsStatus");

  if (gpsStatus) {
    gpsStatus.textContent =
      state.gps.ready
        ? "GPS ONLINE"
        : "GPS OFFLINE";
  }

  const organizerTop = $("#organizerEndMatchTop");
  const playerTop = $("#playerLeaveMatchTop");

  organizerTop?.classList.toggle(
    "hidden",
    state.currentRole !== "organizer" ||
    state.match.status !== "live"
  );

  playerTop?.classList.toggle(
    "hidden",
    state.currentRole !== "player" ||
    state.match.status !== "live"
  );

  $("#tacticalLockButton")?.classList.toggle(
    "hidden",
    state.player.locked
  );

  const guard = $("#touchGuard");

  if (guard) {
    const locked =
      state.match.status === "live" &&
      state.player.locked;

    guard.classList.toggle("visible", locked);
  }

  resetInactivity();
}

/* ================================================================
   ORGANIZADOR HEADER / DEV
================================================================ */

function renderOrganizerSummary() {
  const status = state.match.exists
    ? state.match.status.toUpperCase()
    : "SEM PARTIDA";

  $("#organizerHeaderState").textContent =
    state.match.exists
      ? `${status} · ${state.match.name}`
      : "Configure e salve uma partida.";

  $("#organizerSidebarStatus").textContent = status;

  const total =
    state.simulated.players.length +
    (state.match.organizerParticipates ? 1 : 0);

  $("#organizerPlayerCount").textContent =
    `${total} jogador${total === 1 ? "" : "es"}`;

  const startButton = $("#organizerStartTop");

  if (startButton) {
    startButton.disabled =
      !state.match.exists ||
      state.match.status === "live";

    startButton.textContent =
      state.match.status === "live"
        ? "PARTIDA EM ANDAMENTO"
        : "INICIAR PARTIDA";
  }
}

function renderDev() {
  const playerField = $("#devPlayersPerTeam");

  if (playerField) {
    playerField.value = state.simulated.playersPerTeam;
  }

  $$(".segment-button").forEach((button) => {
    button.classList.remove("active");
  });

  $(`[data-dev-role="${state.dev.role}"]`)?.classList.add("active");

  $(`[data-dev-status="${state.dev.status}"]`)?.classList.add("active");

  updateDevPreview();
}

/* ================================================================
   GLOBAL RENDER
================================================================ */

function updateTopbar() {
  const badge = $("#matchStatusBadge");

  if (!badge) return;

  badge.className = "status-badge neutral";

  if (!state.match.exists) {
    badge.textContent = "SEM PARTIDA";
    return;
  }

  if (state.match.status === "scheduled") {
    badge.classList.add("scheduled");
    badge.textContent = "AGENDADA";
    return;
  }

  if (state.match.status === "live") {
    badge.classList.add("live");
    badge.textContent = "AO VIVO";
    return;
  }

  badge.classList.add("ended");
  badge.textContent = "ENCERRADA";
}

function render() {
  updateTopbar();

  renderPlayerLobby();
  renderPlayerPrep();
  renderPlayerDetails();
  renderOrganizerForm();
  renderOrganizerSummary();
  renderDev();
  renderTactical();

  $$(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const current = $(`#screen${capitalize(state.currentScreen)}`);

  if (current) {
    current.classList.add("active");
  }

  $$(".detail-tab").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.detailTab === state.detailTab
    );
  });

  $$(".side-nav").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.orgSection === state.organizerSection
    );
  });
}

/* ================================================================
   HTML ESCAPE
================================================================ */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectOption(value, selected) {
  return `
    <option value="${escapeHtml(value)}"
      ${value === selected ? "selected" : ""}>
      ${escapeHtml(value)}
    </option>
  `;
}

function moduleToggle(key, label, checked) {
  return `
    <div class="toggle-item">
      <label>
        <input
          type="checkbox"
          data-module="${key}"
          ${checked ? "checked" : ""}
        >
        <span>${escapeHtml(label)}</span>
      </label>
    </div>
  `;
}

/* ================================================================
   EVENTOS
================================================================ */

function bindStaticEvents() {
  /* Escolha inicial */
  $$("[data-role-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      chooseRole(button.dataset.roleChoice);
    });
  });

  /* DEV */
  $("#devButton")?.addEventListener("click", () => {
    state.previousScreen = state.currentScreen;
    showScreen("dev");
  });

  /* Jogador */
  $("#playerDetailsButton")?.addEventListener("click", () => {
    showScreen("playerDetails");
  });

  /* Organizador */
  $("#organizerStartTop")?.addEventListener("click", () => {
    startMatch("organizer");
  });

  $("#saveMatchButton")?.addEventListener("click", () => {
    saveMatchFromOrganizer();
  });

  $("#organizerEndMatchTop")?.addEventListener("click", () => {
    endMatch("organizer");
  });

  $("#playerLeaveMatchTop")?.addEventListener("click", () => {
    abandonMatch();
  });

  /* DEV */
  $("#devPlayersPerTeam")?.addEventListener("input", updateDevPreview);

  $("#applyDevSimulation")?.addEventListener("click", () => {
    applyDevSimulation();
  });

  $("#devCreateMatch")?.addEventListener("click", () => {
    devGenerateMatch();
  });

  $("#devStartMatch")?.addEventListener("click", () => {
    startMatch("dev");
  });

  $("#devEndMatch")?.addEventListener("click", () => {
    endMatch("dev");
  });

  $("#devReset")?.addEventListener("click", resetEverything);

  $$("[data-dev-role]").forEach((button) => {
    button.addEventListener("click", () => {
      setDevRole(button.dataset.devRole);
    });
  });

  $$("[data-dev-status]").forEach((button) => {
    button.addEventListener("click", () => {
      devSetStatus(button.dataset.devStatus);
    });
  });

  /* Tabs do jogador */
  $$("[data-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailTab = button.dataset.detailTab;
      saveState();
      render();
    });
  });

  /* Seções do organizador */
  $$("[data-org-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.organizerSection = button.dataset.orgSection;
      saveState();
      render();
    });
  });

  /* Voltar */
  $$("[data-back]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.back;
      goBack(target);
    });
  });

  /* Modal */
  $("#modalCloseButton")?.addEventListener("click", closeSaveModal);

  $("#modalEnterButton")?.addEventListener("click", enterGameFromModal);

  /* Tático */
  $("#unlockButton")?.addEventListener("pointerdown", (event) => {
    /*
      setupUnlockHold também registra o gesto.
      Este listener apenas impede alguns comportamentos indesejados.
    */
    event.preventDefault();
  });

  $("#tacticalLockButton")?.addEventListener("click", manualLock);

  $("#radioToggle")?.addEventListener("click", toggleRadio);

  $("#channelDown")?.addEventListener("click", () => {
    cycleChannel(-1);
  });

  $("#channelUp")?.addEventListener("click", () => {
    cycleChannel(1);
  });

  $("#radioVolume")?.addEventListener("input", (event) => {
    state.player.radioVolume = Number(event.target.value);
    saveState();
  });

  const ptt = $("#pttButton");

  if (ptt) {
    ptt.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      if (!state.player.locked) {
        pttStart();
      }
    });

    ptt.addEventListener("pointerup", pttStop);
    ptt.addEventListener("pointercancel", pttStop);
    ptt.addEventListener("pointerleave", pttStop);
  }

  $("#instructionsButton")?.addEventListener("click", () => {
    showInstructions();
  });

  $("#objectiveButton")?.addEventListener("click", () => {
    state.previousScreen = state.currentScreen;
    renderInstructionsInsteadOfPrep = true;

    showScreen("playerPrep");
  });

  /*
    Botão de desbloqueio é refeito depois do DOM inicial.
  */
  setupUnlockHold();
}

/* ================================================================
   CRONÔMETRO DA PARTIDA
================================================================ */

setInterval(() => {
  if (state.match.status !== "live") {
    return;
  }

  state.match.seconds += 1;

  /*
    Salvamos frequentemente para manter o estado persistente.
  */
  saveState();

  renderTactical();
}, 1000);

/* ================================================================
   INICIALIZAÇÃO
================================================================ */

bindStaticEvents();
startGps();
render();

/*
  Quando o app já foi usado anteriormente, ele não volta para a tela
  de escolha de persona automaticamente.
*/
if (!state.firstRun && state.currentScreen === "role") {
  state.currentScreen =
    state.currentRole === "organizer"
      ? "organizer"
      : "playerLobby";

  saveState();
  render();
}
