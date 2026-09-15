const KEY = "df_terminal_v9";
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
      radio: true, channel: 1
    },
    sectors: { alfa: "neutro", bravo: "neutro" }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    return { ...initial(), ...JSON.parse(raw),
      match: { ...initial().match, ...(JSON.parse(raw).match || {}) },
      org: { ...initial().org, ...(JSON.parse(raw).org || {}) },
      player: { ...initial().player, ...(JSON.parse(raw).player || {}) },
      sectors: { ...initial().sectors, ...(JSON.parse(raw).sectors || {}) }
    };
  } catch { return initial(); }
}

let state = load();
let prevScreen = "player";
let current = "role";
let timerId = null;
let vuActive = false;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
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

/* ── Screen ── */
function show(name, remember = true) {
  const target = $(`[data-screen="${name}"]`);
  if (!target) return;
  if (remember && current !== name && name !== "dev") prevScreen = current;
  current = name;
  $$(".screen").forEach(s => s.classList.remove("active"));
  target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" });
  render();
}

/* ── Render ── */
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

  const p = state.player;
  setText("#pName", p.name);
  setText("#pTeam", p.team ? teamName(p.team) : "—");

  let status = "Aguardando", badge = "AGUARDANDO", badgeCls = "waiting";
  if (p.presence && !p.entry) { status = "Presença confirmada"; badge = "CONFIRMADO"; badgeCls = "ok"; }
  if (p.entry) { status = "Entrada solicitada"; badge = "AGUARDANDO"; badgeCls = "waiting"; }
  if (m.status === "live" && p.presence) { status = "Em operação"; badge = "AO VIVO"; badgeCls = "live"; }
  setText("#pPartStatus", status);
  const b = $("#pPartBadge");
  if (b) { b.textContent = badge; b.className = "state-pill " + badgeCls; }

  // action buttons
  const showConfirm = has && m.status === "scheduled" && !p.presence;
  const showRequest = has && m.status === "scheduled" && p.presence && !p.entry;
  const showEnter = has && (m.status === "live" || (m.status === "scheduled" && p.presence && p.briefAck));
  toggle("#btnConfirm", showConfirm);
  toggle("#btnRequest", showRequest);
  toggle("#btnEnter", showEnter || (has && m.status === "live" && p.presence));
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
  updateVu(state.player.radio && current === "tactical");

  const isOrg = state.role === "organizer";
  toggle("#tacEnd", isOrg && state.match.status === "live");
  toggle("#tacLeave", !isOrg || state.match.status !== "live");
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

/* ── VU Meter ── */
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
  const bars = $$("#vuMeter span");
  bars.forEach(bar => {
    const h = 15 + Math.random() * 85;
    bar.style.height = h + "%";
  });
  setTimeout(randomizeVu, 90 + Math.random() * 70);
}

/* ── Timer ── */
function startTimer() {
  stopTimer();
  if (state.match.status !== "live") return;
  if (!state.match.startedAt) state.match.startedAt = Date.now() - (state.match.elapsed || 0) * 1000;
  timerId = setInterval(() => {
    state.match.elapsed = Math.floor((Date.now() - state.match.startedAt) / 1000);
    setText("#tacTimer", fmtTimer(state.match.elapsed));
    if (state.match.elapsed % 15 === 0) save();
  }, 1000);
}

function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

/* ── Actions ── */
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
  if (state.match.status === "scheduled") {
    // player can enter only if live, or go wait
    show("waiting");
    return;
  }
  show("tactical");
  if (state.player.radio) updateVu(true);
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
  // reset player flags for new match
  state.player.presence = false;
  state.player.entry = false;
  state.player.briefAck = false;
  save();
  render();
  toast("Partida salva.");
}

function startMatch() {
  if (!state.match.exists) return toast("Salve a partida primeiro.");
  state.match.status = "live";
  state.match.startedAt = Date.now();
  state.match.elapsed = 0;
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
  save();
  render();
  toast("Partida encerrada.");
  show(state.role === "organizer" ? "organizer" : "player");
}

