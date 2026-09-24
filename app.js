import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAQK1aQR9Et8uWofokz3xTGRfwdb2XK37Q",
  authDomain: "deseart-falcons-airsof.firebaseapp.com",
  databaseURL: "https://deseart-falcons-airsof-default-rtdb.firebaseio.com",
  projectId: "deseart-falcons-airsof",
  storageBucket: "deseart-falcons-airsof.firebasestorage.app",
  messagingSenderId: "530347333591",
  appId: "1:530347333591:web:c48b152765ba7297e51d92"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const matchRef = ref(db, 'match');
const playersRef = ref(db, 'players');

// Identificação única do Jogador no aparelho
let myId = localStorage.getItem("df_player_id");
if (!myId) {
  myId = "p_" + Math.random().toString(36).substr(2, 9);
  localStorage.setItem("df_player_id", myId);
}
const myRef = ref(db, 'players/' + myId);

// --- UTILIDADES ---
const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const OBJ_LABELS = { rouba_bandeira: "Rouba bandeira", bomba: "Bomba" };

function initial() {
  return {
    role: null,
    match: {
      exists: false, status: "none",
      name: "", location: "", duration: 60, objective: "rouba_bandeira", briefing: "",
      mapImage: null, terrain: null, marks: [],
      startedAt: null,
      bomb: { planted: false, plantedAt: null, defused: false, exploded: false }
    },
    player: { presence: false, alive: true },
    otherPlayers: {}, // Onde salvaremos o GPS da equipe
    tool: "point",
    gps: { lat: null, lng: null, ok: false, denied: false }
  };
}

let state = initial();
let timerId = null, gpsWatch = null, animFrame = null, prevScreen = "role";

function toast(msg) {
  const el = $("#toast");   if (!el) return;   el.textContent = msg;   el.classList.add("show");   clearTimeout(el._t);   el._t = setTimeout(() => el.classList.remove("show"), 2200); }  function show(name) {   $$(".screen").forEach(s => s.classList.toggle("active", s.dataset.screen === name));
  if (name !== "dev") prevScreen = name;
  render();
}

// --- CONEXÃO FIREBASE (REAL-TIME) ---
function load() {
  state.role = localStorage.getItem("df_role") || null;

  // Escuta as alterações do Operador (Mapa, Bomba, Status)
  onValue(matchRef, (snap) => {
    const data = snap.val();
    if (data) {
      state.match = data;
    } else {
      state.match = initial().match;
    }
    if (state.match.status === "live" && !timerId) startTimer();
    if (state.match.status !== "live") stopTimer();
    render();
  });

  // Escuta a posição e status dos outros jogadores
  onValue(playersRef, (snap) => {
    const data = snap.val();
    if (data) {
      state.otherPlayers = data;
    } else {
      state.otherPlayers = {};
    }
  });
}

function saveMatchData() {
  if (state.role === "organizer") {
    set(matchRef, state.match);
  }
}

function savePlayerData() {
  if (state.role === "player") {
    set(myRef, {
      presence: state.player.presence,
      alive: state.player.alive,
      lat: state.gps.lat,
      lng: state.gps.lng,
      ts: Date.now()
    });
  }
}

function saveRole() {
  localStorage.setItem("df_role", state.role || "");
}

