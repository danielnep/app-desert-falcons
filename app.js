const KEY = "df_v4";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const OBJ_LABELS = {
  rouba_bandeira: "Rouba bandeira",
  bomba: "Bomba"
};

function initial() {
  return {
    role: null,
    match: {
      exists: false, status: "none",
      name: "", location: "", duration: 60, objective: "rouba_bandeira",
      mapImage: null, terrain: null, marks: [],
      startedAt: null, elapsed: 0
    },
    player: { presence: false, alive: true },
    tool: "point",
    gps: { lat: null, lng: null, ok: false, denied: false }
  };
}

let state = initial();
let timerId = null, gpsWatch = null, animFrame = null, prevScreen = "role";

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s) return;
    state = {
      ...initial(), ...s,
      match: { ...initial().match, ...(s.match || {}) },
      player: { ...initial().player, ...(s.player || {}) },
      gps: { ...initial().gps, ...(s.gps || {}) }
    };
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

/* ── GPS obrigatório ── */
function showGpsGate() {
  $("#gpsGate")?.classList.remove("hidden");
}
function hideGpsGate() {
  $("#gpsGate")?.classList.add("hidden");
}
function requestGps() {
  if (!navigator.geolocation) {
    showGpsGate();
    toast("GPS indisponível");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.gps.lat = pos.coords.latitude;
      state.gps.lng = pos.coords.longitude;
      state.gps.ok = true;
      state.gps.denied = false;
      hideGpsGate();
      save();
      startGpsWatch();
      toast("Localização ativa");
      render();
    },
    () => {
      state.gps.ok = false;
      state.gps.denied = true;
      showGpsGate();
    },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}
function startGpsWatch() {
  if (gpsWatch != null || !navigator.geolocation) return;
  gpsWatch = navigator.geolocation.watchPosition(
    (pos) => {
      state.gps.lat = pos.coords.latitude;
      state.gps.lng = pos.coords.longitude;
      state.gps.ok = true;
      const el = $("#pGps");
      if (el) el.textContent = "ATIVO · " + Math.round(pos.coords.accuracy) + "m";
    },
    () => {
      state.gps.ok = false;
      showGpsGate();
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

/* ── Terrain ── */
function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}
function generateTerrain(seed = Date.now()) {
  const rnd = seeded(seed);
  const buildings = [];
  for (let i = 0; i < 9; i++) {
    buildings.push({
      x: 0.05 + rnd() * 0.7, y: 0.05 + rnd() * 0.7,
      w: 0.1 + rnd() * 0.15, h: 0.08 + rnd() * 0.12
    });
  }
  return {
    seed,
    buildings,
    roads: [
      { x1: 0, y1: 0.35, x2: 1, y2: 0.35, thick: 0.06 },
      { x1: 0, y1: 0.7, x2: 1, y2: 0.72, thick: 0.05 },
      { x1: 0.3, y1: 0, x2: 0.32, y2: 1, thick: 0.055 },
      { x1: 0.65, y1: 0, x2: 0.68, y2: 1, thick: 0.05 }
    ],
    cover: Array.from({ length: 12 }, () => ({
      x: rnd(), y: rnd(), r: 0.015 + rnd() * 0.02
    }))
  };
}

function drawTerrain(ctx, w, h, terrain) {
  ctx.fillStyle = "#2a3228";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  const step = Math.max(14, w / 14);
  for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  if (!terrain) return;
  terrain.roads.forEach(r => {
    ctx.strokeStyle = "#3a4238";
    ctx.lineWidth = r.thick * Math.min(w, h);
    ctx.beginPath(); ctx.moveTo(r.x1 * w, r.y1 * h); ctx.lineTo(r.x2 * w, r.y2 * h); ctx.stroke();
    ctx.strokeStyle = "rgba(200,180,80,0.2)";
    ctx.lineWidth = 1; ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(r.x1 * w, r.y1 * h); ctx.lineTo(r.x2 * w, r.y2 * h); ctx.stroke();
    ctx.setLineDash([]);
  });
  terrain.buildings.forEach(b => {
    const bx = b.x * w, by = b.y * h, bw = b.w * w, bh = b.h * h;
    ctx.fillStyle = "#1e241c"; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#8b9a6a"; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, bh);
  });
  (terrain.cover || []).forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x * w, c.y * h, c.r * Math.min(w, h), 0, Math.PI * 2);
    ctx.fillStyle = "#3a4a32"; ctx.fill();
  });
}