function leaveMatch() {
  updateVu(false);
  stopTimer();
  show("player");
  toast("Você saiu do painel.");
}

function toggleRadio() {
  state.player.radio = !state.player.radio;
  save();
  render();
  updateVu(state.player.radio && current === "tactical");
}

function changeCh(d) {
  state.player.channel = Math.max(1, Math.min(99, (state.player.channel || 1) + d));
  save();
  setText("#chDisplay", "CH " + String(state.player.channel).padStart(2, "0"));
}

/* ── Helpers ── */
function setText(s, t) { const el = $(s); if (el) el.textContent = t ?? "—"; }
function setVal(s, v) { const el = $(s); if (el) el.value = v ?? ""; }
function val(s) { return $(s)?.value?.trim() || ""; }
function toggle(s, show) { const el = $(s); if (el) el.classList.toggle("hidden", !show); }

/* ── Events ── */
document.addEventListener("click", (e) => {
  const role = e.target.closest("[data-role]");
  if (role) { selectRole(role.dataset.role); return; }

  const back = e.target.closest("[data-back]");
  if (back) {
    const t = back.dataset.back;
    if (t === "previous") show(prevScreen || "player", false);
    else show(t, false);
    updateVu(false);
    return;
  }

  if (e.target.closest("#devBtn")) { show("dev"); return; }
  if (e.target.closest("#playerDetailsBtn")) { show("details"); return; }
  if (e.target.closest("#btnConfirm")) { confirmPresence(); return; }
  if (e.target.closest("#btnRequest")) { requestEntry(); return; }
  if (e.target.closest("#btnEnter")) { enterMatch(); return; }
  if (e.target.closest("#btnPrepEnter")) { enterMatch(); return; }
  if (e.target.closest("#oSave")) { saveMatch(); return; }
  if (e.target.closest("#oStart") || e.target.closest("#devStart") || e.target.closest("#tacEnd") === null && e.target.closest("#oStart")) { /* handled below */ }
  if (e.target.closest("#oStart")) { startMatch(); return; }
  if (e.target.closest("#oEnd") || e.target.closest("#tacEnd")) { endMatch(); return; }
  if (e.target.closest("#tacLeave")) { leaveMatch(); return; }
  if (e.target.closest("#radioToggle")) { toggleRadio(); return; }
  if (e.target.closest("#chDown")) { changeCh(-1); return; }
  if (e.target.closest("#chUp")) { changeCh(1); return; }

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
    save(); render(); toast("Partida gerada.");
    return;
  }
  if (e.target.closest("#devStart")) { startMatch(); return; }
  if (e.target.closest("#devEnd")) { endMatch(); return; }
  if (e.target.closest("#devReset")) {
    localStorage.removeItem(KEY);
    state = initial();
    stopTimer(); updateVu(false);
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
    } else stopTimer();
    if (!state.match.exists) state.match.exists = true;
    save(); render();
    toast("Status → " + statusLabel(seg.dataset.status));
  }
});

$("#prepAck")?.addEventListener("change", ackBrief);

const ptt = $("#pttBtn");
if (ptt) {
  const startTx = (e) => {
    e.preventDefault();
    if (!state.player.radio) return toast("Rádio desligado.");
    ptt.classList.add("transmitting");
    setText("#radioStatus", "TRANSMITINDO");
    const st = $("#radioStatus");
    if (st) st.classList.add("tx");
    // boost VU while transmitting
    if (vuActive) {
      $$("#vuMeter span").forEach(s => { s.style.height = (50 + Math.random() * 50) + "%"; });
    }
  };
  const endTx = () => {
    ptt.classList.remove("transmitting");
    setText("#radioStatus", "PRONTO");
    const st = $("#radioStatus");
    if (st) st.classList.remove("tx");
  };
  ptt.addEventListener("pointerdown", startTx);
  ptt.addEventListener("pointerup", endTx);
  ptt.addEventListener("pointercancel", endTx);
  ptt.addEventListener("pointerleave", endTx);
}

/* ── Boot ── */
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