function checkInvite() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('join')) {
    state.role = 'player';
    saveRole();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// --- GPS OBRIGATÓRIO ---
function showGpsGate() { $("#gpsGate")?.classList.remove("hidden"); }
function hideGpsGate() { $("#gpsGate")?.classList.add("hidden"); }

function requestGps() {
  if (!navigator.geolocation) { showGpsGate(); toast("GPS indisponível"); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.gps.lat = pos.coords.latitude; state.gps.lng = pos.coords.longitude;
      state.gps.ok = true; state.gps.denied = false;
      hideGpsGate(); savePlayerData(); startGpsWatch(); toast("Localização ativa"); render();
    },
    () => { state.gps.ok = false; state.gps.denied = true; showGpsGate(); },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

function startGpsWatch() {
  if (gpsWatch != null || !navigator.geolocation) return;
  gpsWatch = navigator.geolocation.watchPosition(
    (pos) => {
      state.gps.lat = pos.coords.latitude; state.gps.lng = pos.coords.longitude; state.gps.ok = true;
      const el = $("#pGps");
      if (el) el.textContent = "ATIVO · " + Math.round(pos.coords.accuracy) + "m";
      if (state.role === "player" && state.player.presence) savePlayerData();
    },
    () => { state.gps.ok = false; showGpsGate(); },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

// --- TERRENO E DESENHOS NO MAPA ---
function drawMarks(ctx, w, h, marks) {
  (marks || []).forEach(mk => {
    const x = mk.x * w, y = mk.y * h;
    if (mk.type === "zone") {
      const rad = (mk.r || 0.09) * Math.min(w, h);
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(196,160,106,0.28)"; ctx.fill();
      ctx.strokeStyle = "#c4a06a"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#c4a06a"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.fillText("Z", x, y + 4);
    } else if (mk.type === "base") {
      const s = 24; 
      ctx.fillStyle = "rgba(74,154,74,0.4)"; ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.strokeStyle = "#4a9a4a"; ctx.lineWidth = 3; ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = "#4a9a4a"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "center"; ctx.fillText("BASE", x, y + 5);
    } else if (mk.type === "flag") {
      ctx.strokeStyle = "#d4b84a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 14); ctx.stroke();
      ctx.fillStyle = "#d4b84a";
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 14, y - 8); ctx.lineTo(x, y - 2); ctx.closePath(); ctx.fill();
    } else if (mk.type === "bomb") {
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = "#c04040"; ctx.fill();
      ctx.strokeStyle = "#ff8080"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center"; ctx.fillText("💣", x, y + 4);
    } else {
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
  canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
  return { w: canvas.width, h: canvas.height };
}

function hasMap() { return !!(state.match.mapImage); }

function paintOrg() {
  const canvas = $("#mapCanvas"), wrap = $("#orgMapWrap");
  if (!canvas) return;
  const { w, h } = sizeCanvas(canvas, wrap);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const img = $("#mapImg");
  
  if (state.match.mapImage && img) { 
    img.src = state.match.mapImage; img.classList.add("show"); 
  } else { 
    img?.classList.remove("show"); 
    ctx.fillStyle = "#2a3228"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#8b9a6a"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Envie um mapa tático", w / 2, h / 2);
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
    img.src = state.match.mapImage; img.classList.add("show"); 
  } else { 
    img?.classList.remove("show");
    ctx.fillStyle = "#2a3228"; ctx.fillRect(0, 0, w, h);
  }
  
  drawMarks(ctx, w, h, state.match.marks);

  // Desenha os outros jogadores da equipe
  Object.keys(state.otherPlayers).forEach(key => {
    const p = state.otherPlayers[key];
    if (key !== myId && p.lat && p.lng && p.alive && p.presence) {
      let ox = 0.5 + ((p.lat % 0.001) / 0.001 - 0.5) * 0.1;
      let oy = 0.5 + ((p.lng % 0.001) / 0.001 - 0.5) * 0.1;
      ox = Math.max(0.1, Math.min(0.9, ox)); oy = Math.max(0.1, Math.min(0.9, oy));
      
      // Bolinha simples azul pros aliados
      ctx.beginPath(); ctx.arc(ox * w, oy * h, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#5b8def"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
    }
  });

  // Desenha VOCÊ
  let px = 0.5, py = 0.5;
  if (state.gps.ok && state.gps.lat != null) {
    px = 0.5 + ((state.gps.lat % 0.001) / 0.001 - 0.5) * 0.1;
    py = 0.5 + ((state.gps.lng % 0.001) / 0.001 - 0.5) * 0.1;
    px = Math.max(0.1, Math.min(0.9, px)); py = Math.max(0.1, Math.min(0.9, py));
  }
  drawYou(ctx, w, h, px, py);
}

function updateMarkPanel() {
  const panel = $("#markPanel"), hint = $("#mapStepHint");
  if (hasMap()) {
    panel?.classList.remove("hidden");
    if (hint) hint.textContent = "Mapa delimitado. Agora coloque as características: base, zona, bandeira, bomba…";
  } else {
    panel?.classList.add("hidden");
    if (hint) hint.textContent = "Escolha um arquivo de imagem (PNG, JPEG…). Depois delimite a área útil.";
  }
}

// --- RENDERIZAÇÃO DA INTERFACE ---
function renderHeader() {
  const pill = $("#statusPill"); if (!pill) return;
  const st = state.match.status;
  if (st === "live") { pill.textContent = "AO VIVO"; pill.className = "pill live"; }
  else if (st === "open") { pill.textContent = "ABERTA"; pill.className = "pill wait"; }
  else { pill.textContent = "SEM PARTIDA"; pill.className = "pill"; }
}

function renderPlayer() {
  const m = state.match;
  const wait = $("#playerWait"), ready = $("#playerReady"), live = $("#playerLive");
  if (!m.exists || m.status === "none" || m.status === "ended") {
    wait?.classList.remove("hidden"); ready?.classList.add("hidden"); live?.classList.add("hidden");
    return;
  }
  if (m.status === "live" && state.player.presence) {
    wait?.classList.add("hidden"); ready?.classList.add("hidden"); live?.classList.remove("hidden");
    $("#pLiveObj").textContent = OBJ_LABELS[m.objective] || m.objective;
    $("#pAlive").textContent = state.player.alive ? "ATIVO" : "OUT";
    
    const isOrg = state.role === "organizer";
    $("#btnOrgFromGame")?.classList.toggle("hidden", !isOrg);
    $("#btnEndFromGame")?.classList.toggle("hidden", !isOrg);
    
    // UI da Bomba
    const bombModule = $("#bombModule");
    if (m.objective === "bomba") {
      bombModule?.classList.remove("hidden");
      if (m.bomb.exploded) {
        $("#bombTimerUI").textContent = "BOOM!"; $("#bombStatusText").textContent = "ÁREA DESTRUÍDA";
        $("#btnPlantBomb").classList.add("hidden"); $("#btnDefuseBomb").classList.add("hidden");
      } else if (m.bomb.defused) {
        $("#bombTimerUI").textContent = "00:00"; $("#bombStatusText").textContent = "BOMBA DESARMADA";
        $("#bombStatusText").style.color = "var(--live)";
        $("#btnPlantBomb").classList.add("hidden"); $("#btnDefuseBomb").classList.add("hidden");
      } else if (m.bomb.planted) {
        $("#bombStatusText").textContent = "ARMADA - CORRA!";
        $("#btnPlantBomb").classList.add("hidden"); $("#btnDefuseBomb").classList.remove("hidden");
      } else {
        $("#bombTimerUI").textContent = "10:00"; $("#bombStatusText").textContent = "AGUARDANDO PLANT";
        $("#btnPlantBomb").classList.remove("hidden"); $("#btnDefuseBomb").classList.add("hidden");
      }
    } else {
      bombModule?.classList.add("hidden");
    }

    paintPlayer(); startAnim();
    return;
  }
  wait?.classList.add("hidden"); ready?.classList.remove("hidden"); live?.classList.add("hidden");
  $("#pName").textContent = m.name \vert{}\vert{} "—"; $("#pLoc").textContent = m.location || "—";
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
  if ($("#oBriefing")) $("#oBriefing").value = m.briefing \vert{}\vert{} "";   $$(".obj-btn:not(:disabled)").forEach(b => { b.classList.toggle("active", b.dataset.obj === m.objective); });
  $("#btnEnd")?.classList.toggle("hidden", m.status !== "live");
  $("#btnCopyInvite")?.classList.toggle("hidden", !m.exists);
  updateMarkPanel(); paintOrg();
}

function readOrg() {
  state.match.name = ($("#oName")?.value || "").trim();
  state.match.location = ($("#oLoc")?.value || "").trim();
  state.match.duration = Number($("#oDur")?.value) || 60;
  state.match.briefing = ($("#oBriefing")?.value || "").trim();
}

function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function render() {
  if (!state.gps.ok) { showGpsGate(); return; }
  hideGpsGate(); renderHeader();
  const sc = document.querySelector(".screen.active")?.dataset.screen;
  if (sc === "player") renderPlayer();
  if (sc === "organizer") fillOrg();
  if (sc !== "player") stopAnim();
}

// --- AÇÕES DO JOGO ---
function initMatch(enter) {
  readOrg();
  if (!state.match.name) return toast("Informe o nome da operação.");
  if (!hasMap()) return toast("Envie um mapa antes.");
  state.match.exists = true;
  state.match.status = enter ? "live" : "open";
  if (enter) {
    state.match.startedAt = Date.now();
    state.match.bomb = { planted: false, plantedAt: null, defused: false, exploded: false };
    state.player.presence = true; state.player.alive = true;
    savePlayerData();
  } else {
    state.match.startedAt = null;
  }
  saveMatchData();
  if (enter) { show("player"); toast("Partida iniciada — você entrou."); } 
  else { render(); toast("Partida aberta no lobby."); }
}

function endMatch() {
  state.match.status = "ended"; 
  saveMatchData();
  stopTimer(); render(); toast("Partida encerrada.");
}

function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    if (state.match.status !== "live") return;
    const now = Date.now();
    const elapsed = Math.floor((now - (state.match.startedAt || now)) / 1000);
    
    // Relógio da Bomba
    if (state.match.objective === "bomba" && state.match.bomb.planted && !state.match.bomb.defused && !state.match.bomb.exploded) {
      const bombElapsed = Math.floor((now - state.match.bomb.plantedAt) / 1000);
      const timeLeft = 600 - bombElapsed;
      if (timeLeft <= 0) {
        if (state.role === "organizer") {
          state.match.bomb.exploded = true;
          saveMatchData(); // Apenas o Operador decreta a explosão
        }
      } else {
        const el = $("#bombTimerUI");
        if (el) el.textContent = fmt(timeLeft);
      }
    }

    const max = (state.match.duration || 60) * 60;
    if (elapsed >= max) { 
      if (state.role === "organizer") endMatch(); 
      return; 
    }
    const t = $("#pTimer");
    if (t) t.textContent = fmt(elapsed);
  }, 1000);
}

function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

function startAnim() {
  stopAnim();
  const loop = () => { if (state.match.status === "live") paintPlayer(); animFrame = requestAnimationFrame(loop); };
  animFrame = requestAnimationFrame(loop);
}
function stopAnim() { if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; } }

function onMapTap(e) {
  e.preventDefault();
  if (!hasMap()) return toast("Envie o mapa primeiro.");
  const canvas = $("#mapCanvas"); const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  const x = (t.clientX - rect.left) / rect.width, y = (t.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;

  if (state.tool === "erase") {
    state.match.marks = (state.match.marks || []).filter(m => Math.hypot(m.x - x, m.y - y) > 0.05);
  } else if (state.tool === "zone") { state.match.marks.push({ type: "zone", x, y, r: 0.09 }); } 
  else if (state.tool === "base") { state.match.marks.push({ type: "base", x, y }); } 
  else if (state.tool === "flag") { state.match.marks.push({ type: "flag", x, y }); } 
  else if (state.tool === "bomb") { state.match.marks.push({ type: "bomb", x, y }); } 
  else { state.match.marks.push({ type: "point", x, y }); }
  
  saveMatchData(); paintOrg();
}

// --- CLICKS GERAIS ---
$("#gpsRetry")?.addEventListener("click", () => requestGps());
$("#gpsDeny")?.addEventListener("click", () => { showGpsGate(); toast("Sem localização o app não funciona."); });

document.addEventListener("click", (e) => {
  const role = e.target.closest("[data-role]");
  if (role) {
    if (!state.gps.ok) { showGpsGate(); return; }
    state.role = role.dataset.role; saveRole();
    show(state.role === "organizer" ? "organizer" : "player");
    return;
  }
  const tool = e.target.closest("[data-tool]");
  if (tool) {
    state.tool = tool.dataset.tool;
    $$(".tool-btn[data-tool]").forEach(b => b.classList.toggle("active", b === tool));     return;   }   const obj = e.target.closest(".obj-btn:not(:disabled)");   if (obj && obj.dataset.obj) {     state.match.objective = obj.dataset.obj;     $$
(".obj-btn:not(:disabled)").forEach(b => b.classList.toggle("active", b === obj));
    saveMatchData(); toast("Objetivo: " + (OBJ_LABELS[obj.dataset.obj] || obj.dataset.obj));
  }
});

// --- CROP MAPA (CORTE IMAGEM) ---
let cropImg = null, cropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
function openCropEditor(dataUrl) {
  const modal = $("#cropModal"); if (!modal) return;
  modal.classList.remove("hidden"); cropImg = new Image();
  cropImg.onload = () => { drawCropStage(); cropRect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }; placeCropBox(); };
  cropImg.src = dataUrl;
}
function drawCropStage() {
  const canvas = $("#cropCanvas"), stage = $("#cropStage");
  if (!canvas || !stage || !cropImg) return;
  const r = stage.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr);
  canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
  const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ir = cropImg.width / cropImg.height, sr = canvas.width / canvas.height;
  let dw, dh, dx, dy;
  if (ir > sr) { dw = canvas.width; dh = dw / ir; dx = 0; dy = (canvas.height - dh) / 2; } 
  else { dh = canvas.height; dw = dh * ir; dy = 0; dx = (canvas.width - dw) / 2; }
  canvas._imgLayout = { dx, dy, dw, dh };
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(cropImg, dx, dy, dw, dh);
}
function placeCropBox() {
  const box = $("#cropBox"), stage = $("#cropStage"); if (!box || !stage) return;
  const r = stage.getBoundingClientRect();
  box.style.left = (cropRect.x * r.width) + "px"; box.style.top = (cropRect.y * r.height) + "px";
  box.style.width = (cropRect.w * r.width) + "px"; box.style.height = (cropRect.h * r.height) + "px";
}
function applyCrop() {
  if (!cropImg) return;
  const canvas = $("#cropCanvas"), layout = canvas?._imgLayout; if (!layout) return;
  const stage = $("#cropStage").getBoundingClientRect();
  const sx = cropRect.x * stage.width, sy = cropRect.y * stage.height, sw = cropRect.w * stage.width, sh = cropRect.h * stage.height;
  const scaleX = canvas.width / stage.width, scaleY = canvas.height / stage.height;
  const cx = sx * scaleX, cy = sy * scaleY, cw = sw * scaleX, ch = sh * scaleY;
  const ix = Math.max(cx, layout.dx), iy = Math.max(cy, layout.dy), ix2 = Math.min(cx + cw, layout.dx + layout.dw), iy2 = Math.min(cy + ch, layout.dy + layout.dh);
  if (ix2 <= ix || iy2 <= iy) return toast("Área inválida");
  const relX = (ix - layout.dx) / layout.dw, relY = (iy - layout.dy) / layout.dh, relW = (ix2 - ix) / layout.dw, relH = (iy2 - iy) / layout.dh;
  const srcX = relX * cropImg.width, srcY = relY * cropImg.height, srcW = relW * cropImg.width, srcH = relH * cropImg.height;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(srcW)); out.height = Math.max(1, Math.round(srcH));
  out.getContext("2d").drawImage(cropImg, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);
  
  state.match.mapImage = out.toDataURL("image/jpeg", 0.92); state.match.marks = [];
  saveMatchData(); $("#cropModal")?.classList.add("hidden"); updateMarkPanel(); paintOrg(); toast("Mapa delimitado.");
}

$("#mapFile")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) return toast("Escolha uma imagem.");
  const reader = new FileReader(); reader.onload = () => openCropEditor(reader.result); reader.readAsDataURL(file);
  e.target.value = "";
});
$("#cropOk")?.addEventListener("click", applyCrop);
$("#cropCancel")?.addEventListener("click", () => { $("#cropModal")?.classList.add("hidden"); cropImg = null; });
(function setupCropDrag() {
  const box = $("#cropBox"), stage = $("#cropStage"); if (!box || !stage) return;
  let mode = null, start = null;
  const onDown = (e) => {
    e.preventDefault(); const t = e.touches ? e.touches[0] : e; const br = box.getBoundingClientRect();
    const nearBR = t.clientX > br.right - 20 && t.clientY > br.bottom - 20; mode = nearBR ? "resize" : "move";
    start = { x: t.clientX, y: t.clientY, rect: { ...cropRect } };
  };
  const onMove = (e) => {
    if (!mode || !start) return; e.preventDefault(); const t = e.touches ? e.touches[0] : e; const sr = stage.getBoundingClientRect();
    const dx = (t.clientX - start.x) / sr.width, dy = (t.clientY - start.y) / sr.height;
    if (mode === "move") { cropRect.x = Math.max(0, Math.min(1 - start.rect.w, start.rect.x + dx)); cropRect.y = Math.max(0, Math.min(1 - start.rect.h, start.rect.y + dy)); } 
    else { cropRect.w = Math.max(0.15, Math.min(1 - start.rect.x, start.rect.w + dx)); cropRect.h = Math.max(0.15, Math.min(1 - start.rect.y, start.rect.h + dy)); }
    placeCropBox();
  };
  const onUp = () => { mode = null; start = null; };
  box.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  box.addEventListener("touchstart", onDown, { passive: false }); window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend", onUp);
})();

