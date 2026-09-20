/* Desert Falcons — versão simples offline */
const KEY = "df_v2";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function initial() {
  return {
    role: null,
    match: {
      exists: false,
      status: "none", // none | open | live | ended
      name: "",
      location: "",
      mode: "",
      duration: 60,
      objective: "",
      mapImage: null, // dataURL
      marks: [], // {type, x, y, r?}
      startedAt: null,
      elapsed: 0
    },
    player: {
      presence: false,
      alive: true
    },
    tool: "point"
  };
}

let state = initial();
let timerId = null;
let prevScreen = "role";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state = { ...initial(), ...s, match: { ...initial().match, ...(s.match || {}) }, player: { ...initial().player, ...(s.player || {}) } };
  } catch (_) {}
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function show(name) {
  $$(".screen").forEach(s => s.classList.toggle("active", s.dataset.screen === name));
  if (name !== "dev") prevScreen = name;
  render();
}

function fmtTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

/* ── Header ── */
function renderHeader() {
  const pill = $("#statusPill");
  if (!pill) return;
  const st = state.match.status;
  if (st === "live") {
    pill.textContent = "AO VIVO";
    pill.className = "pill live";
  } else if (st === "open") {
    pill.textContent = "ABERTA";
    pill.className = "pill wait";
  } else {
    pill.textContent = "SEM PARTIDA";
    pill.className = "pill";
  }
}

/* ── Player ── */
function renderPlayer() {
  const m = state.match;
  const wait = $("#playerWait");
  const ready = $("#playerReady");
  const live = $("#playerLive");

  if (!m.exists || m.status === "none" || m.status === "ended") {
    wait?.classList.remove("hidden");
    ready?.classList.add("hidden");
    live?.classList.add("hidden");
    return;
  }

  if (m.status === "live" && state.player.presence) {
    wait?.classList.add("hidden");
    ready?.classList.add("hidden");
    live?.classList.remove("hidden");
    $("#pLiveName").textContent = m.name || "—";
    $("#pLiveObj").textContent = m.objective || "—";
    $("#pAlive").textContent = state.player.alive ? "ATIVO" : "OUT";
    $("#pTimer").textContent = fmtTimer(m.elapsed);
    drawPlayerMap();
    return;
  }

  // open / scheduled — show confirm / enter
  wait?.classList.add("hidden");
  ready?.classList.remove("hidden");
  live?.classList.add("hidden");
  $("#pName").textContent = m.name || "—";
  $("#pLoc").textContent = m.location || "—";
  $("#pMode").textContent = m.mode || "—";
  $("#pDur").textContent = (m.duration || 60) + " min";
  $("#pObj").textContent = m.objective || "—";
  const st = $("#pStatus");
  if (st) {
    st.textContent = m.status === "live" ? "AO VIVO" : "ABERTA";
    st.className = "value " + (m.status === "live" ? "live" : "wait");
  }
  const conf = $("#btnConfirm");
  const ent = $("#btnEnter");
  if (conf) conf.classList.toggle("hidden", state.player.presence);
  if (ent) {
    ent.classList.toggle("hidden", !state.player.presence);
    ent.disabled = m.status !== "live" && m.status !== "open";
    if (m.status === "live") ent.textContent = "ENTRAR NO JOGO";
    else ent.textContent = "AGUARDAR INÍCIO";
  }
}

/* ── Organizer form ── */
function fillOrgForm() {
  const m = state.match;
  $("#oName").value = m.name || "";
  $("#oLoc").value = m.location || "";
  $("#oDur").value = m.duration || 60;
  $("#oMode").value = m.mode || "";
  $("#oObj").value = m.objective || "";
  $("#btnStart")?.classList.toggle("hidden", !(m.exists && m.status === "open"));
  $("#btnEnd")?.classList.toggle("hidden", m.status !== "live");
  $("#btnSave").textContent = m.exists ? "ATUALIZAR E MANTER ABERTA" : "SALVAR E ABRIR PARA JOGADORES";
  if (m.mapImage) {
    const img = $("#mapImg");
    if (img) img.src = m.mapImage;
  }
  resizeOrgCanvas();
  drawOrgMap();
}

