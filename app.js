/* =========================================================
   DESERT FALCONS — APP.JS
   Lógica principal integrada.
   Não depende de dev-mode.js, dev-controls.js,
   player-fixes.js, team-simulation.js ou outros auxiliares.
   ========================================================= */

const KEY = 'df_game_terminal_v5';

let state = load();

let timer = null;
let unlockTimer = null;
let unlockStart = 0;
let inactivityTimer = null;
let watchId = null;

let radioRecorder = null;
let radioStream = null;
let radioChunks = [];
let pttDown = false;

/* =========================================================
   CONFIGURAÇÃO DEMO
   ========================================================= */

const DEMO_CENTER = {
  lat: -19.9167,
  lng: -43.9345
};

/* =========================================================
   ESTADO INICIAL
   ========================================================= */

function initial(){

  return {
    view:'tactical',

    role:'player',

    dev:{
      enabled:false,
      selectedRole:'player'
    },

    detail:'inicio',

    match:{
      name:'Operação Red Sand',
      status:'aguardando',
      seconds:0,
      map:'Complexo Industrial',
      mode:'Simulação'
    },

    organizer:{
      briefingTitle:'Briefing da Operação',
      briefingText:'Objetivo, regras da partida, condições de participação e orientações gerais.'
    },

    player:{
      id:'DF-001',
      name:'Daniel',
      team:'azul',
      class:'Assalto',
      status:'aguardando',

      radio:true,
      channel:'01',
      radioVolume:70,

      briefingAck:false,
      participation:false,
      selfie:null,

      locked:true
    },

    gps:{
      lat:null,
      lng:null,
      accuracy:null,
      ready:false
    },

    objectives:{
      alfa:{
        name:'Setor Alfa',
        control:'neutro'
      },
      bravo:{
        name:'Setor Bravo',
        control:'neutro'
      }
    },

    modules:{
      medical:true,
      zone:true,
      score:false,
      tracking:false,
      objectives:true,
      events:false
    },

    events:[],

    requests:[]
  };
}

/* =========================================================
   PERSISTÊNCIA
   ========================================================= */

function load(){

  try{

    const raw = localStorage.getItem(KEY);

    if(!raw){
      return initial();
    }

    return merge(initial(), JSON.parse(raw));

  }catch{

    return initial();

  }
}

function merge(base,data){

  return {
    ...base,
    ...data,

    dev:{
      ...base.dev,
      ...(data?.dev || {})
    },

    match:{
      ...base.match,
      ...(data?.match || {})
    },

    organizer:{
      ...base.organizer,
      ...(data?.organizer || {})
    },

    player:{
      ...base.player,
      ...(data?.player || {})
    },

    gps:{
      ...base.gps,
      ...(data?.gps || {})
    },

    modules:{
      ...base.modules,
      ...(data?.modules || {})
    },

    objectives:{
      ...base.objectives,
      ...(data?.objectives || {})
    },

    events:Array.isArray(data?.events)
      ? data.events
      : [],

    requests:Array.isArray(data?.requests)
      ? data.requests
      : []
  };
}

function save(){

  localStorage.setItem(KEY,JSON.stringify(state));

}

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function q(id){
  return document.getElementById(id);
}

function fmt(sec){

  return [
    Math.floor(sec/3600),
    Math.floor(sec/60)%60,
    sec%60
  ]
  .map(x=>String(x).padStart(2,'0'))
  .join(':');

}

function toast(text){

  const x = document.createElement('div');

  x.className = 'app-toast';
  x.textContent = text;

  document.body.appendChild(x);

  setTimeout(()=>{
    x.remove();
  },2200);

}

