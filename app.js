const KEY = "df_terminal_v10";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function initial() {
  return {
    role: "player",
    match: {
      exists: false, name: "", status: "none",
      date: "", time: "", location: "", map: "Complexo Industrial",
      mode: "Simulação", duration: 60, startedAt: null, elapsed: 0
    },
    org: {
      briefTitle: "Briefing da Operação",
      briefText: "Objetivo, regras e orientações da partida.",
      objective: "Dominar setores e eliminar a força adversária.",
      blueName: "Equipe Azul", blueLimit: 20,
      redName: "Equipe Vermelha", redLimit: 20
    },
    player: {
      id: "DF-001", name: "DANI", class: "Assalto", team: "azul",
      presence: false, entry: false, briefAck: false,
      radio: true, channel: 1, alive: true, kills: 0
    },
    sectors: { alfa: "neutro", bravo: "neutro" },
    map: {
      playerPos: { x: 0.5, y: 0.5 },
      enemies: [],
      mines: [],
      friends: [],
      droneReady: false,
      revealed: false
    },
    locked: true
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const s = JSON.parse(raw);
    const base = initial();
    return {
      ...base, ...s,
      match: { ...base.match, ...(s.match || {}) },
      org: { ...base.org, ...(s.org || {}) },
      player: { ...base.player, ...(s.player || {}) },
      sectors: { ...base.sectors, ...(s.sectors || {}) },
      map: { ...base.map, ...(s.map || {}) }
    };
  } catch { return initial(); }
}

let state = load();
let prevScreen = "player";
let current = "role";
let timerId = null;
let vuActive = false;
let unlockTimer = null;
let unlockProgress = 0;
let gpsWatch = null;
let mapAnim = null;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

