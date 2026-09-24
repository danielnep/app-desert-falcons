const KEYS = {
  state: 'df_airsoft_state_v4',
  role: 'df_airsoft_role_v4'
};

const DEFAULT_STATE = {
  role: null,
  gps: { lat: null, lng: null, accuracy: null, updatedAt: null },
  match: {
    name: '',
    location: '',
    durationMin: 60,
    status: 'none', // none | open | live | ended
    startAt: null,
    endAt: null,
    playerCount: 5,
    teams: ['A', 'B'],
    modes: ['flag'],
    mergeModes: false,
    livesPerPlayer: 3,
    respawnDelay: 60,
    respawnPolicy: 'nearest',
    teamVisibility: 'always',
    enemyVisibility: 'bomb-only',
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
      lng: null,
      disarmProgress: 0
    },
    map: {
      dataUrl: '',
      naturalWidth: 0,
      naturalHeight: 0,
      marks: [],
      version: 0
    },
    players: [],
    scores: { A: 0, B: 0 },
    hits: { A: 0, B: 0 },
    zones: {},
    logs: []
  }
};

const MODE_DEFS = {
  flag: {
    label: 'Captura de Bandeira',
    icon: '⚑',
    description: 'Bandeiras e bases.',
    feature: 'Bandeiras'
  },
  bomb: {
    label: 'Bomba',
    icon: '◉',
    description: 'Portador, bomba, desarme e explosão.',
    feature: 'Bomba'
  },
  zone: {
    label: 'Controle de Zonas',
    icon: '◎',
    description: 'Zonas e captura por permanência.',
    feature: 'Zonas'
  },
  respawn: {
    label: 'Eliminação + Respawn',
    icon: '↻',
    description: 'Vidas, hit e retorno às bases.',
    feature: 'Respawn'
  }
};

const FEATURE_TOOLS = {
  zone: {
    key: 'zone',
    label: 'Zona',
    icon: '◎',
    help: 'Área numerada de captura.'
  },
  base: {
    key: 'base',
    label: 'Base',
    icon: '■',
    help: 'Ponto quadrado de respawn.'
  },
  flag: {
    key: 'flag',
    label: 'Bandeira',
    icon: '⚑',
    help: 'Objetivo de captura.'
  },
  bomb: {
    key: 'bomb',
    label: 'Área da bomba',
    icon: '◉',
    help: 'Local onde a bomba pode ser armada.'
  }
};

const state = loadState();

let currentGpsWatch = null;
let activeScreen = 'role';
let organizerStep = 1;
let appliedSnapshot = null;
let pendingNavigation = null;
let toastTimer = null;
let audioContext = null;
let lastProximityBeep = 0;
let cropImage = null;
let cropRect = { x: 5, y: 5, w: 90, h: 90 };
let cropPointer = null;

let editor = {
  zoom: 1,
  panX: 0,
  panY: 0,
  tool: 'pan',
  erase: false,
  selectedId: null,
  dragging: false,
  dragStart: null
};

const $ = (id) => document.getElementById(id);

const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector)
];

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mergeDeep(target, source) {
  if (!source || typeof source !== 'object') return target;

  for (const [key, value] of Object.entries(source)) {
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

      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }

  return target;
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEYS.state);
    const parsed = raw ? JSON.parse(raw) : {};

    const result = mergeDeep(
      deepClone(DEFAULT_STATE),
      parsed
    );

    if (
      !Array.isArray(result.match.players) ||
      result.match.players.length === 0
    ) {
      result.match.players = createMockPlayers(
        result.match.playerCount || 5
      );
    }

    return result;
  } catch {
    return deepClone(DEFAULT_STATE);
  }
}

function persistState() {
  try {
    localStorage.setItem(
      KEYS.state,
      JSON.stringify(state)
    );
  } catch {}
}

function loadRole() {
  return (
    localStorage.getItem(KEYS.role) ||
    state.role ||
    null
  );
}

function saveRole(role) {
  state.role = role;

  localStorage.setItem(KEYS.role, role);

  persistState();
}

