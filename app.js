/**
 * DESERT FALCONS — MOTOR DA DEMO
 * Arquitetura: ESTADO -> EVENTO -> UI
 * Recursos de demonstração: HIT + vibração, câmera, mapa, briefing, rádio e DEV TEST.
 */

const STORAGE_KEY = 'df_demo_state_v3';
let state = loadState();
let clockInterval = null;
let cameraStream = null;

function baseState() {
  return {
    app: { currentView: 'inicio', role: 'player' },
    partida: { ativa: true, status: 'aguardando', nome: 'Operação Red Sand', tempo: 0 },
    briefing: {
      objetivo: 'Capturar e manter Alfa e Bravo.',
      contexto: 'Partida de demonstração do sistema de gerenciamento.',
      regras: 'O estado do jogador, os objetivos e os eventos são centralizados pelo motor.',
      especiais: 'Comunicação por canal e recursos digitais demonstrativos ativos.'
    },
    equipes: { azul: { nome: 'AZUL', total: 12, ativos: 12 }, vermelho: { nome: 'VERMELHO', total: 12, ativos: 12 } },
    objetivos: {
      alfa: { nome: 'Setor Alfa', controle: 'neutro' },
      bravo: { nome: 'Setor Bravo', controle: 'neutro' }
    },
    jogador: { id: 'DF-001', nome: 'DANI', equipe: 'azul', classe: 'Assalto', situacao: 'aguardando', radio: { ligado: true, canal: '01', sinal: 'OK' } },
    eventos: []
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...baseState(), ...saved } : baseState();
  } catch (_) { return baseState(); }
}

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function labelStatus(s) {
  return ({ aguardando:'AGUARDANDO', briefing:'BRIEFING', andamento:'EM ANDAMENTO', pausada:'PAUSADA', encerrada:'ENCERRADA' })[s] || String(s).toUpperCase();
}

function addEvent(type, actor, message) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour12:false });
  state.eventos.unshift({ time, type, actor, message });
  state.eventos = state.eventos.slice(0, 50);
  persist();
  renderLogs();
}

function startClock() {
  stopClock();
  clockInterval = setInterval(() => { state.partida.tempo++; persist(); renderClock(); }, 1000);
}
function stopClock() { if (clockInterval) clearInterval(clockInterval); clockInterval = null; }

function switchView(view, nav) {
  state.app.currentView = view;
  document.querySelectorAll('.view-layer').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add('active');
  if (nav) document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (nav) nav.classList.add('active');
  const globalNav = document.getElementById('global-nav');
  if (globalNav) globalNav.style.display = ['tatico','prejogo'].includes(view) ? 'none' : 'flex';
  renderUI();
}

function requestEntry() { addEvent('CHECK_IN', state.jogador.nome, 'Entrada solicitada'); switchView('prejogo'); }

function confirmReady() {
  if (state.partida.status !== 'andamento') {
    addEvent('BLOCKED_DEPLOY', state.jogador.nome, 'Deploy bloqueado: partida não está em andamento.');
    return;
  }
  setPlayerStatus('ativo', 'PLAYER_READY');
  switchView('tatico');
}

function updatePlayerClass(c) { state.jogador.classe = c; addEvent('CLASS_CHANGE', state.jogador.nome, `Classe: ${c}`); persist(); renderUI(); }

function setPlayerStatus(next, eventType='PLAYER_STATUS') {
  const old = state.jogador.situacao;
  if (old === next) return;
  if (old === 'ativo') state.equipes[state.jogador.equipe].ativos = Math.max(0, state.equipes[state.jogador.equipe].ativos - 1);
  if (next === 'ativo') state.equipes[state.jogador.equipe].ativos = Math.min(state.equipes[state.jogador.equipe].total, state.equipes[state.jogador.equipe].ativos + 1);
  state.jogador.situacao = next;
  addEvent(eventType, state.jogador.nome, `Estado: ${old.toUpperCase()} → ${next.toUpperCase()}`);
  renderUI();
}