function readOrgForm() {
  state.match.name = ($("#oName")?.value || "").trim();
  state.match.location = ($("#oLoc")?.value || "").trim();
  state.match.duration = Number($("#oDur")?.value) || 60;
  state.match.mode = ($("#oMode")?.value || "").trim();
  state.match.objective = ($("#oObj")?.value || "").trim();
}

/* ── Map (org) ── */
function resizeOrgCanvas() {
  const wrap = $("#orgMapWrap");
  const canvas = $("#mapCanvas");
  if (!wrap || !canvas) return;
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
}

function drawMarks(ctx, w, h, marks) {
  marks.forEach(mk => {
    const x = mk.x * w, y = mk.y * h;
    if (mk.type === "zone") {
      const rad = (mk.r || 0.08) * Math.min(w, h);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(139, 107, 74, 0.2)";
      ctx.fill();
      ctx.strokeStyle = "#8b6b4a";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (mk.type === "base") {
      const s = 14;
      ctx.fillStyle = "rgba(74, 122, 74, 0.25)";
      ctx.strokeStyle = "#4a7a4a";
      ctx.lineWidth = 2;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.strokeRect(x - s, y - s, s * 2, s * 2);
    } else {
      // point
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#8b6b4a";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function drawOrgMap() {
  const canvas = $("#mapCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!state.match.mapImage) {
    ctx.fillStyle = "#d0cdc6";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6a6560";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Suba uma imagem do mapa", w / 2, h / 2);
  }
  drawMarks(ctx, w, h, state.match.marks || []);
}

function canvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return {
    x: (t.clientX - rect.left) / rect.width,
    y: (t.clientY - rect.top) / rect.height
  };
}

function onOrgMapPointer(e) {
  e.preventDefault();
  const canvas = $("#mapCanvas");
  if (!canvas) return;
  const p = canvasPos(e, canvas);
  if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;

  if (state.tool === "erase") {
    state.match.marks = (state.match.marks || []).filter(mk => {
      const dx = mk.x - p.x, dy = mk.y - p.y;
      return Math.hypot(dx, dy) > 0.06;
    });
  } else if (state.tool === "zone") {
    state.match.marks.push({ type: "zone", x: p.x, y: p.y, r: 0.1 });
  } else if (state.tool === "base") {
    state.match.marks.push({ type: "base", x: p.x, y: p.y });
  } else {
    state.match.marks.push({ type: "point", x: p.x, y: p.y });
  }
  save();
  drawOrgMap();
}

/* ── Player map (read-only) ── */
function resizePlayerCanvas() {
  const wrap = $("#playerMapWrap");
  const canvas = $("#playerMapCanvas");
  if (!wrap || !canvas) return;
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
}

function drawPlayerMap() {
  const img = $("#playerMapImg");
  const canvas = $("#playerMapCanvas");
  if (!canvas) return;
  if (state.match.mapImage && img) img.src = state.match.mapImage;
  resizePlayerCanvas();
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMarks(ctx, canvas.width, canvas.height, state.match.marks || []);
}

/* ── Actions ── */
function saveAndOpen() {
  readOrgForm();
  if (!state.match.name) return toast("Informe o nome da partida.");
  state.match.exists = true;
  state.match.status = "open";
  state.match.startedAt = null;
  state.match.elapsed = 0;
  state.player.presence = false;
  state.player.alive = true;
  save();
  render();
  toast("Partida aberta. Jogadores já podem confirmar.");
}

function startMatch() {
  if (!state.match.exists) return toast("Salve a partida antes.");
  state.match.status = "live";
  state.match.startedAt = Date.now();
  state.match.elapsed = 0;
  save();
  startTimer();
  render();
  toast("Partida iniciada.");
}

function endMatch() {
  state.match.status = "ended";
  stopTimer();
  save();
  render();
  toast("Partida encerrada.");
}

function confirmPresence() {
  state.player.presence = true;
  save();
  render();
  toast("Presença confirmada.");
}

function enterGame() {
  if (!state.player.presence) return toast("Confirme presença antes.");
  if (state.match.status !== "live") return toast("Aguarde o operador iniciar.");
  state.player.alive = true;
  save();
  render();
}

function hitOut() {
  state.player.alive = false;
  save();
  render();
  toast("HIT — você está OUT.");
}

function abandon() {
  state.player.presence = false;
  state.player.alive = true;
  save();
  show("player");
  toast("Você saiu da partida.");
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    if (state.match.status !== "live") return;
    const start = state.match.startedAt || Date.now();
    state.match.elapsed = Math.floor((Date.now() - start) / 1000);
    const max = (state.match.duration || 60) * 60;
    if (state.match.elapsed >= max) {
      endMatch();
      return;
    }
    const t = $("#pTimer");
    if (t) t.textContent = fmtTimer(state.match.elapsed);
    save();
  }, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function render() {
  renderHeader();
  const screen = document.querySelector(".screen.active")?.dataset.screen;
  if (screen === "player") renderPlayer();
  if (screen === "organizer") fillOrgForm();
}

/* ── Events ── */
document.addEventListener("click", (e) => {
  const role = e.target.closest("[data-role]");
  if (role) {
    state.role = role.dataset.role;
    save();
    show(state.role === "organizer" ? "organizer" : "player");
    return;
  }
  const tool = e.target.closest("[data-tool]");
  if (tool) {
    state.tool = tool.dataset.tool;
    $$(".tool-btn").forEach(b => b.classList.toggle("active", b.dataset.tool === state.tool));
    return;
  }
});

$("#devBtn")?.addEventListener("click", () => show("dev"));
$("#devBack")?.addEventListener("click", () => show(prevScreen || "role"));
$("#devPlayer")?.addEventListener("click", () => { state.role = "player"; save(); show("player"); toast("Modo jogador"); });
$("#devOrg")?.addEventListener("click", () => { state.role = "organizer"; save(); show("organizer"); toast("Modo operador"); });
$("#devReset")?.addEventListener("click", () => {
  if (!confirm("Apagar tudo?")) return;
  localStorage.removeItem(KEY);
  state = initial();
  stopTimer();
  show("role");
  toast("Reset ok");
});

$("#btnSave")?.addEventListener("click", saveAndOpen);
$("#btnStart")?.addEventListener("click", startMatch);
$("#btnEnd")?.addEventListener("click", endMatch);
$("#btnOrgBack")?.addEventListener("click", () => show("role"));
$("#btnConfirm")?.addEventListener("click", confirmPresence);
$("#btnEnter")?.addEventListener("click", enterGame);
$("#btnHit")?.addEventListener("click", hitOut);
$("#btnLeave")?.addEventListener("click", abandon);
$("#btnClearMarks")?.addEventListener("click", () => {
  state.match.marks = [];
  save();
  drawOrgMap();
  toast("Marcas limpas");
});

$("#mapFile")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.match.mapImage = reader.result;
    const img = $("#mapImg");
    if (img) img.src = reader.result;
    save();
    resizeOrgCanvas();
    drawOrgMap();
    toast("Mapa carregado");
  };
  reader.readAsDataURL(file);
});

const orgCanvas = $("#mapCanvas");
if (orgCanvas) {
  orgCanvas.addEventListener("pointerdown", onOrgMapPointer);
}

window.addEventListener("resize", () => {
  resizeOrgCanvas();
  drawOrgMap();
  if (state.match.status === "live") drawPlayerMap();
});

/* ── Boot ── */
load();
if (state.role === "player") show("player");
else if (state.role === "organizer") show("organizer");
else show("role");
if (state.match.status === "live") startTimer();
render();
