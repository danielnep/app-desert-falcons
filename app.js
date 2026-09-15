const KEY = "df_terminal_v10";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function initial() {
  return {
    role: "player",
    match: {
      exists: false, name: "", status: "none",
      date: "", time: "", location: "", map: "Complexo Industrial",
      mode: "Simulação", duration: 60, checkIn: "", startedAt: null, elapsed: 0
    },
    org: {
      briefTitle: "Briefing da Operação",
      briefText: "Objetivo, regras e orientações da partida.",
      objective: "Dominar setores e eliminar a força adversária.",
      blueName: "Equipe Azul", blueLimit: 20,
      redName: "Equipe Vermelha", redLimit: 20, participates: true
    },
    player: {
      id: "DF-001", name: "DANI", class: "Assalto", team: "azul",
      presence: false, entry: false, briefAck: false,
      radio: true, channel: 1, radioVolume: 70, alive: true, kills: 0
    },
    modules: { medical: true, zone: true, score: false, tracking: false, objectives: true, events: false },
    simulatedPlayers: { perTeam: 0 },
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
      map: { ...base.map, ...(s.map || {}) },
      modules: { ...base.modules, ...(s.modules || {}) },
      simulatedPlayers: { ...base.simulatedPlayers, ...(s.simulatedPlayers || {}) }
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
  renderLobby();
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
  const vol = $("#radioVol");
  if (vol) vol.value = state.player.radioVolume ?? 70;
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
  if (!window._pttActive) updateVu(false);

  setText("#killCount", `ELIM ${state.player.kills}/3`);
  const ds = $("#droneStatus");
  if (ds) {
    ds.textContent = state.map.droneReady ? "DRONE OK" : "DRONE STANDBY";
    ds.className = state.map.droneReady ? "ready" : "";
  }
  // placar
  const sim = state.simulatedPlayers?.perTeam || 0;
  const blueScore = state.player.team === "azul" ? state.player.kills : Math.floor(sim * 0.4);
  const redScore = state.player.team === "vermelho" ? state.player.kills : Math.floor(sim * 0.35) + (state.player.team === "azul" ? 0 : state.player.kills);
  setText("#scoreBlue", String(state.player.team === "azul" ? state.player.kills + sim : sim));
  setText("#scoreRed", String(state.player.team !== "azul" ? state.player.kills + sim : Math.max(0, sim - 1)));
  setText("#scoreKills", state.player.kills + " ELIM");
  const pill = $("#tacLivePill");
  if (pill) {
    pill.textContent = state.match.status === "live" ? "ATIVO" : statusLabel(state.match.status);
    pill.className = "state-pill " + (state.match.status === "live" ? "live" : "");
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
  setVal("#oBriefText", state.org.briefText);
  setVal("#oObjective", state.org.objective);
  setVal("#oBlueName", state.org.blueName);
  setVal("#oBlueLimit", state.org.blueLimit);
  setVal("#oRedName", state.org.redName);
  setVal("#oRedLimit", state.org.redLimit);
  toggle("#oEnd", m.status === "live");
}

function renderLobby() {
  setText("#lobbyMatchName", state.match.name || "Partida");
  const sim = state.simulatedPlayers?.perTeam || 0;
  const count = (state.player.presence ? 1 : 0) + sim * 2;
  setText("#lobbyCount", String(count));
  setText("#lobbyPresence", count ? count + " presença(s) confirmada(s)." : "Aguardando jogadores confirmarem.");
  const link = location.origin + location.pathname + "?join=1&m=" + encodeURIComponent(state.match.name || "partida");
  const input = $("#lobbyLink");
  if (input) input.value = link;
  const st = $("#lobbyStatus");
  if (st) {
    st.textContent = state.match.status === "live" ? "AO VIVO" : "AGUARDANDO";
    st.className = "state-pill " + (state.match.status === "live" ? "live" : "scheduled");
  }
}

function renderDetails() {
  const p = state.player;
  const m = state.match;
  setText("#dId", p.id);
  setText("#dName", p.name);
  setText("#dClass", p.class);
  setText("#dTeam", p.team ? teamName(p.team) : "—");
  setText("#dRadio", p.radio ? "ON" : "OFF");
  setText("#dChannel", String(p.channel).padStart(2, "0"));
  setText("#dMatchName", m.exists ? (m.name || "—") : "—");
  setText("#dMatchStatus", m.exists ? statusLabel(m.status) : "—");
  setText("#dMatchMap", m.map || "—");
  setText("#dMatchMode", m.mode || "—");
  setText("#dBriefTitle", state.org.briefTitle || "—");
  setText("#dBriefText", state.org.briefText || "—");
  setText("#dObjective", state.org.objective || "—");
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
  for (let i = 0; i < 10; i++) {
    state.map.enemies.push({
      id: i,
      x: 0.55 + Math.random() * 0.38,
      y: 0.25 + Math.random() * 0.55,
      visible: true,
      alive: true
    });
  }
  state.map.friends = [];
  for (let i = 0; i < 7; i++) {
    state.map.friends.push({
      x: 0.08 + Math.random() * 0.4,
      y: 0.25 + Math.random() * 0.45
    });
  }
  save();
}

function drawMap() {
  const canvas = $("#tacMap");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // dark ground - multiple gray tones
  ctx.fillStyle = "#0e100c";
  ctx.fillRect(0, 0, w, h);

  // fine grid (dry grays)
  ctx.strokeStyle = "#1a1c16";
  ctx.lineWidth = 1;
  const step = 20;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
  // stronger every 4th line
  ctx.strokeStyle = "#24261e";
  for (let x = 0; x <= w; x += step * 4) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += step * 4) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }

  // roads - mid gray asphalt bands
  ctx.fillStyle = "#2a2c28";
  // horizontal
  ctx.fillRect(0, h * 0.42, w, h * 0.07);
  ctx.fillRect(0, h * 0.72, w * 0.55, h * 0.05);
  // vertical / diagonal-ish strips
  ctx.fillRect(w * 0.48, 0, w * 0.07, h);
  ctx.save();
  ctx.translate(w * 0.72, h * 0.55);
  ctx.rotate(-0.35);
  ctx.fillRect(-w * 0.08, -h * 0.02, w * 0.55, h * 0.05);
  ctx.restore();

  // road edge highlight
  ctx.strokeStyle = "#3a3c36";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, h * 0.42, w, h * 0.07);
  ctx.strokeRect(w * 0.48, 0, w * 0.07, h);

  // units / buildings - yellow border like screenshot
  const units = [
    { x: 0.06, y: 0.08, w: 0.28, h: 0.28, label: "UNIDADE 1", sub: "A definir" },
    { x: 0.38, y: 0.10, w: 0.22, h: 0.24, label: "UNIDADE 2", sub: "A definir" },
    { x: 0.66, y: 0.08, w: 0.28, h: 0.28, label: "UNIDADE 3", sub: "A definir" },
    { x: 0.32, y: 0.58, w: 0.28, h: 0.18, label: "VEÍCULO TÁTICO", sub: "A definir" },
    { x: 0.66, y: 0.58, w: 0.28, h: 0.18, label: "VEÍCULO TÁTICO", sub: "A definir" }
  ];
  units.forEach(u => {
    const bx = u.x * w, by = u.y * h, bw = u.w * w, bh = u.h * h;
    ctx.fillStyle = "rgba(18, 20, 16, 0.85)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#d4b84a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = "#d4b84a";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(u.label, bx + bw / 2, by + bh / 2 - 4);
    ctx.fillStyle = "#8a8860";
    ctx.font = "8px sans-serif";
    ctx.fillText(u.sub, bx + bw / 2, by + bh / 2 + 8);
  });

  // zone circles (objectives)
  [[0.12, 0.82], [0.88, 0.48]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * w, y * h, 22, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,184,74,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x * w, y * h, 16, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,184,74,0.25)";
    ctx.stroke();
  });

  // mines
  (state.map.mines || []).forEach(m => {
    if (!m.active) return;
    const mx = m.x * w, my = m.y * h;
    ctx.fillStyle = "#9a8a3a";
    ctx.beginPath();
    ctx.moveTo(mx, my - 5); ctx.lineTo(mx + 5, my + 4); ctx.lineTo(mx - 5, my + 4);
    ctx.closePath(); ctx.fill();
  });

  // glowing friends (yellow)
  const t = Date.now() / 1000;
  (state.map.friends || []).forEach((f, i) => {
    const fx = f.x * w, fy = f.y * h;
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.2 + i);
    ctx.beginPath();
    ctx.arc(fx, fy, 10 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(212, 184, 74, ${0.12 * pulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#e8d070";
    ctx.shadowColor = "#d4b84a";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // glowing enemies (red)
  (state.map.enemies || []).forEach((e, i) => {
    if (!e.alive) return;
    if (!e.visible && !state.map.revealed) return;
    const ex = e.x * w, ey = e.y * h;
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.5 + i * 0.7);
    ctx.beginPath();
    ctx.arc(ex, ey, 10 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 60, 60, ${0.15 * pulse})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#e06060";
    ctx.shadowColor = "#ff4040";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // player - white/yellow core like screenshot
  const px = state.map.playerPos.x * w;
  const py = state.map.playerPos.y * h;
  ctx.beginPath();
  ctx.arc(px, py, 12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8e0";
  ctx.shadowColor = "#d4b84a";
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#d4b84a";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function startMapLoop() {
  stopMapLoop();
  mapAnim = setInterval(() => {
    state.map.enemies.forEach(e => {
      if (!e.alive) return;
      e.x += (Math.random() - 0.5) * 0.006;
      e.y += (Math.random() - 0.5) * 0.006;
      e.x = Math.max(0.08, Math.min(0.92, e.x));
      e.y = Math.max(0.12, Math.min(0.88, e.y));
    });
    (state.map.friends || []).forEach(f => {
      f.x += (Math.random() - 0.5) * 0.004;
      f.y += (Math.random() - 0.5) * 0.004;
      f.x = Math.max(0.08, Math.min(0.5, f.x));
      f.y = Math.max(0.2, Math.min(0.7, f.y));
    });
    drawMap();
  }, 120);
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
  state.match.checkIn = val("#oCheckIn") || "";
  state.org.briefTitle = val("#oBriefTitle") || "Briefing da Operação";
  state.org.briefText = val("#oBriefText") || "";
  state.org.objective = val("#oObjective") || "";
  state.org.blueName = val("#oBlueName") || "Equipe Azul";
  state.org.blueLimit = Number(val("#oBlueLimit")) || 20;
  state.org.redName = val("#oRedName") || "Equipe Vermelha";
  state.org.redLimit = Number(val("#oRedLimit")) || 20;
  state.org.participates = true; // padrão
}

function prepareMatch() {
  readOrg();
  if (!state.match.name.trim()) {
    toast("Informe o nome da partida.");
    return false;
  }
  state.match.exists = true;
  state.match.elapsed = 0;
  state.match.startedAt = null;
  state.org.participates = true;
  state.player.presence = true; // org já está dentro
  state.player.entry = false;
  state.player.briefAck = true;
  state.player.alive = true;
  state.player.kills = 0;
  state.map.enemies = [];
  state.map.mines = [];
  state.map.droneReady = false;
  state.map.revealed = false;
  return true;
}

function scheduleMatch() {
  if (!prepareMatch()) return;
  state.match.status = "scheduled";
  state.role = "organizer";
  save();
  render();
  show("lobby");
  toast("Partida agendada. Envie o link.");
}

function startNow() {
  if (!prepareMatch()) return;
  state.match.status = "scheduled"; // lobby first, then live
  state.role = "organizer";
  save();
  render();
  show("lobby");
  toast("Lobby aberto. Aguarde presenças ou inicie.");
}

function saveMatch() { scheduleMatch(); }


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
  if (!window._pttActive) updateVu(false);
}

function changeCh(d) {
  state.player.channel = Math.max(1, Math.min(99, (state.player.channel || 1) + d));
  save();
  setText("#chDisplay", "CH " + String(state.player.channel).padStart(2, "0"));
  const vol = $("#radioVol");
  if (vol) vol.value = state.player.radioVolume ?? 70;
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
    window._pttActive = true;
    ptt.classList.add("transmitting");
    setText("#radioStatus", "TRANSMITINDO");
    $("#radioStatus")?.classList.add("tx");
    startMicMeter();
  };
  const endTx = () => {
    stopMicMeter();
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


// Tabs
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    $$(".tab-btn").forEach(b => b.classList.remove("active"));
    tab.classList.add("active");
    const name = tab.dataset.tab;
    $("#tabInicio")?.classList.toggle("hidden", name !== "inicio");
    $("#tabBriefing")?.classList.toggle("hidden", name !== "briefing");
    $("#tabPerfil")?.classList.toggle("hidden", name !== "perfil");
  }
});

$("#tacLockBtn")?.addEventListener("click", () => {
  state.locked = true;
  updateLock();
  updateVu(false);
  toast("Painel bloqueado.");
});

$("#radioVol")?.addEventListener("input", (e) => {
  state.player.radioVolume = Number(e.target.value);
  save();
});

$("#saveModalContinue")?.addEventListener("click", () => {
  $("#saveModal")?.classList.add("hidden");
});
$("#saveModalEnter")?.addEventListener("click", () => {
  $("#saveModal")?.classList.add("hidden");
  if (state.match.status === "scheduled") startMatch();
  else show("tactical");
});

$("#devApplyPlayers")?.addEventListener("click", () => {
  const n = Number(val("#devPlayersPerTeam")) || 0;
  state.simulatedPlayers.perTeam = Math.max(0, Math.min(200, n));
  setText("#devBlueCount", String(state.simulatedPlayers.perTeam));
  setText("#devRedCount", String(state.simulatedPlayers.perTeam));
  setText("#devTotalCount", String(state.simulatedPlayers.perTeam * 2));
  save();
  render();
  toast("Simulação aplicada: " + state.simulatedPlayers.perTeam + " por equipe.");
});

$("#devAsPlayer")?.addEventListener("click", () => {
  state.role = "player";
  save();
  show("player", false);
  toast("Modo jogador.");
});
$("#devAsOrg")?.addEventListener("click", () => {
  state.role = "organizer";
  save();
  show("organizer", false);
  toast("Modo organizador.");
});



$("#oSchedule")?.addEventListener("click", scheduleMatch);
$("#oStartNow")?.addEventListener("click", startNow);
$("#lobbyCopy")?.addEventListener("click", async () => {
  const input = $("#lobbyLink");
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    toast("Link copiado.");
  } catch {
    input.select();
    toast("Selecione e copie o link.");
  }
});
$("#lobbyStart")?.addEventListener("click", () => {
  startMatch();
  show("tactical");
});
$("#lobbyCancel")?.addEventListener("click", () => {
  state.match.status = "ended";
  state.match.exists = false;
  save();
  show("organizer");
  toast("Partida cancelada.");
});

// Join link: ?join=1 → player mode
(function handleJoinLink() {
  const params = new URLSearchParams(location.search);
  if (params.get("join") === "1") {
    state.role = "player";
    state.player.presence = false;
    state.player.entry = false;
    state.player.briefAck = false;
    if (params.get("m") && !state.match.name) {
      state.match.name = params.get("m");
      state.match.exists = true;
      state.match.status = state.match.status === "none" ? "scheduled" : state.match.status;
    }
    save();
  }
})();

function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get("join") === "1") {
    state.role = "player";
    show("player", false);
  } else if (localStorage.getItem(KEY)) {
    if (state.role === "organizer" && state.match.exists && state.match.status === "scheduled") {
      show("lobby", false);
    } else {
      show(state.role === "organizer" ? "organizer" : "player", false);
    }
  } else {
    show("role", false);
  }
  if (state.match.status === "live") startTimer();
  render();
}
boot();
