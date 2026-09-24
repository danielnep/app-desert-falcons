const STORAGE_KEY = 'df_airsoft_state_v7';
const ROLE_KEY = 'df_airsoft_role_v7';

const MODE_DEFS = {
  flag: {
    label: 'Captura de Bandeira',
    icon: '⚑',
    help: 'Bandeiras e bases.'
  },
  bomb: {
    label: 'Bomba',
    icon: '◉',
    help: 'Portador, armamento, localização, desarme e explosão.'
  },
  zone: {
    label: 'Controle de Zonas',
    icon: '◎',
    help: 'Zonas numeradas e captura por permanência.'
  },
  respawn: {
    label: 'Eliminação + Respawn',
    icon: '↻',
    help: 'Vidas, HIT e retorno às bases.'
  }
};

const TOOLS = {
  zone: {
    label: 'Zona',
    icon: '◎',
    help: 'Zona numerada de captura.'
  },
  base: {
    label: 'Base',
    icon: '■',
    help: 'Base quadrada de objetivo ou respawn.'
  },
  flag: {
    label: 'Bandeira',
    icon: '⚑',
    help: 'Objetivo de captura de bandeira.'
  },
  bomb: {
    label: 'Área da bomba',
    icon: '◉',
    help: 'Local permitido para armar a bomba.'
  }
};

const DEFAULT_STATE = {
  role: null,

  gps: {
    lat: null,
    lng: null,
    accuracy: null,
    updatedAt: null
  },

  match: {
    name: '',
    location: '',
    durationMin: 60,

    playerCount: 5,

    status: 'none',
    startAt: null,
    endAt: null,

    modes: ['flag'],
    mergeModes: false,

    livesPerPlayer: 3,

    respawnDelay: 60,
    respawnPolicy: 'nearest',

    teamVisibility: 'always',

    enemyVisibility: 'off',
    enemyVisibilitySeconds: 60,

    zoneCaptureSeconds: 30,
    zonePoints: 100,

    bomb: {
      bombsPerPlayer: 3,
      durationMin: 10,
      disarmSeconds: 20,
      blastRadius: 20,

      armPolicy: 'areas',
      timingPolicy: 'predefined',

      carrierId: 'A-3',

      planted: false,

      armedAt: null,
      expiresAt: null,

      armedByTeam: 'A',

      x: 0.62,
      y: 0.48,

      lat: null,
      lng: null
    },

    map: {
      dataUrl: '',
      naturalWidth: 0,
      naturalHeight: 0,
      marks: []
    },

    scores: {
      A: 0,
      B: 0
    },

    hits: {
      A: 0,
      B: 0
    },

    zones: {},

    players: [],

    logs: []
  }
};

let state = loadState();
let draft = deepClone(state.match);
let appliedSnapshot = deepClone(draft);

let activeScreen = 'role';
let currentGpsWatch = null;

let pendingAction = null;
let toastTimer = null;
let confirmCallback = null;

let cropImage = null;

let cropRect = {
  x: 5,
  y: 5,
  w: 90,
  h: 90
};

let cropBoxDrag = null;

let audioContext = null;
let lastBeep = 0;

const imageCache = new Map();

const editor = {
  zoom: 1,
  panX: 0,
  panY: 0,
  mode: 'pan',
  selectedId: null,
  drag: null
};

const playerViewer = {
  zoom: 1,
  panX: 0,
  panY: 0
};

const $ = id => document.getElementById(id);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

/* =========================
   EVENTOS SEGUROS
========================= */

function on(id, eventName, handler, options) {
  const element = $(id);

  if (!element) {
    console.warn(
      `[DF] Elemento #${id} não encontrado para ${eventName}.`
    );
    return false;
  }

  element.addEventListener(
    eventName,
    handler,
    options
  );

  return true;
}

function onSelector(selector, eventName, handler) {
  $$(selector).forEach(element => {
    element.addEventListener(
      eventName,
      handler
    );
  });
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent =
      value;
  }
}

function toggleHidden(id, hidden) {
  const element = $(id);

  if (element) {
    element.classList.toggle(
      'hidden',
      hidden
    );
  }
}

/* =========================
   GENERAL
========================= */

function deepClone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[char]
  );
}

function mergeDefaults(target, source) {
  if (
    !source ||
    typeof source !== 'object'
  ) {
    return target;
  }

  for (
    const [key, value] of Object.entries(source)
  ) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      if (
        !target[key] ||
        typeof target[key] !== 'object' ||
        Array.isArray(target[key])
      ) {
        target[key] = {};
      }

      mergeDefaults(
        target[key],
        value
      );
    } else {
      target[key] = value;
    }
  }

  return target;
}

function loadState() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    const saved =
      raw
        ? JSON.parse(raw)
        : {};

    const merged =
      mergeDefaults(
        deepClone(DEFAULT_STATE),
        saved
      );

    if (
      !Array.isArray(
        merged.match.modes
      ) ||
      !merged.match.modes.length
    ) {
      merged.match.modes = ['flag'];
    }

    merged.match.players =
      createPlayers(
        merged.match.playerCount,
        merged.match.players
      );

    return merged;
  } catch (error) {
    console.error(
      '[DF] Falha ao carregar estado:',
      error
    );

    return deepClone(
      DEFAULT_STATE
    );
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    console.warn(
      '[DF] Não foi possível salvar:',
      error
    );
  }
}

function role() {
  return (
    localStorage.getItem(
      ROLE_KEY
    ) ||
    state.role ||
    null
  );
}

function setRole(value) {
  state.role = value;

  localStorage.setItem(
    ROLE_KEY,
    value
  );

  saveState();
}

function formatTime(seconds) {
  seconds = Math.max(
    0,
    Math.floor(
      Number(seconds) || 0
    )
  );

  const h =
    Math.floor(
      seconds / 3600
    );

  const m =
    Math.floor(
      (seconds % 3600) / 60
    );

  const s =
    seconds % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clamp(
  value,
  min,
  max,
  fallback
) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, n)
  );
}