function escapeHtml(value){

  return String(value ?? '')
    .replace(/[&<>"']/g,char=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));

}

/* =========================================================
   DEV MODE
   ========================================================= */

/*
  DEV não é uma simples troca de "jogador ↔ organizador".

  A arquitetura separa:
  - DEV habilitado/desabilitado
  - papel selecionado
  - estado da partida
  - tela atual

  Somente o papel ORGANIZADOR possui autoridade para
  iniciar/encerrar partida.
*/

function openDev(){

  renderDevModal();

}

function closeDev(){

  document.querySelector('.dev-overlay')?.remove();

}

function renderDevModal(){

  closeDev();

  const overlay = document.createElement('div');

  overlay.className = 'dev-overlay open';

  overlay.innerHTML = `
    <div class="dev-panel">

      <div class="dev-panel-head">

        <div>
          <span class="micro">DESERT FALCONS</span>
          <h2>MODO DEV</h2>
        </div>

        <button class="dev-close" id="devClose">✕</button>

      </div>

      <div class="dev-state">
        <strong>ESTADO DO DEV: ${state.dev.enabled ? 'HABILITADO' : 'DESABILITADO'}</strong>
        <small>
          Controle separado do papel e do estado da partida.
        </small>
      </div>

      <span class="micro">ESCOLHER PAPEL</span>

      <div class="dev-role-row">

        <button
          class="dev-role ${state.dev.selectedRole==='player'?'active':''}"
          data-dev-role="player">
          JOGADOR
        </button>

        <button
          class="dev-role ${state.dev.selectedRole==='organizer'?'active':''}"
          data-dev-role="organizer">
          ORGANIZADOR
        </button>

      </div>

      <button id="devEnable" class="dev-toggle">
        ${state.dev.enabled ? 'DESABILITAR MODO DEV' : 'HABILITAR MODO DEV'}
      </button>

      <button id="devApply" class="detail-primary">
        APLICAR
      </button>

    </div>
  `;

  document.getElementById('devRoot').appendChild(overlay);

  overlay.addEventListener('click',e=>{

    if(e.target===overlay){
      closeDev();
    }

  });

  q('devClose')?.addEventListener('click',closeDev);

  document.querySelectorAll('[data-dev-role]').forEach(button=>{

    button.addEventListener('click',()=>{

      state.dev.selectedRole = button.dataset.devRole;

      renderDevModal();

    });

  });

  q('devEnable')?.addEventListener('click',()=>{

    state.dev.enabled = !state.dev.enabled;

    save();

    renderDevModal();

  });

  q('devApply')?.addEventListener('click',applyDev);

}

function applyDev(){

  if(!state.dev.enabled){

    state.role = 'player';
    state.view = state.player.participation
      ? 'waiting'
      : 'details';

    save();
    closeDev();
    render();

    return;
  }

  state.role = state.dev.selectedRole;

  state.view =
    state.role === 'organizer'
      ? 'organizer'
      : (
          state.match.status === 'andamento'
            ? 'tactical'
            : state.player.participation
              ? 'waiting'
              : 'details'
        );

  save();

  closeDev();

  render();

}

/* =========================================================
   PAPEL E AUTORIDADE
   ========================================================= */

function isOrganizer(){

  return state.role === 'organizer';

}

function requireOrganizer(){

  if(!isOrganizer()){

    toast('Ação disponível somente para o organizador.');

    return false;

  }

  return true;

}

/* =========================================================
   NAVEGAÇÃO DO JOGADOR
   ========================================================= */

function activatePlayerView(view){

  q('screen-tactical')?.classList.toggle(
    'active',
    view==='tactical'
  );

  q('screen-details')?.classList.toggle(
    'active',
    view==='details'
  );

  q('screen-waiting')?.classList.toggle(
    'active',
    view==='waiting'
  );

  document.querySelectorAll('.player-nav-btn').forEach(button=>{

    button.classList.toggle(
      'active',
      button.dataset.view===view
    );

  });

}

function setPlayerView(view){

  if(isOrganizer()) return;

  if(
    state.match.status==='andamento' &&
    state.player.participation &&
    view==='details'
  ){

    toast('Detalhes indisponíveis durante a partida.');

    view='tactical';

  }

  state.view=view;

  save();

  render();

}

function setDetail(detail){

  state.detail=detail;

  document.querySelectorAll('.detail-tab').forEach(button=>{

    button.classList.toggle(
      'active',
      button.dataset.detail===detail
    );

  });

  document.querySelectorAll('.detail-pane').forEach(pane=>{

    pane.classList.toggle(
      'active',
      pane.id === `detail-${detail}`
    );

  });

  save();

}

/* =========================================================
   BRIEFING
   ========================================================= */

function briefingChanged(){

  state.player.briefingAck =
    !!q('briefingAck')?.checked;

  save();

  updateParticipationButton();

}

function updateParticipationButton(){

  const button = q('confirmParticipation');

  if(!button) return;

  button.disabled = !(
    state.player.briefingAck &&
    state.player.selfie
  );

}

function renderBriefing(){

  const title = q('briefingTitle');
  const body = q('briefingBody');

  if(title){

    title.textContent =
      state.organizer.briefingTitle;

  }

  if(body){

    body.innerHTML = `
      <p>
        <strong>${escapeHtml(state.match.name)}</strong>
        · ${escapeHtml(state.match.map)}
        · ${escapeHtml(state.match.mode)}
      </p>

      <p style="margin-top:6px">
        ${escapeHtml(state.organizer.briefingText)}
      </p>
    `;

  }

}

/* =========================================================
   REGISTRO DE PRESENÇA
   ========================================================= */

async function captureSelfie(){

  const preview = q('selfiePreview');

  if(!preview){

    return;

  }

  try{

    if(!navigator.mediaDevices?.getUserMedia){

      throw new Error();

    }

    const stream =
      await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:'user'
        },
        audio:false
      });

    const video = document.createElement('video');

    video.autoplay=true;
    video.playsInline=true;
    video.srcObject=stream;

    preview.classList.remove('hidden');
    preview.innerHTML='';
    preview.appendChild(video);

    const button=document.createElement('button');

    button.className='detail-primary';
    button.textContent='CAPTURAR REGISTRO';

    preview.appendChild(button);

    button.onclick=()=>{

      const canvas=document.createElement('canvas');

      canvas.width=600;
      canvas.height=600;

      const ctx=canvas.getContext('2d');

      const side=Math.min(
        video.videoWidth,
        video.videoHeight
      );

      ctx.drawImage(
        video,
        (video.videoWidth-side)/2,
        (video.videoHeight-side)/2,
        side,
        side,
        0,
        0,
        600,
        600
      );

      const now=new Date();

      ctx.fillStyle='rgba(0,0,0,.72)';
      ctx.fillRect(0,530,600,70);

      ctx.fillStyle='#fff';
      ctx.font='16px monospace';

      ctx.fillText(
        now.toLocaleString('pt-BR'),
        15,
        555
      );

      ctx.font='13px monospace';

      ctx.fillText(
        state.gps.ready
          ? `${state.gps.lat.toFixed(5)}, ${state.gps.lng.toFixed(5)}`
          : 'LOCALIZAÇÃO NÃO DISPONÍVEL',
        15,
        578
      );

      state.player.selfie={
        data:canvas.toDataURL('image/jpeg',.78),
        timestamp:now.toISOString(),
        lat:state.gps.lat,
        lng:state.gps.lng
      };

      stream.getTracks().forEach(track=>track.stop());

      preview.innerHTML=`
        <img
          src="${state.player.selfie.data}"
          alt="Registro de presença"
        >

        <span>
          REGISTRO CAPTURADO ·
          ${now.toLocaleTimeString('pt-BR',{hour12:false})}
        </span>
      `;

      save();

      updateParticipationButton();

    };

  }catch{

    toast('Câmera indisponível ou permissão negada.');

  }

}