/* Marcas com cor e símbolo distintos */
function drawMarks(ctx, w, h, marks) {
  (marks || []).forEach(mk => {
    const x = mk.x * w, y = mk.y * h;
    if (mk.type === "zone") {
      const rad = (mk.r || 0.09) * Math.min(w, h);
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(196,160,106,0.28)"; ctx.fill();
      ctx.strokeStyle = "#c4a06a"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#c4a06a"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
      ctx.fillText("Z", x, y + 4);
    } else if (mk.type === "base") {
      const s = 11;
      ctx.fillStyle = "rgba(74,154,74,0.4)"; ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.strokeStyle = "#4a9a4a"; ctx.lineWidth = 2.5; ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = "#4a9a4a"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center";
      ctx.fillText("B", x, y + 4);
    } else if (mk.type === "flag") {
      ctx.strokeStyle = "#d4b84a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 14); ctx.stroke();
      ctx.fillStyle = "#d4b84a";
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 14, y - 8); ctx.lineTo(x, y - 2); ctx.closePath(); ctx.fill();
    } else if (mk.type === "bomb") {
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = "#c04040"; ctx.fill();
      ctx.strokeStyle = "#ff8080"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
      ctx.fillText("💣", x, y + 4);
    } else {
      // point - azul
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#5b8def"; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
  });
}