function toast(
  message,
  duration = 2200
) {
  const el =
    $('toast');

  if (!el) {
    return;
  }

  el.textContent =
    message;

  el.classList.add(
    'show'
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(() => {
      el.classList.remove(
        'show'
      );
    }, duration);
}

function openOverlay(id) {
  const el = $(id);

  if (!el) {
    return;
  }

  el.classList.remove(
    'hidden'
  );

  el.setAttribute(
    'aria-hidden',
    'false'
  );
}

function closeOverlay(id) {
  const el = $(id);

  if (!el) {
    return;
  }

  el.classList.add(
    'hidden'
  );

  el.setAttribute(
    'aria-hidden',
    'true'
  );
}

/* =========================
   SCREENS
========================= */

function showScreen(name) {
  $$('.screen').forEach(
    screen => {
      screen.classList.toggle(
        'active',
        screen.dataset.screen ===
          name
      );
    }
  );

  activeScreen =
    name;

  updateHeader();

  if (name === 'player') {
    renderPlayer();
  }

  if (name === 'organizer') {
    renderOperatorMenu();
  }

  if (name === 'control') {
    renderControl();
  }
}

function updateHeader() {
  const pill =
    $('statusPill');

  if (!pill) {
    return;
  }

  pill.className =
    'pill';

  const status =
    state.match.status;

  if (status === 'live') {
    pill.textContent =
      'EM JOGO';

    pill.classList.add(
      'live'
    );
  } else if (status === 'open') {
    pill.textContent =
      'ABERTA';

    pill.classList.add(
      'wait'
    );
  } else if (status === 'ended') {
    pill.textContent =
      'ENCERRADA';
  } else {
    pill.textContent =
      'SEM PARTIDA';
  }
}

/* =========================
   CONFIRMAÇÕES
========================= */

function openConfirm(
  title,
  text,
  okText,
  callback,
  danger = true
) {
  setText(
    'confirmKicker',
    'CONFIRMAÇÃO'
  );

  setText(
    'confirmTitle',
    title
  );

  setText(
    'confirmText',
    text
  );

  setText(
    'confirmOk',
    okText
  );

  const ok =
    $('confirmOk');

  if (ok) {
    ok.className =
      `btn ${
        danger
          ? 'danger'
          : 'primary'
      }`;
  }

  confirmCallback =
    callback;

  openOverlay(
    'confirmModal'
  );
}

function closeConfirm() {
  confirmCallback =
    null;

  closeOverlay(
    'confirmModal'
  );
}

function draftDirty() {
  return (
    JSON.stringify(draft) !==
    JSON.stringify(appliedSnapshot)
  );
}

function applyDraft() {
  state.match =
    deepClone(draft);

  state.match.players =
    createPlayers(
      state.match.playerCount,
      state.match.players
    );

  appliedSnapshot =
    deepClone(draft);

  saveState();

  updateHeader();
  renderOperatorMenu();

  toast(
    'ALTERAÇÕES APLICADAS.'
  );
}

function restoreDraft() {
  draft =
    deepClone(
      state.match
    );

  appliedSnapshot =
    deepClone(
      draft
    );
}

function withPending(action) {
  if (!draftDirty()) {
    action();
    return;
  }

  pendingAction =
    action;

  openOverlay(
    'pendingModal'
  );
}

/* =========================
   PLAYERS
========================= */

function createPlayers(
  count,
  previous = []
) {
  count = clamp(
    count,
    1,
    20,
    5
  );

  const old =
    Array.isArray(previous)
      ? previous
      : [];

  const list = [];

  for (
    const team of ['A', 'B']
  ) {
    for (
      let i = 1;
      i <= count;
      i++
    ) {
      const id =
        `${team}-${i}`;

      const previousPlayer =
        old.find(
          p =>
            p.id === id
        );

      const angle =
        (i / count) *
        Math.PI *
        2;

      const centerX =
        team === 'A'
          ? 0.28
          : 0.72;

      const centerY =
        team === 'A'
          ? 0.68
          : 0.32;

      const x =
        centerX +
        Math.cos(angle) * 0.08;

      const y =
        centerY +
        Math.sin(angle) * 0.08;

      list.push({
        id,

        name:
          previousPlayer?.name ||
          `Jogador ${i}`,

        team,

        lives:
          previousPlayer?.lives ??
          state.match.livesPerPlayer,

        hits:
          previousPlayer?.hits ??
          0,

        status:
          previousPlayer?.status ??
          'ATIVO',

        x:
          previousPlayer?.x ??
          x,

        y:
          previousPlayer?.y ??
          y,

        lat:
          previousPlayer?.lat ??
          null,

        lng:
          previousPlayer?.lng ??
          null,

        isMe:
          team === 'A' &&
          i === 1,

        mock:
          !(
            team === 'A' &&
            i === 1
          ),

        confirmed:
          previousPlayer?.confirmed ??
          false,

        carryingBomb:
          previousPlayer?.carryingBomb ??
          false,

        bombsRemaining:
          previousPlayer?.bombsRemaining ??
          state.match.bomb.bombsPerPlayer,

        respawnPendingUntil:
          previousPlayer?.respawnPendingUntil ??
          null,

        respawnTargetId:
          previousPlayer?.respawnTargetId ??
          null
      });
    }
  }

  return list;
}

function currentPlayer() {
  return (
    state.match.players.find(
      player =>
        player.isMe
    ) ||
    state.match.players[0]
  );
}

/* =========================
   MODES
========================= */

function draftFeatures() {
  const modes =
    new Set(
      draft.modes || []
    );

  return {
    zone: modes.has('zone'),

    base:
      modes.has('flag') ||
      modes.has('bomb') ||
      modes.has('respawn'),

    flag:
      modes.has('flag'),

    bomb:
      modes.has('bomb')
  };
}

function stateFeatures() {
  const modes =
    new Set(
      state.match.modes || []
    );

  return {
    zone: modes.has('zone'),

    base:
      modes.has('flag') ||
      modes.has('bomb') ||
      modes.has('respawn'),

    flag:
      modes.has('flag'),

    bomb:
      modes.has('bomb')
  };
}

function objectiveLabel(
  match = state.match
) {
  return (
    (match.modes || [])
      .map(
        mode =>
          MODE_DEFS[mode]?.label ||
          mode
      )
      .join(' + ') ||
    'Sem objetivo'
  );
}

/* =========================
   REGRAS
========================= */

function syncDraftFields() {
  const fields = {
    oName: draft.name || '',
    oLoc: draft.location || '',
    oDur: draft.durationMin ?? 60,
    playerCount: draft.playerCount ?? 5,
    livesPerPlayer: draft.livesPerPlayer ?? 3,
    respawnDelay: draft.respawnDelay ?? 60,
    respawnPolicy: draft.respawnPolicy || 'nearest',
    teamVisibility: draft.teamVisibility || 'always',
    enemyVisibility: draft.enemyVisibility || 'off',
    enemyVisibilitySeconds:
      draft.enemyVisibilitySeconds ?? 60,
    zoneCaptureSeconds:
      draft.zoneCaptureSeconds ?? 30,
    zonePoints:
      draft.zonePoints ?? 100,
    bombsPerPlayer:
      draft.bomb?.bombsPerPlayer ?? 3,
    bombDurationMin:
      draft.bomb?.durationMin ?? 10,
    bombDisarmSeconds:
      draft.bomb?.disarmSeconds ?? 20,
    bombBlastRadius:
      draft.bomb?.blastRadius ?? 20,
    bombArmPolicy:
      draft.bomb?.armPolicy || 'areas',
    bombTimingPolicy:
      draft.bomb?.timingPolicy || 'predefined'
  };

  Object.entries(fields).forEach(
    ([id, value]) => {
      const element =
        $(id);

      if (element) {
        element.value =
          value;
      }
    }
  );

  renderCarrierSelect();
  renderRuleAvailability();
}

function renderCarrierSelect() {
  const select =
    $('bombCarrier');

  if (!select) {
    return;
  }

  const players =
    createPlayers(
      draft.playerCount,
      draft.players
    );

  const teamA =
    players.filter(
      player =>
        player.team === 'A'
    );

  select.innerHTML =
    teamA
      .map(
        player =>
          `<option value="${esc(player.id)}">${esc(player.name)}</option>`
      )
      .join('');

  const exists =
    teamA.some(
      player =>
        player.id ===
        draft.bomb.carrierId
    );

  select.value =
    exists
      ? draft.bomb.carrierId
      : (
          teamA[2]?.id ||
          teamA[0]?.id ||
          ''
        );

  draft.bomb.carrierId =
    select.value;
}

function readRulesForm() {
  const value = id =>
    $(id)?.value;

  draft.name =
    value('oName')?.trim() ||
    'Operação Desert Falcons';

  draft.location =
    value('oLoc')?.trim() ||
    'Campo';

  draft.durationMin =
    clamp(
      value('oDur'),
      10,
      480,
      60
    );

  draft.playerCount =
    clamp(
      value('playerCount'),
      1,
      20,
      5
    );

  draft.livesPerPlayer =
    clamp(
      value('livesPerPlayer'),
      1,
      20,
      3
    );

  draft.respawnDelay =
    clamp(
      value('respawnDelay'),
      0,
      900,
      60
    );

  draft.respawnPolicy =
    value('respawnPolicy') ||
    'nearest';

  draft.teamVisibility =
    value('teamVisibility') ||
    'always';

  draft.enemyVisibility =
    value('enemyVisibility') ||
    'off';

  draft.enemyVisibilitySeconds =
    clamp(
      value('enemyVisibilitySeconds'),
      5,
      900,
      60
    );

  draft.zoneCaptureSeconds =
    clamp(
      value('zoneCaptureSeconds'),
      1,
      1800,
      30
    );

  draft.zonePoints =
    clamp(
      value('zonePoints'),
      0,
      10000,
      100
    );

  draft.bomb.bombsPerPlayer =
    clamp(
      value('bombsPerPlayer'),
      0,
      20,
      3
    );

  draft.bomb.durationMin =
    clamp(
      value('bombDurationMin'),
      1,
      120,
      10
    );

  draft.bomb.disarmSeconds =
    clamp(
      value('bombDisarmSeconds'),
      1,
      600,
      20
    );

  draft.bomb.blastRadius =
    clamp(
      value('bombBlastRadius'),
      1,
      500,
      20
    );

  draft.bomb.armPolicy =
    value('bombArmPolicy') ||
    'areas';

  draft.bomb.timingPolicy =
    value('bombTimingPolicy') ||
    'predefined';

  draft.bomb.carrierId =
    value('bombCarrier') ||
    draft.bomb.carrierId;

  draft.players =
    createPlayers(
      draft.playerCount,
      draft.players
    );
}

function renderRuleAvailability() {
  const features =
    draftFeatures();

  $$('[data-rule-feature]')
    .forEach(
      section => {
        const type =
          section.dataset.ruleFeature;

        section.classList.toggle(
          'hidden',
          !features[type]
        );
      }
    );
}

/* =========================
   MODE MODAL
========================= */

function renderModeModal() {
  const merge =
    $('mergeModes');

  if (merge) {
    merge.checked =
      Boolean(
        draft.mergeModes
      );
  }

  $$('.choice-card').forEach(
    button => {
      button.classList.toggle(
        'active',
        draft.modes.includes(
          button.dataset.mode
        )
      );
    }
  );

  const features =
    draftFeatures();

  const matrix =
    $('featureMatrix');

  if (!matrix) {
    return;
  }

  matrix.innerHTML =
    '';

  const items = [
    [
      'zone',
      '◎',
      'Zonas',
      'Zonas numeradas e captura.'
    ],
    [
      'base',
      '■',
      'Bases',
      'Bases para objetivo e respawn.'
    ],
    [
      'flag',
      '⚑',
      'Bandeiras',
      'Bandeiras de captura.'
    ],
    [
      'bomb',
      '◉',
      'Bomba',
      'Portador, localização, desarme e explosão.'
    ]
  ];

  items.forEach(
    ([key, icon, title, help]) => {
      const row =
        document.createElement(
          'div'
        );

      row.className =
        `feature-row ${
          features[key]
            ? ''
            : 'off'
        }`;

      row.innerHTML =
        `
          <span>${icon}</span>
          <div>
            <strong>
              ${title} · ${
                features[key]
                  ? 'ATIVO'
                  : 'INATIVO'
              }
            </strong>
            <small>${help}</small>
          </div>
        `;

      matrix.appendChild(
        row
      );
    }
  );
}

/* =========================
   OPERATOR MENU
========================= */

function renderOperatorMenu() {
  const badge =
    $('operatorStateBadge');

  const live =
    state.match.status === 'live';

  if (badge) {
    badge.textContent =
      live
        ? 'EM JOGO'
        : 'CONFIGURANDO';

    badge.classList.toggle(
      'live',
      live
    );
  }

  toggleHidden(
    'openControlFromMenu',
    !live
  );

  toggleHidden(
    'btnEnd',
    !['open', 'live'].includes(
      state.match.status
    )
  );

  const rows = [
    [
      'Modos',
      objectiveLabel(draft)
    ],

    [
      'Partida',
      `${draft.name || '—'} · ${
        draft.durationMin || 60
      } min`
    ],

    [
      'Vidas',
      `${draft.livesPerPlayer || 3} por jogador`
    ],

    [
      'Respawn',
      formatTime(
        draft.respawnDelay || 0
      )
    ],

    [
      'Bomba',
      draft.modes.includes('bomb')
        ? `${draft.bomb.durationMin} min · ${draft.bomb.bombsPerPlayer}/jogador`
        : 'Não usada'
    ],

    [
      'Mapa',
      draft.map.dataUrl
        ? `${draft.map.marks.length} elementos`
        : 'Não configurado'
    ]
  ];

  const summary =
    $('operatorSummary');

  if (!summary) {
    return;
  }

  summary.innerHTML =
    rows
      .map(
        ([key, value]) =>
          `
            <div class="summary-item">
              <span>${esc(key)}</span>
              <strong>${esc(value)}</strong>
            </div>
          `
      )
      .join('');
}

/* =========================
   MODAIS
========================= */

function openConfig(id) {
  if (id === 'rulesModal') {
    syncDraftFields();
  }

  if (id === 'modesModal') {
    renderModeModal();
  }

  if (id === 'mapModal') {
    renderMapSummary();
    drawPreview();
  }

  if (id === 'reviewModal') {
    renderReview();
  }

  openOverlay(id);
}

function closeConfig(id) {
  withPending(
    () =>
      closeOverlay(id)
  );
}

function renderReview() {
  const features =
    draftFeatures();

  const rows = [
    [
      'Modos',
      objectiveLabel(draft)
    ],

    [
      'Partida',
      draft.name || '—'
    ],

    [
      'Local',
      draft.location || '—'
    ],

    [
      'Jogadores/equipe',
      draft.playerCount
    ],

    [
      'Vidas',
      draft.livesPerPlayer
    ],

    [
      'Respawn',
      `${draft.respawnDelay}s · ${
        draft.respawnPolicy === 'nearest'
          ? 'base mais próxima'
          : draft.respawnPolicy === 'choice'
          ? 'jogador escolhe'
          : 'operador escolhe'
      }`
    ],

    [
      'GPS equipe',
      draft.teamVisibility === 'always'
        ? 'sempre'
        : draft.teamVisibility === 'benefit'
        ? 'benefício'
        : 'desativado'
    ],

    [
      'Zonas',
      features.zone
        ? `${draft.zoneCaptureSeconds}s · ${draft.zonePoints} pts`
        : 'não usadas'
    ],

    [
      'Bomba',
      features.bomb
        ? `${draft.bomb.durationMin} min · ${draft.bomb.bombsPerPlayer}/jogador`
        : 'não usada'
    ],

    [
      'Mapa',
      draft.map.dataUrl
        ? `${draft.map.marks.length} elementos`
        : 'não configurado'
    ]
  ];

  const holder =
    $('reviewSummary');

  if (!holder) {
    return;
  }

  holder.innerHTML =
    rows
      .map(
        ([key, value]) =>
          `
            <div class="review-item">
              <span>${esc(key)}</span>
              <strong>${esc(value)}</strong>
            </div>
          `
      )
      .join('');
}

function validateStart() {
  readRulesForm();

  if (!draft.map.dataUrl) {
    toast(
      'CONFIGURE O MAPA ANTES DE INICIAR.'
    );

    return false;
  }

  if (!draft.modes.length) {
    toast(
      'SELECIONE PELO MENOS UM MODO.'
    );

    return false;
  }

  if (
    !draft.mergeModes &&
    draft.modes.length > 1
  ) {
    toast(
      'ATIVE “MESCLAR MODOS” PARA USAR MAIS DE UM.'
    );

    return false;
  }

  const confirm =
    $('confirmStart');

  if (
    !confirm?.checked
  ) {
    toast(
      'MARQUE A CONFIRMAÇÃO DO BRIEFING.'
    );

    return false;
  }

  return true;
}

/* =========================
   START
========================= */

function startMatch() {
  if (!validateStart()) {
    return;
  }

  if (draftDirty()) {
    applyDraft();
  }

  state.match.status =
    'live';

  state.match.startAt =
    Date.now();

  state.match.endAt =
    null;

  state.match.scores = {
    A: 0,
    B: 0
  };

  state.match.hits = {
    A: 0,
    B: 0
  };

  state.match.zones =
    {};

  state.match.bomb.planted =
    false;

  state.match.bomb.armedAt =
    null;

  state.match.bomb.expiresAt =
    null;

  state.match.players =
    createPlayers(
      state.match.playerCount,
      state.match.players
    ).map(
      player => ({
        ...player,

        lives:
          state.match.livesPerPlayer,

        hits:
          0,

        status:
          'ATIVO',

        bombsRemaining:
          state.match.bomb.bombsPerPlayer,

        respawnPendingUntil:
          null,

        respawnTargetId:
          null
      })
    );

  state.match.players.forEach(
    player => {
      player.carryingBomb =
        player.id ===
        state.match.bomb.carrierId;
    }
  );

  const carrier =
    state.match.players.find(
      player =>
        player.id ===
        state.match.bomb.carrierId
    );

  if (carrier) {
    state.match.bomb.armedByTeam =
      carrier.team;
  }

  addLog(
    'Operação iniciada.'
  );

  saveState();
  updateHeader();

  closeOverlay(
    'reviewModal'
  );

  showScreen(
    'control'
  );

  toast(
    'OPERAÇÃO INICIADA.',
    3000
  );
}

/* =========================
   MAP
========================= */

function mapMarks() {
  return Array.isArray(
    draft.map.marks
  )
    ? draft.map.marks
    : [];
}

function hasMap() {
  return Boolean(
    draft.map.dataUrl
  );
}

function mapBox(
  width,
  height,
  zoom = 1,
  panX = 0,
  panY = 0
) {
  const iw =
    draft.map.naturalWidth ||
    width;

  const ih =
    draft.map.naturalHeight ||
    height;

  const scale =
    Math.min(
      width / iw,
      height / ih
    );

  const boxWidth =
    iw * scale * zoom;

  const boxHeight =
    ih * scale * zoom;

  return {
    left:
      width / 2 -
      boxWidth / 2 +
      panX,

    top:
      height / 2 -
      boxHeight / 2 +
      panY,

    width:
      boxWidth,

    height:
      boxHeight
  };
}

function resizeCanvas(canvas) {
  if (!canvas) {
    return null;
  }

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    Math.min(
      2,
      window.devicePixelRatio || 1
    );

  const width =
    Math.max(
      1,
      Math.floor(
        rect.width * dpr
      )
    );

  const height =
    Math.max(
      1,
      Math.floor(
        rect.height * dpr
      )
    );

  if (
    canvas.width !== width ||
    canvas.height !== height
  ) {
    canvas.width =
      width;

    canvas.height =
      height;
  }

  return {
    width: rect.width,
    height: rect.height,
    dpr
  };
}

function drawMapMarks(
  ctx,
  width,
  height,
  box,
  options = {}
) {
  const allowed =
    options.live
      ? stateFeatures()
      : draftFeatures();

  const playerView =
    Boolean(
      options.playerView
    );

  const marks =
    options.live
      ? (
          state.match.map.marks ||
          []
        )
      : mapMarks();

  marks.forEach(
    mark => {
      if (
        !allowed[mark.type]
      ) {
        return;
      }

      const x =
        box.left +
        mark.x *
        box.width;

      const y =
        box.top +
        mark.y *
        box.height;

      const size =
        Math.max(
          18,
          Math.min(
            box.width,
            box.height
          ) *
          mark.size
        );

      const colors = {
        zone: '#5a8f5a',
        base: '#4a7a4a',
        flag: '#b38c2f',
        bomb: '#a04848'
      };

      const stroke =
        colors[
          mark.type
        ];

      const fill =
        mark.type === 'zone'
          ? 'rgba(90,143,90,.14)'
          : mark.type === 'base'
          ? 'rgba(74,122,74,.14)'
          : mark.type === 'flag'
          ? 'rgba(179,140,47,.16)'
          : 'rgba(160,72,72,.16)';

      const selected =
        !playerView &&
        mark.id ===
        editor.selectedId;

      ctx.save();

      ctx.lineWidth =
        selected
          ? 3
          : 2;

      ctx.strokeStyle =
        stroke;

      ctx.fillStyle =
        fill;

      if (
        mark.type === 'zone'
      ) {
        ctx.beginPath();

        ctx.arc(
          x,
          y,
          size / 2,
          0,
          Math.PI * 2
        );

        ctx.fill();
        ctx.stroke();
      } else if (
        mark.type === 'base'
      ) {
        ctx.fillRect(
          x - size / 2,
          y - size / 2,
          size,
          size
        );

        ctx.strokeRect(
          x - size / 2,
          y - size / 2,
          size,
          size
        );
      } else {
        ctx.beginPath();

        ctx.arc(
          x,
          y,
          size / 2.6,
          0,
          Math.PI * 2
        );

        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle =
        stroke;

      ctx.font =
        `800 ${Math.max(
          9,
          Math.min(
            15,
            size * .20
          )
        )}px system-ui`;

      ctx.textAlign =
        'center';

      ctx.textBaseline =
        'middle';

      ctx.fillText(
        String(
          mark.label || ''
        ).toUpperCase(),
        x,
        y
      );

      if (selected) {
        ctx.setLineDash([
          5,
          4
        ]);

        ctx.strokeStyle =
          '#292521';

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          size / 2 + 6,
          0,
          Math.PI * 2
        );

        ctx.stroke();

        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  );

  if (!options.playerView) {
    return;
  }

  const me =
    currentPlayer();

  const bomb =
    state.match.bomb;

  if (bomb.planted) {
    const bx =
      box.left +
      bomb.x *
      box.width;

    const by =
      box.top +
      bomb.y *
      box.height;

    ctx.save();

    ctx.beginPath();

    ctx.arc(
      bx,
      by,
      17,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      '#a04848';

    ctx.strokeStyle =
      '#fff';

    ctx.lineWidth =
      3;

    ctx.fill();
    ctx.stroke();

    ctx.fillStyle =
      '#fff';

    ctx.font =
      '12px sans-serif';

    ctx.textAlign =
      'center';

    ctx.textBaseline =
      'middle';

    ctx.fillText(
      '💣',
      bx,
      by
    );

    ctx.restore();
  }

  (
    state.match.players || []
  )
    .filter(
      player =>
        player.status !==
          'FORA DA OPERAÇÃO' &&
        player.team ===
          (
            me?.team ||
            'A'
          )
    )
    .forEach(
      player =>
        drawPlayerMark(
          ctx,
          player,
          box
        )
    );
}

function drawPlayerMark(
  ctx,
  player,
  box
) {
  const x =
    box.left +
    player.x *
    box.width;

  const y =
    box.top +
    player.y *
    box.height;

  const radius =
    Math.max(
      8,
      Math.min(
        box.width,
        box.height
      ) * .018
    );

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    radius,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    player.isMe
      ? '#e2ca61'
      : '#8b6b4a';

  ctx.strokeStyle =
    '#fff';

  ctx.lineWidth =
    2;

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle =
    '#292521';

  ctx.font =
    `800 ${Math.max(
      8,
      radius * .9
    )}px system-ui`;

  ctx.textAlign =
    'center';

  ctx.textBaseline =
    'top';

  ctx.fillText(
    player.isMe
      ? 'VOCÊ'
      : String(
          player.name || ''
        ).toUpperCase(),
    x,
    y + radius + 5
  );

  ctx.restore();
}

function drawCanvas(
  canvas,
  dataUrl,
  options = {}
) {
  if (!canvas) {
    return;
  }

  const metrics =
    resizeCanvas(
      canvas
    );

  if (!metrics) {
    return;
  }

  const {
    width,
    height,
    dpr
  } = metrics;

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const zoom =
    options.zoom ?? 1;

  const panX =
    options.panX ?? 0;

  const panY =
    options.panY ?? 0;

  const box =
    mapBox(
      width,
      height,
      zoom,
      panX,
      panY
    );

  const paint =
    image => {
      const current =
        resizeCanvas(
          canvas
        );

      if (!current) {
        return;
      }

      const context =
        canvas.getContext('2d');

      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      context.save();

      context.scale(
        current.dpr,
        current.dpr
      );

      const currentBox =
        mapBox(
          current.width,
          current.height,
          zoom,
          panX,
          panY
        );

      if (image) {
        context.drawImage(
          image,
          currentBox.left,
          currentBox.top,
          currentBox.width,
          currentBox.height
        );
      }

      drawMapMarks(
        context,
        current.width,
        current.height,
        currentBox,
        options
      );

      context.restore();
    };

  if (!dataUrl) {
    ctx.save();

    ctx.scale(
      dpr,
      dpr
    );

    drawMapMarks(
      ctx,
      width,
      height,
      box,
      options
    );

    ctx.restore();

    return;
  }

  let image =
    imageCache.get(
      dataUrl
    );

  if (!image) {
    image =
      new Image();

    imageCache.set(
      dataUrl,
      image
    );

    image.onload = () =>
      paint(image);

    image.src =
      dataUrl;

    return;
  }

  if (image.complete) {
    paint(image);
  } else {
    image.onload = () =>
      paint(image);
  }
}

function drawPreview() {
  drawCanvas(
    $('mapCanvas'),
    draft.map.dataUrl,
    {
      zoom: 1,
      panX: 0,
      panY: 0
    }
  );
}

function drawEditor() {
  drawCanvas(
    $('mapEditorCanvas'),
    draft.map.dataUrl,
    {
      zoom: editor.zoom,
      panX: editor.panX,
      panY: editor.panY
    }
  );

  setText(
    'zoomValue',
    `${Math.round(
      editor.zoom * 100
    )}%`
  );
}

function drawPlayerMap() {
  drawCanvas(
    $('playerMapCanvas'),
    state.match.map.dataUrl,
    {
      zoom:
        playerViewer.zoom,

      panX:
        playerViewer.panX,

      panY:
        playerViewer.panY,

      playerView:
        true,

      live:
        true
    }
  );

  setText(
    'playerZoomValue',
    `${Math.round(
      playerViewer.zoom * 100
    )}%`
  );
}

/* =========================
   MAP SUMMARY
========================= */

function renderMapSummary() {
  const holder =
    $('mapToolSummary');

  if (!holder) {
    return;
  }

  const features =
    draftFeatures();

  holder.innerHTML =
    '';

  Object.entries(
    TOOLS
  ).forEach(
    ([key, tool]) => {
      const chip =
        document.createElement(
          'div'
        );

      chip.className =
        `feature-chip ${
          features[key]
            ? ''
            : 'off'
        }`;

      chip.textContent =
        `${tool.icon} ${tool.label} · ${
          features[key]
            ? 'ATIVO'
            : 'INATIVO'
        }`;

      holder.appendChild(
        chip
      );
    }
  );
}

/* =========================
   MAP EDITOR
========================= */

function addMapMark(
  type,
  x,
  y
) {
  const features =
    draftFeatures();

  if (!features[type]) {
    toast(
      `O modo escolhido não permite ${
        TOOLS[type]?.label?.toLowerCase() ||
        type
      }.`
    );

    return;
  }

  const number =
    mapMarks().filter(
      mark =>
        mark.type === type
    ).length + 1;

  const size =
    type === 'base'
      ? 0.23
      : type === 'zone'
      ? 0.24
      : 0.12;

  const mark = {
    id:
      `${type}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 6)}`,

    type,

    number,

    label:
      `${TOOLS[type].label} ${number}`,

    x:
      Math.max(
        0.02,
        Math.min(0.98, x)
      ),

    y:
      Math.max(
        0.02,
        Math.min(0.98, y)
      ),

    size
  };

  draft.map.marks.push(
    mark
  );

  editor.selectedId =
    mark.id;

  drawEditor();
  drawPreview();
  renderInspector();

  toast(
    `${mark.label.toUpperCase()} ADICIONADA.`
  );
}

function findMarkAt(
  x,
  y
) {
  return [
    ...mapMarks()
  ]
    .reverse()
    .find(
      mark =>
        Math.hypot(
          x - mark.x,
          y - mark.y
        ) <=
        Math.max(
          0.045,
          mark.size / 2
        )
    );
}

function renderEditorTools() {
  const holder =
    $('editorTools');

  if (!holder) {
    return;
  }

  holder.innerHTML =
    '';

  const features =
    draftFeatures();

  Object.entries(
    TOOLS
  ).forEach(
    ([key, tool]) => {
      const button =
        document.createElement(
          'button'
        );

      button.type =
        'button';

      button.className =
        'tool-btn editor-tool selectable';

      if (!features[key]) {
        button.classList.add(
          'disabled'
        );
      }

      button.innerHTML =
        `
          <strong>
            ${tool.icon} ${tool.label}
          </strong>

          <small>
            ${tool.help}
          </small>
        `;

      button.addEventListener(
        'click',
        () => {
          if (!features[key]) {
            toast(
              `O modo atual não libera ${tool.label.toLowerCase()}.`
            );

            return;
          }

          editor.mode =
            key;

          editor.selectedId =
            null;

          $$('.editor-tool')
            .forEach(
              item =>
                item.classList.remove(
                  'selected'
                )
            );

          button.classList.add(
            'selected'
          );

          toast(
            `TOQUE NO MAPA PARA ADICIONAR ${tool.label.toUpperCase()}.`
          );
        }
      );

      holder.appendChild(
        button
      );
    }
  );
}

function renderInspector() {
  const panel =
    $('elementInspector');

  const content =
    $('inspectorContent');

  if (!panel || !content) {
    return;
  }

  const mark =
    mapMarks().find(
      item =>
        item.id ===
        editor.selectedId
    );

  if (!mark) {
    panel.classList.add(
      'hidden'
    );

    return;
  }

  panel.classList.remove(
    'hidden'
  );

  content.innerHTML =
    `
      <div class="field">
        <span>Nome</span>

        <input
          id="inspectorName"
          maxlength="36"
          value="${esc(mark.label)}"
        >
      </div>

      <div class="field">
        <span>Tamanho</span>

        <input
          id="inspectorSize"
          type="range"
          min="0.06"
          max="0.35"
          step="0.01"
          value="${mark.size}"
        >

        <small id="inspectorSizeValue">
          ${Math.round(
            mark.size * 100
          )}%
        </small>
      </div>

      <div class="inspector-actions">

        <button
          class="tool-btn"
          id="inspectorSave"
          type="button"
        >
          APLICAR
        </button>

        <button
          class="tool-btn danger-tool"
          id="inspectorDelete"
          type="button"
        >
          🗑 APAGAR
        </button>

      </div>
    `;

  on(
    'inspectorSize',
    'input',
    event => {
      mark.size =
        Number(
          event.target.value
        );

      setText(
        'inspectorSizeValue',
        `${Math.round(
          mark.size * 100
        )}%`
      );

      drawEditor();
      drawPreview();
    }
  );

  on(
    'inspectorSave',
    'click',
    () => {
      const name =
        $('inspectorName')?.value?.trim();

      if (name) {
        mark.label =
          name;
      }

      drawEditor();
      drawPreview();

      toast(
        'ELEMENTO ATUALIZADO.'
      );
    }
  );

  on(
    'inspectorDelete',
    'click',
    () =>
      deleteMark(
        mark.id
      )
  );
}

function renumber(type) {
  let n = 1;

  mapMarks()
    .filter(
      mark =>
        mark.type === type
    )
    .forEach(
      mark => {
        const oldNumber =
          mark.number;

        mark.number =
          n;

        const oldDefault =
          new RegExp(
            `^${TOOLS[type].label} \\d+$`
          );

        if (
          oldDefault.test(
            mark.label
          ) ||
          mark.label ===
            `${TOOLS[type].label} ${oldNumber}`
        ) {
          mark.label =
            `${TOOLS[type].label} ${n}`;
        }

        n++;
      }
    );
}

function deleteMark(id) {
  const mark =
    mapMarks().find(
      item =>
        item.id === id
    );

  if (!mark) {
    return;
  }

  openConfirm(
    `Apagar ${mark.label}?`,
    'O elemento será removido do mapa. A imagem original não será alterada.',
    'APAGAR',
    () => {
      draft.map.marks =
        draft.map.marks.filter(
          item =>
            item.id !== id
        );

      renumber(
        mark.type
      );

      editor.selectedId =
        null;

      drawEditor();
      drawPreview();
      renderInspector();

      toast(
        'ELEMENTO APAGADO.'
      );
    }
  );
}

function clearMarks() {
  if (!mapMarks().length) {
    toast(
      'NÃO HÁ ELEMENTOS NO MAPA.'
    );

    return;
  }

  openConfirm(
    'Limpar todos os elementos?',
    'Todas as zonas, bases, bandeiras e áreas de bomba serão removidas.',
    'LIMPAR',
    () => {
      draft.map.marks =
        [];

      editor.selectedId =
        null;

      drawEditor();
      drawPreview();
      renderInspector();

      toast(
        'ELEMENTOS LIMPOS.'
      );
    }
  );
}

function openEditor() {
  if (!hasMap()) {
    toast(
      'ENVIE OU GERE UM MAPA PRIMEIRO.'
    );

    return;
  }

  editor.zoom =
    1;

  editor.panX =
    0;

  editor.panY =
    0;

  editor.mode =
    'pan';

  editor.selectedId =
    null;

  renderEditorTools();
  renderInspector();

  openOverlay(
    'mapEditorModal'
  );

  setTimeout(
    drawEditor,
    80
  );
}

/* =========================
   MAP GENERATION
========================= */

function generateMap() {
  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    1600;

  canvas.height =
    1000;

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.strokeStyle =
    '#c7c1b8';

  ctx.globalAlpha =
    .6;

  ctx.lineWidth =
    3;

  for (
    let x = 0;
    x <= canvas.width;
    x += 160
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x,
      0
    );

    ctx.lineTo(
      x,
      canvas.height
    );

    ctx.stroke();
  }

  for (
    let y = 0;
    y <= canvas.height;
    y += 160
  ) {
    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      canvas.width,
      y
    );

    ctx.stroke();
  }

  ctx.globalAlpha =
    .16;

  ctx.fillStyle =
    '#8b6b4a';

  for (
    let i = 0;
    i < 12;
    i++
  ) {
    ctx.fillRect(
      80 +
        (
          i * 137
        ) % 1320,

      100 +
        (
          i * 89
        ) % 760,

      120 +
        (
          i % 3
        ) * 70,

      70 +
        (
          i % 2
        ) * 45
    );
  }

  ctx.globalAlpha =
    1;

  ctx.strokeStyle =
    '#8b6b4a';

  ctx.lineWidth =
    10;

  ctx.strokeRect(
    20,
    20,
    1560,
    960
  );

  ctx.fillStyle =
    '#6a5238';

  ctx.font =
    '800 34px system-ui';

  ctx.fillText(
    'DESERT FALCONS · MAPA TÁTICO',
    50,
    65
  );

  draft.map.dataUrl =
    canvas.toDataURL(
      'image/png'
    );

  draft.map.naturalWidth =
    canvas.width;

  draft.map.naturalHeight =
    canvas.height;

  draft.map.marks =
    [];

  editor.selectedId =
    null;

  drawPreview();

  toast(
    'MAPA DE TESTE GERADO.'
  );
}

/* =========================
   CROP
========================= */

function onMapFile(file) {
  const reader =
    new FileReader();

  reader.onload =
    () => {
      cropImage =
        new Image();

      cropImage.onload =
        () => {
          cropRect = {
            x: 5,
            y: 5,
            w: 90,
            h: 90
          };

          openOverlay(
            'cropModal'
          );

          drawCrop();
          positionCrop();
        };

      cropImage.src =
        reader.result;
    };

  reader.readAsDataURL(
    file
  );
}

function drawCrop() {
  const canvas =
    $('cropCanvas');

  const metrics =
    resizeCanvas(
      canvas
    );

  if (
    !metrics ||
    !cropImage
  ) {
    return;
  }

  const {
    width,
    height,
    dpr
  } = metrics;

  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();

  ctx.scale(
    dpr,
    dpr
  );

  const scale =
    Math.min(
      width /
        cropImage.naturalWidth,

      height /
        cropImage.naturalHeight
    );

  const imageWidth =
    cropImage.naturalWidth *
    scale;

  const imageHeight =
    cropImage.naturalHeight *
    scale;

  const x =
    (
      width -
      imageWidth
    ) / 2;

  const y =
    (
      height -
      imageHeight
    ) / 2;

  ctx.drawImage(
    cropImage,
    x,
    y,
    imageWidth,
    imageHeight
  );

  ctx.restore();
}

function positionCrop() {
  const box =
    $('cropBox');

  if (!box) {
    return;
  }

  box.style.left =
    `${cropRect.x}%`;

  box.style.top =
    `${cropRect.y}%`;

  box.style.width =
    `${cropRect.w}%`;

  box.style.height =
    `${cropRect.h}%`;
}

function applyCrop() {
  if (!cropImage) {
    return;
  }

  const stage =
    $('cropStage');

  if (!stage) {
    return;
  }

  const rect =
    stage.getBoundingClientRect();

  const scale =
    Math.min(
      rect.width /
        cropImage.naturalWidth,

      rect.height /
        cropImage.naturalHeight
    );

  const imageWidth =
    cropImage.naturalWidth *
    scale;

  const imageHeight =
    cropImage.naturalHeight *
    scale;

  const offsetX =
    (
      rect.width -
      imageWidth
    ) / 2;

  const offsetY =
    (
      rect.height -
      imageHeight
    ) / 2;

  const cropLeft =
    cropRect.x /
    100 *
    rect.width;

  const cropTop =
    cropRect.y /
    100 *
    rect.height;

  const cropWidth =
    cropRect.w /
    100 *
    rect.width;

  const cropHeight =
    cropRect.h /
    100 *
    rect.height;

  const sx =
    Math.max(
      0,
      (
        cropLeft -
        offsetX
      ) / scale
    );

  const sy =
    Math.max(
      0,
      (
        cropTop -
        offsetY
      ) / scale
    );

  const sw =
    Math.min(
      cropImage.naturalWidth -
        sx,

      cropWidth /
        scale
    );

  const sh =
    Math.min(
      cropImage.naturalHeight -
        sy,

      cropHeight /
        scale
    );

  if (
    sw < 2 ||
    sh < 2
  ) {
    toast(
      'ÁREA DE CORTE INVÁLIDA.'
    );

    return;
  }

  const output =
    document.createElement(
      'canvas'
    );

  output.width =
    Math.round(sw);

  output.height =
    Math.round(sh);

  output
    .getContext('2d')
    ?.drawImage(
      cropImage,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      output.width,
      output.height
    );

  draft.map.dataUrl =
    output.toDataURL(
      'image/png'
    );

  draft.map.naturalWidth =
    output.width;

  draft.map.naturalHeight =
    output.height;

  draft.map.marks =
    [];

  editor.selectedId =
    null;

  cropImage =
    null;

  closeOverlay(
    'cropModal'
  );

  drawPreview();

  toast(
    'MAPA APLICADO.'
  );
}

/* =========================
   PLAYER
========================= */

function renderPlayer() {
  const wait =
    $('playerWait');

  const ready =
    $('playerReady');

  const live =
    $('playerLive');

  if (!wait || !ready || !live) {
    return;
  }

  if (
    !['open', 'live'].includes(
      state.match.status
    )
  ) {
    wait.classList.remove(
      'hidden'
    );

    ready.classList.add(
      'hidden'
    );

    live.classList.add(
      'hidden'
    );

    return;
  }

  wait.classList.add(
    'hidden'
  );

  const me =
    currentPlayer();

  if (
    state.match.status === 'open'
  ) {
    ready.classList.remove(
      'hidden'
    );

    live.classList.add(
      'hidden'
    );

    setText(
      'pName',
      state.match.name ||
        'Operação Desert Falcons'
    );

    setText(
      'pLoc',
      state.match.location ||
        'Campo'
    );

    setText(
      'pObj',
      objectiveLabel()
    );

    setText(
      'pDur',
      `${state.match.durationMin} min`
    );

    setText(
      'pLivesReady',
      me
        ? `${me.lives} vida(s)`
        : '—'
    );

    setText(
      'pTeam',
      `EQUIPE ${
        me?.team || 'A'
      }`
    );

    const confirmBtn =
      $('btnConfirm');

    if (confirmBtn) {
      confirmBtn.textContent =
        me?.confirmed
          ? 'PRESENÇA CONFIRMADA ✓'
          : 'CONFIRMAR PRESENÇA';

      confirmBtn.classList.toggle(
        'selected',
        Boolean(
          me?.confirmed
        )
      );
    }

    toggleHidden(
      'btnEnter',
      !me?.confirmed
    );

    return;
  }

  ready.classList.add(
    'hidden'
  );

  live.classList.remove(
    'hidden'
  );

  renderPlayerLive();
}

function matchElapsed() {
  if (!state.match.startAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (
        Date.now() -
        state.match.startAt
      ) / 1000
    )
  );
}

function matchRemaining() {
  return Math.max(
    0,
    (
      Number(
        state.match.durationMin
      ) || 60
    ) * 60 -
    matchElapsed()
  );
}

function renderPlayerLive() {
  const me =
    currentPlayer();

  setText(
    'pLiveObj',
    objectiveLabel()
  );

  setText(
    'pScoreA',
    `A ${
      state.match.scores.A || 0
    }`
  );

  setText(
    'pScoreB',
    `B ${
      state.match.scores.B || 0
    }`
  );

  setText(
    'pTimer',
    formatTime(
      matchRemaining()
    )
  );

  setText(
    'pPlayerState',
    me?.status || 'ATIVO'
  );

  setText(
    'pAlive',
    `${me?.status || 'ATIVO'} · ${me?.lives ?? 0} vida(s)`
  );

  setText(
    'pGps',
    state.gps.updatedAt
      ? `GPS ±${Math.round(
          state.gps.accuracy || 0
        )}m`
      : 'GPS aguardando…'
  );

  setText(
    'hudTeamChip',
    `EQUIPE ${
      me?.team || 'A'
    }`
  );

  renderAllies();
  renderBombHud();
  renderZoneHud();
  renderQuickActions();
  drawPlayerMap();

  toggleHidden(
    'btnOrgFromGame',
    role() !== 'organizer'
  );

  toggleHidden(
    'btnEndFromGame',
    role() !== 'organizer'
  );

  if (
    matchRemaining() <= 0 &&
    state.match.status === 'live'
  ) {
    endMatch(
      'TEMPO DA PARTIDA ENCERRADO.'
    );
  }
}

function renderAllies() {
  const me =
    currentPlayer();

  const holder =
    $('allyList');

  if (!holder) {
    return;
  }

  holder.innerHTML =
    (
      state.match.players ||
      []
    )
      .filter(
        player =>
          player.team ===
          (
            me?.team || 'A'
          )
      )
      .map(
        player =>
          `
          <div class="ally-item ${
            player.isMe ? 'you' : ''
          }">

            <span class="ally-dot"></span>

            <span class="name">
              ${esc(
                player.isMe
                  ? 'Você'
                  : player.name
              )}
            </span>

            <small>
              ${esc(
                player.status
              )} · ${
                player.lives
              } vida(s)
            </small>

          </div>
          `
      )
      .join('');
}

/* =========================
   BOMB
========================= */

function renderBombHud() {
  const holder =
    $('bombHud');

  if (!holder) {
    return;
  }

  if (
    !state.match.modes.includes(
      'bomb'
    )
  ) {
    holder.classList.add(
      'hidden'
    );

    return;
  }

  holder.classList.remove(
    'hidden'
  );

  const bomb =
    state.match.bomb;

  const me =
    currentPlayer();

  const carrier =
    state.match.players.find(
      player =>
        player.id ===
        bomb.carrierId
    );

  if (!bomb.planted) {
    holder.className =
      'live-panel';

    holder.innerHTML =
      `
        <div class="live-title">
          <strong>💣 BOMBA · PORTADOR</strong>
          <b>${esc(
            carrier?.name || '—'
          )}</b>
        </div>

        <div class="live-copy">
          ${
            carrier?.team === me?.team
              ? 'A bomba pertence à sua equipe.'
              : 'Aguardando armamento.'
          }
        </div>
      `;

    return;
  }

  const enemy =
    bomb.armedByTeam !==
    me?.team;

  const remaining =
    Math.max(
      0,
      Math.floor(
        (
          bomb.expiresAt -
          Date.now()
        ) / 1000
      )
    );

  const distance =
    bombDistance(
      me,
      bomb
    );

  holder.className =
    `live-panel ${
      enemy ? 'enemy' : ''
    }`;

  holder.innerHTML =
    `
      <div class="live-title">
        <strong>
          ${
            enemy
              ? '💣 LOCALIZE E DESARME'
              : '💣 BOMBA ARMADA'
          }
        </strong>

        <b>
          ${formatTime(
            remaining
          )}
        </b>
      </div>

      <div class="live-copy">
        Localização GPS ativa · aproximadamente
        ${distance} m.

        ${
          enemy
            ? 'O bipe fica mais rápido conforme você se aproxima.'
            : 'Sua equipe acompanha o estado da bomba.'
        }
      </div>

      ${
        enemy
          ? `
            <button
              class="quick-action"
              id="quickDisarm"
              type="button"
            >
              DESARMAR BOMBA
            </button>
          `
          : ''
      }
    `;

  on(
    'quickDisarm',
    'click',
    startDisarm
  );

  if (enemy) {
    bombBeep(
      distance
    );
  }

  if (
    remaining <= 0
  ) {
    explodeBomb();
  }
}

function bombDistance(
  player,
  bomb
) {
  if (
    Number.isFinite(
      player?.lat
    ) &&
    Number.isFinite(
      player?.lng
    ) &&
    Number.isFinite(
      bomb?.lat
    ) &&
    Number.isFinite(
      bomb?.lng
    )
  ) {
    const R =
      6371000;

    const toRad =
      value =>
        value *
        Math.PI /
        180;

    const dLat =
      toRad(
        bomb.lat -
        player.lat
      );

    const dLng =
      toRad(
        bomb.lng -
        player.lng
      );

    const a =
      Math.sin(
        dLat / 2
      ) ** 2 +

      Math.cos(
        toRad(
          player.lat
        )
      ) *

      Math.cos(
        toRad(
          bomb.lat
        )
      ) *

      Math.sin(
        dLng / 2
      ) ** 2;

    return Math.round(
      R *
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      )
    );
  }

  return Math.round(
    Math.hypot(
      (
        player?.x ??
        0.5
      ) -
      (
        bomb?.x ??
        0.5
      ),

      (
        player?.y ??
        0.5
      ) -
      (
        bomb?.y ??
        0.5
      )
    ) * 120
  );
}