/* =========================================================
   PARTICIPAÇÃO
   ========================================================= */

function confirmParticipation(){

  if(!(
    state.player.briefingAck &&
    state.player.selfie
  )){

    toast(
      'Leia o briefing e registre a presença antes de confirmar.'
    );

    return;

  }

  state.player.participation=true;
  state.player.status='aguardando';

  state.role='player';
  state.view='waiting';

  save();

  startGps();

  render();

}

/* =========================================================
   PARTIDA
   ========================================================= */

function startMatch(){

  if(!requireOrganizer()) return;

  if(state.match.status==='andamento'){

    toast('A partida já está em andamento.');

    return;

  }

  state.match.status='andamento';
  state.match.seconds=0;

  if(state.player.participation){

    state.player.status='ativo';

  }else{

    state.player.status='aguardando';

  }

  save();

  startGps();

  /*
    O organizador permanece organizador.
    Ele não perde sua autoridade ao iniciar a partida.
  */

  state.role='organizer';
  state.view='organizer';

  render();

  toast('Partida iniciada.');

}

function endMatch(){

  if(!requireOrganizer()) return;

  if(state.match.status!=='andamento'){

    toast('Não há partida em andamento.');

    return;

  }

  state.match.status='encerrada';

  state.player.status=
    state.player.participation
      ? 'finalizado'
      : 'aguardando';

  state.view='organizer';
  state.role='organizer';

  clearWatch();

  save();

  render();

  toast('Partida encerrada pelo organizador.');

}