function dispatch(evento, payload={}) {
  const actor = payload.origin || state.jogador.nome;
  switch (evento) {
    case 'MATCH_START':
      if (state.partida.status === 'andamento') return;
      state.partida.status = 'andamento';
      addEvent('MATCH_START', actor, 'Partida iniciada');
      startClock();
      break;
    case 'MATCH_PAUSE':
      if (state.partida.status !== 'andamento') return;
      state.partida.status = 'pausada'; addEvent('MATCH_PAUSE', actor, 'Partida pausada'); stopClock(); break;
    case 'MATCH_RESUME':
      if (state.partida.status !== 'pausada') return;
      state.partida.status = 'andamento'; addEvent('MATCH_RESUME', actor, 'Partida retomada'); startClock(); break;
    case 'MATCH_END':
      state.partida.status = 'encerrada'; addEvent('MATCH_END', actor, 'Partida encerrada'); stopClock(); break;
    case 'PLAYER_HIT':
      if (state.jogador.situacao === 'ativo') simulateHit(actor);
      break;
    case 'PLAYER_ACTIVE':
      if (state.partida.status === 'andamento') setPlayerStatus('ativo', 'PLAYER_ACTIVE');
      break;
    case 'PLAYER_OUT': if (state.jogador.situacao === 'ativo') setPlayerStatus('fora', 'PLAYER_OUT'); break;
    case 'TEAM_RETURN': setPlayerStatus('aguardando', 'TEAM_RETURN'); break;
    case 'RADIO_TOGGLE':
      state.jogador.radio.ligado = !state.jogador.radio.ligado;
      state.jogador.radio.sinal = state.jogador.radio.ligado ? 'OK' : 'OFF';
      addEvent('RADIO', actor, state.jogador.radio.ligado ? 'Comunicação online' : 'Comunicação offline'); break;
    case 'RADIO_CHANNEL': state.jogador.radio.canal = payload.canal || state.jogador.radio.canal; addEvent('RADIO_CHANNEL', actor, `Canal ${state.jogador.radio.canal}`); break;
    case 'RADIO_PING': if (state.jogador.radio.ligado) addEvent('RADIO_PING', actor, `Ping enviado no canal ${state.jogador.radio.canal}`); break;
    case 'TEAM_STATUS': if (state.jogador.radio.ligado) addEvent('TEAM_STATUS', actor, `Status enviado no canal ${state.jogador.radio.canal}`); break;
    case 'CAPTURE_OBJ':
      if (state.jogador.situacao === 'ativo' && state.objetivos[payload.target]) {
        state.objetivos[payload.target].controle = state.jogador.equipe;
        addEvent('OBJECTIVE_UPDATE', actor, `${state.objetivos[payload.target].nome} → ${state.jogador.equipe.toUpperCase()}`);
      }
      break;
  }
  persist(); renderUI();
}

function simulateHit(actor='SISTEMA') {
  state.jogador.situacao = 'atingido';
  state.equipes[state.jogador.equipe].ativos = Math.max(0, state.equipes[state.jogador.equipe].ativos - 1);
  addEvent('PLAYER_HIT', actor, 'Jogador declarado atingido');
  navigator.vibrate?.([120, 80, 180]);
  showHitFlash();
  renderUI();
}

function showHitFlash() {
  let el = document.getElementById('hit-feedback');
  if (!el) {
    el = document.createElement('div'); el.id = 'hit-feedback';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(160,0,0,.32);z-index:9998;pointer-events:none;opacity:0;transition:.15s';
    document.body.appendChild(el);
  }
  el.style.opacity = '1'; setTimeout(()=>el.style.opacity='0', 180);
}

function openCameraDemo() {
  const modal = makeModal('camera-modal', 'SIMULAÇÃO DE CÂMERA', `<div id="camera-wrap" style="background:#000;border-radius:12px;overflow:hidden;min-height:260px;display:flex;align-items:center;justify-content:center"><video id="camera-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video><span id="camera-fallback" style="display:none;padding:30px;text-align:center">Câmera indisponível neste navegador. A demonstração continua funcionando.</span></div><p style="margin:12px 0;color:#aaa">A câmera serve apenas para demonstrar a interface do recurso.</p><button class="btn-primary" onclick="closeModal('camera-modal');stopCamera()">CONCLUIR</button>`);
  const video = modal.querySelector('#camera-video');
  if (!navigator.mediaDevices?.getUserMedia) { modal.querySelector('#camera-fallback').style.display='block'; return; }
  navigator.mediaDevices.getUserMedia({ video:true, audio:false }).then(stream=>{ cameraStream=stream; video.srcObject=stream; }).catch(()=>{ modal.querySelector('#camera-fallback').style.display='block'; });
}
function stopCamera(){ if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null;} }

function openMap() {
  const src = 'https://www.google.com/maps?q=Divinópolis%20MG&output=embed';
  makeModal('map-modal','MAPA DA PARTIDA',`<iframe title="Google Maps" src="${src}" style="width:100%;height:62vh;border:0;border-radius:12px;background:#111"></iframe><p style="font-size:.8rem;color:#999;margin-top:8px">Mapa demonstrativo. Em produção, o ponto e as camadas da partida vêm do motor.</p><button class="btn-primary mt-2" onclick="closeModal('map-modal')">FECHAR MAPA</button>`);
}