function bombBeep(distance) {
  const now =
    Date.now();

  let interval =
    1600;

  if (distance < 25) {
    interval = 250;
  } else if (
    distance < 50
  ) {
    interval = 500;
  } else if (
    distance < 100
  ) {
    interval = 900;
  }

  if (
    now -
    lastBeep <
    interval
  ) {
    return;
  }

  lastBeep =
    now;

  try {
    audioContext ||=
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    if (
      audioContext.state ===
      'suspended'
    ) {
      audioContext
        .resume()
        .catch(
          () => {}
        );
    }

    const oscillator =
      audioContext
        .createOscillator();

    const gain =
      audioContext
        .createGain();

    oscillator.frequency.value =
      distance < 25
        ? 1050
        : distance < 50
        ? 780
        : distance < 100
        ? 600
        : 480;

    gain.gain.value =
      0.035;

    oscillator
      .connect(gain)
      .connect(
        audioContext.destination
      );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
      0.09
    );
  } catch (_) {}

  if (navigator.vibrate) {
    navigator.vibrate(
      distance < 25
        ? [60, 40, 60]
        : 35
    );
  }
}

function renderQuickActions() {
  const holder =
    $('quickActions');

  if (!holder) {
    return;
  }

  const me =
    currentPlayer();

  const bomb =
    state.match.bomb;

  let html =
    '';

  if (
    state.match.modes.includes(
      'bomb'
    ) &&
    !bomb.planted &&
    bomb.carrierId === me?.id &&
    Number(
      me?.bombsRemaining ??
      bomb.bombsPerPlayer
    ) > 0
  ) {
    html +=
      `
        <button
          class="quick-action"
          id="quickArm"
          type="button"
        >
          💣 ARMAR BOMBA
        </button>
      `;
  }

  holder.innerHTML =
    html;

  on(
    'quickArm',
    'click',
    armBomb
  );
}