function resetDemo(){

  clearWatch();
  stopPtt();
  clearInterval(timer);

  localStorage.removeItem(KEY);

  state=initial();

  save();

  startTimer();

  render();

  toast('Demonstração resetada.');

}

/* =========================================================
   CONFIGURAÇÃO DO ORGANIZADOR
   ========================================================= */

function saveOrganizer(){

  if(!requireOrganizer()) return;

  const name=q('orgMatchName')?.value.trim();
  const map=q('orgMap')?.value;
  const mode=q('orgMode')?.value;

  const title=q('orgBriefingTitle')?.value.trim();
  const text=q('orgBriefingText')?.value.trim();

  if(name){
    state.match.name=name;
  }

  if(map){
    state.match.map=map;
  }

  if(mode){
    state.match.mode=mode;
  }

  if(title){
    state.organizer.briefingTitle=title;
  }

  if(text){
    state.organizer.briefingText=text;
  }

  save();

  render();

  toast('Configuração salva.');

}

/* =========================================================
   MÓDULOS
   ========================================================= */

function toggleModule(key){

  if(!requireOrganizer()) return;

  if(!(key in state.modules)) return;

  state.modules[key]=!state.modules[key];

  save();

  renderOrganizer();

}

/* =========================================================
   RÁDIO — CONTROLE VISUAL / REGISTRO
   ========================================================= */

function toggleRadio(){

  state.player.radio=!state.player.radio;

  stopPtt();

  save();

  render();

}

function setChannel(value){

  state.player.channel=value;

  save();

  render();

}

function setVolume(value){

  state.player.radioVolume=Number(value);

  save();

}

async function startPtt(){

  if(!state.player.radio){

    toast('Rádio desligado.');

    return;

  }

  if(pttDown) return;

  pttDown=true;

  q('radioPtt')?.classList.add('transmitting');

  if(q('radioPtt')){
    q('radioPtt').textContent='TRANSMITINDO…';
  }

  if(q('radioTx')){
    q('radioTx').textContent='TRANSMITINDO';
  }

  /*
    Registro local da entrada de áudio.
    Não existe transmissão externa neste terminal.
  */

  try{

    if(
      navigator.mediaDevices?.getUserMedia &&
      window.MediaRecorder
    ){

      radioStream =
        await navigator.mediaDevices.getUserMedia({
          audio:true
        });

      radioChunks=[];

      radioRecorder =
        new MediaRecorder(radioStream);

      radioRecorder.ondataavailable=e=>{

        if(e.data.size){
          radioChunks.push(e.data);
        }

      };

      radioRecorder.onstop=()=>{

        radioStream?.getTracks().forEach(
          track=>track.stop()
        );

        radioStream=null;
        radioRecorder=null;

      };

      radioRecorder.start();

    }

  }catch{

    /* microfone opcional */

  }

}