function openBriefing() {
  makeModal('briefing-modal','BRIEFING',`
    <div class="card"><h3>OBJETIVO</h3><p>${escapeHtml(state.briefing.objetivo)}</p></div>
    <div class="card mt-2"><h3>CONTEXTO</h3><p>${escapeHtml(state.briefing.contexto)}</p></div>
    <div class="card mt-2"><h3>REGRAS</h3><p>${escapeHtml(state.briefing.regras)}</p></div>
    <div class="card mt-2"><h3>CONDIÇÕES ESPECIAIS</h3><p>${escapeHtml(state.briefing.especiais)}</p></div>
    <button class="btn-primary mt-2" onclick="closeModal('briefing-modal')">ENTENDI</button>`);
}

function openDevTest() {
  makeModal('dev-modal','DEV TEST',`
    <p style="color:#aaa">Modo de demonstração. Escolha qual experiência testar.</p>
    <button class="btn-primary mt-2" onclick="setRole('player')">TESTAR COMO JOGADOR</button>
    <button class="btn-warning mt-2" onclick="setRole('command')">TESTAR COMO COMANDO</button>
    <button class="btn-danger mt-2" onclick="resetDemo()">RESETAR DEMO</button>
    <div class="card mt-2"><b>Estado atual:</b> <span id="dev-state">${state.jogador.situacao.toUpperCase()}</span><br><b>Papel:</b> ${state.app.role === 'player' ? 'JOGADOR' : 'COMANDO'}</div>`);
}

function setRole(role){ state.app.role=role; persist(); closeModal('dev-modal'); if(role==='command') switchView('comando'); else switchView('inicio'); renderUI(); }
function resetDemo(){ stopClock(); stopCamera(); state=baseState(); persist(); closeModal('dev-modal'); switchView('inicio'); renderUI(); }

function makeModal(id,title,body){
  closeModal(id);
  const wrap=document.createElement('div'); wrap.id=id; wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  wrap.innerHTML=`<div style="width:min(720px,100%);max-height:92vh;overflow:auto;background:#121214;border:1px solid #A67C52;border-radius:14px;padding:16px;color:#eee"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="font-size:1rem;color:#A67C52">${title}</h2><button class="btn-icon" style="font-size:1.4rem" onclick="closeModal('${id}')">✕</button></div><div style="margin-top:12px">${body}</div></div>`;
  document.body.appendChild(wrap); return wrap.firstElementChild;
}
function closeModal(id){ const el=document.getElementById(id); if(el) el.remove(); if(id==='camera-modal') stopCamera(); }

function ensureTools(){
  if(document.getElementById('df-tools')) return;
  const home=document.querySelector('#view-inicio .content-area');
  if(home){
    const panel=document.createElement('div'); panel.id='df-tools'; panel.className='card mt-2';
    panel.innerHTML='<h3>FERRAMENTAS DA DEMO</h3><div class="grid-2"><button class="btn-primary" onclick="openBriefing()">BRIEFING</button><button class="btn-primary" onclick="openMap()">MAPA</button><button class="btn-warning" onclick="openDevTest()">DEV TEST</button><button class="btn-success" onclick="switchView(\'tatico\')">PAINEL TÁTICO</button></div>';
    home.appendChild(panel);
  }
  const prep=document.querySelector('#view-prejogo .content-area');
  if(prep && !document.getElementById('prep-tools')){
    const panel=document.createElement('div'); panel.id='prep-tools'; panel.className='card mt-2'; panel.innerHTML='<h3>CONSULTA</h3><div class="grid-2"><button class="btn-primary" onclick="openBriefing()">VER BRIEFING</button><button class="btn-primary" onclick="openMap()">VER MAPA</button></div>'; prep.appendChild(panel);
  }
}

function renderUI(){
  ensureTools();
  const name=document.getElementById('home-op-name'); if(name) name.innerText=state.partida.nome;
  const st=document.getElementById('home-op-status'); if(st) st.innerText=labelStatus(state.partida.status);
  const pn=document.getElementById('pre-player-name'); if(pn) pn.innerText=state.jogador.nome;
  const pt=document.getElementById('pre-player-team'); if(pt) pt.innerText=state.equipes[state.jogador.equipe].nome;
  const pc=document.getElementById('pre-player-class'); if(pc) pc.value=state.jogador.classe;
  const briefing=document.getElementById('pre-briefing-text'); if(briefing) briefing.innerText=state.briefing.objetivo;
  const ml=document.getElementById('pre-mechanics-list'); if(ml) ml.innerHTML='<li>Estado do jogador</li><li>Eventos em tempo real</li><li>Comunicação por rádio</li><li>Mapa e briefing</li><li>Câmera demonstrativa</li>';
  const cmdStatus=document.getElementById('cmd-motor-status'); if(cmdStatus) cmdStatus.innerText=labelStatus(state.partida.status);
  const blue=document.getElementById('cmd-blue-count'); if(blue) blue.innerText=state.equipes.azul.ativos;
  const red=document.getElementById('cmd-red-count'); if(red) red.innerText=state.equipes.vermelho.ativos;
  const start=document.getElementById('cmd-btn-start'); if(start) start.style.display=state.partida.status==='aguardando'?'block':'none';
  const pause=document.getElementById('cmd-btn-pause'); if(pause) pause.style.display=state.partida.status==='andamento'?'block':'none';
  const end=document.getElementById('cmd-btn-end'); if(end) end.style.display=['andamento','pausada'].includes(state.partida.status)?'block':'none';
  const grid=document.getElementById('cmd-objectives-list'); if(grid) grid.innerHTML=Object.values(state.objetivos).map(o=>`<div class="obj-item ${o.controle==='azul'?'obj-azul':o.controle==='vermelho'?'obj-verm':'obj-neutro'}"><span>${o.nome}</span><span>${o.controle.toUpperCase()}</span></div>`).join('');
  renderHUD(); renderLogs(); renderClock(); persist();
}