function armBomb() {
  const me =
    currentPlayer();

  const bomb =
    state.match.bomb;

  if (
    !me ||
    bomb.planted ||
    bomb.carrierId !== me.id
  ) {
    return;
  }

  if (
    Number(
      me.bombsRemaining ??
      bomb.bombsPerPlayer
    ) <= 0
  ) {
    toast(
      'VOCÊ NÃO TEM MAIS BOMBAS DISPONÍVEIS.'
    );

    return;
  }

  if (
    bomb.armPolicy ===
    'areas' &&
    !state.match.map.marks.some(
      mark =>
        mark.type === 'bomb'
    )
  ) {
    toast(
      'NÃO HÁ ÁREA DE BOMBA CONFIGURADA.'
    );

    return;
  }

  if (
    bomb.timingPolicy ===
    'arming'
  ) {
    const value =
      prompt(
        'Tempo da bomba em minutos:',
        String(
          bomb.durationMin
        )
      );

    if (value === null) {
      return;
    }

    const minutes =
      Number(value);

    if (
      !Number.isFinite(
        minutes
      ) ||
      minutes < 1 ||
      minutes > 120
    ) {
      toast(
        'INFORME ENTRE 1 E 120 MINUTOS.'
      );

      return;
    }

    bomb.durationMin =
      minutes;
  }

  bomb.planted =
    true;

  bomb.armedAt =
    Date.now();

  bomb.expiresAt =
    Date.now() +
    bomb.durationMin *
    60000;

  bomb.armedByTeam =
    me.team;

  bomb.x =
    me.x;

  bomb.y =
    me.y;

  bomb.lat =
    state.gps.lat;

  bomb.lng =
    state.gps.lng;

  me.bombsRemaining =
    Math.max(
      0,
      Number(
        me.bombsRemaining ??
        bomb.bombsPerPlayer
      ) - 1
    );

  addLog(
    `${me.name} armou a bomba.`
  );

  saveState();

  toast(
    'BOMBA ARMADA. CONTAGEM INICIADA.',
    3000
  );

  renderPlayer();
}