function stopPtt(){

  if(!pttDown) return;

  pttDown=false;

  if(
    radioRecorder &&
    radioRecorder.state==='recording'
  ){
    radioRecorder.stop();
  }

  radioStream?.getTracks().forEach(
    track=>track.stop()
  );

  radioStream=null;
  radioRecorder=null;

  q('radioPtt')?.classList.remove(
    'transmitting'
  );

  if(q('radioPtt')){
    q('radioPtt').textContent='SEGURE PARA FALAR';
  }

  if(q('radioTx')){
    q('radioTx').textContent='PRONTO';
  }

}

/* =========================================================
   TRAVA DO PAINEL
   ========================================================= */

function lockPanel(){

  state.player.locked=true;

  q('touchGuard')?.classList.add('visible');
  q('manualLock')?.classList.add('hidden');

  save();

  resetInactivity();

}

function unlockPanel(){

  state.player.locked=false;

  q('touchGuard')?.classList.remove('visible');
  q('manualLock')?.classList.remove('hidden');

  save();

  resetInactivity();

}

function initTouchGuard(){

  const guard=q('touchGuard');

  if(!guard) return;

  const begin=e=>{

    if(state.match.status!=='andamento') return;

    e.preventDefault();

    unlockStart=performance.now();

    const bar=
      guard.querySelector('.unlock-track i');

    clearInterval(unlockTimer);

    unlockTimer=setInterval(()=>{

      const progress=
        Math.min(
          100,
          ((performance.now()-unlockStart)/1200)*100
        );

      if(bar){

        bar.style.width=`${progress}%`;

      }

      if(progress>=100){

        clearInterval(unlockTimer);

        unlockPanel();

        navigator.vibrate?.(25);

      }

    },25);

  };

  const cancel=()=>{

    clearInterval(unlockTimer);

    const bar=
      guard.querySelector('.unlock-track i');

    if(bar){

      bar.style.width='0';

    }

  };

  guard.addEventListener(
    'pointerdown',
    begin
  );

  ['pointerup','pointercancel','pointerleave']
    .forEach(type=>{
      guard.addEventListener(type,cancel);
    });

}

function manualLock(){

  if(state.match.status==='andamento'){
    lockPanel();
  }

}

function resetInactivity(){

  clearTimeout(inactivityTimer);

  if(
    state.match.status!=='andamento' ||
    state.player.locked
  ){
    return;
  }

  inactivityTimer=setTimeout(
    lockPanel,
    30000
  );

}

/* =========================================================
   GPS
   ========================================================= */

function startGps(){

  if(!navigator.geolocation){
    return;
  }

  clearWatch();

  watchId=
    navigator.geolocation.watchPosition(
      position=>{

        state.gps={
          lat:position.coords.latitude,
          lng:position.coords.longitude,
          accuracy:position.coords.accuracy,
          ready:true
        };

        save();

        renderGps();
        positionPlayerOnFictionalMap();

      },

      ()=>{
        state.gps.ready=false;
        renderGps();
      },

      {
        enableHighAccuracy:true,
        maximumAge:5000,
        timeout:10000
      }
    );

}

function clearWatch(){

  if(watchId!==null){

    navigator.geolocation.clearWatch(watchId);

    watchId=null;

  }

}

function renderGps(){

  const status=q('gpsStatus');
  const coords=q('gpsCoords');
  const accuracy=q('gpsAccuracy');

  if(!status || !coords || !accuracy){
    return;
  }

  if(state.gps.ready){

    status.textContent='● GPS ATIVO';

    coords.textContent=
      `${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)}`;

    accuracy.textContent=
      `PRECISÃO ±${Math.round(state.gps.accuracy)} M`;

  }else{

    status.textContent='● GPS AGUARDANDO';
    coords.textContent='LOCALIZAÇÃO DEMO';
    accuracy.textContent='PRECISÃO —';

  }

}