function drawYou(ctx, w, h, nx, ny) {
  const x = nx * w, y = ny * h;
  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 350);
  ctx.beginPath(); ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(240,232,192,${0.18 * pulse})`; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#f0e8c0"; ctx.shadowColor = "#d4b84a"; ctx.shadowBlur = 14; ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = "#8b6b4a"; ctx.lineWidth = 2; ctx.stroke();
}

function sizeCanvas(canvas, wrap) {
  if (!canvas || !wrap) return { w: 0, h: 0 };
  const r = wrap.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
  return { w: canvas.width, h: canvas.height };
}

function hasMap() {
  return !!(state.match.mapImage || state.match.terrain);
}

function paintOrg() {
  const canvas = $("#mapCanvas"), wrap = $("#orgMapWrap");
  if (!canvas) return;
  const { w, h } = sizeCanvas(canvas, wrap);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const img = $("#mapImg");
  if (state.match.mapImage && img) {
    img.src = state.match.mapImage;
    img.classList.add("show");
  } else {
    img?.classList.remove("show");
    drawTerrain(ctx, w, h, state.match.terrain);
  }
  // se tem imagem, só desenha marcas por cima (imagem já é fundo)
  if (state.match.mapImage) {
    // fundo transparente, só marks
  } else if (!state.match.terrain) {
    ctx.fillStyle = "#2a3228";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#8b9a6a";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Envie ou gere um mapa", w / 2, h / 2);
  }
  drawMarks(ctx, w, h, state.match.marks);
}

function paintPlayer() {
  const canvas = $("#playerMapCanvas"), wrap = $("#playerMapWrap");
  if (!canvas) return;
  const { w, h } = sizeCanvas(canvas, wrap);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const img = $("#playerMapImg");
  if (state.match.mapImage && img) {
    img.src = state.match.mapImage;
    img.classList.add("show");
  } else {
    img?.classList.remove("show");
    drawTerrain(ctx, w, h, state.match.terrain);
  }
  drawMarks(ctx, w, h, state.match.marks);
  let px = 0.5, py = 0.5;
  if (state.gps.ok && state.gps.lat != null) {
    px = 0.5 + ((state.gps.lat % 0.001) / 0.001 - 0.5) * 0.1;
    py = 0.5 + ((state.gps.lng % 0.001) / 0.001 - 0.5) * 0.1;
    px = Math.max(0.1, Math.min(0.9, px));
    py = Math.max(0.1, Math.min(0.9, py));
  }
  drawYou(ctx, w, h, px, py);
}

function updateMarkPanel() {
  const panel = $("#markPanel");
  const hint = $("#mapStepHint");
  if (hasMap()) {
    panel?.classList.remove("hidden");
    if (hint) hint.textContent = "Mapa carregado. Toque para marcar bomba, zona, base…";
  } else {
    panel?.classList.add("hidden");
    if (hint) hint.textContent = "1) Envie a imagem do mapa. 2) Depois marque pontos, zonas, bomba…";
  }
}

/* ── Render ── */
function renderHeader() {
  const pill = $("#statusPill");
  if (!pill) return;
  const st = state.match.status;
  if (st === "live") { pill.textContent = "AO VIVO"; pill.className = "pill live"; }
  else if (st === "open") { pill.textContent = "ABERTA"; pill.className = "pill wait"; }
  else { pill.textContent = "SEM PARTIDA"; pill.className = "pill"; }
}

function renderPlayer() {
  const m = state.match;
  const wait = $("#playerWait"), ready = $("#playerReady"), live = $("#playerLive");
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
    $("#pLiveObj").textContent = OBJ_LABELS[m.objective] || m.objective;
    $("#pAlive").textContent = state.player.alive ? "ATIVO" : "OUT";
    $("#pTimer").textContent = fmt(m.elapsed);
    const isOrg = state.role === "organizer";
    $("#btnOrgFromGame")?.classList.toggle("hidden", !isOrg);
    $("#btnEndFromGame")?.classList.toggle("hidden", !isOrg);
    paintPlayer();
    startAnim();
    return;
  }
  wait?.classList.add("hidden");
  ready?.classList.remove("hidden");
  live?.classList.add("hidden");
  $("#pName").textContent = m.name || "—";
  $("#pLoc").textContent = m.location || "—";
  $("#pObj").textContent = OBJ_LABELS[m.objective] || m.objective || "—";
  $("#pDur").textContent = (m.duration || 60) + " min";
  const st = $("#pStatus");
  if (st) {
    st.textContent = m.status === "live" ? "AO VIVO" : "ABERTA";
    st.className = "value " + (m.status === "live" ? "live" : "wait");
  }
  $("#btnConfirm")?.classList.toggle("hidden", !!state.player.presence);
  const ent = $("#btnEnter");
  if (ent) {
    ent.classList.toggle("hidden", !state.player.presence);
    ent.textContent = m.status === "live" ? "ENTRAR NO JOGO" : "AGUARDAR INÍCIO";
  }
}

function fillOrg() {
  const m = state.match;
  if ($("#oName")) $("#oName").value = m.name || "";
  if ($("#oLoc")) $("#oLoc").value = m.location || "";
  if ($("#oDur")) $("#oDur").value = m.duration || 60;
  $$(".obj-btn:not(:disabled)").forEach(b => {
    b.classList.toggle("active", b.dataset.obj === m.objective);
  });
  $("#btnEnd")?.classList.toggle("hidden", m.status !== "live");
  updateMarkPanel();
  paintOrg();
}

function readOrg() {
  state.match.name = ($("#oName")?.value || "").trim();
  state.match.location = ($("#oLoc")?.value || "").trim();
  state.match.duration = Number($("#oDur")?.value) || 60;
}

function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function render() {
  if (!state.gps.ok) { showGpsGate(); return; }
  hideGpsGate();
  renderHeader();
  const sc = document.querySelector(".screen.active")?.dataset.screen;
  if (sc === "player") renderPlayer();
  if (sc === "organizer") fillOrg();
  if (sc !== "player") stopAnim();
}

/* ── Actions ── */
function saveMatch(enter) {
  readOrg();
  if (!state.match.name) return toast("Informe o nome.");
  if (!hasMap()) return toast("Envie ou gere um mapa antes.");
  state.match.exists = true;
  state.match.status = enter ? "live" : "open";
  if (enter) {
    state.match.startedAt = Date.now();
    state.match.elapsed = 0;
    state.player.presence = true;
    state.player.alive = true;
    startTimer();
  } else {
    state.match.startedAt = null;
    state.match.elapsed = 0;
    state.player.presence = false;
    state.player.alive = true;
  }
  save();
  if (enter) {
    show("player");
    toast("Partida iniciada — você entrou.");
  } else {
    render();
    toast("Partida aberta para jogadores.");
  }
}

function endMatch() {
  state.match.status = "ended";
  stopTimer();
  save();
  render();
  toast("Partida encerrada.");
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    if (state.match.status !== "live") return;
    state.match.elapsed = Math.floor((Date.now() - (state.match.startedAt || Date.now())) / 1000);
    const max = (state.match.duration || 60) * 60;
    if (state.match.elapsed >= max) { endMatch(); return; }
    const t = $("#pTimer");
    if (t) t.textContent = fmt(state.match.elapsed);
    save();
  }, 1000);
}
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

function startAnim() {
  stopAnim();
  const loop = () => {
    if (state.match.status === "live") paintPlayer();
    animFrame = requestAnimationFrame(loop);
  };
  animFrame = requestAnimationFrame(loop);
}
function stopAnim() { if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; } }

function onMapTap(e) {
  e.preventDefault();
  if (!hasMap()) return toast("Envie ou gere o mapa primeiro.");
  const canvas = $("#mapCanvas");
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  const x = (t.clientX - rect.left) / rect.width;
  const y = (t.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;

  if (state.tool === "erase") {
    state.match.marks = (state.match.marks || []).filter(m => Math.hypot(m.x - x, m.y - y) > 0.05);
  } else if (state.tool === "zone") {
    state.match.marks.push({ type: "zone", x, y, r: 0.09 });
  } else if (state.tool === "base") {
    state.match.marks.push({ type: "base", x, y });
  } else if (state.tool === "flag") {
    state.match.marks.push({ type: "flag", x, y });
  } else if (state.tool === "bomb") {
    state.match.marks.push({ type: "bomb", x, y });
  } else {
    state.match.marks.push({ type: "point", x, y });
  }
  save();
  paintOrg();
}

/* ── Events ── */
$("#gpsRetry")?.addEventListener("click", () => requestGps());
$("#gpsDeny")?.addEventListener("click", () => {
  // loop: volta a mostrar o aviso
  showGpsGate();
  toast("Sem localização o app não funciona.");
});

document.addEventListener("click", (e) => {
  const role = e.target.closest("[data-role]");
  if (role) {
    if (!state.gps.ok) { showGpsGate(); return; }
    state.role = role.dataset.role;
    save();
    show(state.role === "organizer" ? "organizer" : "player");
    return;
  }
  const tool = e.target.closest("[data-tool]");
  if (tool) {
    state.tool = tool.dataset.tool;
    $$(".tool-btn[data-tool]").forEach(b => b.classList.toggle("active", b === tool));
    return;
  }
  const obj = e.target.closest(".obj-btn:not(:disabled)");
  if (obj && obj.dataset.obj) {
    state.match.objective = obj.dataset.obj;
    $$(".obj-btn:not(:disabled)").forEach(b => b.classList.toggle("active", b === obj));
    save();
    toast("Objetivo: " + (OBJ_LABELS[obj.dataset.obj] || obj.dataset.obj));
  }
});

$("#mapFile")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.match.mapImage = reader.result;
    state.match.terrain = null;
    save();
    updateMarkPanel();
    paintOrg();
    toast("Mapa enviado. Agora marque os pontos.");
  };
  reader.readAsDataURL(file);
});

$("#btnGenMap")?.addEventListener("click", () => {
  state.match.terrain = generateTerrain(Date.now());
  state.match.mapImage = null;
  state.match.marks = [];
  const img = $("#mapImg");
  if (img) { img.src = ""; img.classList.remove("show"); }
  save();
  updateMarkPanel();
  paintOrg();
  toast("Mapa tático gerado.");
});

$("#btnClearMarks")?.addEventListener("click", () => {
  state.match.marks = [];
  save();
  paintOrg();
  toast("Marcas limpas");
});

$("#mapCanvas")?.addEventListener("pointerdown", onMapTap);

$("#btnSaveEnter")?.addEventListener("click", () => saveMatch(true));
$("#btnSaveOnly")?.addEventListener("click", () => saveMatch(false));
$("#btnEnd")?.addEventListener("click", endMatch);
$("#btnEndFromGame")?.addEventListener("click", endMatch);
$("#btnOrgFromGame")?.addEventListener("click", () => {
  state.role = "organizer";
  save();
  show("organizer");
});
$("#btnOrgBack")?.addEventListener("click", () => show("role"));
$("#btnConfirm")?.addEventListener("click", () => {
  state.player.presence = true; save(); render(); toast("Presença confirmada");
});
$("#btnEnter")?.addEventListener("click", () => {
  if (!state.player.presence) return toast("Confirme presença");
  if (state.match.status !== "live") return toast("Aguarde o início");
  state.player.alive = true; save(); render();
});
$("#btnHit")?.addEventListener("click", () => {
  state.player.alive = false; save(); render(); toast("HIT — OUT");
});
$("#btnLeave")?.addEventListener("click", () => {
  state.player.presence = false; state.player.alive = true; save(); show("player"); toast("Abandonou");
});

$("#devBtn")?.addEventListener("click", () => show("dev"));
$("#devBack")?.addEventListener("click", () => show(prevScreen || "role"));
$("#devPlayer")?.addEventListener("click", () => { state.role = "player"; save(); show("player"); });
$("#devOrg")?.addEventListener("click", () => { state.role = "organizer"; save(); show("organizer"); });
$("#devReset")?.addEventListener("click", () => {
  if (!confirm("Apagar tudo?")) return;
  localStorage.removeItem(KEY);
  state = initial();
  stopTimer(); stopAnim();
  show("role");
  requestGps();
});

window.addEventListener("resize", () => { paintOrg(); if (state.match.status === "live") paintPlayer(); });

/* Boot */
load();
requestGps();
if (state.role === "player") show("player");
else if (state.role === "organizer") show("organizer");
else show("role");
if (state.match.status === "live") startTimer();
render();