function startDisarm() {
  const me =
    currentPlayer();

  const bomb =
    state.match.bomb;

  if (
    !bomb.planted ||
    bomb.armedByTeam ===
    me?.team
  ) {
    return;
  }

  if (
    bombDistance(me, bomb) >
    25
  ) {
    toast(
      'APROXIME-SE DA BOMBA PARA DESARMAR.'
    );

    return;
  }

  let remaining =
    Number(
      bomb.disarmSeconds
    ) || 20;

  toast(
    `DESARME INICIADO · ${remaining}s`
  );

  const timer =
    setInterval(
      () => {
        if (
          !bomb.planted ||
          state.match.status !==
          'live'
        ) {
          clearInterval(
            timer
          );

          return;
        }

        if (
          bombDistance(
            me,
            bomb
          ) > 25
        ) {
          clearInterval(
            timer
          );

          toast(
            'DESARME INTERROMPIDO.'
          );

          return;
        }

        remaining--;

        if (
          remaining <= 0
        ) {
          clearInterval(
            timer
          );

          disarmBomb();
        }
      },
      1000
    );
}

function disarmBomb() {
  const bomb =
    state.match.bomb;

  if (!bomb.planted) {
    return;
  }

  const team =
    bomb.armedByTeam;

  bomb.planted =
    false;

  bomb.armedAt =
    null;

  bomb.expiresAt =
    null;

  state.match.scores[team] =
    Math.max(
      0,
      (
        state.match.scores[team] ||
        0
      ) - 25
    );

  addLog(
    'Bomba desarmada.'
  );

  saveState();

  toast(
    'BOMBA DESARMADA.'
  );

  renderPlayer();
  renderControl();
}

function explodeBomb() {
  const bomb =
    state.match.bomb;

  if (!bomb.planted) {
    return;
  }

  const attackingTeam =
    bomb.armedByTeam;

  const enemyTeam =
    attackingTeam === 'A'
      ? 'B'
      : 'A';

  const victims =
    state.match.players.filter(
      player =>
        player.team ===
        enemyTeam &&
        player.status !==
        'FORA DA OPERAÇÃO' &&
        bombDistance(
          player,
          bomb
        ) <=
        bomb.blastRadius
    );

  victims.forEach(
    player => {
      player.hits += 1;

      player.lives =
        Math.max(
          0,
          player.lives - 1
        );

      player.status =
        player.lives > 0
          ? 'HIT'
          : 'FORA DA OPERAÇÃO';
    }
  );

  state.match.hits[enemyTeam] =
    (
      state.match.hits[enemyTeam] ||
      0
    ) +
    victims.length;

  state.match.scores[attackingTeam] =
    (
      state.match.scores[attackingTeam] ||
      0
    ) +
    victims.length * 50;

  bomb.planted =
    false;

  bomb.armedAt =
    null;

  bomb.expiresAt =
    null;

  addLog(
    `Bomba detonou · ${victims.length} atingido(s).`
  );

  saveState();

  if (navigator.vibrate) {
    navigator.vibrate(
      [100, 70, 140]
    );
  }

  toast(
    '💥 BOMBA DETONADA.',
    3200
  );

  renderPlayer();
  renderControl();
}

/* =========================
   ZONAS
========================= */