function positionPlayerOnFictionalMap(){

  const marker=q('playerMapMarker');

  if(!marker) return;

  const lat=
    state.gps.ready
      ? state.gps.lat
      : DEMO_CENTER.lat;

  const lng=
    state.gps.ready
      ? state.gps.lng
      : DEMO_CENTER.lng;

  const dx=
    Math.max(
      -1,
      Math.min(
        1,
        (lng-DEMO_CENTER.lng)*700
      )
    );

  const dy=
    Math.max(
      -1,
      Math.min(
        1,
        (lat-DEMO_CENTER.lat)*700
      )
    );

  marker.style.left=
    `${50+dx*24}%`;

  marker.style.top=
    `${52-dy*24}%`;

}

function centerMap(){

  positionPlayerOnFictionalMap();

  const marker=q('playerMapMarker');

  marker?.animate(
    [
      {
        transform:'translate(-50%,-50%) scale(1)'
      },
      {
        transform:'translate(-50%,-50%) scale(1.25)'
      },
      {
        transform:'translate(-50%,-50%) scale(1)'
      }
    ],
    {
      duration:450
    }
  );

}

/* =========================================================
   INSTRUÇÕES
   ========================================================= */

function openInstructions(){

  modal(
    'BRIEFING E REGRAS',
    `
      <div class="rule-card">
        <b>${escapeHtml(state.organizer.briefingTitle)}</b>

        <p>
          ${escapeHtml(state.organizer.briefingText)}
        </p>
      </div>

      <button
        class="detail-primary"
        onclick="closeModal()">
        FECHAR
      </button>
    `
  );

}

/* =========================================================
   MODAL
   ========================================================= */

function modal(title,body){

  closeModal();

  q('modalRoot').innerHTML=`
    <div class="modal-backdrop"
         onclick="if(event.target===this)closeModal()">

      <div class="modal">

        <div class="modal-head">

          <h2>${escapeHtml(title)}</h2>

          <button onclick="closeModal()">
            ✕
          </button>

        </div>

        <div class="modal-body">
          ${body}
        </div>

      </div>
    </div>
  `;

}

function closeModal(){

  stopPtt();

  q('modalRoot').innerHTML='';

}

/* =========================================================
   SOLICITAÇÕES AO ORGANIZADOR
   ========================================================= */

function renderRequests(){

  const root=q('organizerRequests');

  if(!root) return;

  if(!state.requests.length){

    root.innerHTML=
      '<div class="empty-state">Nenhuma solicitação pendente.</div>';

    return;

  }

  root.innerHTML=state.requests.map((request,index)=>`

    <div class="request-item">

      <div>
        <strong>${escapeHtml(request.title)}</strong>
        <small>${escapeHtml(request.text)}</small>
      </div>

      <button
        class="small"
        data-request-index="${index}">
        RECEBER
      </button>

    </div>

  `).join('');

  root
    .querySelectorAll('[data-request-index]')
    .forEach(button=>{

      button.addEventListener('click',()=>{

        const index=Number(
          button.dataset.requestIndex
        );

        state.requests.splice(index,1);

        save();

        renderRequests();

      });

    });

}

/* =========================================================
   TELA DO ORGANIZADOR
   ========================================================= */

function renderOrganizer(){

  const root=q('screen-organizer');

  if(!root) return;

  q('orgMatchName').value=
    state.match.name;

  q('orgMap').value=
    state.match.map;

  q('orgMode').value=
    state.match.mode;

  q('orgBriefingTitle').value=
    state.organizer.briefingTitle;

  q('orgBriefingText').value=
    state.organizer.briefingText;

  q('orgAttendance').textContent=
    state.player.participation
      ? 'CONFIRMADO'
      : 'AGUARDANDO';

  q('orgReadyCount').textContent=
    state.player.participation
      ? '1/1'
      : '0/1';

  document
    .querySelectorAll('.module-toggle')
    .forEach(button=>{

      button.classList.toggle(
        'on',
        !!state.modules[button.dataset.module]
      );

    });

  q('startMatchButton')
    ?.classList.toggle(
      'hidden',
      state.match.status==='andamento'
    );

  q('endMatchButton')
    ?.classList.toggle(
      'hidden',
      state.match.status!=='andamento'
    );

  renderRequests();

}