// --- EVENTOS DE BOTÕES ---
$("#btnGenMap")?.addEventListener("click", () => {
  state.match.mapImage = null; state.match.marks = [];
  saveMatchData(); updateMarkPanel(); paintOrg(); toast("Limpou mapa anterior.");
});
$("#btnClearMarks")?.addEventListener("click", () => { state.match.marks = []; saveMatchData(); paintOrg(); toast("Marcas limpas"); });
$("#mapCanvas")?.addEventListener("pointerdown", onMapTap);

// Botões Org
$("#btnSaveEnter")?.addEventListener("click", () => initMatch(true));
$("#btnSaveOnly")?.addEventListener("click", () => initMatch(false));
$("#btnCopyInvite")?.addEventListener("click", () => {
  const link = window.location.origin + window.location.pathname + "?join=1";
  navigator.clipboard.writeText(link).then(() => toast("Link copiado pro clipboard!")).catch(() => toast("Erro ao copiar link"));
});
$("#btnEnd")?.addEventListener("click", endMatch);
$("#btnOrgBack")?.addEventListener("click", () => show("role"));

// Botões Player
$("#btnConfirm")?.addEventListener("click", () => { state.player.presence = true; savePlayerData(); render(); toast("Presença confirmada"); });
$("#btnEnter")?.addEventListener("click", () => {
  if (!state.player.presence) return toast("Confirme presença");
  if (state.match.status !== "live") return toast("Aguarde o início");
  state.player.alive = true; savePlayerData(); render();
});
$("#btnHit")?.addEventListener("click", () => { state.player.alive = false; savePlayerData(); render(); toast("HIT — OUT"); });
$("#btnLeave")?.addEventListener("click", () => { 
  state.player.presence = false; state.player.alive = true; savePlayerData(); show("player"); toast("Abandonou a operação"); 
});
$("#btnEndFromGame")?.addEventListener("click", endMatch);
$("#btnOrgFromGame")?.addEventListener("click", () => { state.role = "organizer"; saveRole(); show("organizer"); });