function statusLabel(s) {
  return { none: "SEM PARTIDA", scheduled: "AGENDADA", live: "AO VIVO", ended: "ENCERRADA" }[s] || "SEM PARTIDA";
}
function fmtDate(d) {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}
function fmtDur(m) {
  if (!m) return "—";
  const v = Number(m);
  return v < 60 ? `${v} min` : `${Math.floor(v / 60)}h${v % 60 ? " " + (v % 60) + "min" : ""}`;
}
function fmtTimer(sec) {
  const t = Math.max(0, Number(sec) || 0);
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
function teamName(t) {
  return t === "azul" ? (state.org.blueName || "Equipe Azul") : (state.org.redName || "Equipe Vermelha");
}

function show(name, remember = true) {
  const target = $(`[data-screen="${name}"]`);
  if (!target) return;
  if (remember && current !== name && name !== "dev") prevScreen = current;
  current = name;
  $$(".screen").forEach(s => s.classList.remove("active"));
  target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" });

  if (name === "tactical") {
    state.locked = true;
    updateLock();
    startGps();
    spawnEnemiesIfNeeded();
    drawMap();
    startMapLoop();
  } else {
    stopMapLoop();
    stopGps();
    updateVu(false);
  }
  render();
}

function render() {
  renderHeader();
  renderPlayer();
  renderPrep();
  renderTactical();
  renderOrganizer();
  renderDetails();
}

function renderHeader() {
  const el = $("#globalStatus");
  if (!el) return;
  const st = state.match.exists ? state.match.status : "none";
  el.textContent = statusLabel(st);
  el.className = "status-chip " + (st === "live" ? "live" : st === "scheduled" ? "scheduled" : st === "ended" ? "ended" : "");
}

function renderPlayer() {
  const m = state.match;
  const has = m.exists && m.status !== "ended";
  setText("#pMatchName", has ? (m.name || "Partida") : "Nenhuma partida");
  const pill = $("#pMatchState");
  if (pill) {
    pill.textContent = statusLabel(has ? m.status : "none");
    pill.className = "state-pill " + (m.status === "live" ? "live" : m.status === "scheduled" ? "scheduled" : "");
  }
  setText("#pMatchDate", fmtDate(m.date));
  setText("#pMatchTime", m.time || "—");
  setText("#pMatchLocation", m.location || "—");
  setText("#pMatchMap", m.map || "—");
  setText("#pMatchMode", m.mode || "—");
  setText("#pMatchDuration", fmtDur(m.duration));
  setText("#pName", state.player.name);
  setText("#pTeam", state.player.team ? teamName(state.player.team) : "—");

  let status = "Aguardando", badge = "AGUARDANDO", badgeCls = "waiting";
  if (!state.player.alive) { status = "Eliminado"; badge = "HIT"; badgeCls = "ended"; }
  else if (state.player.presence && !state.player.entry) { status = "Presença confirmada"; badge = "CONFIRMADO"; badgeCls = "ok"; }
  else if (state.player.entry) { status = "Entrada solicitada"; badge = "AGUARDANDO"; badgeCls = "waiting"; }
  else if (m.status === "live" && state.player.presence) { status = "Em operação"; badge = "AO VIVO"; badgeCls = "live"; }
  setText("#pPartStatus", status);
  const b = $("#pPartBadge");
  if (b) { b.textContent = badge; b.className = "state-pill " + badgeCls; }

  const showConfirm = has && m.status === "scheduled" && !state.player.presence && state.player.alive;
  const showRequest = has && m.status === "scheduled" && state.player.presence && !state.player.entry;
  const showEnter = has && state.player.alive && (m.status === "live" || (m.status === "scheduled" && state.player.presence));
  toggle("#btnConfirm", showConfirm);
  toggle("#btnRequest", showRequest);
  toggle("#btnEnter", showEnter);
}

function renderPrep() {
  setText("#prepTitle", state.org.briefTitle || "Briefing");
  setText("#prepText", state.org.briefText || "—");
  setText("#prepObjective", state.org.objective || "—");
  const ack = $("#prepAck");
  if (ack) ack.checked = !!state.player.briefAck;
  const btn = $("#btnPrepEnter");
  if (btn) btn.disabled = !state.player.briefAck;
}

function renderTactical() {
  setText("#tacMatchName", state.match.name || "—");
  setText("#tacTimer", fmtTimer(state.match.elapsed));
  setText("#chDisplay", "CH " + String(state.player.channel).padStart(2, "0"));
  setText("#secAlfa", (state.sectors.alfa || "neutro").toUpperCase());
  setText("#secBravo", (state.sectors.bravo || "neutro").toUpperCase());
  const a = $("#secAlfa"), b = $("#secBravo");
  if (a) a.className = state.sectors.alfa || "neutro";
  if (b) b.className = state.sectors.bravo || "neutro";

  const rt = $("#radioToggle");
  if (rt) {
    rt.textContent = state.player.radio ? "ON" : "OFF";
    rt.className = "radio-toggle" + (state.player.radio ? " on" : "");
  }
  updateVu(state.player.radio && current === "tactical" && !state.locked);

  setText("#killCount", `ELIMINAÇÕES: ${state.player.kills}/3`);
  const ds = $("#droneStatus");
  if (ds) {
    ds.textContent = state.map.droneReady ? "DRONE: POSIÇÕES DISPONÍVEIS" : "DRONE: STANDBY";
    ds.className = state.map.droneReady ? "ready" : "";
  }

  const isOrg = state.role === "organizer";
  toggle("#tacEnd", isOrg && state.match.status === "live");
  toggle("#tacLeave", true);
  updateLock();
}

function renderOrganizer() {
  const m = state.match;
  const pill = $("#orgStatus");
  if (pill) {
    pill.textContent = statusLabel(m.exists ? m.status : "none");
    pill.className = "state-pill " + (m.status === "live" ? "live" : m.status === "scheduled" ? "scheduled" : "");
  }
  setVal("#oName", m.name);
  setVal("#oDate", m.date);
  setVal("#oTime", m.time);
  setVal("#oLocation", m.location);
  setVal("#oMap", m.map);
  setVal("#oMode", m.mode);
  setVal("#oDuration", m.duration);
  setVal("#oBriefTitle", state.org.briefTitle);
  setVal("#oBriefText", state.org.briefText);
  setVal("#oObjective", state.org.objective);
  setVal("#oBlueName", state.org.blueName);
  setVal("#oBlueLimit", state.org.blueLimit);
  setVal("#oRedName", state.org.redName);
  setVal("#oRedLimit", state.org.redLimit);
  toggle("#oStart", m.exists && m.status === "scheduled");
  toggle("#oEnd", m.status === "live");
}

function renderDetails() {
  const p = state.player;
  setText("#dId", p.id);
  setText("#dName", p.name);
  setText("#dClass", p.class);
  setText("#dTeam", p.team ? teamName(p.team) : "—");
  setText("#dRadio", p.radio ? "ON" : "OFF");
  setText("#dChannel", String(p.channel).padStart(2, "0"));
}

function updateLock() {
  const lock = $("#tacLock");
  if (!lock) return;
  lock.classList.toggle("hidden", !state.locked);
}

function startUnlock(e) {
  e.preventDefault();
  if (!state.locked) return;
  unlockProgress = 0;
  const btn = $("#unlockBtn");
  const bar = $("#unlockBar");
  btn?.classList.add("holding");
  clearInterval(unlockTimer);
  unlockTimer = setInterval(() => {
    unlockProgress += 4;
    if (bar) bar.style.width = unlockProgress + "%";
    if (unlockProgress >= 100) {
      clearInterval(unlockTimer);
      state.locked = false;
      updateLock();
      toast("Painel liberado.");
      if (state.player.radio) updateVu(true);
      btn?.classList.remove("holding");
      if (bar) bar.style.width = "0%";
    }
  }, 60);
}

function cancelUnlock() {
  clearInterval(unlockTimer);
  unlockProgress = 0;
  const btn = $("#unlockBtn");
  const bar = $("#unlockBar");
  btn?.classList.remove("holding");
  if (bar) bar.style.width = "0%";
}

function startGps() {
  if (!navigator.geolocation) {
    setText("#mapStatus", "GPS OFF");
    return;
  }
  setText("#mapStatus", "GPS…");
  gpsWatch = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      state.map.playerPos.x = 0.3 + (Math.abs(lng) % 1) * 0.4;
      state.map.playerPos.y = 0.3 + (Math.abs(lat) % 1) * 0.4;
      setText("#mapStatus", "GPS OK");
      checkMines();
      drawMap();
    },
    () => setText("#mapStatus", "GPS ERR"),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
  );
}