function renderZoneHud() {
  const holder =
    $('zoneHud');

  if (!holder) {
    return;
  }

  if (
    !state.match.modes.includes(
      'zone'
    )
  ) {
    holder.classList.add(
      'hidden'
    );

    return;
  }

  holder.classList.remove(
    'hidden'
  );

  const me =
    currentPlayer();

  const zone =
    state.match.map.marks.find(
      mark =>
        mark.type === 'zone' &&
        Math.hypot(
          me.x - mark.x,
          me.y - mark.y
        ) <=
        mark.size / 2
    );

  if (!zone) {
    holder.className =
      'live-panel';

    holder.innerHTML =
      `
        <div class="live-title">
          <strong>◎ ZONAS</strong>
          <b>FORA</b>
        </div>

        <div class="live-copy">
          Entre em uma zona para iniciar a captura.
        </div>
      `;

    return;
  }

  const key =
    zone.id;

  const progress =
    state.match.zones[key] ||
    {
      startedAt: null,
      captured: false,
      team: null
    };

  if (
    !progress.startedAt &&
    !progress.captured
  ) {
    progress.startedAt =
      Date.now();

    progress.team =
      me.team;

    state.match.zones[key] =
      progress;

    saveState();
  }

  const elapsed =
    Math.floor(
      (
        Date.now() -
        progress.startedAt
      ) / 1000
    );

  if (
    !progress.captured &&
    elapsed >=
    state.match.zoneCaptureSeconds
  ) {
    progress.captured =
      true;

    state.match.scores[me.team] =
      (
        state.match.scores[me.team] ||
        0
      ) +
      Number(
        state.match.zonePoints ||
        0
      );

    addLog(
      `${zone.label} capturada pela equipe ${me.team}.`
    );

    saveState();

    toast(
      `${zone.label.toUpperCase()} CAPTURADA.`
    );
  }

  holder.innerHTML =
    `
      <div class="live-title">
        <strong>
          ${esc(zone.label)}
        </strong>

        <b>
          ${
            progress.captured
              ? 'VERDE'
              : `${elapsed}s`
          }
        </b>
      </div>

      <div class="live-copy">
        ${
          progress.captured
            ? 'Zona capturada.'
            : `Necessário ${state.match.zoneCaptureSeconds}s para capturar.`
        }
      </div>
    `;
}

/* =========================
   HIT + RESPAWN
========================= */

function hitPlayer() {
  const me =
    currentPlayer();

  if (
    !me ||
    state.match.status !==
    'live' ||
    me.status ===
    'FORA DA OPERAÇÃO'
  ) {
    return;
  }

  openConfirm(
    'Confirmar HIT?',
    'Seu HIT será registrado, uma vida será removida e o respawn seguirá a regra configurada.',
    'CONFIRMAR',
    () => {
      me.hits += 1;

      me.lives =
        Math.max(
          0,
          me.lives - 1
        );

      state.match.hits[me.team] =
        (
          state.match.hits[me.team] ||
          0
        ) +
        1;

      if (
        me.lives <= 0
      ) {
        me.status =
          'FORA DA OPERAÇÃO';

        toast(
          'VOCÊ ESTÁ FORA DA OPERAÇÃO.',
          3000
        );
      } else {
        me.status =
          'HIT';

        toast(
          `HIT REGISTRADO · ${me.lives} VIDA(S) RESTANTES.`
        );

        startRespawn(
          me
        );
      }

      addLog(
        `${me.name} levou HIT.`
      );

      saveState();

      renderPlayer();
      renderControl();
    }
  );
}

function startRespawn(player) {
  const delay =
    Number(
      state.match.respawnDelay
    ) || 0;

  player.respawnPendingUntil =
    Date.now() +
    delay * 1000;

  player.respawnTargetId =
    null;

  if (delay <= 0) {
    resolveRespawn(
      player
    );

    return;
  }

  toast(
    `${player.name.toUpperCase()} · RESPAWN EM ${delay}s.`,
    1800
  );

  setTimeout(
    () =>
      resolveRespawn(
        player
      ),
    delay * 1000
  );
}

function resolveRespawn(player) {
  if (
    !player ||
    player.lives <= 0
  ) {
    return;
  }

  if (
    state.match.respawnPolicy ===
    'operator'
  ) {
    player.status =
      'AGUARDANDO BASE';

    saveState();

    renderControl();

    if (player.isMe) {
      toast(
        'AGUARDANDO O OPERADOR DEFINIR A BASE.'
      );
    }

    return;
  }

  if (
    state.match.respawnPolicy ===
    'choice' &&
    player.isMe
  ) {
    const bases =
      state.match.map.marks.filter(
        mark =>
          mark.type === 'base'
      );

    if (bases.length) {
      const list =
        bases
          .map(
            (base, index) =>
              `${index + 1}. ${base.label}`
          )
          .join('\n');

      const value =
        prompt(
          `Escolha a base de respawn:\n${list}`,
          '1'
        );

      const chosen =
        bases[
          Number(value) - 1
        ];

      player.respawnTargetId =
        chosen?.id ||
        bases[0].id;
    }
  }

  respawnPlayer(
    player
  );
}

function respawnPlayer(
  player,
  baseId = null
) {
  if (
    !player ||
    player.lives <= 0
  ) {
    return;
  }

  const bases =
    state.match.map.marks.filter(
      mark =>
        mark.type === 'base'
    );

  let chosen =
    null;

  if (baseId) {
    chosen =
      bases.find(
        base =>
          base.id === baseId
      ) || null;
  }

  if (
    !chosen &&
    player.respawnTargetId
  ) {
    chosen =
      bases.find(
        base =>
          base.id ===
          player.respawnTargetId
      ) || null;
  }

  if (
    !chosen &&
    bases.length
  ) {
    if (
      state.match.respawnPolicy ===
      'nearest'
    ) {
      chosen =
        [...bases].sort(
          (a, b) =>
            Math.hypot(
              player.x - a.x,
              player.y - a.y
            ) -
            Math.hypot(
              player.x - b.x,
              player.y - b.y
            )
        )[0];
    } else {
      chosen =
        bases[0];
    }
  }

  if (chosen) {
    player.x =
      chosen.x;

    player.y =
      chosen.y;
  }

  player.status =
    'ATIVO';

  player.respawnPendingUntil =
    null;

  player.respawnTargetId =
    null;

  addLog(
    `${player.name} voltou ao jogo.`
  );

  saveState();

  toast(
    `${player.name.toUpperCase()} · RESPAWN.`
  );

  renderPlayer();
  renderControl();
}

/* =========================
   CONTROL PANEL
========================= */

function renderControl() {
  setText(
    'ctrlScoreA',
    state.match.scores.A || 0
  );

  setText(
    'ctrlScoreB',
    state.match.scores.B || 0
  );

  setText(
    'ctrlHitsA',
    `${state.match.hits.A || 0} hits`
  );

  setText(
    'ctrlHitsB',
    `${state.match.hits.B || 0} hits`
  );

  setText(
    'ctrlTimer',
    formatTime(
      matchElapsed()
    )
  );

  setText(
    'ctrlMatchName',
    state.match.name || '—'
  );

  const delay =
    $('liveRespawnDelay');

  if (delay) {
    delay.value =
      state.match.respawnDelay ?? 60;
  }

  const policy =
    $('liveRespawnPolicy');

  if (policy) {
    policy.value =
      state.match.respawnPolicy ||
      'nearest';
  }

  renderOperatorPlayers();
  renderRespawnQueue();
  renderOperatorBomb();
  renderControlLog();
}

function renderOperatorPlayers() {
  const holder =
    $('operatorPlayers');

  if (!holder) {
    return;
  }

  holder.innerHTML =
    (
      state.match.players ||
      []
    )
      .map(
        player =>
          `
          <div class="operator-row">

            <div>

              <strong>
                ${esc(player.name)}
                · Equipe ${player.team}
              </strong>

              <small>
                ${esc(player.status)}
                · ${player.lives} vida(s)
                · ${player.hits} hit(s)
              </small>

            </div>

            <span>
              ${Math.round(
                player.x * 100
              )}% ·
              ${Math.round(
                player.y * 100
              )}%
            </span>

          </div>
          `
      )
      .join('');
}

function renderRespawnQueue() {
  const holder =
    $('respawnQueue');

  if (!holder) {
    return;
  }

  const pending =
    (
      state.match.players ||
      []
    ).filter(
      player =>
        player.status ===
        'AGUARDANDO BASE'
    );

  if (!pending.length) {
    holder.innerHTML =
      `
        <div class="log-item">
          Nenhum jogador aguardando decisão.
        </div>
      `;

    return;
  }

  const bases =
    state.match.map.marks.filter(
      mark =>
        mark.type === 'base'
    );

  holder.innerHTML =
    pending
      .map(
        player => {
          const buttons =
            bases
              .map(
                base =>
                  `
                  <button
                    type="button"
                    class="tool-btn"
                    data-respawn-player="${esc(player.id)}"
                    data-respawn-base="${esc(base.id)}"
                  >
                    ${esc(base.label)}
                  </button>
                  `
              )
              .join('');

          return `
            <div class="operator-row">

              <div>

                <strong>
                  ${esc(player.name)}
                  · Equipe ${player.team}
                </strong>

                <small>
                  Escolha a base de respawn.
                </small>

              </div>

              <div style="
                display:flex;
                gap:4px;
                flex-wrap:wrap;
                justify-content:flex-end;
              ">
                ${
                  buttons ||
                  '<span>Crie uma base no mapa.</span>'
                }
              </div>

            </div>
          `;
        }
      )
      .join('');

  holder
    .querySelectorAll(
      '[data-respawn-player]'
    )
    .forEach(
      button => {
        button.addEventListener(
          'click',
          () => {
            const player =
              state.match.players.find(
                item =>
                  item.id ===
                  button.dataset.respawnPlayer
              );

            if (player) {
              respawnPlayer(
                player,
                button.dataset.respawnBase
              );
            }
          }
        );
      }
    );
}

function renderOperatorBomb() {
  const card =
    $('operatorBombCard');

  if (!card) {
    return;
  }

  const enabled =
    state.match.modes.includes(
      'bomb'
    );

  card.classList.toggle(
    'hidden',
    !enabled
  );

  if (!enabled) {
    return;
  }

  const bomb =
    state.match.bomb;

  const carrier =
    state.match.players.find(
      player =>
        player.id ===
        bomb.carrierId
    );

  const remaining =
    bomb.planted
      ? Math.max(
          0,
          Math.floor(
            (
              bomb.expiresAt -
              Date.now()
            ) / 1000
          )
        )
      : 0;

  const holder =
    $('operatorBombState');

  if (!holder) {
    return;
  }

  holder.innerHTML =
    `
      <div class="info-line">
        <span>Portador</span>
        <strong>
          ${esc(
            carrier?.name || '—'
          )}
        </strong>
      </div>

      <div class="info-line">
        <span>Estado</span>
        <strong>
          ${
            bomb.planted
              ? 'ARMADA'
              : 'NÃO ARMADA'
          }
        </strong>
      </div>

      <div class="info-line">
        <span>Tempo</span>
        <strong>
          ${
            bomb.planted
              ? formatTime(
                  remaining
                )
              : `${bomb.durationMin} min`
          }
        </strong>
      </div>

      <div class="info-line">
        <span>Raio</span>
        <strong>
          ${bomb.blastRadius} m
        </strong>
      </div>
    `;
}

function renderControlLog() {
  const holder =
    $('controlLog');

  if (!holder) {
    return;
  }

  holder.innerHTML =
    (
      state.match.logs ||
      []
    )
      .map(
        log =>
          `
          <div class="log-item">

            <time>
              ${new Date(
                log.at
              ).toLocaleTimeString(
                'pt-BR'
              )}
            </time>

            ${esc(
              log.text
            )}

          </div>
          `
      )
      .join('') ||
    `
      <div class="log-item">
        Nenhum evento.
      </div>
    `;
}

/* =========================
   OPERATOR ACTIONS
========================= */

function transferBomb() {
  if (
    state.match.bomb.planted
  ) {
    toast(
      'A BOMBA JÁ FOI ARMADA. O PORTADOR NÃO PODE SER TROCADO.'
    );

    return;
  }

  const team =
    state.match.bomb.armedByTeam;

  const list =
    state.match.players.filter(
      player =>
        player.status !==
        'FORA DA OPERAÇÃO' &&
        player.team === team
    );

  const text =
    list
      .map(
        (player, index) =>
          `${index + 1}. ${player.name}`
      )
      .join('\n');

  const current =
    list.findIndex(
      player =>
        player.id ===
        state.match.bomb.carrierId
    );

  const value =
    prompt(
      `Novo portador:\n${text}`,
      String(
        Math.max(
          1,
          current + 1
        )
      )
    );

  if (value === null) {
    return;
  }

  const player =
    list[
      Number(value) - 1
    ];

  if (!player) {
    toast(
      'PORTADOR INVÁLIDO.'
    );

    return;
  }

  state.match.players.forEach(
    item =>
      item.carryingBomb =
        false
  );

  player.carryingBomb =
    true;

  state.match.bomb.carrierId =
    player.id;

  state.match.bomb.armedByTeam =
    player.team;

  addLog(
    `Bomba transferida para ${player.name}.`
  );

  saveState();

  toast(
    `BOMBA ENTREGUE A ${player.name.toUpperCase()}.`
  );

  renderControl();
  renderPlayer();
}