// Briefing Player
$("#btnShowBriefing")?.addEventListener("click", () => {
  $("#bName").textContent = state.match.name || "—";
  $("#bLoc").textContent = state.match.location || "—";
  $("#bObj").textContent = OBJ_LABELS[state.match.objective] || state.match.objective || "—";
  $("#bDur").textContent = (state.match.duration || 60) + " min";
  $("#bText").textContent = state.match.briefing || "Nenhuma instrução adicional.";
  $("#briefingModal")?.classList.remove("hidden");
});
$("#btnCloseBriefing")?.addEventListener("click", () => { $("#briefingModal")?.classList.add("hidden"); });

// Bomba Player e Operador
$("#btnPlantBomb")?.addEventListener("click", () => {
  state.match.bomb.planted = true;
  state.match.bomb.plantedAt = Date.now();
  saveMatchData(); toast("BOMBA ARMADA! 10 MINUTOS!");
});
$("#btnDefuseBomb")?.addEventListener("click", () => {
  state.match.bomb.defused = true;
  saveMatchData(); toast("BOMBA DESARMADA!");
});

// Dev Mode (Zerar tudo)
$("#devBtn")?.addEventListener("click", () => show("dev"));
$("#devBack")?.addEventListener("click", () => show(prevScreen || "role"));
$("#devPlayer")?.addEventListener("click", () => { state.role = "player"; saveRole(); show("player"); });
$("#devOrg")?.addEventListener("click", () => { state.role = "organizer"; saveRole(); show("organizer"); });
$("#devReset")?.addEventListener("click", () => {
  if (!confirm("Apagar tudo e limpar banco de dados?")) return;
  localStorage.removeItem("df_role"); localStorage.removeItem("df_player_id");
  remove(matchRef); remove(playersRef);
  state = initial(); stopTimer(); stopAnim(); show("role"); requestGps(); toast("Sistema resetado.");
});

window.addEventListener("resize", () => { paintOrg(); if (state.match.status === "live") paintPlayer(); });

// --- BOOT ---
checkInvite();
load();
requestGps();
if (state.role === "player") show("player");
else if (state.role === "organizer") show("organizer");
else show("role");
render();