function renderHUD(){
  const indicator=document.getElementById('hud-status-indicator'), title=document.getElementById('hud-state-title'), desc=document.getElementById('hud-state-desc'), critical=document.getElementById('hud-critical-action'), modules=document.getElementById('hud-modules-grid');
  if(!indicator||!title||!desc||!critical||!modules)return;
  critical.innerHTML=''; modules.innerHTML='';
  if(state.partida.status!=='andamento'){ indicator.className='status-indicator'; indicator.innerText=labelStatus(state.partida.status); title.innerText='AGUARDANDO COMANDO'; title.style.color='var(--text-muted)'; desc.innerText='Use o DEV TEST para conduzir a demonstração.'; return; }
  if(state.jogador.situacao==='ativo'){
    indicator.className='status-indicator active'; indicator.innerText='ATIVO'; title.innerText='STATUS OPERACIONAL'; title.style.color='var(--tactical-green-light)'; desc.innerText=`${state.equipes[state.jogador.equipe].nome} • ${state.jogador.classe}`;
    critical.innerHTML='<button class="btn-danger" onclick="dispatch(\'PLAYER_HIT\')">DECLARAR HIT</button>';
    modules.innerHTML=`<button class="module-active" onclick="openCameraDemo()">CÂMERA / MÓDULO</button><button onclick="openMap()">MAPA</button><button onclick="openBriefing()">BRIEFING</button><button onclick="dispatch('RADIO_TOGGLE')">RÁDIO ${state.jogador.radio.ligado?'ONLINE':'OFFLINE'}</button><button onclick="dispatch('RADIO_PING')">PING EQUIPE</button><button onclick="dispatch('TEAM_STATUS')">STATUS EQUIPE</button>`;
  }else if(state.jogador.situacao==='atingido'){
    indicator.className='status-indicator hit'; indicator.innerText='ATINGIDO'; title.innerText='VOCÊ FOI ATINGIDO'; title.style.color='var(--tactical-red-light)'; desc.innerText='Estado atualizado pelo motor da partida.';
    critical.innerHTML='<button class="btn-success" onclick="dispatch(\'PLAYER_ACTIVE\')">SIMULAR RECUPERAÇÃO</button>';
    modules.innerHTML='<button onclick="openBriefing()">BRIEFING</button><button onclick="openMap()">MAPA</button>';
  }else{
    indicator.className='status-indicator'; indicator.innerText=state.jogador.situacao.toUpperCase(); title.innerText='FORA DO CAMPO'; title.style.color='var(--tactical-yellow)'; desc.innerText='Altere o estado pelo DEV TEST ou pelo comando.';
    critical.innerHTML='<button class="btn-success" onclick="dispatch(\'PLAYER_ACTIVE\')">VOLTAR PARA ATIVO</button>';
  }
}

function renderLogs(){ const box=document.getElementById('cmd-live-logs'); if(!box)return; box.innerHTML=state.eventos.map(e=>`<div class="log-line"><span class="log-time">[${e.time}]</span><span class="log-actor">${escapeHtml(e.actor)}:</span>${escapeHtml(e.message)}</div>`).join(''); }
function renderClock(){ const el=document.getElementById('hud-clock'); if(!el)return; const h=Math.floor(state.partida.tempo/3600).toString().padStart(2,'0'),m=Math.floor((state.partida.tempo%3600)/60).toString().padStart(2,'0'),s=(state.partida.tempo%60).toString().padStart(2,'0'); el.innerText=`${h}:${m}:${s}`; }
function escapeHtml(v){ return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }

window.addEventListener('load',()=>{ renderUI(); if(state.partida.status==='andamento') startClock(); });