function changeBombTime() {
  const value =
    prompt(
      'Novo tempo da bomba em minutos:',
      String(
        state.match.bomb.durationMin
      )
    );

  if (value === null) {
    return;
  }

  const minutes =
    Number(value);

  if (
    !Number.isFinite(
      minutes
    ) ||
    minutes < 1 ||
    minutes > 120
  ) {
    toast(
      'INFORME ENTRE 1 E 120 MINUTOS.'
    );

    return;
  }

  state.match.bomb.durationMin =
    minutes;

  if (
    state.match.bomb.planted
  ) {
    state.match.bomb.expiresAt =
      Date.now() +
      minutes * 60000;
  }

  addLog(
    `Tempo da bomba alterado para ${minutes} min.`
  );

  saveState();

  toast(
    'TEMPO DA BOMBA ATUALIZADO.'
  );

  renderControl();
  renderPlayer();
}

function applyLiveRules() {
  const delay =
    $('liveRespawnDelay');

  const policy =
    $('liveRespawnPolicy');

  if (delay) {
    state.match.respawnDelay =
      clamp(
        delay.value,
        0,
        900,
        60
      );
  }

  if (policy) {
    state.match.respawnPolicy =
      policy.value;
  }

  addLog(
    'Regras de respawn atualizadas durante a partida.'
  );

  saveState();

  toast(
    'CONTROLE AO VIVO APLICADO.'
  );

  renderControl();
}

/* =========================
   END MATCH
========================= */

function endMatch(
  reason =
    'Partida encerrada.'
) {
  state.match.status =
    'ended';

  state.match.endAt =
    Date.now();

  state.match.bomb.planted =
    false;

  state.match.bomb.armedAt =
    null;

  state.match.bomb.expiresAt =
    null;

  addLog(
    reason
  );

  saveState();

  updateHeader();

  toast(
    reason,
    3000
  );

  showScreen(
    role() === 'organizer'
      ? 'control'
      : 'player'
  );
}

/* =========================
   LOG
========================= */

function addLog(text) {
  state.match.logs ||=
    [];

  state.match.logs.unshift({
    at: Date.now(),
    text
  });

  state.match.logs =
    state.match.logs.slice(
      0,
      60
    );
}

/* =========================
   GPS
========================= */

function requestGps() {
  if (
    !navigator.geolocation
  ) {
    setText(
      'gpsMessage',
      'Este navegador não oferece localização.'
    );

    openOverlay(
      'gpsGate'
    );

    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      state.gps = {
        lat:
          position.coords.latitude,

        lng:
          position.coords.longitude,

        accuracy:
          position.coords.accuracy,

        updatedAt:
          Date.now()
      };

      const me =
        state.match.players.find(
          player =>
            player.isMe
        );

      if (me) {
        me.lat =
          state.gps.lat;

        me.lng =
          state.gps.lng;

        me.mock =
          false;
      }

      saveState();

      closeOverlay(
        'gpsGate'
      );

      startGpsWatch();

      renderPlayer();

      toast(
        'GPS ATIVO.'
      );
    },

    error => {
      setText(
        'gpsMessage',
        error.code === 1
          ? 'Permissão negada. Você ainda pode navegar pelo protótipo neste aparelho; ative o GPS para os recursos de localização.'
          : 'Não foi possível obter a localização agora.'
      );

      openOverlay(
        'gpsGate'
      );
    },

    {
      enableHighAccuracy:
        true,

      timeout:
        10000,

      maximumAge:
        2000
    }
  );
}

function startGpsWatch() {
  if (
    currentGpsWatch !== null ||
    !navigator.geolocation
  ) {
    return;
  }

  currentGpsWatch =
    navigator.geolocation.watchPosition(
      position => {
        state.gps = {
          lat:
            position.coords.latitude,

          lng:
            position.coords.longitude,

          accuracy:
            position.coords.accuracy,

          updatedAt:
            Date.now()
        };

        const me =
          state.match.players.find(
            player =>
              player.isMe
          );

        if (me) {
          me.lat =
            state.gps.lat;

          me.lng =
            state.gps.lng;

          me.mock =
            false;
        }

        saveState();

        if (
          activeScreen ===
          'player'
        ) {
          renderPlayer();
        }
      },

      error => {
        console.warn(
          '[DF] GPS watch:',
          error
        );
      },

      {
        enableHighAccuracy:
          true,

        maximumAge:
          2000
      }
    );
}

/* =========================
   MOCK
========================= */

function simulatePlayers() {
  if (
    state.match.status !==
    'live'
  ) {
    return;
  }

  const time =
    Date.now() /
    9000;

  state.match.players
    .filter(
      player =>
        player.mock
    )
    .forEach(
      (player, index) => {
        const offset =
          player.team === 'A'
            ? 0
            : Math.PI;

        const centerX =
          player.team === 'A'
            ? .28
            : .72;

        const centerY =
          player.team === 'A'
            ? .68
            : .32;

        player.x =
          Math.max(
            .04,
            Math.min(
              .96,
              centerX +
                Math.cos(
                  time *
                  (
                    .5 +
                    index * .03
                  ) +
                  index +
                  offset
                ) * .08
            )
          );

        player.y =
          Math.max(
            .04,
            Math.min(
              .96,
              centerY +
                Math.sin(
                  time *
                  (
                    .55 +
                    index * .02
                  ) +
                  index +
                  offset
                ) * .07
            )
          );
      }
    );
}

/* =========================
   RESET
========================= */

function resetAll() {
  openConfirm(
    'Reset total?',
    'Isso apaga partida, mapa, configurações e perfil salvos neste navegador.',
    'RESET',
    () => {
      localStorage.removeItem(
        STORAGE_KEY
      );

      localStorage.removeItem(
        ROLE_KEY
      );

      location.reload();
    }
  );
}

/* =========================
   EVENTOS
========================= */