function formatSeconds(totalSeconds) {
  const sec = Math.max(
    0,
    Math.floor(Number(totalSeconds) || 0)
  );

  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(
      2,
      '0'
    )}:${String(s).padStart(2, '0')}`;
  }

  return `${String(m).padStart(2, '0')}:${String(s).padStart(
    2,
    '0'
  )}`;
}

function objectiveLabel() {
  const modes = state.match.modes || [];

  if (!modes.length) {
    return 'Sem objetivo definido';
  }

  if (modes.length === 1) {
    return (
      MODE_DEFS[modes[0]]?.label ||
      modes[0]
    );
  }

  return modes
    .map((mode) => MODE_DEFS[mode]?.label || mode)
    .join(' + ');
}

function showToast(message, duration = 2300) {
  const el = $('toast');

  if (!el) return;

  el.textContent = message;
  el.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, duration);
}

function setModal(el, open) {
  if (!el) return;

  el.classList.toggle('hidden', !open);

  el.setAttribute(
    'aria-hidden',
    open ? 'false' : 'true'
  );
}

function confirmAction({
  title,
  text,
  kicker = 'CONFIRMAÇÃO',
  ok = 'CONFIRMAR',
  cancel = 'CANCELAR',
  tone = 'danger',
  onOk
}) {
  const modal = $('confirmModal');

  if (!modal) return;

  const kickerEl = $('confirmModalKicker');
  const titleEl = $('confirmModalTitle');
  const textEl = $('confirmModalText');
  const okBtn = $('confirmModalOk');
  const cancelBtn = $('confirmModalCancel');

  if (!kickerEl || !titleEl || !textEl || !okBtn || !cancelBtn) {
    return;
  }

  kickerEl.textContent = kicker;
  titleEl.textContent = title;
  textEl.textContent = text;

  okBtn.textContent = ok;
  okBtn.className = `btn ${tone} selectable`;

  setModal(modal, true);

  const clean = () => {
    setModal(modal, false);
    cancelBtn.onclick = null;
    okBtn.onclick = null;
  };

  cancelBtn.onclick = clean;

  okBtn.onclick = () => {
    clean();
    onOk?.();
  };
}

function screenHasPendingChanges() {
  if (!appliedSnapshot) return false;

  return (
    organizerStep >= 1 &&
    JSON.stringify(readOrganizerForm()) !==
      JSON.stringify(appliedSnapshot)
  );
}

function requestNavigation(action) {
  if (screenHasPendingChanges()) {
    pendingNavigation = action;

    setModal(
      $('pendingModal'),
      true
    );

    return;
  }

  action();
}

function showScreen(screenName) {
  $$('.screen').forEach((section) => {
    section.classList.toggle(
      'active',
      section.dataset.screen === screenName
    );
  });

  activeScreen = screenName;

  window.scrollTo?.(0, 0);

  if (screenName === 'organizer') {
    syncOrganizerFormFromState();
    renderOrganizerAll();
  }

  if (screenName === 'player') {
    renderPlayer();
  }

  if (screenName === 'control') {
    renderControlPanel();
  }
}

function setRoleAndOpen(role) {
  saveRole(role);

  $$('.role-card').forEach((btn) => {
    btn.classList.toggle(
      'selected',
      btn.dataset.role === role
    );
  });

  if (role === 'player') {
    showScreen('player');
    renderPlayer();
    return;
  }

  if (role === 'organizer') {
    if (state.match.status === 'live') {
      showScreen('control');
    } else {
      showScreen('organizer');
      organizerStep = 1;
      updateWizardStep();
    }
  }
}

function getCurrentPlayer() {
  const real = state.match.players.find(
    (player) => player.isMe
  );

  if (real) return real;

  return state.match.players[0] || null;
}

function createMockPlayers(count = 5) {
  const total = Math.max(
    1,
    Math.min(20, Number(count) || 5)
  );

  const teamA = Math.max(
    1,
    Math.ceil(total / 2)
  );

  const positionsA = [
    [.25, .75],
    [.34, .67],
    [.42, .58],
    [.18, .57],
    [.28, .50]
  ];

  const positionsB = [
    [.72, .22],
    [.67, .32],
    [.58, .40],
    [.82, .40],
    [.74, .50]
  ];

  const list = [];

  for (let i = 1; i <= total; i++) {
    const team = i <= teamA ? 'A' : 'B';

    const idx =
      team === 'A'
        ? i - 1
        : i - teamA - 1;

    const pos =
      team === 'A'
        ? positionsA[idx % positionsA.length]
        : positionsB[idx % positionsB.length];

    list.push({
      id: `${team}-${i}`,
      name: `Jogador ${i}`,
      team,
      lives: DEFAULT_STATE.match.livesPerPlayer,
      hits: 0,
      status: 'ATIVO',
      lat: null,
      lng: null,
      x: pos[0],
      y: pos[1],
      isMe: i === 1,
      mock: i !== 1,
      confirmed: false,
      carryingBomb:
        i === 3 && team === 'A'
    });
  }

  return list;
}

function ensurePlayers() {
  const target = Math.max(
    1,
    Math.min(
      20,
      Number(state.match.playerCount) || 5
    )
  );

  const current = state.match.players || [];

  if (current.length === target) {
    return;
  }

  state.match.players =
    createMockPlayers(target);

  persistState();
}

function currentTeam() {
  return getCurrentPlayer()?.team || 'A';
}

function allowedFeatures() {
  const modes = new Set(
    state.match.modes || []
  );

  return {
    zone: modes.has('zone'),
    base:
      modes.has('respawn') ||
      modes.has('flag') ||
      modes.has('bomb'),
    flag: modes.has('flag'),
    bomb: modes.has('bomb')
  };
}

function allMapMarks() {
  return Array.isArray(
    state.match.map.marks
  )
    ? state.match.map.marks
    : [];
}

function nextNumber(type) {
  return (
    allMapMarks().filter(
      (mark) => mark.type === type
    ).length + 1
  );
}

function addMark(type, x = 0.5, y = 0.5) {
  const allowed = allowedFeatures();

  if (!allowed[type]) {
    showToast(
      `O modo escolhido não permite ${
        FEATURE_TOOLS[type].label.toLowerCase()
      }.`
    );

    return;
  }

  const number = nextNumber(type);

  const mark = {
    id:
      `${type}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 7)}`,
    type,
    number,
    label:
      `${FEATURE_TOOLS[type].label} ${number}`,
    x: Math.max(
      0.03,
      Math.min(0.97, x)
    ),
    y: Math.max(
      0.03,
      Math.min(0.97, y)
    ),
    size:
      type === 'base'
        ? 0.22
        : type === 'zone'
        ? 0.23
        : 0.10
  };

  state.match.map.marks.push(mark);

  state.match.map.version += 1;

  persistState();

  editor.selectedId = mark.id;

  renderAllMaps();
  renderEditorInspector();

  showToast(
    `${mark.label} adicionada.`
  );
}

function removeMark(id) {
  const mark =
    state.match.map.marks.find(
      (item) => item.id === id
    );

  if (!mark) return;

  confirmAction({
    title: `Apagar ${mark.label}?`,
    text:
      'O elemento será removido do mapa. A imagem original não será alterada.',
    ok: 'APAGAR',
    onOk: () => {
      state.match.map.marks =
        state.match.map.marks.filter(
          (item) => item.id !== id
        );

      renumberMarks(mark.type);

      editor.selectedId = null;

      persistState();

      renderAllMaps();
      renderEditorInspector();

      showToast('Elemento apagado.');
    }
  });
}

function renumberMarks(type) {
  let counter = 1;

  state.match.map.marks
    .filter(
      (mark) => mark.type === type
    )
    .forEach((mark) => {
      mark.number = counter;
      mark.label =
        `${FEATURE_TOOLS[type].label} ${counter}`;
      counter += 1;
    });
}

function updateMark(id, patch) {
  const mark =
    state.match.map.marks.find(
      (item) => item.id === id
    );

  if (!mark) return;

  Object.assign(mark, patch);

  persistState();

  renderAllMaps();
  renderEditorInspector();
}

function selectMarkAt(
  x,
  y,
  tolerance = 0.06
) {
  const marks = [
    ...state.match.map.marks
  ].reverse();

  for (const mark of marks) {
    const dx = x - mark.x;
    const dy = y - mark.y;

    const radius =
      Math.max(
        0.035,
        mark.size / 2
      ) + tolerance;

    if (
      Math.hypot(dx, dy) <=
      radius
    ) {
      return mark;
    }
  }

  return null;
}

function getContainedImageBox(
  width,
  height,
  image,
  zoom = 1,
  panX = 0,
  panY = 0
) {
  const iw =
    image?.naturalWidth ||
    state.match.map.naturalWidth ||
    width;

  const ih =
    image?.naturalHeight ||
    state.match.map.naturalHeight ||
    height;

  const scale = Math.min(
    width / Math.max(1, iw),
    height / Math.max(1, ih)
  );

  const baseW = iw * scale;
  const baseH = ih * scale;

  const baseX =
    (width - baseW) / 2;

  const baseY =
    (height - baseH) / 2;

  const boxW = baseW * zoom;
  const boxH = baseH * zoom;

  const boxX =
    width / 2 -
    boxW / 2 +
    panX;

  const boxY =
    height / 2 -
    boxH / 2 +
    panY;

  return {
    left: boxX,
    top: boxY,
    width: boxW,
    height: boxH
  };
}

function drawMark(
  ctx,
  mark,
  width,
  height,
  selected = false,
  playerView = false,
  mapBox = null
) {
  const box =
    mapBox || {
      left: 0,
      top: 0,
      width,
      height
    };

  const x =
    box.left +
    mark.x * box.width;

  const y =
    box.top +
    mark.y * box.height;

  const s = Math.max(
    18,
    mark.size *
      Math.min(
        box.width,
        box.height
      )
  );

  ctx.save();

  ctx.lineWidth =
    selected ? 3 : 2;

  const palette = {
    zone: {
      fill: 'rgba(90,143,90,.14)',
      stroke: '#5a8f5a'
    },
    base: {
      fill: 'rgba(74,122,74,.16)',
      stroke: '#4a7a4a'
    },
    flag: {
      fill: 'rgba(179,140,47,.16)',
      stroke: '#b38c2f'
    },
    bomb: {
      fill: 'rgba(160,72,72,.16)',
      stroke: '#a04848'
    }
  }[mark.type];

  ctx.fillStyle = palette.fill;
  ctx.strokeStyle = palette.stroke;

  if (mark.type === 'zone') {
    ctx.beginPath();

    ctx.arc(
      x,
      y,
      s / 2,
      0,
      Math.PI * 2
    );

    ctx.fill();
    ctx.stroke();
  } else if (mark.type === 'base') {
    ctx.beginPath();

    ctx.rect(
      x - s / 2,
      y - s / 2,
      s,
      s
    );

    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();

    ctx.arc(
      x,
      y,
      s / 2.6,
      0,
      Math.PI * 2
    );

    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle =
    palette.stroke;

  ctx.font =
    `800 ${Math.max(
      10,
      Math.min(16, s * 0.22)
    )}px system-ui, sans-serif`;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(
    mark.label.toUpperCase(),
    x,
    y
  );

  if (
    selected &&
    !playerView
  ) {
    ctx.setLineDash([
      5,
      4
    ]);

    ctx.strokeStyle =
      '#2a2622';

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      s / 2 + 6,
      0,
      Math.PI * 2
    );

    ctx.stroke();

    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawBombIndicator(
  ctx,
  bomb,
  width,
  height,
  isEnemy,
  mapBox = null
) {
  if (!bomb?.planted) {
    return;
  }

  const box =
    mapBox || {
      left: 0,
      top: 0,
      width,
      height
    };

  const x =
    box.left +
    bomb.x * box.width;

  const y =
    box.top +
    bomb.y * box.height;

  const r = Math.max(
    11,
    Math.min(
      box.width,
      box.height
    ) * 0.025
  );

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    r + 8,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = isEnemy
    ? 'rgba(160,72,72,.18)'
    : 'rgba(179,140,47,.18)';

  ctx.fill();

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    r,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    '#a04848';

  ctx.strokeStyle =
    '#fff';

  ctx.lineWidth = 3;

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle =
    '#fff';

  ctx.font =
    `900 ${Math.max(
      9,
      Math.min(12, r)
    )}px system-ui, sans-serif`;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(
    '💣',
    x,
    y
  );

  ctx.fillStyle =
    '#2a2622';

  ctx.font =
    '800 9px system-ui, sans-serif';

  ctx.textBaseline = 'top';

  ctx.fillText(
    'BOMBA',
    x,
    y + r + 8
  );

  ctx.restore();
}

function drawPlayer(
  ctx,
  player,
  width,
  height,
  isEnemy = false,
  mapBox = null
) {
  if (
    isEnemy &&
    state.match.teamVisibility === 'off'
  ) {
    return;
  }

  const box =
    mapBox || {
      left: 0,
      top: 0,
      width,
      height
    };

  const x =
    box.left +
    player.x * box.width;

  const y =
    box.top +
    player.y * box.height;

  const r = Math.max(
    8,
    Math.min(
      box.width,
      box.height
    ) * 0.018
  );

  ctx.save();

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    r + 4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = isEnemy
    ? 'rgba(160,72,72,.18)'
    : 'rgba(139,107,74,.18)';

  ctx.fill();

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    r,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    player.isMe
      ? '#e9d47a'
      : isEnemy
      ? '#a04848'
      : '#8b6b4a';

  ctx.strokeStyle =
    '#fff';

  ctx.lineWidth = 2;

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle =
    '#2a2622';

  ctx.font =
    `700 ${Math.max(
      8,
      Math.min(11, r * 0.9)
    )}px system-ui, sans-serif`;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillText(
    player.isMe
      ? 'VOCÊ'
      : player.name.toUpperCase(),
    x,
    y + r + 6
  );

  ctx.restore();
}

function markVisibleInCurrentMap(
  mark,
  playerView = false
) {
  const allowed =
    allowedFeatures();

  if (!allowed[mark.type]) {
    return false;
  }

  if (
    playerView &&
    mark.type === 'bomb'
  ) {
    return false;
  }

  return true;
}

function resizeCanvas(canvas) {
  if (!canvas) {
    return null;
  }

  const rect =
    canvas.getBoundingClientRect();

  const dpr = Math.min(
    2,
    window.devicePixelRatio || 1
  );

  const w = Math.max(
    1,
    Math.floor(rect.width * dpr)
  );

  const h = Math.max(
    1,
    Math.floor(rect.height * dpr)
  );

  if (
    canvas.width !== w ||
    canvas.height !== h
  ) {
    canvas.width = w;
    canvas.height = h;
  }

  return {
    width: rect.width,
    height: rect.height,
    dpr
  };
}

function renderMap(
  canvas,
  image,
  options = {}
) {
  if (!canvas) {
    return;
  }

  const metrics =
    resizeCanvas(canvas);

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

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();

  ctx.scale(dpr, dpr);

  const box =
    getContainedImageBox(
      width,
      height,
      image,
      1,
      0,
      0
    );

  for (
    const mark of allMapMarks()
  ) {
    if (
      !markVisibleInCurrentMap(
        mark,
        Boolean(options.playerView)
      )
    ) {
      continue;
    }

    drawMark(
      ctx,
      mark,
      width,
      height,
      Boolean(
        mark.id === editor.selectedId &&
        options.editor
      ),
      Boolean(options.playerView),
      box
    );
  }

  if (options.playerView) {
    drawBombIndicator(
      ctx,
      state.match.bomb,
      width,
      height,
      state.match.bomb.armedByTeam !==
        currentTeam(),
      box
    );

    const players =
      state.match.players || [];

    const meTeam =
      currentTeam();

    players.forEach(
      (player) => {
        if (
          player.status ===
          'FORA DA OPERAÇÃO'
        ) {
          return;
        }

        if (
          player.team === meTeam
        ) {
          drawPlayer(
            ctx,
            player,
            width,
            height,
            false,
            box
          );
        }
      }
    );
  }

  ctx.restore();
}

function renderAllMaps() {
  const orgImg =
    $('mapImg');

  const orgCanvas =
    $('mapCanvas');

  const playerImg =
    $('playerMapImg');

  const playerCanvas =
    $('playerMapCanvas');

  const editorImg =
    $('mapEditorImg');

  if (
    state.match.map.dataUrl
  ) {
    [
      orgImg,
      playerImg,
      editorImg
    ]
      .filter(Boolean)
      .forEach((img) => {
        if (
          img.src !==
          state.match.map.dataUrl
        ) {
          img.src =
            state.match.map.dataUrl;
        }

        img.classList.add(
          'show'
        );
      });
  } else {
    [
      orgImg,
      playerImg,
      editorImg
    ]
      .filter(Boolean)
      .forEach((img) => {
        img.classList.remove(
          'show'
        );
      });
  }

  renderMap(
    orgCanvas,
    orgImg,
    {
      editor: false,
      playerView: false
    }
  );

  renderMap(
    playerCanvas,
    playerImg,
    {
      playerView: true
    }
  );

  renderEditorCanvas();
}

function renderEditorCanvas() {
  const canvas =
    $('mapEditorCanvas');

  const img =
    $('mapEditorImg');

  if (!canvas) {
    return;
  }

  const metrics =
    resizeCanvas(canvas);

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

  const box =
    getContainedImageBox(
      width,
      height,
      img,
      editor.zoom,
      editor.panX,
      editor.panY
    );

  for (
    const mark of allMapMarks()
  ) {
    if (
      !markVisibleInCurrentMap(
        mark,
        false
      )
    ) {
      continue;
    }

    drawMark(
      ctx,
      mark,
      width,
      height,
      mark.id === editor.selectedId,
      false,
      box
    );
  }

  ctx.restore();

  if (img) {
    img.style.transform =
      `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`;
    img.style.transformOrigin =
      'center center';
  }

  const zoomValue =
    $('zoomValue');

  if (zoomValue) {
    zoomValue.textContent =
      `${Math.round(
        editor.zoom * 100
      )}%`;
  }

  const preview =
    $('mapPreviewZoom');

  if (preview) {
    preview.textContent =
      `${Math.round(
        editor.zoom * 100
      )}%`;
  }
}

function editorClientToNormalized(
  event
) {
  const canvas =
    $('mapEditorCanvas');

  const img =
    $('mapEditorImg');

  const rect =
    canvas.getBoundingClientRect();

  const px =
    event.clientX -
    rect.left;

  const py =
    event.clientY -
    rect.top;

  const box =
    getContainedImageBox(
      rect.width,
      rect.height,
      img,
      editor.zoom,
      editor.panX,
      editor.panY
    );

  if (
    box.width <= 0 ||
    box.height <= 0
  ) {
    return {
      x: 0.5,
      y: 0.5
    };
  }

  return {
    x: Math.max(
      0,
      Math.min(
        1,
        (px - box.left) /
          box.width
      )
    ),
    y: Math.max(
      0,
      Math.min(
        1,
        (py - box.top) /
          box.height
      )
    )
  };
}

function openMapEditor() {
  if (
    !state.match.map.dataUrl
  ) {
    showToast(
      'Envie ou gere um mapa primeiro.'
    );

    return;
  }

  editor.zoom = 1;
  editor.panX = 0;
  editor.panY = 0;
  editor.tool = 'pan';
  editor.erase = false;
  editor.selectedId = null;

  setModal(
    $('mapEditorModal'),
    true
  );

  renderEditorTools();
  renderEditorInspector();

  setTimeout(
    renderEditorCanvas,
    30
  );
}

function closeMapEditor() {
  setModal(
    $('mapEditorModal'),
    false
  );

  editor.selectedId = null;

  renderMap(
    $('mapCanvas'),
    $('mapImg'),
    {}
  );
}

function renderEditorTools() {
  const holder =
    $('editorTools');

  if (!holder) {
    return;
  }

  holder.innerHTML = '';

  const allowed =
    allowedFeatures();

  Object.keys(
    FEATURE_TOOLS
  ).forEach((type) => {
    const item =
      FEATURE_TOOLS[type];

    const btn =
      document.createElement(
        'button'
      );

    btn.type = 'button';

    btn.className =
      'tool-btn editor-tool selectable';

    if (!allowed[type]) {
      btn.classList.add(
        'disabled'
      );

      btn.disabled = true;

      btn.title =
        `O modo atual não permite ${item.label}.`;
    }

    btn.innerHTML =
      `<strong>${item.icon} ${item.label}</strong><small>${item.help}</small>`;

    btn.addEventListener(
      'click',
      () => {
        if (!allowed[type]) {
          showToast(
            `O modo escolhido não permite ${item.label.toLowerCase()}.`
          );

          return;
        }

        editor.tool = type;
        editor.erase = false;

        setSelectedButton(
          btn,
          true
        );

        showToast(
          `Toque no mapa para adicionar ${item.label.toLowerCase()}.`
        );
      }
    );

    holder.appendChild(btn);
  });
}

function renderEditorInspector() {
  const panel =
    $('elementInspector');

  const content =
    $('inspectorContent');

  if (!panel || !content) {
    return;
  }

  const mark =
    state.match.map.marks.find(
      (item) =>
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

  content.innerHTML = `
    <div class="field">
      <span>Nome</span>
      <input id="inspectorName" value="${escapeHtml(mark.label)}" maxlength="36">
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
        ${Math.round(mark.size * 100)}%
      </small>
    </div>

    <div class="inspector-actions">
      <button
        type="button"
        class="tool-btn selectable"
        id="inspectorSave"
      >
        APLICAR
      </button>

      <button
        type="button"
        class="tool-btn danger-tool selectable"
        id="inspectorDelete"
      >
        🗑 APAGAR
      </button>
    </div>
  `;

  $('inspectorSize').addEventListener(
    'input',
    (event) => {
      const size =
        Number(event.target.value);

      $('inspectorSizeValue')
        .textContent =
        `${Math.round(
          size * 100
        )}%`;

      mark.size = size;

      persistState();

      renderAllMaps();
    }
  );

  $('inspectorSave').addEventListener(
    'click',
    () => {
      const label =
        $('inspectorName')
          .value
          .trim();

      if (label) {
        mark.label = label;
      }

      persistState();

      renderAllMaps();

      showToast(
        'Elemento atualizado.'
      );
    }
  );

  $('inspectorDelete').addEventListener(
    'click',
    () =>
      removeMark(mark.id)
  );
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[char]
  );
}

function updateWizardStep() {
  $$('.wizard-tab').forEach(
    (tab) => {
      tab.classList.toggle(
        'active',
        Number(tab.dataset.step) ===
          organizerStep
      );
    }
  );

  $$('.wizard-step').forEach(
    (panel) => {
      panel.classList.toggle(
        'active',
        Number(
          panel.dataset.stepPanel
        ) === organizerStep
      );
    }
  );

  $('wizardBack')
    .classList.toggle(
      'hidden',
      organizerStep === 1
    );

  $('wizardNext')
    .classList.toggle(
      'hidden',
      organizerStep === 3
    );

  $('wizardNext').textContent =
    organizerStep === 2
      ? 'IR PARA O MAPA'
      : 'AVANÇAR';

  updateFeatureSectionsEnabled();
  updateOperationSummary();
}

function readOrganizerForm() {
  return {
    name:
      $('oName')?.value.trim() ||
      '',

    location:
      $('oLoc')?.value.trim() ||
      '',

    durationMin:
      Math.max(
        10,
        Math.min(
          480,
          Number(
            $('oDur')?.value
          ) || 60
        )
      ),

    modes: [
      ...$$('.mode-card.active')
    ].map(
      (btn) =>
        btn.dataset.mode
    ),

    mergeModes:
      Boolean(
        $('mergeModes')?.checked
      ),

    livesPerPlayer:
      Math.max(
        1,
        Math.min(
          20,
          Number(
            $('livesPerPlayer')?.value
          ) || 3
        )
      ),

    respawnDelay:
      Math.max(
        0,
        Math.min(
          900,
          Number(
            $('respawnDelay')?.value
          ) || 60
        )
      ),

    respawnPolicy:
      $('respawnPolicy')?.value ||
      'nearest',

    teamVisibility:
      $('teamVisibility')?.value ||
      'always',

    enemyVisibility:
      $('enemyVisibility')?.value ||
      'bomb-only',

    enemyVisibilitySeconds:
      Math.max(
        5,
        Math.min(
          900,
          Number(
            $('enemyVisibilitySeconds')?.value
          ) || 60
        )
      ),

    zoneCaptureSeconds:
      Math.max(
        1,
        Math.min(
          1800,
          Number(
            $('zoneCaptureSeconds')?.value
          ) || 30
        )
      ),

    zonePoints:
      Math.max(
        0,
        Math.min(
          10000,
          Number(
            $('zonePoints')?.value
          ) || 100
        )
      ),

    bomb: {
      bombsPerPlayer:
        Math.max(
          0,
          Math.min(
            20,
            Number(
              $('bombsPerPlayer')?.value
            ) || 3
          )
        ),

      durationMin:
        Math.max(
          1,
          Math.min(
            120,
            Number(
              $('bombDurationMin')?.value
            ) || 10
          )
        ),

      disarmSeconds:
        Math.max(
          1,
          Math.min(
            600,
            Number(
              $('bombDisarmSeconds')?.value
            ) || 20
          )
        ),

      blastRadius:
        Math.max(
          1,
          Math.min(
            500,
            Number(
              $('bombBlastRadius')?.value
            ) || 20
          )
        ),

      armPolicy:
        $('bombArmPolicy')?.value ||
        'areas',

      timingPolicy:
        $('bombTimingPolicy')?.value ||
        'predefined'
    }
  };
}

function applyOrganizerForm() {
  const form =
    readOrganizerForm();

  state.match.name =
    form.name ||
    'Operação Desert Falcons';

  state.match.location =
    form.location ||
    'Campo';

  state.match.durationMin =
    form.durationMin;

  state.match.modes =
    form.modes.length
      ? form.modes
      : ['flag'];

  state.match.mergeModes =
    form.mergeModes;

  state.match.livesPerPlayer =
    form.livesPerPlayer;

  state.match.respawnDelay =
    form.respawnDelay;

  state.match.respawnPolicy =
    form.respawnPolicy;

  state.match.teamVisibility =
    form.teamVisibility;

  state.match.enemyVisibility =
    form.enemyVisibility;

  state.match.enemyVisibilitySeconds =
    form.enemyVisibilitySeconds;

  state.match.zoneCaptureSeconds =
    form.zoneCaptureSeconds;

  state.match.zonePoints =
    form.zonePoints;

  Object.assign(
    state.match.bomb,
    form.bomb
  );

  ensurePlayers();

  state.match.players.forEach(
    (player) => {
      if (
        player.lives >
          form.livesPerPlayer ||
        player.lives == null
      ) {
        player.lives =
          form.livesPerPlayer;
      }
    }
  );

  persistState();

  appliedSnapshot =
    deepClone(
      readOrganizerForm()
    );

  renderOrganizerAll();

  showToast(
    'Alterações aplicadas.'
  );
}

function discardOrganizerChanges() {
  syncOrganizerFormFromSnapshot();

  showToast(
    'Alterações descartadas.'
  );
}

function syncOrganizerFormFromState() {
  $('oName').value =
    state.match.name || '';

  $('oLoc').value =
    state.match.location || '';

  $('oDur').value =
    state.match.durationMin ||
    60;

  $('mergeModes').checked =
    Boolean(
      state.match.mergeModes
    );

  $$('.mode-card').forEach(
    (btn) => {
      btn.classList.toggle(
        'active',
        state.match.modes.includes(
          btn.dataset.mode
        )
      );
    }
  );

  $('livesPerPlayer').value =
    state.match.livesPerPlayer ||
    3;

  $('respawnDelay').value =
    state.match.respawnDelay ??
    60;

  $('respawnPolicy').value =
    state.match.respawnPolicy ||
    'nearest';

  $('teamVisibility').value =
    state.match.teamVisibility ||
    'always';

  $('enemyVisibility').value =
    state.match.enemyVisibility ||
    'bomb-only';

  $('enemyVisibilitySeconds').value =
    state.match.enemyVisibilitySeconds ||
    60;

  $('zoneCaptureSeconds').value =
    state.match.zoneCaptureSeconds ||
    30;

  $('zonePoints').value =
    state.match.zonePoints ||
    100;

  $('bombsPerPlayer').value =
    state.match.bomb.bombsPerPlayer ??
    3;

  $('bombDurationMin').value =
    state.match.bomb.durationMin ??
    10;

  $('bombDisarmSeconds').value =
    state.match.bomb.disarmSeconds ??
    20;

  $('bombBlastRadius').value =
    state.match.bomb.blastRadius ??
    20;

  $('bombArmPolicy').value =
    state.match.bomb.armPolicy ||
    'areas';

  $('bombTimingPolicy').value =
    state.match.bomb.timingPolicy ||
    'predefined';

  appliedSnapshot =
    deepClone(
      readOrganizerForm()
    );
}

function syncOrganizerFormFromSnapshot() {
  if (!appliedSnapshot) {
    syncOrganizerFormFromState();
    return;
  }

  const snapshot =
    appliedSnapshot;

  $('oName').value =
    snapshot.name;

  $('oLoc').value =
    snapshot.location;

  $('oDur').value =
    snapshot.durationMin;

  $('mergeModes').checked =
    snapshot.mergeModes;

  $$('.mode-card').forEach(
    (btn) => {
      btn.classList.toggle(
        'active',
        snapshot.modes.includes(
          btn.dataset.mode
        )
      );
    }
  );

  $('livesPerPlayer').value =
    snapshot.livesPerPlayer;

  $('respawnDelay').value =
    snapshot.respawnDelay;

  $('respawnPolicy').value =
    snapshot.respawnPolicy;

  $('teamVisibility').value =
    snapshot.teamVisibility;

  $('enemyVisibility').value =
    snapshot.enemyVisibility;

  $('enemyVisibilitySeconds').value =
    snapshot.enemyVisibilitySeconds;

  $('zoneCaptureSeconds').value =
    snapshot.zoneCaptureSeconds;

  $('zonePoints').value =
    snapshot.zonePoints;

  $('bombsPerPlayer').value =
    snapshot.bomb.bombsPerPlayer;

  $('bombDurationMin').value =
    snapshot.bomb.durationMin;

  $('bombDisarmSeconds').value =
    snapshot.bomb.disarmSeconds;

  $('bombBlastRadius').value =
    snapshot.bomb.blastRadius;

  $('bombArmPolicy').value =
    snapshot.bomb.armPolicy;

  $('bombTimingPolicy').value =
    snapshot.bomb.timingPolicy;

  renderOrganizerAll();
}

function updateFeatureSectionsEnabled() {
  const allowed =
    allowedFeatures();

  $$('[data-feature-section]').forEach(
    (section) => {
      const type =
        section.dataset.featureSection;

      section.style.opacity =
        allowed[type]
          ? '1'
          : '.48';

      section.style.pointerEvents =
        allowed[type]
          ? 'auto'
          : 'none';
    }
  );

  const merge =
    $('mergeModes').checked;

  $('mergeHelp')
    .classList.toggle(
      'hidden',
      !merge
    );

  $('modeSelectionHelp')
    .textContent = merge
      ? 'Mais de um modo está ativo. O mapa e o HUD liberarão as características compatíveis.'
      : 'Selecione um modo. Ative “mesclar” para combinar vários.';
}

function updateFeatureMatrix() {
  const holder =
    $('featureMatrix');

  const allowed =
    allowedFeatures();

  holder.innerHTML = '';

  const items = [
    [
      'zone',
      '◎',
      'Zonas',
      'Zonas numeradas, captura e recompensa por permanência.'
    ],
    [
      'base',
      '■',
      'Bases',
      'Bases numeradas para objetivo e/ou respawn.'
    ],
    [
      'flag',
      '⚑',
      'Bandeiras',
      'Bandeiras e objetivo de captura.'
    ],
    [
      'bomb',
      '◉',
      'Bomba',
      'Portador, armamento, localização, desarme e explosão.'
    ]
  ];

  items.forEach(
    ([
      key,
      icon,
      title,
      description
    ]) => {
      const row =
        document.createElement(
          'div'
        );

      row.className =
        `feature-row ${
          allowed[key]
            ? ''
            : 'disabled'
        }`;

      row.innerHTML =
        `<span class="feature-icon">${icon}</span>
         <div>
           <strong>${title} ${
             allowed[key]
               ? '· ATIVO'
               : '· INATIVO'
           }</strong>
           <small>${description}</small>
         </div>`;

      holder.appendChild(row);
    }
  );
}

function renderMapToolSummary() {
  const holder =
    $('mapToolSummary');

  const allowed =
    allowedFeatures();

  holder.innerHTML = '';

  Object.keys(
    FEATURE_TOOLS
  ).forEach((type) => {
    const item =
      FEATURE_TOOLS[type];

    const chip =
      document.createElement(
        'div'
      );

    chip.className =
      `map-tool-chip ${
        allowed[type]
          ? ''
          : 'off'
      }`;

    chip.textContent =
      `${item.icon} ${item.label} — ${
        allowed[type]
          ? 'ATIVO'
          : 'INATIVO'
      }`;

    holder.appendChild(chip);
  });
}

function updateOperationSummary() {
  const holder =
    $('operationSummary');

  if (!holder) {
    return;
  }

  const bombMode =
    state.match.modes.includes(
      'bomb'
    );

  const zoneMode =
    state.match.modes.includes(
      'zone'
    );

  const summary = [
    [
      'Modo',
      objectiveLabel()
    ],
    [
      'Vidas',
      state.match.livesPerPlayer
    ],
    [
      'Respawn',
      formatSeconds(
        state.match.respawnDelay
      )
    ],
    [
      'GPS equipe',
      state.match.teamVisibility ===
      'always'
        ? 'Sempre'
        : state.match.teamVisibility ===
          'benefit'
        ? 'Benefício'
        : 'Desativado'
    ],
    [
      'Zonas',
      zoneMode
        ? `${state.match.zoneCaptureSeconds}s / ${state.match.zonePoints} pts`
        : 'Não usadas'
    ],
    [
      'Bomba',
      bombMode
        ? `${state.match.bomb.durationMin} min / ${state.match.bomb.bombsPerPlayer} por jogador`
        : 'Não usada'
    ]
  ];

  holder.innerHTML =
    summary
      .map(
        ([key, value]) =>
          `<div class="summary-chip">
            <span>${escapeHtml(key)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>`
      )
      .join('');
}

function renderOrganizerAll() {
  updateFeatureSectionsEnabled();
  updateFeatureMatrix();
  renderMapToolSummary();
  renderAllMaps();
  updateOperationSummary();
  updateActionButtons();

  if (
    !$('mergeModes').checked
  ) {
    const modeButtons =
      $$('.mode-card.active');

    if (
      modeButtons.length > 1
    ) {
      $$('.mode-card').forEach(
        (btn) => {
          btn.classList.toggle(
            'active',
            btn === modeButtons[0]
          );
        }
      );
    }
  }
}

function updateActionButtons() {
  const hasMatch =
    ['open', 'live'].includes(
      state.match.status
    );

  $('btnEnd')
    .classList.toggle(
      'hidden',
      !hasMatch
    );
}

function setSelectedButton(
  btn,
  selected
) {
  if (!btn) return;

  btn.classList.toggle(
    'selected',
    Boolean(selected)
  );

  btn.classList.toggle(
    'is-selected',
    Boolean(selected)
  );
}

function initGps() {
  if (
    !('geolocation' in navigator)
  ) {
    showGpsGate(
      'Seu navegador não oferece localização. Este protótipo exige GPS para o painel tático.'
    );

    return;
  }

  requestGps(false);
}

function showGpsGate(message) {
  const messageEl =
    $('gpsMessage');

  if (messageEl) {
    messageEl.textContent =
      message;
  }

  setModal(
    $('gpsGate'),
    true
  );
}

function hideGpsGate() {
  setModal(
    $('gpsGate'),
    false
  );
}

function requestGps(
  fromButton = false
) {
  if (!navigator.geolocation) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
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
        getCurrentPlayer();

      if (me) {
        me.lat =
          state.gps.lat;

        me.lng =
          state.gps.lng;

        me.mock = false;
      }

      persistState();

      hideGpsGate();

      startGpsWatch();

      renderPlayer();
    },
    (error) => {
      if (error?.code === 1) {
        showGpsGate(
          'A localização é obrigatória para o painel tático. Ative a permissão de localização do navegador e tente novamente.'
        );
      } else if (fromButton) {
        showGpsGate(
          'Não foi possível obter sua localização agora. Tente novamente.'
        );
      } else {
        showGpsGate(
          'Para usar o aplicativo, permita o acesso à localização.'
        );
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 3000
    }
  );
}

function startGpsWatch() {
  if (
    currentGpsWatch != null ||
    !navigator.geolocation
  ) {
    return;
  }

  currentGpsWatch =
    navigator.geolocation.watchPosition(
      (position) => {
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
          getCurrentPlayer();

        if (me) {
          me.lat =
            state.gps.lat;

          me.lng =
            state.gps.lng;

          me.mock = false;

          if (
            state.match.map.dataUrl
          ) {
            me.x = 0.5;
            me.y = 0.52;
          }
        }

        persistState();

        renderPlayer();
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 2000
      }
    );
}

function positionText() {
  if (!state.gps.updatedAt) {
    return 'GPS aguardando…';
  }

  const accuracy =
    Math.round(
      state.gps.accuracy || 0
    );

  return accuracy
    ? `GPS ±${accuracy} m`
    : 'GPS ativo';
}

function renderPlayer() {
  const match =
    state.match;

  const wait =
    $('playerWait');

  const ready =
    $('playerReady');

  const live =
    $('playerLive');

  if (
    !match ||
    !['open', 'live'].includes(
      match.status
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

  if (
    match.status === 'live'
  ) {
    ready.classList.add(
      'hidden'
    );

    live.classList.remove(
      'hidden'
    );

    renderLivePlayerHud();
  } else {
    ready.classList.remove(
      'hidden'
    );

    live.classList.add(
      'hidden'
    );

    const me =
      getCurrentPlayer();

    $('pName').textContent =
      match.name ||
      'Operação Desert Falcons';

    $('pLoc').textContent =
      match.location ||
      'Campo';

    $('pObj').textContent =
      objectiveLabel();

    $('pDur').textContent =
      `${match.durationMin} min`;

    $('pStatus').textContent =
      'ABERTA';

    $('pLivesReady')
      .textContent =
      `${me?.lives ?? match.livesPerPlayer} vida(s)`;

    $('pTeam').textContent =
      `EQUIPE ${
        me?.team || 'A'
      }`;

    $('btnConfirm')
      .classList.toggle(
        'is-selected',
        Boolean(
          me?.confirmed
        )
      );

    $('btnConfirm')
      .textContent =
      me?.confirmed
        ? 'PRESENÇA CONFIRMADA ✓'
        : 'CONFIRMAR PRESENÇA';

    $('btnEnter')
      .classList.toggle(
        'hidden',
        !me?.confirmed
      );
  }

  $('btnOrgFromGame')
    .classList.toggle(
      'hidden',
      state.role !==
        'organizer'
    );

  $('btnEndFromGame')
    .classList.toggle(
      'hidden',
      state.role !==
        'organizer' ||
      match.status !==
        'live'
    );
}

function matchElapsedSeconds() {
  if (!state.match.startAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() -
        state.match.startAt) /
        1000
    )
  );
}

function matchRemainingSeconds() {
  return Math.max(
    0,
    state.match.durationMin *
      60 -
      matchElapsedSeconds()
  );
}

function renderLivePlayerHud() {
  const match =
    state.match;

  const me =
    getCurrentPlayer();

  $('pLiveObj').textContent =
    objectiveLabel();

  $('pScoreA').textContent =
    `A ${
      match.scores.A || 0
    }`;

  $('pScoreB').textContent =
    `B ${
      match.scores.B || 0
    }`;

  $('pTimer').textContent =
    formatSeconds(
      matchRemainingSeconds()
    );

  $('pPlayerState')
    .textContent =
    me?.status ||
    'ATIVO';

  $('pAlive').textContent =
    `${me?.status || 'ATIVO'} · ${Math.max(
      0,
      me?.lives ?? 0
    )} vida(s)`;

  $('pGps').textContent =
    positionText();

  $('hudTeamChip')
    .textContent =
    `EQUIPE ${
      me?.team || 'A'
    }`;

  renderAllies();
  renderBombHud();
  renderZoneHud();
  renderQuickActions();
  updateStatusPill();

  if (
    matchRemainingSeconds() <=
      0 &&
    match.status === 'live'
  ) {
    endMatchInternal(
      'Tempo da partida encerrado.'
    );
  }
}

function renderAllies() {
  const holder =
    $('allyList');

  const me =
    getCurrentPlayer();

  const list =
    (
      state.match.players ||
      []
    ).filter(
      (player) =>
        player.team ===
        (me?.team || 'A')
    );

  holder.innerHTML =
    list
      .map(
        (player) => `
        <div class="ally-item ${
          player.isMe ? 'you' : ''
        }">
          <div style="display:flex;align-items:center;gap:7px">
            <span class="ally-dot"></span>
            <strong>${
              escapeHtml(
                player.isMe
                  ? 'Você'
                  : player.name
              )
            }</strong>
          </div>

          <span class="ally-status">
            ${escapeHtml(
              player.status
            )} · ${player.lives} vida(s)
          </span>
        </div>
      `
      )
      .join('');
}

function renderBombHud() {
  const holder =
    $('bombHud');

  const active =
    state.match.modes.includes(
      'bomb'
    );

  if (!active) {
    holder.classList.add(
      'hidden'
    );

    return;
  }

  holder.classList.remove(
    'hidden'
  );

  const me =
    getCurrentPlayer();

  const bomb =
    state.match.bomb;

  if (!bomb.planted) {
    const carrier =
      state.match.players.find(
        (player) =>
          player.id ===
          bomb.carrierId
      );

    holder.className =
      'bomb-hud';

    holder.innerHTML =
      `<div class="bomb-title-row">
        <strong>💣 BOMBA · PORTADOR</strong>
        <span>${
          escapeHtml(
            carrier?.name ||
              'Não definido'
          )
        }</span>
      </div>

      <div class="bomb-meta">
        ${
          carrier?.team ===
          me?.team
            ? 'A bomba pertence à sua equipe.'
            : 'Aguardando armamento.'
        }
      </div>`;

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
        ) /
          1000
      )
    );

  holder.className =
    `bomb-hud active ${
      enemy ? 'enemy' : ''
    }`;

  const distance =
    estimateBombDistance(
      me,
      bomb
    );

  const action = enemy
    ? `<button
         type="button"
         class="quick-action selectable"
         id="quickDisarm"
       >
         DESARMAR BOMBA
       </button>`
    : '';

  holder.innerHTML =
    `<div class="bomb-title-row">
      <strong>${
        enemy
          ? '💣 BOMBA · LOCALIZE E DESARME'
          : '💣 BOMBA ARMADA'
      }</strong>

      <span class="bomb-time">
        ${formatSeconds(
          remaining
        )}
      </span>
    </div>

    <div class="bomb-meta">
      ${
        enemy
          ? `Localização ativa · ~${distance} m · aproxime-se para desarmar.`
          : 'Localização visível para sua equipe.'
      }
    </div>

    ${action}`;

  $('quickDisarm')
    ?.addEventListener(
      'click',
      startDisarmSequence
    );

  if (enemy) {
    handleBombProximity(
      me,
      bomb,
      distance
    );
  }

  if (
    remaining <= 0 &&
    bomb.planted
  ) {
    explodeBomb();
  }
}

function estimateBombDistance(
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
    const R = 6371000;

    const toRad =
      (value) =>
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
      ) **
        2 +
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
        ) **
          2;

    return Math.round(
      R *
        2 *
        Math.atan2(
          Math.sqrt(a),
          Math.sqrt(
            1 - a
          )
        )
    );
  }

  const dx =
    (player?.x ?? 0.5) -
    (bomb?.x ?? 0.5);

  const dy =
    (player?.y ?? 0.5) -
    (bomb?.y ?? 0.5);

  return Math.round(
    Math.hypot(dx, dy) *
      120
  );
}

function handleBombProximity(
  player,
  bomb,
  distance
) {
  if (
    !player ||
    !bomb?.planted
  ) {
    return;
  }

  const now =
    Date.now();

  let interval =
    1800;

  if (
    distance < 30
  ) {
    interval = 280;
  } else if (
    distance < 60
  ) {
    interval = 520;
  } else if (
    distance < 100
  ) {
    interval = 900;
  }

  if (
    now -
      lastProximityBeep >=
    interval
  ) {
    lastProximityBeep =
      now;

    playBeep(
      distance < 30
        ? 980
        : distance < 60
        ? 720
        : 520
    );

    if (
      navigator.vibrate
    ) {
      navigator.vibrate(
        distance < 30
          ? [60, 40, 60]
          : 35
      );
    }
  }
}

function playBeep(
  frequency = 700
) {
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
        .catch(() => {});
    }

    const osc =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    osc.type = 'sine';

    osc.frequency.value =
      frequency;

    gain.gain.setValueAtTime(
      0.001,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.04,
      audioContext.currentTime +
        0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime +
        0.10
    );

    osc
      .connect(gain)
      .connect(
        audioContext.destination
      );

    osc.start();

    osc.stop(
      audioContext.currentTime +
        0.11
    );
  } catch {}
}

function renderZoneHud() {
  const holder =
    $('zoneHud');

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
    getCurrentPlayer();

  const zone =
    findPlayerZone(me);

  if (!zone) {
    holder.className =
      'zone-hud';

    holder.innerHTML =
      `<div class="zone-title-row">
        <strong>◎ ZONAS</strong>
        <span>FORA DA ZONA</span>
      </div>

      <div class="zone-meta">
        Entre em uma zona para iniciar a contagem de captura.
      </div>`;

    return;
  }

  const key =
    zone.id;

  const progress =
    state.match.zones[key] || {
      team: null,
      startedAt: null,
      captured: false
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

    persistState();
  }

  const elapsed =
    progress.startedAt
      ? Math.floor(
          (
            Date.now() -
            progress.startedAt
          ) /
            1000
        )
      : 0;

  const captured =
    progress.captured;

  holder.className =
    'zone-hud';

  holder.innerHTML =
    `<div class="zone-title-row">
      <strong>${escapeHtml(
        zone.label
      )}</strong>

      <span>
        ${
          captured
            ? 'CAPTURADA'
            : `CAPTURANDO · ${elapsed}s`
        }
      </span>
    </div>

    <div class="zone-meta">
      ${
        captured
          ? 'A zona está verde no mapa.'
          : `Necessário: ${state.match.zoneCaptureSeconds}s.`
      }
    </div>`;

  if (
    !captured &&
    progress.startedAt &&
    elapsed >=
      state.match.zoneCaptureSeconds
  ) {
    captureZone(
      zone,
      me.team
    );
  }
}

function findPlayerZone(
  player
) {
  if (!player) {
    return null;
  }

  return state.match.map.marks.find(
    (mark) =>
      mark.type ===
        'zone' &&
      Math.hypot(
        player.x -
          mark.x,
        player.y -
          mark.y
      ) <=
        mark.size / 2
  );
}

function captureZone(
  zone,
  team
) {
  const entry =
    state.match.zones[
      zone.id
    ] || {};

  if (
    entry.captured
  ) {
    return;
  }

  entry.captured =
    true;

  entry.team =
    team;

  state.match.zones[
    zone.id
  ] = entry;

  state.match.scores[
    team
  ] =
    (
      state.match.scores[
        team
      ] || 0
    ) +
    Number(
      state.match.zonePoints ||
        0
    );

  addLog(
    `Zona ${zone.number} capturada pela equipe ${team}.`
  );

  persistState();

  showToast(
    `${zone.label} capturada.`
  );
}

function renderQuickActions() {
  const holder =
    $('quickActions');

  const me =
    getCurrentPlayer();

  const actions = [];

  const bomb =
    state.match.bomb;

  if (
    state.match.modes.includes(
      'bomb'
    ) &&
    me &&
    !bomb.planted &&
    bomb.carrierId ===
      me.id
  ) {
    actions.push({
      id: 'quickArm',
      label: '💣 ARMAR BOMBA'
    });
  }

  holder.innerHTML =
    actions
      .map(
        (action) =>
          `<button
             type="button"
             class="quick-action selectable"
             id="${action.id}"
           >
             ${action.label}
           </button>`
      )
      .join('');

  $('quickArm')
    ?.addEventListener(
      'click',
      armBomb
    );
}

function armBomb() {
  const me =
    getCurrentPlayer();

  const bomb =
    state.match.bomb;

  if (
    !me ||
    !state.match.modes.includes(
      'bomb'
    ) ||
    bomb.planted ||
    bomb.carrierId !==
      me.id
  ) {
    return;
  }

  if (
    bomb.armPolicy ===
      'areas' &&
    !state.match.map.marks.some(
      (mark) =>
        mark.type ===
        'bomb'
    )
  ) {
    showToast(
      'Não há área de bomba configurada no mapa.'
    );

    return;
  }

  if (
    bomb.timingPolicy ===
    'arming'
  ) {
    const value =
      window.prompt(
        'Quantos minutos a bomba terá?',
        String(
          bomb.durationMin
        )
      );

    if (value == null) {
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
      showToast(
        'Informe entre 1 e 120 minutos.'
      );

      return;
    }

    bomb.durationMin =
      minutes;
  }

  const area =
    nearestMark(
      me,
      'bomb'
    );

  bomb.planted =
    true;

  bomb.armedAt =
    Date.now();

  bomb.expiresAt =
    Date.now() +
    Number(
      bomb.durationMin
    ) *
      60000;

  bomb.armedByTeam =
    me.team;

  bomb.x =
    area?.x ??
    me.x;

  bomb.y =
    area?.y ??
    me.y;

  bomb.lat =
    state.gps.lat;

  bomb.lng =
    state.gps.lng;

  addLog(
    `${me.name} armou a bomba. Tempo: ${bomb.durationMin} min.`
  );

  persistState();

  showToast(
    'Bomba armada. Contagem iniciada.',
    3000
  );

  renderPlayer();
}

function nearestMark(
  player,
  type
) {
  const marks =
    state.match.map.marks.filter(
      (mark) =>
        mark.type === type
    );

  if (
    !marks.length ||
    !player
  ) {
    return null;
  }

  return [...marks].sort(
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
}

function startDisarmSequence() {
  const me =
    getCurrentPlayer();

  const bomb =
    state.match.bomb;

  if (
    !me ||
    !bomb.planted ||
    bomb.armedByTeam ===
      me.team
  ) {
    return;
  }

  const distance =
    estimateBombDistance(
      me,
      bomb
    );

  if (
    distance > 25
  ) {
    showToast(
      'Aproxime-se da bomba para desarmar.'
    );

    return;
  }

  const seconds =
    Number(
      state.match.bomb.disarmSeconds ||
        20
    );

  let remaining =
    seconds;

  showToast(
    `Desarme iniciado. ${seconds}s.`,
    1800
  );

  const interval =
    setInterval(() => {
      if (
        !state.match.bomb
          .planted ||
        state.match.status !==
          'live'
      ) {
        clearInterval(
          interval
        );

        return;
      }

      const currentDistance =
        estimateBombDistance(
          me,
          state.match.bomb
        );

      if (
        currentDistance > 25
      ) {
        clearInterval(
          interval
        );

        showToast(
          'Desarme interrompido: você se afastou da bomba.'
        );

        return;
      }

      remaining -= 1;

      if (
        remaining <= 0
      ) {
        clearInterval(
          interval
        );

        disarmBomb();
      }
    }, 1000);
}

function disarmBomb() {
  if (
    !state.match.bomb
      .planted
  ) {
    return;
  }

  const defending =
    state.match.bomb
      .armedByTeam;

  state.match.bomb.planted =
    false;

  state.match.bomb.armedAt =
    null;

  state.match.bomb.expiresAt =
    null;

  state.match.scores[
    defending
  ] =
    Math.max(
      0,
      (
        state.match.scores[
          defending
        ] || 0
      ) -
        25
    );

  addLog(
    'Bomba desarmada pela equipe adversária.'
  );

  persistState();

  showToast(
    'BOMBA DESARMADA.'
  );

  renderPlayer();
  renderControlPanel();
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

  const blastRadius =
    Number(
      bomb.blastRadius ||
        20
    );

  const victims =
    state.match.players.filter(
      (player) =>
        player.team ===
          enemyTeam &&
        player.status !==
          'FORA DA OPERAÇÃO' &&
        estimateBombDistance(
          player,
          bomb
        ) <=
          blastRadius
    );

  victims.forEach(
    (player) => {
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

  state.match.hits[
    enemyTeam
  ] =
    (
      state.match.hits[
        enemyTeam
      ] || 0
    ) +
    victims.length;

  state.match.scores[
    attackingTeam
  ] =
    (
      state.match.scores[
        attackingTeam
      ] || 0
    ) +
    victims.length *
      50;

  bomb.planted =
    false;

  bomb.armedAt =
    null;

  bomb.expiresAt =
    null;

  addLog(
    `Bomba detonou. ${victims.length} jogador(es) da equipe ${enemyTeam} atingido(s).`
  );

  persistState();

  if (
    navigator.vibrate
  ) {
    navigator.vibrate(
      [100, 80, 140]
    );
  }

  showToast(
    '💥 BOMBA DETONADA.',
    3200
  );

  renderPlayer();
  renderControlPanel();
}

function handlePlayerHit() {
  const me =
    getCurrentPlayer();

  if (
    !me ||
    state.match.status !==
      'live'
  ) {
    return;
  }

  if (
    me.status ===
    'FORA DA OPERAÇÃO'
  ) {
    return;
  }

  confirmAction({
    title:
      'Confirmar HIT?',

    text:
      'O sistema registrará a eliminação, reduzirá uma vida e iniciará o respawn conforme as regras.',

    ok:
      'CONFIRMAR HIT',

    onOk: () => {
      me.hits += 1;

      me.lives =
        Math.max(
          0,
          me.lives - 1
        );

      state.match.hits[
        me.team
      ] =
        (
          state.match.hits[
            me.team
          ] || 0
        ) + 1;

      if (
        me.lives <= 0
      ) {
        me.status =
          'FORA DA OPERAÇÃO';

        addLog(
          `${me.name} ficou fora da operação.`
        );

        showToast(
          'VOCÊ ESTÁ FORA DA OPERAÇÃO.'
        );
      } else {
        me.status =
          'HIT';

        addLog(
          `${me.name} levou HIT. Vidas restantes: ${me.lives}.`
        );

        notifyTeamOfHit(me);

        startRespawn(me);
      }

      persistState();

      renderPlayer();
      renderControlPanel();
    }
  });
}

function notifyTeamOfHit(
  player
) {
  showToast(
    `EQUIPE ${player.team}: ${player.name} levou HIT.`,
    2400
  );
}

function startRespawn(
  player
) {
  const delay =
    Number(
      state.match.respawnDelay ||
        0
    );

  if (
    delay <= 0
  ) {
    respawnPlayer(player);
    return;
  }

  let remaining =
    delay;

  showToast(
    `${player.name}: respawn em ${remaining}s.`,
    1700
  );

  const timer =
    setInterval(() => {
      remaining -= 1;

      if (
        remaining <= 0
      ) {
        clearInterval(
          timer
        );

        respawnPlayer(
          player
        );
      } else if (
        activeScreen ===
        'player'
      ) {
        showToast(
          `${player.name}: respawn em ${remaining}s.`,
          900
        );
      }
    }, 1000);
}

function respawnPlayer(
  player
) {
  if (
    player.lives <= 0
  ) {
    return;
  }

  const bases =
    state.match.map.marks.filter(
      (mark) =>
        mark.type ===
        'base'
    );

  if (bases.length) {
    let target =
      bases[0];

    if (
      state.match.respawnPolicy ===
      'nearest'
    ) {
      target =
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
    } else if (
      state.match.respawnPolicy ===
      'choice'
    ) {
      target =
        bases[
          Math.floor(
            Math.random() *
              bases.length
          )
        ];
    }

    player.x =
      target.x;

    player.y =
      target.y;
  }

  player.status =
    'ATIVO';

  addLog(
    `${player.name} voltou à operação.`
  );

  persistState();

  showToast(
    `${player.name}: respawn concluído.`
  );

  renderPlayer();
  renderControlPanel();
}

function transferBomb() {
  const candidates =
    state.match.players.filter(
      (player) =>
        player.status !==
        'FORA DA OPERAÇÃO'
    );

  if (!candidates.length) {
    return;
  }

  const names =
    candidates
      .map(
        (player, index) =>
          `${index + 1}. ${player.name} · Equipe ${player.team}`
      )
      .join('\n');

  const currentIndex =
    candidates.findIndex(
      (player) =>
        player.id ===
        state.match.bomb.carrierId
    );

  const value =
    window.prompt(
      `Escolha o novo portador:\n${names}`,
      String(
        Math.max(
          1,
          currentIndex + 1
        )
      )
    );

  if (value == null) {
    return;
  }

  const idx =
    Number(value) - 1;

  if (
    !Number.isInteger(idx) ||
    !candidates[idx]
  ) {
    showToast(
      'Portador inválido.'
    );

    return;
  }

  state.match.players.forEach(
    (player) => {
      player.carryingBomb =
        false;
    }
  );

  const selected =
    candidates[idx];

  state.match.bomb.carrierId =
    selected.id;

  selected.carryingBomb =
    true;

  state.match.bomb.armedByTeam =
    selected.team;

  addLog(
    `Portador da bomba alterado para ${selected.name}.`
  );

  persistState();

  showToast(
    `Bomba entregue a ${selected.name}.`
  );

  renderControlPanel();
  renderPlayer();
}

function changeBombTime() {
  const value =
    window.prompt(
      'Novo tempo da bomba em minutos:',
      String(
        state.match.bomb.durationMin
      )
    );

  if (value == null) {
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
    showToast(
      'Informe entre 1 e 120 minutos.'
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
      minutes *
        60000;
  }

  addLog(
    `Tempo da bomba alterado para ${minutes} min pelo operador.`
  );

  persistState();

  showToast(
    'Tempo da bomba atualizado.'
  );

  renderControlPanel();
  renderPlayer();
}

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
      50
    );
}

function renderControlPanel() {
  if (!state.match) {
    return;
  }

  $('ctrlScoreA')
    .textContent =
    state.match.scores.A ||
    0;

  $('ctrlScoreB')
    .textContent =
    state.match.scores.B ||
    0;

  $('ctrlHitsA')
    .textContent =
    `${state.match.hits.A || 0} hits`;

  $('ctrlHitsB')
    .textContent =
    `${state.match.hits.B || 0} hits`;

  $('ctrlTimer')
    .textContent =
    formatSeconds(
      state.match.status ===
        'live'
        ? matchElapsedSeconds()
        : 0
    );

  $('ctrlMatchName')
    .textContent =
    state.match.name ||
    '—';

  $('liveRespawnDelay')
    .value =
    state.match.respawnDelay ??
    60;

  $('liveRespawnPolicy')
    .value =
    state.match.respawnPolicy ||
    'nearest';

  renderOperatorPlayers();
  renderOperatorBombState();
  renderControlLog();
}

function renderOperatorPlayers() {
  const holder =
    $('operatorPlayers');

  const players =
    state.match.players ||
    [];

  holder.innerHTML =
    players
      .map(
        (player) => `
          <div class="operator-player-row">
            <div class="operator-player-main">
              <strong>
                ${escapeHtml(
                  player.name
                )}
                · Equipe ${player.team}
              </strong>

              <small>
                ${escapeHtml(
                  player.status
                )}
                · ${player.lives} vida(s)
                · ${player.hits} hit(s)
              </small>
            </div>

            <div class="operator-player-meta">
              ${Math.round(
                player.x * 100
              )}% · ${Math.round(
                player.y * 100
              )}%
            </div>
          </div>
        `
      )
      .join('');
}

function renderOperatorBombState() {
  const card =
    $('operatorBombCard');

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
      (player) =>
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
            ) /
              1000
          )
        )
      : 0;

  $('operatorBombState')
    .innerHTML =
    `
      <div class="info-line">
        <span>Portador</span>
        <strong>${
          escapeHtml(
            carrier?.name ||
              '—'
          )
        }</strong>
      </div>

      <div class="info-line">
        <span>Equipe</span>
        <strong>
          ${carrier?.team || '—'}
        </strong>
      </div>

      <div class="info-line">
        <span>Estado</span>
        <strong>
          ${
            bomb.planted
              ? 'ARMADA'
              : 'DESARMADA / NÃO ARMADA'
          }
        </strong>
      </div>

      <div class="info-line">
        <span>Tempo</span>
        <strong>
          ${
            bomb.planted
              ? formatSeconds(
                  remaining
                )
              : `${bomb.durationMin} min`
          }
        </strong>
      </div>

      <div class="info-line">
        <span>Área de explosão</span>
        <strong>
          ${bomb.blastRadius} m
        </strong>
      </div>

      <div class="info-line">
        <span>Local</span>
        <strong>
          ${
            bomb.planted
              ? `${Math.round(
                  bomb.x * 100
                )}% / ${Math.round(
                  bomb.y * 100
                )}%`
              : '—'
          }
        </strong>
      </div>
    `;
}

function renderControlLog() {
  const holder =
    $('controlLog');

  const logs =
    state.match.logs ||
    [];

  holder.innerHTML =
    logs.length
      ? logs
          .map(
            (entry) =>
              `<div class="log-item">
                <span>
                  ${new Date(
                    entry.at
                  ).toLocaleTimeString(
                    'pt-BR',
                    {
                      hour: '2-digit',
                      minute:
                        '2-digit',
                      second:
                        '2-digit'
                    }
                  )}
                </span>
                ${escapeHtml(
                  entry.text
                )}
              </div>`
          )
          .join('')
      : `
          <div class="log-item">
            <span>AGORA</span>
            Nenhum evento registrado.
          </div>
        `;
}

function updateStatusPill() {
  const pill =
    $('statusPill');

  const status =
    state.match.status;

  pill.className =
    'pill';

  if (
    status === 'open'
  ) {
    pill.textContent =
      'ABERTA';

    pill.classList.add(
      'wait'
    );
  } else if (
    status === 'live'
  ) {
    pill.textContent =
      'EM JOGO';

    pill.classList.add(
      'live'
    );
  } else {
    pill.textContent =
      status === 'ended'
        ? 'ENCERRADA'
        : 'SEM PARTIDA';
  }
}

function saveMatchOnly() {
  if (
    screenHasPendingChanges()
  ) {
    applyOrganizerForm();
  }

  state.match.status =
    'open';

  state.match.startAt =
    null;

  state.match.endAt =
    null;

  addLog(
    'Partida salva e aberta para entrada dos jogadores.'
  );

  persistState();

  updateStatusPill();

  showToast(
    'Partida salva e aberta.'
  );
}

function validateStartConfiguration() {
  if (!state.match.map.dataUrl) {
    showToast(
      'Configure um mapa antes de iniciar.'
    );

    organizerStep = 3;

    updateWizardStep();

    return false;
  }

  if (
    !state.match.mergeModes &&
    state.match.modes.length !==
      1
  ) {
    showToast(
      'Escolha apenas um modo ou ative “mesclar modos”.'
    );

    return false;
  }

  if (
    !state.match.modes.length
  ) {
    showToast(
      'Escolha pelo menos um modo.'
    );

    return false;
  }

  if (
    !$('confirmMap').checked
  ) {
    showToast(
      'Confirme o briefing e o mapa antes de iniciar.'
    );

    organizerStep = 3;

    updateWizardStep();

    return false;
  }

  return true;
}

function startMatch() {
  if (
    screenHasPendingChanges()
  ) {
    applyOrganizerForm();
  }

  if (
    !validateStartConfiguration()
  ) {
    return;
  }

  state.match.status =
    'live';

  state.match.startAt =
    Date.now();

  state.match.endAt =
    null;

  state.match.scores =
    {
      A: 0,
      B: 0
    };

  state.match.hits =
    {
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

  ensurePlayers();

  state.match.players.forEach(
    (player, index) => {
      player.lives =
        Number(
          state.match
            .livesPerPlayer
        );

      player.status =
        'ATIVO';

      player.hits = 0;

      player.confirmed =
        index === 0;
    }
  );

  if (
    !state.match.bomb.carrierId ||
    !state.match.players.some(
      (player) =>
        player.id ===
        state.match.bomb.carrierId
    )
  ) {
    const candidate =
      state.match.players.find(
        (player) =>
          player.team ===
          'A'
      );

    state.match.bomb.carrierId =
      candidate?.id ||
      state.match.players[0]?.id;
  }

  state.match.players.forEach(
    (player) => {
      player.carryingBomb =
        player.id ===
        state.match.bomb
          .carrierId;
    }
  );

  const carrier =
    state.match.players.find(
      (player) =>
        player.id ===
        state.match.bomb
          .carrierId
    );

  if (carrier) {
    state.match.bomb.armedByTeam =
      carrier.team;
  }

  addLog(
    'Operação iniciada.'
  );

  persistState();

  updateStatusPill();

  showScreen(
    state.role ===
      'organizer'
      ? 'control'
      : 'player'
  );

  showToast(
    'Operação iniciada.'
  );
}

function enterGameAsPlayer() {
  const me =
    getCurrentPlayer();

  if (
    !me?.confirmed
  ) {
    showToast(
      'Confirme presença primeiro.'
    );

    return;
  }

  if (
    state.match.status ===
    'open'
  ) {
    showToast(
      'Aguardando o operador iniciar a operação.'
    );

    return;
  }

  if (
    state.match.status !==
    'live'
  ) {
    showToast(
      'Não há partida em andamento.'
    );

    return;
  }

  showScreen(
    'player'
  );
}

function endMatchInternal(
  reason =
    'Partida encerrada.'
) {
  if (
    state.match.status ===
    'ended'
  ) {
    return;
  }

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

  addLog(reason);

  persistState();

  updateStatusPill();

  showToast(reason);

  if (
    activeScreen ===
      'control' ||
    activeScreen ===
      'player'
  ) {
    if (
      state.role ===
      'organizer'
    ) {
      showScreen(
        'control'
      );
    } else {
      showScreen(
        'player'
      );
    }
  }
}

function resetTotal() {
  confirmAction({
    title:
      'Reset total?',

    text:
      'Isso apaga a partida, o mapa, as configurações e o papel salvo neste navegador.',

    ok:
      'RESET TOTAL',

    onOk: () => {
      localStorage.removeItem(
        KEYS.state
      );

      localStorage.removeItem(
        KEYS.role
      );

      window.location.reload();
    }
  });
}

function openCrop(file) {
  const reader =
    new FileReader();

  reader.onload = () => {
    cropImage =
      new Image();

    cropImage.onload = () => {
      cropRect = {
        x: 5,
        y: 5,
        w: 90,
        h: 90
      };

      setModal(
        $('cropModal'),
        true
      );

      drawCropStage();
      positionCropBox();
    };

    cropImage.src =
      reader.result;
  };

  reader.readAsDataURL(
    file
  );
}

function drawCropStage() {
  const canvas =
    $('cropCanvas');

  const metrics =
    resizeCanvas(canvas);

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
    canvas.getContext(
      '2d'
    );

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
        cropImage
          .naturalWidth,
      height /
        cropImage
          .naturalHeight
    );

  const w =
    cropImage
      .naturalWidth *
    scale;

  const h =
    cropImage
      .naturalHeight *
    scale;

  const dx =
    (width - w) / 2;

  const dy =
    (height - h) / 2;

  ctx.drawImage(
    cropImage,
    dx,
    dy,
    w,
    h
  );

  ctx.restore();
}

function positionCropBox() {
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

  box.style.display =
    'block';
}

function applyCrop() {
  if (!cropImage) {
    return;
  }

  const stage =
    $('cropStage');

  const rect =
    stage.getBoundingClientRect();

  const scale =
    Math.min(
      rect.width /
        cropImage
          .naturalWidth,
      rect.height /
        cropImage
          .naturalHeight
    );

  const renderedW =
    cropImage
      .naturalWidth *
    scale;

  const renderedH =
    cropImage
      .naturalHeight *
    scale;

  const offsetX =
    (rect.width -
      renderedW) /
    2;

  const offsetY =
    (rect.height -
      renderedH) /
    2;

  const cropLeftPx =
    (cropRect.x /
      100) *
    rect.width;

  const cropTopPx =
    (cropRect.y /
      100) *
    rect.height;

  const cropWidthPx =
    (cropRect.w /
      100) *
    rect.width;

  const cropHeightPx =
    (cropRect.h /
      100) *
    rect.height;

  const sourceX =
    Math.max(
      0,
      (
        cropLeftPx -
        offsetX
      ) /
        scale
    );

  const sourceY =
    Math.max(
      0,
      (
        cropTopPx -
        offsetY
      ) /
        scale
    );

  const sourceW =
    Math.min(
      cropImage
        .naturalWidth -
        sourceX,
      cropWidthPx /
        scale
    );

  const sourceH =
    Math.min(
      cropImage
        .naturalHeight -
        sourceY,
      cropHeightPx /
        scale
    );

  if (
    sourceW <= 1 ||
    sourceH <= 1
  ) {
    showToast(
      'Área de recorte inválida.'
    );

    return;
  }

  const outW =
    Math.round(
      sourceW
    );

  const outH =
    Math.round(
      sourceH
    );

  const out =
    document.createElement(
      'canvas'
    );

  out.width =
    outW;

  out.height =
    outH;

  const ctx =
    out.getContext(
      '2d'
    );

  ctx.drawImage(
    cropImage,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    outW,
    outH
  );

  state.match.map.dataUrl =
    out.toDataURL(
      'image/png',
      0.92
    );

  state.match.map.naturalWidth =
    outW;

  state.match.map.naturalHeight =
    outH;

  state.match.map.marks =
    [];

  state.match.map.version +=
    1;

  editor.selectedId =
    null;

  persistState();

  setModal(
    $('cropModal'),
    false
  );

  cropImage =
    null;

  renderAllMaps();

  showToast(
    'Área do mapa aplicada.'
  );
}

function generateTacticalMap() {
  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    1400;

  canvas.height =
    900;

  const ctx =
    canvas.getContext(
      '2d'
    );

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.globalAlpha =
    0.45;

  ctx.strokeStyle =
    '#b9b5ae';

  ctx.lineWidth =
    2;

  for (
    let x = 0;
    x <= canvas.width;
    x += 140
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
    y += 140
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
    0.15;

  ctx.fillStyle =
    '#8b6b4a';

  for (
    let i = 0;
    i < 10;
    i++
  ) {
    ctx.beginPath();

    const x =
      80 +
      (
        i * 123
      ) %
        1180;

    const y =
      80 +
      (
        i * 71
      ) %
        700;

    const w =
      120 +
      (i % 3) *
        60;

    const h =
      70 +
      (i % 2) *
        40;

    if (
      typeof ctx.roundRect ===
      'function'
    ) {
      ctx.roundRect(
        x,
        y,
        w,
        h,
        14
      );
    } else {
      ctx.rect(
        x,
        y,
        w,
        h
      );
    }

    ctx.fill();
  }

  ctx.globalAlpha =
    1;

  ctx.strokeStyle =
    '#8b6b4a';

  ctx.lineWidth =
    8;

  ctx.strokeRect(
    20,
    20,
    1360,
    860
  );

  ctx.fillStyle =
    '#6a5238';

  ctx.font =
    '800 34px system-ui, sans-serif';

  ctx.fillText(
    'DESERT FALCONS · MAPA TÁTICO',
    44,
    58
  );

  state.match.map.dataUrl =
    canvas.toDataURL(
      'image/png'
    );

  state.match.map.naturalWidth =
    canvas.width;

  state.match.map.naturalHeight =
    canvas.height;

  state.match.map.marks =
    [];

  state.match.map.version +=
    1;

  editor.selectedId =
    null;

  persistState();

  renderAllMaps();

  showToast(
    'Mapa tático gerado.'
  );
}

function clearAllMarks() {
  if (
    !state.match.map.marks.length
  ) {
    showToast(
      'Não há elementos para apagar.'
    );

    return;
  }

  confirmAction({
    title:
      'Limpar todos os elementos?',

    text:
      'Todas as zonas, bases, bandeiras e áreas de bomba do mapa serão removidas.',

    ok:
      'LIMPAR',

    onOk: () => {
      state.match.map.marks =
        [];

      editor.selectedId =
        null;

      persistState();

      renderAllMaps();
      renderEditorInspector();

      showToast(
        'Todos os elementos foram apagados.'
      );
    }
  });
}

function initMapInteractions() {
  const canvas =
    $('mapEditorCanvas');

  if (!canvas) {
    return;
  }

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.setPointerCapture(
        event.pointerId
      );

      const pos =
        editorClientToNormalized(
          event
        );

      const selected =
        selectMarkAt(
          pos.x,
          pos.y,
          0.05
        );

      editor.dragging =
        true;

      if (
        editor.erase
      ) {
        editor.dragStart = {
          x: event.clientX,
          y: event.clientY
        };

        if (selected) {
          removeMark(
            selected.id
          );
        }

        return;
      }

      if (
        [
          'zone',
          'base',
          'flag',
          'bomb'
        ].includes(
          editor.tool
        )
      ) {
        editor.dragStart = {
          x: event.clientX,
          y: event.clientY
        };

        addMark(
          editor.tool,
          pos.x,
          pos.y
        );

        editor.tool =
          'pan';

        setSelectedButton(
          $('toolPan'),
          true
        );

        return;
      }

      editor.selectedId =
        selected?.id ||
        null;

      if (selected) {
        editor.dragStart = {
          x:
            event.clientX,
          y:
            event.clientY,
          mode:
            'mark',
          markId:
            selected.id,
          markX:
            selected.x,
          markY:
            selected.y,
          panX:
            editor.panX,
          panY:
            editor.panY
        };
      } else {
        editor.dragStart = {
          x:
            event.clientX,
          y:
            event.clientY,
          mode:
            'pan',
          panX:
            editor.panX,
          panY:
            editor.panY
        };
      }

      renderEditorInspector();
      renderEditorCanvas();
    }
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (
        !editor.dragging ||
        editor.erase ||
        editor.tool !== 'pan' ||
        !editor.dragStart
      ) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      const dxPx =
        event.clientX -
        editor.dragStart.x;

      const dyPx =
        event.clientY -
        editor.dragStart.y;

      if (
        editor.dragStart
          .mode ===
        'mark'
      ) {
        const img =
          $('mapEditorImg');

        const box =
          getContainedImageBox(
            rect.width,
            rect.height,
            img,
            editor.zoom,
            editor.panX,
            editor.panY
          );

        const mark =
          state.match.map.marks.find(
            (item) =>
              item.id ===
              editor.dragStart
                .markId
          );

        if (
          mark &&
          box.width > 0 &&
          box.height > 0
        ) {
          mark.x =
            Math.max(
              0.02,
              Math.min(
                0.98,
                editor.dragStart
                  .markX +
                  dxPx /
                    box.width
              )
            );

          mark.y =
            Math.max(
              0.02,
              Math.min(
                0.98,
                editor.dragStart
                  .markY +
                  dyPx /
                    box.height
              )
            );

          renderEditorCanvas();
        }

        return;
      }

      editor.panX =
        editor.dragStart
          .panX +
        dxPx;

      editor.panY =
        editor.dragStart
          .panY +
        dyPx;

      renderEditorCanvas();
    }
  );

  canvas.addEventListener(
    'pointerup',
    () => {
      editor.dragging =
        false;

      if (
        editor.dragStart?.mode ===
        'mark'
      ) {
        persistState();
      }

      editor.dragStart =
        null;
    }
  );

  canvas.addEventListener(
    'pointercancel',
    () => {
      editor.dragging =
        false;

      editor.dragStart =
        null;
    }
  );

  $('zoomIn').addEventListener(
    'click',
    () =>
      setEditorZoom(
        editor.zoom + 0.25
      )
  );

  $('zoomOut').addEventListener(
    'click',
    () =>
      setEditorZoom(
        editor.zoom - 0.25
      )
  );

  $('zoomReset').addEventListener(
    'click',
    () => {
      editor.zoom = 1;
      editor.panX = 0;
      editor.panY = 0;

      renderEditorCanvas();
    }
  );

  $('toolPan').addEventListener(
    'click',
    () => {
      editor.tool =
        'pan';

      editor.erase =
        false;

      setSelectedButton(
        $('toolPan'),
        true
      );

      setSelectedButton(
        $('toolErase'),
        false
      );

      showToast(
        'Modo mover mapa ativo.'
      );
    }
  );

  $('toolErase').addEventListener(
    'click',
    () => {
      editor.erase =
        !editor.erase;

      editor.tool =
        'pan';

      setSelectedButton(
        $('toolErase'),
        editor.erase
      );

      setSelectedButton(
        $('toolPan'),
        !editor.erase
      );

      showToast(
        editor.erase
          ? 'Modo apagar ativo.'
          : 'Modo apagar desativado.'
      );
    }
  );

  $('toolResetView').addEventListener(
    'click',
    () => {
      editor.zoom = 1;
      editor.panX = 0;
      editor.panY = 0;

      renderEditorCanvas();

      showToast(
        'Mapa centralizado.'
      );
    }
  );

  $('toolClear').addEventListener(
    'click',
    clearAllMarks
  );

  $('mapEditorApply').addEventListener(
    'click',
    closeMapEditor
  );

  $('mapEditorClose').addEventListener(
    'click',
    closeMapEditor
  );
}

function setEditorZoom(
  value
) {
  editor.zoom =
    Math.max(
      0.75,
      Math.min(
        4,
        value
      )
    );

  renderEditorCanvas();
}

function initCropInteractions() {
  const box =
    $('cropBox');

  const stage =
    $('cropStage');

  if (
    !box ||
    !stage
  ) {
    return;
  }

  const start =
    (event) => {
      event.preventDefault();

      const rect =
        stage.getBoundingClientRect();

      const x =
        (
          (
            event.clientX -
            rect.left
          ) /
            rect.width
        ) *
        100;

      const y =
        (
          (
            event.clientY -
            rect.top
          ) /
            rect.height
        ) *
        100;

      cropPointer = {
        x,
        y,
        rect: {
          ...cropRect
        },
        edge:
          (
            x >
              cropRect.x +
                cropRect.w -
                5 &&
            y >
              cropRect.y +
                cropRect.h -
                5
          )
            ? 'resize'
            : 'move'
      };
    };

  const move =
    (event) => {
      if (
        !cropPointer
      ) {
        return;
      }

      const rect =
        stage.getBoundingClientRect();

      const x =
        (
          (
            event.clientX -
            rect.left
          ) /
            rect.width
        ) *
        100;

      const y =
        (
          (
            event.clientY -
            rect.top
          ) /
            rect.height
        ) *
        100;

      const dx =
        x -
        cropPointer.x;

      const dy =
        y -
        cropPointer.y;

      if (
        cropPointer.edge ===
        'resize'
      ) {
        cropRect.w =
          Math.max(
            10,
            Math.min(
              100 -
                cropRect.x,
              cropPointer.rect.w +
                dx
            )
          );

        cropRect.h =
          Math.max(
            10,
            Math.min(
              100 -
                cropRect.y,
              cropPointer.rect.h +
                dy
            )
          );
      } else {
        cropRect.x =
          Math.max(
            0,
            Math.min(
              100 -
                cropRect.w,
              cropPointer.rect.x +
                dx
            )
          );

        cropRect.y =
          Math.max(
            0,
            Math.min(
              100 -
                cropRect.h,
              cropPointer.rect.y +
                dy
            )
          );
      }

      positionCropBox();
    };

  const end =
    () => {
      cropPointer =
        null;
    };

  box.addEventListener(
    'pointerdown',
    start
  );

  window.addEventListener(
    'pointermove',
    move
  );

  window.addEventListener(
    'pointerup',
    end
  );

  $('cropOk').addEventListener(
    'click',
    applyCrop
  );

  $('cropCancel').addEventListener(
    'click',
    () => {
      cropImage =
        null;

      setModal(
        $('cropModal'),
        false
      );
    }
  );
}

function initEvents() {
  $$('.role-card').forEach(
    (btn) =>
      btn.addEventListener(
        'click',
        () =>
          setRoleAndOpen(
            btn.dataset.role
          )
      )
  );

  $('devBtn').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            'dev'
          )
      )
  );

  $('devBack').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            loadRole() ===
            'organizer'
              ? 'organizer'
              : 'player'
          )
      )
  );

  $('devPlayer').addEventListener(
    'click',
    () =>
      setRoleAndOpen(
        'player'
      )
  );

  $('devOrg').addEventListener(
    'click',
    () =>
      setRoleAndOpen(
        'organizer'
      )
  );

  $('devReset').addEventListener(
    'click',
    resetTotal
  );

  $('gpsRetry').addEventListener(
    'click',
    () =>
      requestGps(
        true
      )
  );

  $('gpsDeny').addEventListener(
    'click',
    () =>
      showGpsGate(
        'A localização é obrigatória para usar o aplicativo. Ative a permissão no navegador para continuar.'
      )
  );

  $('btnPlayerBack').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            'role'
          )
      )
  );

  $('btnPlayerBackReady').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            'role'
          )
      )
  );

  $('btnConfirm').addEventListener(
    'click',
    () => {
      const me =
        getCurrentPlayer();

      if (!me) {
        return;
      }

      me.confirmed =
        true;

      persistState();

      renderPlayer();

      showToast(
        'Presença confirmada.'
      );
    }
  );

  $('btnEnter').addEventListener(
    'click',
    enterGameAsPlayer
  );

  $('btnHit').addEventListener(
    'click',
    handlePlayerHit
  );

  $('btnLeave').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            'role'
          )
      )
  );

  $('btnOrgFromGame').addEventListener(
    'click',
    () =>
      showScreen(
        'control'
      )
  );

  $('btnEndFromGame').addEventListener(
    'click',
    () =>
      confirmAction({
        title:
          'Encerrar partida?',

        text:
          'A partida será encerrada para todos neste navegador.',

        ok:
          'ENCERRAR',

        onOk: () =>
          endMatchInternal(
            'Operador encerrou a partida.'
          )
      })
  );

  $$('.wizard-tab').forEach(
    (tab) =>
      tab.addEventListener(
        'click',
        () => {
          const target =
            Number(
              tab.dataset.step
            );

          if (
            target ===
            organizerStep
          ) {
            return;
          }

          requestWizardStep(
            target
          );
        }
      )
  );

  $('wizardBack').addEventListener(
    'click',
    () =>
      requestWizardStep(
        organizerStep - 1
      )
  );

  $('wizardNext').addEventListener(
    'click',
    () => {
      if (
        organizerStep ===
          2 &&
        !readOrganizerForm()
          .name
      ) {
        showToast(
          'Dê um nome à operação antes de avançar.'
        );

        return;
      }

      requestWizardStep(
        organizerStep + 1
      );
    }
  );

  $('wizardApply').addEventListener(
    'click',
    () =>
      applyOrganizerForm()
  );

  $('mergeModes').addEventListener(
    'change',
    () => {
      if (
        !$('mergeModes')
          .checked
      ) {
        const active =
          $$('.mode-card.active');

        if (
          active.length >
          1
        ) {
          active
            .slice(1)
            .forEach(
              (btn) =>
                btn.classList.remove(
                  'active'
                )
            );
        }
      }

      renderOrganizerAll();
    }
  );

  $$('.mode-card').forEach(
    (btn) =>
      btn.addEventListener(
        'click',
        () => {
          const merge =
            $('mergeModes')
              .checked;

          if (!merge) {
            $$('.mode-card')
              .forEach(
                (item) =>
                  item.classList.remove(
                    'active'
                  )
              );

            btn.classList.add(
              'active'
            );
          } else {
            btn.classList.toggle(
              'active'
            );

            if (
              !$$(
                '.mode-card.active'
              ).length
            ) {
              btn.classList.add(
                'active'
              );
            }
          }

          renderOrganizerAll();
        }
      )
  );

  $('mapFile').addEventListener(
    'change',
    (event) => {
      const file =
        event.target
          .files?.[0];

      if (file) {
        openCrop(file);
      }
    }
  );

  $('btnGenMap').addEventListener(
    'click',
    generateTacticalMap
  );

  $('btnOpenMapEditor').addEventListener(
    'click',
    openMapEditor
  );

  $('btnClearMarks').addEventListener(
    'click',
    clearAllMarks
  );

  $('btnSaveOnly').addEventListener(
    'click',
    saveMatchOnly
  );

  $('btnSaveEnter').addEventListener(
    'click',
    () => {
      if (
        screenHasPendingChanges()
      ) {
        applyOrganizerForm();
      }

      startMatch();
    }
  );

  $('btnEnd').addEventListener(
    'click',
    () =>
      confirmAction({
        title:
          'Encerrar partida?',

        text:
          'A operação ficará encerrada. O histórico local será mantido.',

        ok:
          'ENCERRAR',

        onOk: () =>
          endMatchInternal(
            'Operador encerrou a partida.'
          )
      })
  );

  $('btnOrgBack').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            'role'
          )
      )
  );

  $('openOpControl').addEventListener(
    'click',
    () =>
      showScreen(
        'control'
      )
  );

  $('btnControlBack').addEventListener(
    'click',
    () =>
      requestNavigation(
        () =>
          showScreen(
            'organizer'
          )
      )
  );

  $('btnControlEnd').addEventListener(
    'click',
    () =>
      confirmAction({
        title:
          'Encerrar partida?',

        text:
          'A operação ficará encerrada.',

        ok:
          'ENCERRAR',

        onOk: () =>
          endMatchInternal(
            'Operador encerrou a partida.'
          )
      })
  );

  $('btnTransferBomb').addEventListener(
    'click',
    transferBomb
  );

  $('btnChangeBombTime').addEventListener(
    'click',
    changeBombTime
  );

  $('btnApplyLiveRules').addEventListener(
    'click',
    () => {
      state.match.respawnDelay =
        Math.max(
          0,
          Math.min(
            900,
            Number(
              $('liveRespawnDelay')
                .value
            ) || 60
          )
        );

      state.match.respawnPolicy =
        $('liveRespawnPolicy')
          .value;

      addLog(
        'Regras de respawn atualizadas durante a operação.'
      );

      persistState();

      showToast(
        'Controle ao vivo aplicado.'
      );

      renderControlPanel();
    }
  );

  $('pendingApply').addEventListener(
    'click',
    () => {
      applyOrganizerForm();

      const action =
        pendingNavigation;

      pendingNavigation =
        null;

      setModal(
        $('pendingModal'),
        false
      );

      action?.();
    }
  );

  $('pendingDiscard').addEventListener(
    'click',
    () => {
      discardOrganizerChanges();

      const action =
        pendingNavigation;

      pendingNavigation =
        null;

      setModal(
        $('pendingModal'),
        false
      );

      action?.();
    }
  );

  $('pendingCancel').addEventListener(
    'click',
    () => {
      pendingNavigation =
        null;

      setModal(
        $('pendingModal'),
        false
      );
    }
  );

  initMapInteractions();
  initCropInteractions();

  $$('.selectable').forEach(
    (button) => {
      button.addEventListener(
        'pointerdown',
        () =>
          button.classList.add(
            'selected'
          )
      );

      button.addEventListener(
        'pointerup',
        () =>
          setTimeout(
            () =>
              button.classList.remove(
                'selected'
              ),
            180
          )
      );

      button.addEventListener(
        'pointercancel',
        () =>
          button.classList.remove(
            'selected'
          )
      );

      button.addEventListener(
        'pointerleave',
        () =>
          button.classList.remove(
            'selected'
          )
      );
    }
  );
}

function requestWizardStep(
  target
) {
  if (
    target < 1 ||
    target > 3 ||
    target ===
      organizerStep
  ) {
    return;
  }

  const go = () => {
    if (
      screenHasPendingChanges()
    ) {
      applyOrganizerForm();
    }

    organizerStep =
      target;

    updateWizardStep();
  };

  if (
    screenHasPendingChanges()
  ) {
    pendingNavigation =
      go;

    setModal(
      $('pendingModal'),
      true
    );
  } else {
    go();
  }
}

function simulateMockPlayers() {
  if (
    state.match.status !==
    'live'
  ) {
    return;
  }

  const t =
    Date.now() /
    9000;

  state.match.players
    .filter(
      (player) =>
        player.mock
    )
    .forEach(
      (
        player,
        index
      ) => {
        const seed =
          index + 1;

        const homeX =
          player.team ===
          'A'
            ? 0.25 +
              (
                index % 3
              ) *
                0.08
            : 0.70 -
              (
                index % 3
              ) *
                0.07;

        const homeY =
          player.team ===
          'A'
            ? 0.68 -
              (
                index % 2
              ) *
                0.08
            : 0.28 +
              (
                index % 2
              ) *
                0.08;

        player.x =
          Math.max(
            0.05,
            Math.min(
              0.95,
              homeX +
                Math.sin(
                  t *
                    (
                      0.7 +
                      seed *
                        0.03
                    ) +
                    seed
                ) *
                  0.07
            )
          );

        player.y =
          Math.max(
            0.05,
            Math.min(
              0.95,
              homeY +
                Math.cos(
                  t *
                    (
                      0.65 +
                      seed *
                        0.02
                    ) +
                    seed
                ) *
                  0.06
            )
          );
      }
    );
}

function tick() {
  updateStatusPill();

  if (
    state.match.status ===
    'live'
  ) {
    simulateMockPlayers();

    if (
      activeScreen ===
      'player'
    ) {
      renderLivePlayerHud();
    }

    if (
      activeScreen ===
      'control'
    ) {
      renderControlPanel();
    }
  }
}

function init() {
  ensurePlayers();

  updateStatusPill();

  syncOrganizerFormFromState();

  initEvents();

  const role =
    loadRole();

  if (
    role === 'player' ||
    role === 'organizer'
  ) {
    setRoleAndOpen(
      role
    );
  } else {
    showScreen(
      'role'
    );
  }

  window.setInterval(
    tick,
    1000
  );

  window.addEventListener(
    'resize',
    () => {
      renderAllMaps();

      drawCropStage();

      if (
        $('mapEditorModal') &&
        !$(
          'mapEditorModal'
        ).classList.contains(
          'hidden'
        )
      ) {
        renderEditorCanvas();
      }
    }
  );

  initGps();
}

init();