/* =========================================================
   RENDER GERAL
   ========================================================= */

function render(){

  const organizer=isOrganizer();

  q('headerRole').textContent=
    organizer
      ? 'ORGANIZADOR'
      : 'JOGADOR';

  q('headerSubtitle').textContent=
    organizer
      ? 'COMMAND CENTER'
      : 'PLAYER TERMINAL';

  q('headerMatch').textContent=
    state.match.status==='andamento'
      ? 'EM ANDAMENTO'
      : state.match.status==='encerrada'
        ? 'ENCERRADA'
        : state.player.participation
          ? 'AGUARDANDO'
          : 'PREPARAÇÃO';

  q('homePlayerName').textContent=
    state.player.name;

  q('homeIdentity').textContent=
    `${state.player.id} · ${state.player.team.toUpperCase()} · ${state.player.class.toUpperCase()}`;

  q('profileName').textContent=
    state.player.name;

  q('profileMeta').textContent=
    `${state.player.id} · ${state.player.team.toUpperCase()}`;

  q('profileClass').textContent=
    state.player.class.toUpperCase();

  q('profileStatus').textContent=
    state.player.status.toUpperCase();

  q('profileRadio').textContent=
    state.player.radio
      ? `CH ${state.player.channel}`
      : 'DESLIGADO';

  if(q('briefingAck')){

    q('briefingAck').checked=
      !!state.player.briefingAck;

  }

  updateParticipationButton();

  q('tacticalMatch').textContent=
    state.match.name.toUpperCase();

  q('tacticalState').textContent=
    state.player.status==='ativo'
      ? 'ATIVO'
      : 'AGUARDANDO';

  q('radioStatus').textContent=
    state.player.radio
      ? `LIGADO · CH ${state.player.channel}`
      : 'DESLIGADO';

  q('radioPower').textContent=
    state.player.radio
      ? 'DESLIGAR'
      : 'LIGAR';

  q('radioChannel').value=
    state.player.channel;

  q('radioVolume').value=
    state.player.radioVolume;

  q('playerStateTitle').textContent=
    state.player.status==='ativo'
      ? 'ATIVO'
      : 'AGUARDANDO';

  q('playerStateDesc').textContent=
    state.match.status==='andamento'
      ? 'Partida em andamento.'
      : state.match.status==='encerrada'
        ? 'Partida encerrada.'
        : 'Aguardando início.';

  const blueObjectives=
    Object.values(state.objectives)
      .filter(item=>item.control==='azul')
      .length;

  const changedObjectives=
    Object.values(state.objectives)
      .filter(item=>item.control!=='neutro')
      .length;

  q('missionProgress').style.width=
    `${blueObjectives/2*100}%`;

  q('missionText').textContent=
    `${changedObjectives} de 2 setores registrados`;

  q('gameClock').textContent=
    fmt(state.match.seconds);

  renderGps();
  positionPlayerOnFictionalMap();
  renderBriefing();
  renderOrganizer();
  renderRequests();

  q('playerNav').style.display=
    organizer
      ? 'none'
      : 'grid';

  q('screen-organizer').style.display=
    organizer
      ? 'block'
      : 'none';

  if(organizer){

    q('screen-tactical')?.classList.remove('active');
    q('screen-details')?.classList.remove('active');
    q('screen-waiting')?.classList.remove('active');

  }else{

    activatePlayerView(
      state.view==='details'
        ? 'details'
        : state.view==='waiting'
          ? 'waiting'
          : 'tactical'
    );

  }

  /*
    Estado do painel protegido.
    Durante uma partida o bloqueio volta a aparecer
    sempre que o usuário entra novamente no painel.
  */

  if(
    state.match.status==='andamento' &&
    !state.player.locked &&
    state.view==='tactical'
  ){

    q('touchGuard')?.classList.remove('visible');

  }else if(
    state.match.status!=='andamento'
  ){

    q('touchGuard')?.classList.add('visible');

  }

}