function bindEvents() {

  /* PERFIL */

  onSelector(
    '.role-card',
    'click',
    event => {
      const button =
        event.currentTarget;

      const selectedRole =
        button.dataset.role;

      if (
        selectedRole !==
          'player' &&
        selectedRole !==
          'organizer'
      ) {
        return;
      }

      setRole(
        selectedRole
      );

      $$('.role-card')
        .forEach(
          item =>
            item.classList.toggle(
              'selected',
              item === button
            )
        );

      showScreen(
        selectedRole ===
          'player'
          ? 'player'
          : 'organizer'
      );
    }
  );

  /* DEV */

  on(
    'devBtn',
    'click',
    () =>
      withPending(
        () =>
          showScreen(
            'dev'
          )
      )
  );

  on(
    'devPlayer',
    'click',
    () => {
      setRole(
        'player'
      );

      showScreen(
        'player'
      );
    }
  );

  on(
    'devOrg',
    'click',
    () => {
      setRole(
        'organizer'
      );

      showScreen(
        state.match.status ===
          'live'
          ? 'control'
          : 'organizer'
      );
    }
  );

  on(
    'devReset',
    'click',
    resetAll
  );

  on(
    'devBack',
    'click',
    () =>
      showScreen(
        role() ===
          'organizer'
          ? 'organizer'
          : 'player'
      )
  );

  /* GPS */

  on(
    'gpsRetry',
    'click',
    requestGps
  );

  on(
    'gpsDeny',
    'click',
    () => {
      closeOverlay(
        'gpsGate'
      );

      toast(
        'GPS NÃO ATIVADO.'
      );
    }
  );

  /* ABRIR MODAIS */

  $$('[data-open-modal]')
    .forEach(
      button => {
        button.addEventListener(
          'click',
          () =>
            openConfig(
              button.dataset.openModal
            )
        );
      }
    );

  /* FECHAR MODAIS */

  $$('[data-close-modal]')
    .forEach(
      button => {
        button.addEventListener(
          'click',
          () =>
            closeConfig(
              button.dataset.closeModal
            )
        );
      }
    );

  /* APLICAR MODAIS */

  $$('[data-apply-modal]')
    .forEach(
      button => {
        button.addEventListener(
          'click',
          () => {
            const modalId =
              button.dataset.applyModal;

            if (
              modalId ===
              'rulesModal'
            ) {
              readRulesForm();
            }

            appliedSnapshot =
              deepClone(
                draft
              );

            state.match =
              deepClone(
                draft
              );

            state.match.players =
              createPlayers(
                state.match.playerCount,
                state.match.players
              );

            saveState();

            updateHeader();
            renderOperatorMenu();

            closeOverlay(
              modalId
            );

            toast(
              'ALTERAÇÕES APLICADAS.'
            );
          }
        );
      }
    );

  /* MODOS */

  on(
    'mergeModes',
    'change',
    () => {
      draft.mergeModes =
        $('mergeModes')
          .checked;

      renderModeModal();
    }
  );

  onSelector(
    '.choice-card',
    'click',
    event => {
      const button =
        event.currentTarget;

      const mode =
        button.dataset.mode;

      if (!mode) {
        return;
      }

      if (!draft.mergeModes) {
        draft.modes =
          [mode];
      } else {
        draft.modes =
          draft.modes.includes(
            mode
          )
            ? draft.modes.filter(
                item =>
                  item !==
                  mode
              )
            : [
                ...draft.modes,
                mode
              ];

        if (
          !draft.modes.length
        ) {
          draft.modes =
            ['flag'];
        }
      }

      renderModeModal();
    }
  );

  /* MAPA */

  on(
    'mapFile',
    'change',
    event => {
      const file =
        event.currentTarget
          .files?.[0];

      if (file) {
        onMapFile(
          file
        );
      }
    }
  );

  on(
    'btnGenMap',
    'click',
    generateMap
  );

  on(
    'btnOpenMapEditor',
    'click',
    openEditor
  );

  on(
    'btnPreviewEditor',
    'click',
    openEditor
  );

  on(
    'btnClearMarks',
    'click',
    clearMarks
  );

  /* START */

  on(
    'btnStartMatch',
    'click',
    startMatch
  );

  /* SALVAR */

  on(
    'btnSaveDraft',
    'click',
    () => {
      readRulesForm();

      appliedSnapshot =
        deepClone(
          draft
        );

      state.match =
        deepClone(
          draft
        );

      state.match.players =
        createPlayers(
          state.match.playerCount,
          state.match.players
        );

      saveState();

      renderOperatorMenu();

      toast(
        'ALTERAÇÕES APLICADAS.'
      );
    }
  );

  /* NAVEGAÇÃO OPERADOR */

  on(
    'btnOrgBack',
    'click',
    () =>
      withPending(
        () =>
          showScreen(
            'role'
          )
      )
  );

  on(
    'openControlFromMenu',
    'click',
    () =>
      showScreen(
        'control'
      )
  );

  /* ENCERRAR */

  on(
    'btnEnd',
    'click',
    () =>
      openConfirm(
        'Encerrar partida?',
        'A operação será encerrada neste aparelho.',
        'ENCERRAR',
        () =>
          endMatch(
            'PARTIDA ENCERRADA PELO OPERADOR.'
          )
      )
  );

  on(
    'btnControlBack',
    'click',
    () =>
      showScreen(
        'organizer'
      )
  );

  on(
    'btnControlEnd',
    'click',
    () =>
      openConfirm(
        'Encerrar partida?',
        'A operação será encerrada.',
        'ENCERRAR',
        () =>
          endMatch(
            'PARTIDA ENCERRADA PELO OPERADOR.'
          )
      )
  );

  /* BOMBA */

  on(
    'btnTransferBomb',
    'click',
    transferBomb
  );

  on(
    'btnChangeBombTime',
    'click',
    changeBombTime
  );

  on(
    'btnApplyLiveRules',
    'click',
    applyLiveRules
  );

  /* PLAYER */

  on(
    'btnConfirm',
    'click',
    () => {
      const player =
        currentPlayer();

      if (!player) {
        return;
      }

      player.confirmed =
        true;

      saveState();

      renderPlayer();

      toast(
        'PRESENÇA CONFIRMADA.'
      );
    }
  );

  on(
    'btnEnter',
    'click',
    () => {
      if (
        state.match.status ===
        'live'
      ) {
        showScreen(
          'player'
        );
      } else {
        toast(
          'AGUARDE O OPERADOR INICIAR.'
        );
      }
    }
  );

  on(
    'btnPlayerBack',
    'click',
    () =>
      showScreen(
        'role'
      )
  );

  on(
    'btnPlayerBackReady',
    'click',
    () =>
      showScreen(
        'role'
      )
  );

  on(
    'btnLeave',
    'click',
    () =>
      showScreen(
        'role'
      )
  );

  on(
    'btnHit',
    'click',
    hitPlayer
  );

  on(
    'btnOrgFromGame',
    'click',
    () =>
      showScreen(
        'control'
      )
  );

  on(
    'btnEndFromGame',
    'click',
    () =>
      openConfirm(
        'Encerrar partida?',
        'A operação será encerrada.',
        'ENCERRAR',
        () =>
          endMatch(
            'PARTIDA ENCERRADA PELO OPERADOR.'
          )
      )
  );

  /* PENDING */

  on(
    'pendingApply',
    'click',
    () => {
      state.match =
        deepClone(
          draft
        );

      state.match.players =
        createPlayers(
          state.match.playerCount,
          state.match.players
        );

      appliedSnapshot =
        deepClone(
          draft
        );

      saveState();

      const action =
        pendingAction;

      pendingAction =
        null;

      closeOverlay(
        'pendingModal'
      );

      toast(
        'ALTERAÇÕES APLICADAS.'
      );

      action?.();
    }
  );

  on(
    'pendingDiscard',
    'click',
    () => {
      restoreDraft();

      const action =
        pendingAction;

      pendingAction =
        null;

      closeOverlay(
        'pendingModal'
      );

      toast(
        'ALTERAÇÕES DESCARTADAS.'
      );

      action?.();
    }
  );

  on(
    'pendingCancel',
    'click',
    () => {
      pendingAction =
        null;

      closeOverlay(
        'pendingModal'
      );
    }
  );

  /* CONFIRM */

  on(
    'confirmCancel',
    'click',
    closeConfirm
  );

  on(
    'confirmOk',
    'click',
    () => {
      const callback =
        confirmCallback;

      closeConfirm();

      callback?.();
    }
  );

  /* EDITOR */

  on(
    'mapEditorApply',
    'click',
    () => {
      closeOverlay(
        'mapEditorModal'
      );

      drawPreview();

      toast(
        'MAPA ATUALIZADO.'
      );
    }
  );

  on(
    'mapEditorClose',
    'click',
    () =>
      closeOverlay(
        'mapEditorModal'
      )
  );

  on(
    'zoomIn',
    'click',
    () => {
      editor.zoom =
        Math.min(
          4,
          editor.zoom + .25
        );

      drawEditor();
    }
  );

  on(
    'zoomOut',
    'click',
    () => {
      editor.zoom =
        Math.max(
          .75,
          editor.zoom - .25
        );

      drawEditor();
    }
  );

  on(
    'zoomReset',
    'click',
    () => {
      editor.zoom =
        1;

      editor.panX =
        0;

      editor.panY =
        0;

      drawEditor();
    }
  );

  on(
    'toolPan',
    'click',
    () => {
      editor.mode =
        'pan';

      $$('.editor-tools .tool-btn')
        .forEach(
          button =>
            button.classList.remove(
              'selected'
            )
        );

      $('toolPan')
        ?.classList.add(
          'selected'
        );
    }
  );

  on(
    'toolErase',
    'click',
    () => {
      editor.mode =
        editor.mode ===
        'erase'
          ? 'pan'
          : 'erase';

      $('toolErase')
        ?.classList.toggle(
          'selected',
          editor.mode ===
          'erase'
        );
    }
  );

  on(
    'toolResetView',
    'click',
    () => {
      editor.zoom =
        1;

      editor.panX =
        0;

      editor.panY =
        0;

      drawEditor();
    }
  );

  /* PLAYER ZOOM */

  on(
    'playerZoomIn',
    'click',
    () => {
      playerViewer.zoom =
        Math.min(
          4,
          playerViewer.zoom + .25
        );

      drawPlayerMap();
    }
  );

  on(
    'playerZoomOut',
    'click',
    () => {
      playerViewer.zoom =
        Math.max(
          .75,
          playerViewer.zoom - .25
        );

      drawPlayerMap();
    }
  );

  on(
    'playerMapCenter',
    'click',
    () => {
      playerViewer.zoom =
        1;

      playerViewer.panX =
        0;

      playerViewer.panY =
        0;

      drawPlayerMap();
    }
  );

  /* EDITOR POINTER */

  const editorCanvas =
    $('mapEditorCanvas');

  if (editorCanvas) {

    editorCanvas.addEventListener(
      'pointerdown',
      event => {
        editorCanvas.setPointerCapture?.(
          event.pointerId
        );

        const position =
          normalizedPoint(
            event,
            editorCanvas
          );

        const mark =
          findMarkAt(
            position.x,
            position.y
          );

        if (
          editor.mode ===
          'erase'
        ) {
          if (mark) {
            deleteMark(
              mark.id
            );
          }

          return;
        }

        if (
          TOOLS[
            editor.mode
          ]
        ) {
          addMapMark(
            editor.mode,
            position.x,
            position.y
          );

          editor.mode =
            'pan';

          $('toolPan')
            ?.classList.add(
              'selected'
            );

          return;
        }

        editor.selectedId =
          mark?.id ||
          null;

        editor.drag = {
          x:
            event.clientX,

          y:
            event.clientY,

          mode:
            mark
              ? 'mark'
              : 'pan',

          markId:
            mark?.id,

          markX:
            mark?.x,

          markY:
            mark?.y,

          panX:
            editor.panX,

          panY:
            editor.panY
        };

        renderInspector();
        drawEditor();
      }
    );

    editorCanvas.addEventListener(
      'pointermove',
      event => {
        if (!editor.drag) {
          return;
        }

        const rect =
          editorCanvas.getBoundingClientRect();

        const dx =
          event.clientX -
          editor.drag.x;

        const dy =
          event.clientY -
          editor.drag.y;

        if (
          editor.drag.mode ===
          'mark'
        ) {
          const box =
            mapBox(
              rect.width,
              rect.height,
              editor.zoom,
              editor.panX,
              editor.panY
            );

          const mark =
            mapMarks().find(
              item =>
                item.id ===
                editor.drag
                  .markId
            );

          if (mark) {
            mark.x =
              Math.max(
                0,
                Math.min(
                  1,
                  editor.drag.markX +
                    dx / box.width
                )
              );

            mark.y =
              Math.max(
                0,
                Math.min(
                  1,
                  editor.drag.markY +
                    dy / box.height
                )
              );

            drawEditor();
          }
        } else {
          editor.panX =
            editor.drag.panX +
            dx;

          editor.panY =
            editor.drag.panY +
            dy;

          drawEditor();
        }
      }
    );

    [
      'pointerup',
      'pointercancel'
    ].forEach(
      eventName => {
        editorCanvas.addEventListener(
          eventName,
          () => {
            if (
              editor.drag?.mode ===
              'mark'
            ) {
              drawPreview();
            }

            editor.drag =
              null;
          }
        );
      }
    );
  }

  /* CROP */

  on(
    'cropOk',
    'click',
    applyCrop
  );

  on(
    'cropCancel',
    'click',
    () => {
      cropImage =
        null;

      closeOverlay(
        'cropModal'
      );
    }
  );

  const cropBox =
    $('cropBox');

  const cropStage =
    $('cropStage');

  if (
    cropBox &&
    cropStage
  ) {
    cropBox.addEventListener(
      'pointerdown',
      event => {
        event.preventDefault();

        const rect =
          cropBox.getBoundingClientRect();

        cropBoxDrag = {
          x:
            event.clientX,

          y:
            event.clientY,

          rect:
            deepClone(
              cropRect
            ),

          resize:
            event.clientX >
              rect.right - 24 &&
            event.clientY >
              rect.bottom - 24
        };
      }
    );

    cropStage.addEventListener(
      'pointermove',
      event => {
        if (!cropBoxDrag) {
          return;
        }

        const rect =
          cropStage.getBoundingClientRect();

        const dx =
          (
            event.clientX -
            cropBoxDrag.x
          ) /
          rect.width *
          100;

        const dy =
          (
            event.clientY -
            cropBoxDrag.y
          ) /
          rect.height *
          100;

        if (
          cropBoxDrag.resize
        ) {
          cropRect.w =
            Math.max(
              12,
              Math.min(
                100 - cropRect.x,
                cropBoxDrag.rect.w +
                  dx
              )
            );

          cropRect.h =
            Math.max(
              12,
              Math.min(
                100 - cropRect.y,
                cropBoxDrag.rect.h +
                  dy
              )
            );
        } else {
          cropRect.x =
            Math.max(
              0,
              Math.min(
                100 - cropRect.w,
                cropBoxDrag.rect.x +
                  dx
              )
            );

          cropRect.y =
            Math.max(
              0,
              Math.min(
                100 - cropRect.h,
                cropBoxDrag.rect.y +
                  dy
              )
            );
        }

        positionCrop();
      }
    );

    cropStage.addEventListener(
      'pointerup',
      () =>
        cropBoxDrag =
          null
    );

    cropStage.addEventListener(
      'pointercancel',
      () =>
        cropBoxDrag =
          null
    );
  }
}

/* =========================
   MAP COORDINATE
========================= */

function normalizedPoint(
  event,
  canvas
) {
  const rect =
    canvas.getBoundingClientRect();

  const px =
    event.clientX -
    rect.left;

  const py =
    event.clientY -
    rect.top;

  const box =
    mapBox(
      rect.width,
      rect.height,
      editor.zoom,
      editor.panX,
      editor.panY
    );

  if (
    box.width <= 0 ||
    box.height <= 0
  ) {
    return {
      x: .5,
      y: .5
    };
  }

  return {
    x:
      Math.max(
        0,
        Math.min(
          1,
          (
            px -
            box.left
          ) / box.width
        )
      ),

    y:
      Math.max(
        0,
        Math.min(
          1,
          (
            py -
            box.top
          ) / box.height
        )
      )
  };
}

/* =========================
   GLOBAL ERRORS
========================= */

window.addEventListener(
  'error',
  event => {
    console.error(
      '[DF] Erro JavaScript:',
      event.error || event.message
    );

    toast(
      'ERRO NO APLICATIVO · VEJA O CONSOLE.'
    );
  }
);

window.addEventListener(
  'unhandledrejection',
  event => {
    console.error(
      '[DF] Promise rejeitada:',
      event.reason
    );
  }
);

/* =========================
   TIMER
========================= */

setInterval(
  () => {
    simulatePlayers();
    updateHeader();

    if (
      activeScreen ===
      'player'
    ) {
      renderPlayer();
    }

    if (
      activeScreen ===
      'control'
    ) {
      renderControl();
    }
  },
  1000
);

/* =========================
   RESIZE
========================= */

window.addEventListener(
  'resize',
  () => {
    drawPreview();

    const editorModal =
      $('mapEditorModal');

    if (
      editorModal &&
      !editorModal.classList.contains(
        'hidden'
      )
    ) {
      drawEditor();
    }

    const cropModal =
      $('cropModal');

    if (
      cropModal &&
      !cropModal.classList.contains(
        'hidden'
      )
    ) {
      drawCrop();
    }

    if (
      activeScreen ===
      'player'
    ) {
      drawPlayerMap();
    }
  }
);

/* =========================
   INIT
========================= */

function init() {
  state.match.players =
    createPlayers(
      state.match.playerCount,
      state.match.players
    );

  draft =
    deepClone(
      state.match
    );

  appliedSnapshot =
    deepClone(
      draft
    );

  saveState();

  bindEvents();

  updateHeader();

  const savedRole =
    role();

  if (
    savedRole === 'player' ||
    savedRole === 'organizer'
  ) {
    setRole(
      savedRole
    );

    showScreen(
      savedRole === 'organizer' &&
      state.match.status === 'live'
        ? 'control'
        : savedRole
    );
  } else {
    showScreen(
      'role'
    );
  }

  renderModeModal();
  syncDraftFields();

  /*
    O GPS é solicitado depois
    da interface estar pronta.
  */
  setTimeout(
    requestGps,
    150
  );
}

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    init,
    {
      once: true
    }
  );
} else {
  init();
}