function stopGps() {
  if (gpsWatch) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
}

function spawnEnemiesIfNeeded() {
  if (state.map.enemies.length > 0) return;
  for (let i = 0; i < 8; i++) {
    state.map.enemies.push({
      id: i,
      x: 0.15 + Math.random() * 0.7,
      y: 0.15 + Math.random() * 0.7,
      visible: false,
      alive: true
    });
  }
  state.map.friends = [
    { x: 0.45, y: 0.55 },
    { x: 0.55, y: 0.4 }
  ];
  save();
}

function drawMap() {
  const canvas = $("#tacMap");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "#1a221c";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8) * w;
    const y = (i / 8) * h;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  state.map.mines.forEach(m => {
    if (!m.active) return;
    const mx = m.x * w, my = m.y * h;
    ctx.fillStyle = "#b89a5e";
    ctx.fillRect(mx - 5, my - 5, 10, 10);
    ctx.strokeStyle = "#8a7348";
    ctx.strokeRect(mx - 5, my - 5, 10, 10);
  });

  state.map.friends.forEach(f => {
    ctx.beginPath();
    ctx.arc(f.x * w, f.y * h, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#4a6a8b";
    ctx.fill();
  });

  state.map.enemies.forEach(e => {
    if (!e.alive) return;
    if (!e.visible && !state.map.revealed) return;
    ctx.beginPath();
    ctx.arc(e.x * w, e.y * h, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#a05050";
    ctx.fill();
    ctx.strokeStyle = "#c07070";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const px = state.map.playerPos.x * w;
  const py = state.map.playerPos.y * h;
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#7a8b5c";
  ctx.fill();
  ctx.strokeStyle = "#a0b070";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + 14, py - 6);
  ctx.lineTo(px + 14, py + 6);
  ctx.closePath();
  ctx.fillStyle = "rgba(122,139,92,0.4)";
  ctx.fill();
}

function startMapLoop() {
  stopMapLoop();
  mapAnim = setInterval(() => {
    state.map.enemies.forEach(e => {
      if (!e.alive) return;
      e.x += (Math.random() - 0.5) * 0.004;
      e.y += (Math.random() - 0.5) * 0.004;
      e.x = Math.max(0.05, Math.min(0.95, e.x));
      e.y = Math.max(0.05, Math.min(0.95, e.y));
    });
    drawMap();
  }, 800);
}

function stopMapLoop() {
  if (mapAnim) { clearInterval(mapAnim); mapAnim = null; }
}

function checkMines() {
  if (!state.player.alive || state.match.status !== "live") return;
  const p = state.map.playerPos;
  state.map.mines.forEach(m => {
    if (!m.active) return;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.06) {
      m.active = false;
      takeHit("MINA");
      save();
    }
  });
}

function takeHit(reason = "HIT") {
  if (!state.player.alive) return;
  state.player.alive = false;
  state.locked = true;
  updateLock();
  updateVu(false);
  save();
  render();
  toast(reason + " — você está fora. Dead rag.");
}

function registerKill() {
  if (!state.player.alive || state.match.status !== "live") return toast("Não disponível.");
  state.player.kills = Math.min(3, state.player.kills + 1);
  const hidden = state.map.enemies.filter(e => e.alive && !e.visible);
  if (hidden.length) {
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    pick.visible = true;
  }
  if (state.player.kills >= 3 && !state.map.droneReady) {
    state.map.droneReady = true;
    state.map.revealed = true;
    state.map.enemies.forEach(e => { if (e.alive) e.visible = true; });
    toast("DRONE: posições inimigas atualizadas.");
  } else {
    toast("Eliminação registrada (" + state.player.kills + "/3).");
  }
  save();
  render();
  drawMap();
}

function updateVu(on) {
  const meter = $("#vuMeter");
  if (!meter) return;
  if (on) {
    meter.classList.add("active");
    vuActive = true;
    randomizeVu();
  } else {
    meter.classList.remove("active");
    vuActive = false;
    meter.querySelectorAll("span").forEach(s => { s.style.height = "8%"; });
  }
}
function randomizeVu() {
  if (!vuActive) return;
  $$("#vuMeter span").forEach(bar => {
    bar.style.height = (15 + Math.random() * 85) + "%";
  });
  setTimeout(randomizeVu, 90 + Math.random() * 70);
}

function startTimer() {
  stopTimer();
  if (state.match.status !== "live") return;
  if (!state.match.startedAt) state.match.startedAt = Date.now() - (state.match.elapsed || 0) * 1000;
  timerId = setInterval(() => {
    state.match.elapsed = Math.floor((Date.now() - state.match.startedAt) / 1000);
    setText("#tacTimer", fmtTimer(state.match.elapsed));
    if (state.match.elapsed % 20 === 0) save();
  }, 1000);
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function selectRole(role) {
  state.role = role;
  save();
  show(role === "player" ? "player" : "organizer", false);
}

function confirmPresence() {
  if (!state.match.exists) return toast("Nenhuma partida.");
  state.player.presence = true;
  save();
  toast("Presença confirmada.");
  show("prep");
}

function requestEntry() {
  state.player.entry = true;
  save();
  show("waiting");
  toast("Solicitação enviada.");
}

function enterMatch() {
  if (!state.player.briefAck && state.match.status === "scheduled") {
    show("prep");
    return toast("Confirme o briefing antes.");
  }
  if (state.match.status !== "live") {
    show("waiting");
    return;
  }
  state.player.alive = true;
  show("tactical");
  startTimer();
}

function ackBrief() {
  const cb = $("#prepAck");
  state.player.briefAck = !!cb?.checked;
  save();
  const btn = $("#btnPrepEnter");
  if (btn) btn.disabled = !state.player.briefAck;
}

function readOrg() {
  state.match.name = val("#oName");
  state.match.date = val("#oDate");
  state.match.time = val("#oTime");
  state.match.location = val("#oLocation");
  state.match.map = val("#oMap") || "Complexo Industrial";
  state.match.mode = val("#oMode") || "Simulação";
  state.match.duration = Number(val("#oDuration")) || 60;
  state.org.briefTitle = val("#oBriefTitle") || "Briefing da Operação";
  state.org.briefText = val("#oBriefText") || "";
  state.org.objective = val("#oObjective") || "";
  state.org.blueName = val("#oBlueName") || "Equipe Azul";
  state.org.blueLimit = Number(val("#oBlueLimit")) || 20;
  state.org.redName = val("#oRedName") || "Equipe Vermelha";
  state.org.redLimit = Number(val("#oRedLimit")) || 20;
}

function saveMatch() {
  readOrg();
  if (!state.match.name.trim()) return toast("Informe o nome da partida.");
  state.match.exists = true;
  if (state.match.status === "none" || state.match.status === "ended") {
    state.match.status = "scheduled";
    state.match.elapsed = 0;
    state.match.startedAt = null;
  }
  state.player.presence = false;
  state.player.entry = false;
  state.player.briefAck = false;
  state.player.alive = true;
  state.player.kills = 0;
  state.map.enemies = [];
  state.map.mines = [];
  state.map.droneReady = false;
  state.map.revealed = false;
  save();
  render();
  toast("Partida salva.");
}

function startMatch() {
  if (!state.match.exists) return toast("Salve a partida primeiro.");
  state.match.status = "live";
  state.match.startedAt = Date.now();
  state.match.elapsed = 0;
  state.player.alive = true;
  state.player.kills = 0;
  state.map.droneReady = false;
  state.map.revealed = false;
  state.map.enemies = [];
  spawnEnemiesIfNeeded();
  save();
  render();
  startTimer();
  toast("Partida iniciada.");
  if (state.role === "organizer") show("tactical");
}

function endMatch() {
  state.match.status = "ended";
  stopTimer();
  updateVu(false);
  stopMapLoop();
  save();
  render();
  toast("Partida encerrada.");
  show(state.role === "organizer" ? "organizer" : "player");
}

function leaveMatch() {
  updateVu(false);
  stopMapLoop();
  stopGps();
  show(state.role === "organizer" ? "organizer" : "player");
  toast(state.role === "organizer" ? "Saiu do painel." : "Você abandonou a partida.");
}

function toggleRadio() {
  state.player.radio = !state.player.radio;
  save();
  render();
  updateVu(state.player.radio && current === "tactical" && !state.locked);
}

function changeCh(d) {
  state.player.channel = Math.max(1, Math.min(99, (state.player.channel || 1) + d));
  save();
  setText("#chDisplay", "CH " + String(state.player.channel).padStart(2, "0"));
}

function setText(s, t) { const el = $(s); if (el) el.textContent = t ?? "—"; }
function setVal(s, v) { const el = $(s); if (el) el.value = v ?? ""; }
function val(s) { return $(s)?.value?.trim() || ""; }
function toggle(s, show) { const el = $(s); if (el) el.classList.toggle("hidden", !show); }

document.addEventListener("click", (e) => {
  const role = e.target.closest("[data-role]");
  if (role) { selectRole(role.dataset.role); return; }

  const back = e.target.closest("[data-back]");
  if (back) {
    const t = back.dataset.back;
    if (t === "previous") show(prevScreen || "player", false);
    else show(t, false);
    return;
  }

  if (e.target.closest("#devBtn")) { show("dev"); return; }
  if (e.target.closest("#playerDetailsBtn")) { show("details"); return; }
  if (e.target.closest("#btnConfirm")) { confirmPresence(); return; }
  if (e.target.closest("#btnRequest")) { requestEntry(); return; }
  if (e.target.closest("#btnEnter") || e.target.closest("#btnPrepEnter")) { enterMatch(); return; }
  if (e.target.closest("#oSave")) { saveMatch(); return; }
  if (e.target.closest("#oStart")) { startMatch(); return; }
  if (e.target.closest("#oEnd") || e.target.closest("#tacEnd")) { endMatch(); return; }
  if (e.target.closest("#tacLeave") || e.target.closest("#oLeave")) { leaveMatch(); return; }
  if (e.target.closest("#radioToggle")) { toggleRadio(); return; }
  if (e.target.closest("#chDown")) { changeCh(-1); return; }
  if (e.target.closest("#chUp")) { changeCh(1); return; }
  if (e.target.closest("#btnHit")) { takeHit("HIT"); return; }
  if (e.target.closest("#btnKill")) { registerKill(); return; }
  if (e.target.closest("#oClearMines")) {
    state.map.mines = [];
    save();
    toast("Minas limpas.");
    return;
  }

  if (e.target.closest("#devGen")) {
    state.match = {
      exists: true, name: "Operação Red Sand", status: "scheduled",
      date: "2026-10-18", time: "09:00", location: "Campo Norte",
      map: "Complexo Industrial", mode: "Simulação", duration: 90,
      startedAt: null, elapsed: 0
    };
    state.player.presence = false;
    state.player.entry = false;
    state.player.briefAck = false;
    state.player.alive = true;
    state.player.kills = 0;
    state.map.enemies = [];
    state.map.mines = [];
    state.map.droneReady = false;
    state.map.revealed = false;
    save(); render(); toast("Partida gerada.");
    return;
  }
  if (e.target.closest("#devStart")) { startMatch(); return; }
  if (e.target.closest("#devEnd")) { endMatch(); return; }
  if (e.target.closest("#devReset")) {
    localStorage.removeItem(KEY);
    state = initial();
    stopTimer(); stopMapLoop(); stopGps(); updateVu(false);
    show("role", false);
    render();
    toast("Dados resetados.");
    return;
  }

  const seg = e.target.closest("[data-status]");
  if (seg) {
    state.match.status = seg.dataset.status;
    if (seg.dataset.status === "live") {
      state.match.startedAt = Date.now();
      state.match.elapsed = 0;
      startTimer();
      spawnEnemiesIfNeeded();
    } else stopTimer();
    if (!state.match.exists) state.match.exists = true;
    save(); render();
    toast("Status → " + statusLabel(seg.dataset.status));
  }
});

$("#prepAck")?.addEventListener("change", ackBrief);

const unlockBtn = $("#unlockBtn");
if (unlockBtn) {
  unlockBtn.addEventListener("pointerdown", startUnlock);
  unlockBtn.addEventListener("pointerup", cancelUnlock);
  unlockBtn.addEventListener("pointercancel", cancelUnlock);
  unlockBtn.addEventListener("pointerleave", cancelUnlock);
}

const ptt = $("#pttBtn");
if (ptt) {
  const startTx = (e) => {
    e.preventDefault();
    if (state.locked || !state.player.radio) return toast(state.locked ? "Desbloqueie o painel." : "Rádio desligado.");
    ptt.classList.add("transmitting");
    setText("#radioStatus", "TRANSMITINDO");
    $("#radioStatus")?.classList.add("tx");
  };
  const endTx = () => {
    ptt.classList.remove("transmitting");
    setText("#radioStatus", "PRONTO");
    $("#radioStatus")?.classList.remove("tx");
  };
  ptt.addEventListener("pointerdown", startTx);
  ptt.addEventListener("pointerup", endTx);
  ptt.addEventListener("pointercancel", endTx);
  ptt.addEventListener("pointerleave", endTx);
}

$("#tacMap")?.addEventListener("click", (e) => {
  if (state.locked || state.role !== "organizer") return;
  const canvas = $("#tacMap");
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  if (state.map.mines.length >= 6) return toast("Máximo de 6 minas.");
  state.map.mines.push({ x, y, active: true });
  save();
  drawMap();
  toast("Mina posicionada.");
});

function boot() {
  if (localStorage.getItem(KEY)) {
    show(state.role === "organizer" ? "organizer" : "player", false);
  } else {
    show("role", false);
  }
  if (state.match.status === "live") startTimer();
  render();
}
boot();