/* =========================================================
   TIMER
   ========================================================= */

function startTimer(){

  clearInterval(timer);

  timer=setInterval(()=>{

    if(state.match.status==='andamento'){

      state.match.seconds++;

      if(q('gameClock')){

        q('gameClock').textContent=
          fmt(state.match.seconds);

      }

      save();

    }

  },1000);

}

/* =========================================================
   EVENTOS / BIND
   ========================================================= */

function bind(){

  /* Navegação principal */

  document
    .querySelectorAll('.player-nav-btn')
    .forEach(button=>{

      button.addEventListener(
        'click',
        ()=>setPlayerView(button.dataset.view)
      );

    });

  /* Abas do jogador */

  document
    .querySelectorAll('.detail-tab')
    .forEach(button=>{

      button.addEventListener(
        'click',
        ()=>setDetail(button.dataset.detail)
      );

    });

  document
    .querySelectorAll('[data-detail]:not(.detail-tab)')
    .forEach(button=>{

      button.addEventListener(
        'click',
        ()=>setDetail(button.dataset.detail)
      );

    });

  /* DEV */

  q('devOpenButton')
    ?.addEventListener(
      'click',
      openDev
    );

  /* Briefing */

  q('briefingAck')
    ?.addEventListener(
      'change',
      briefingChanged
    );

  q('selfieButton')
    ?.addEventListener(
      'click',
      captureSelfie
    );

  q('confirmParticipation')
    ?.addEventListener(
      'click',
      confirmParticipation
    );

  /* Rádio */

  q('radioPower')
    ?.addEventListener(
      'click',
      toggleRadio
    );

  q('radioChannel')
    ?.addEventListener(
      'change',
      event=>setChannel(event.target.value)
    );

  q('radioVolume')
    ?.addEventListener(
      'input',
      event=>setVolume(event.target.value)
    );

  q('radioPtt')
    ?.addEventListener(
      'pointerdown',
      startPtt
    );

  ['pointerup','pointercancel','pointerleave']
    .forEach(type=>{
      q('radioPtt')
        ?.addEventListener(type,stopPtt);
    });

  /* Mapa */

  q('mapCenter')
    ?.addEventListener(
      'click',
      centerMap
    );

  /* Ações */

  q('instructionsButton')
    ?.addEventListener(
      'click',
      openInstructions
    );

  q('hitButton')
    ?.addEventListener(
      'click',
      ()=>{
        state.events.push({
          type:'demo-event',
          timestamp:new Date().toISOString()
        });

        save();

        toast('Evento de demonstração registrado.');
      }
    );

  /* Trava */

  q('manualLock')
    ?.addEventListener(
      'click',
      manualLock
    );

  /* Organizador */

  q('saveBriefing')
    ?.addEventListener(
      'click',
      saveOrganizer
    );

  q('startMatchButton')
    ?.addEventListener(
      'click',
      startMatch
    );

  q('endMatchButton')
    ?.addEventListener(
      'click',
      endMatch
    );

  q('resetDemoButton')
    ?.addEventListener(
      'click',
      resetDemo
    );

  /* Módulos */

  document
    .querySelectorAll('.module-toggle')
    .forEach(button=>{

      button.addEventListener(
        'click',
        ()=>toggleModule(button.dataset.module)
      );

    });

  /* Proteção */

  initTouchGuard();

  document.addEventListener(
    'pointerdown',
    ()=>{
      if(
        state.view==='tactical' &&
        !state.player.locked
      ){
        resetInactivity();
      }
    },
    {
      passive:true
    }
  );

}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  ()=>{

    bind();

    startTimer();

    render();

    if(
      state.player.participation
    ){
      startGps();
    }

  }
);
