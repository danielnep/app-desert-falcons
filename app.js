/* =========================================================
   DESERT FALCONS — APP CORE
   ========================================================= */

const KEY = 'df_game_terminal_v6';

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

const DEMO_CENTER = {
  lat: -19.9167,
  lng: -43.9345
};

/* =========================================================
   ESTADO
   ========================================================= */

function initial(){
  return {
    screen:'tactical',

    role:'player',

    dev:{
      enabled:false
    },

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
      alfa:{name:'Setor Alfa',control:'neutro'},
      bravo:{name:'Setor Bravo',control:'neutro'}
    },

    events:[]
  };
}

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return initial();

    return merge(initial(), JSON.parse(raw));
  }catch{
    return initial();
  }
}

function merge(a,b){
  return {
    ...a,
    ...b,

    dev:{
      ...a.dev,
      ...(b.dev || {})
    },

    match:{
      ...a.match,
      ...(b.match || {})
    },

    organizer:{
      ...a.organizer,
      ...(b.organizer || {})
    },

    player:{
      ...a.player,
      ...(b.player || {})
    },

    gps:{
      ...a.gps,
      ...(b.gps || {})
    },

    objectives:{
      ...a.objectives,
      ...(b.objectives || {})
    },

    events:Array.isArray(b.events) ? b.events : []
  };
}

function save(){
  try{
    localStorage.setItem(KEY, JSON.stringify(state));
  }catch{}
}

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function q(id){
  return document.getElementById(id);
}

function fmt(sec){
  return [
    Math.floor(sec / 3600),
    Math.floor(sec / 60) % 60,
    sec % 60
  ]
  .map(x => String(x).padStart(2,'0'))
  .join(':');
}

function toast(text){
  const x = document.createElement('div');

  x.className = 'app-toast';
  x.textContent = text;

  x.style.cssText = `
    position:fixed;
    left:50%;
    bottom:18px;
    transform:translateX(-50%);
    z-index:9999;
    padding:10px 14px;
    background:#222;
    border:1px solid #555;
    color:#fff;
    font-size:10px;
  `;

  document.body.appendChild(x);

  setTimeout(() => x.remove(), 2200);
}

/* =========================================================
   NAVEGAÇÃO — CADA ABERTURA É UMA TELA
   ========================================================= */

function showScreen(screen){

  document.querySelectorAll('.app-screen').forEach(s => {
    s.classList.remove('active');
  });

  const target = q(`screen-${screen}`);

  if(target){
    target.classList.add('active');
    state.screen = screen;
    save();
  }

  render();
}

function goBack(screen='tactical'){
  showScreen(screen);
}

/* =========================================================
   TIMER
   ========================================================= */

function startTimer(){

  clearInterval(timer);

  timer = setInterval(() => {

    if(state.match.status !== 'andamento'){
      return;
    }

    state.match.seconds++;

    if(q('gameClock')){
      q('gameClock').textContent = fmt(state.match.seconds);
    }

    save();

  },1000);
}

/* =========================================================
   BLOQUEIO DO PAINEL
   ========================================================= */

function lockPanel(){

  state.player.locked = true;

  q('touchGuard')?.classList.add('visible');
  q('manualLock')?.classList.remove('hidden');

  save();
  resetInactivity();
}

function unlockPanel(){

  state.player.locked = false;

  q('touchGuard')?.classList.remove('visible');
  q('manualLock')?.classList.remove('hidden');

  save();
  resetInactivity();
}

function resetInactivity(){

  clearTimeout(inactivityTimer);

  if(
    state.match.status !== 'andamento' ||
    state.player.locked
  ){
    return;
  }

  inactivityTimer = setTimeout(() => {
    lockPanel();
  },30000);
}

function initTouchGuard(){

  const guard = q('touchGuard');

  if(!guard) return;

  const begin = e => {

    if(state.match.status !== 'andamento'){
      return;
    }

    e.preventDefault();

    unlockStart = performance.now();

    const bar = guard.querySelector('.unlock-track i');

    clearInterval(unlockTimer);

    unlockTimer = setInterval(() => {

      const progress =
        Math.min(
          100,
          ((performance.now() - unlockStart) / 1200) * 100
        );

      if(bar){
        bar.style.width = `${progress}%`;
      }

      if(progress >= 100){

        clearInterval(unlockTimer);

        unlockPanel();

        navigator.vibrate?.(25);
      }

    },25);
  };

  const cancel = () => {

    clearInterval(unlockTimer);

    const bar = guard.querySelector('.unlock-track i');

    if(bar){
      bar.style.width = '0';
    }
  };

  guard.addEventListener('pointerdown',begin);

  ['pointerup','pointercancel','pointerleave']
    .forEach(event => {
      guard.addEventListener(event,cancel);
    });
}

function manualLock(){

  if(state.match.status === 'andamento'){
    lockPanel();
  }
}

/* =========================================================
   GPS
   ========================================================= */

function startGps(){

  if(!navigator.geolocation){
    return;
  }

  clearWatch();

  watchId = navigator.geolocation.watchPosition(

    pos => {

      state.gps = {
        lat:pos.coords.latitude,
        lng:pos.coords.longitude,
        accuracy:pos.coords.accuracy,
        ready:true
      };

      save();

      renderGps();
      positionPlayerOnFictionalMap();
    },

    () => {

      state.gps.ready = false;

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

  if(watchId !== null){

    navigator.geolocation.clearWatch(watchId);

    watchId = null;
  }
}

function renderGps(){

  const s = q('gpsStatus');
  const c = q('gpsCoords');
  const a = q('gpsAccuracy');

  if(!s || !c || !a){
    return;
  }

  if(state.gps.ready){

    s.textContent = '● GPS ATIVO';

    c.textContent =
      `${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)}`;

    a.textContent =
      `PRECISÃO ±${Math.round(state.gps.accuracy)} M`;

  }else{

    s.textContent = '● GPS AGUARDANDO';
    c.textContent = 'LOCALIZAÇÃO DEMO';
    a.textContent = 'PRECISÃO —';
  }
}

function positionPlayerOnFictionalMap(){

  const marker = q('playerMapMarker');

  if(!marker) return;

  const lat =
    state.gps.ready
      ? state.gps.lat
      : DEMO_CENTER.lat;

  const lng =
    state.gps.ready
      ? state.gps.lng
      : DEMO_CENTER.lng;

  const dx = Math.max(
    -1,
    Math.min(
      1,
      (lng - DEMO_CENTER.lng) * 700
    )
  );

  const dy = Math.max(
    -1,
    Math.min(
      1,
      (lat - DEMO_CENTER.lat) * 700
    )
  );

  marker.style.left = `${50 + dx * 24}%`;
  marker.style.top = `${52 - dy * 24}%`;
}

function centerMap(){

  positionPlayerOnFictionalMap();

  const marker = q('playerMapMarker');

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
   BRIEFING / PARTICIPAÇÃO
   ========================================================= */

function renderBriefing(){

  const title = q('briefingTitle');
  const body = q('briefingBody');

  if(title){
    title.textContent = state.organizer.briefingTitle;
  }

  if(body){

    body.innerHTML = `
      <p>
        <strong>${state.match.name}</strong>
      </p>

      <p>
        ${state.organizer.briefingText}
      </p>

      <p>
        MAPA: ${state.match.map}
      </p>

      <p>
        MODELO: ${state.match.mode}
      </p>
    `;
  }
}

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

/* =========================================================
   SELFIE
   ========================================================= */

async function captureSelfie(){

  const preview = q('selfiePreview');

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

    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    preview.classList.remove('hidden');
    preview.innerHTML = '';
    preview.appendChild(video);

    const snap = document.createElement('button');

    snap.className = 'detail-primary';
    snap.textContent = 'CAPTURAR';

    preview.appendChild(snap);

    snap.onclick = () => {

      const canvas =
        document.createElement('canvas');

      canvas.width = 600;
      canvas.height = 600;

      const ctx = canvas.getContext('2d');

      const s = Math.min(
        video.videoWidth,
        video.videoHeight
      );

      ctx.drawImage(
        video,
        (video.videoWidth - s) / 2,
        (video.videoHeight - s) / 2,
        s,
        s,
        0,
        0,
        600,
        600
      );

      const now = new Date();

      state.player.selfie = {
        data:canvas.toDataURL('image/jpeg',.78),
        timestamp:now.toISOString(),
        lat:state.gps.lat,
        lng:state.gps.lng
      };

      stream.getTracks().forEach(
        t => t.stop()
      );

      preview.innerHTML = `
        <img src="${state.player.selfie.data}" alt="Registro de presença">
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

function confirmParticipation(){

  if(!(
    state.player.briefingAck &&
    state.player.selfie
  )){

    toast(
      'Leia o briefing e registre a selfie antes de confirmar.'
    );

    return;
  }

  state.player.participation = true;
  state.player.status = 'aguardando';

  save();

  startGps();

  showScreen('waiting');
}

/* =========================================================
   PARTIDA
   ========================================================= */

function startMatch(){

  state.match.status = 'andamento';
  state.match.seconds = 0;

  state.player.status =
    state.player.participation
      ? 'ativo'
      : 'aguardando';

  save();

  if(state.player.participation){

    state.screen = 'tactical';

    state.player.locked = true;

    startGps();
    lockPanel();

    showScreen('tactical');

  }else{

    toast('Nenhum jogador confirmou participação.');
  }
}

/* =========================================================
   ORGANIZADOR
   ========================================================= */

function saveOrganizer(){

  const name =
    q('orgMatchName')?.value.trim();

  const map =
    q('orgMap')?.value;

  const mode =
    q('orgMode')?.value;

  const title =
    q('orgBriefingTitle')?.value.trim();

  const text =
    q('orgBriefingText')?.value.trim();

  if(name){
    state.match.name = name;
  }

  if(map){
    state.match.map = map;
  }

  if(mode){
    state.match.mode = mode;
  }

  if(title){
    state.organizer.briefingTitle = title;
  }

  if(text){
    state.organizer.briefingText = text;
  }

  save();

  render();

  toast('Configuração salva.');
}

/* =========================================================
   RÁDIO
   ========================================================= */

function toggleRadio(){

  state.player.radio =
    !state.player.radio;

  save();

  render();
}

function setChannel(value){

  state.player.channel = value;

  save();

  render();
}

function setVolume(value){

  state.player.radioVolume = Number(value);

  save();
}

async function startPtt(){

  if(!state.player.radio){

    toast('Rádio desligado.');

    return;
  }

  if(pttDown){
    return;
  }

  pttDown = true;

  q('radioPtt')
    ?.classList.add('transmitting');

  if(q('radioPtt')){
    q('radioPtt').innerHTML =
      '<span class="ptt-icon">●</span><strong>TRANSMITINDO…</strong>';
  }

  if(q('radioTx')){
    q('radioTx').textContent =
      'TRANSMITINDO';
  }

  try{

    if(
      navigator.mediaDevices?.getUserMedia &&
      window.MediaRecorder
    ){

      radioStream =
        await navigator.mediaDevices.getUserMedia({
          audio:true
        });

      radioChunks = [];

      radioRecorder =
        new MediaRecorder(radioStream);

      radioRecorder.ondataavailable =
        event => {

          if(event.data.size){
            radioChunks.push(event.data);
          }
        };

      radioRecorder.start();
    }

  }catch{}
}

function stopPtt(){

  if(!pttDown){
    return;
  }

  pttDown = false;

  if(
    radioRecorder &&
    radioRecorder.state === 'recording'
  ){
    radioRecorder.stop();
  }

  radioStream?.getTracks().forEach(
    track => track.stop()
  );

  radioStream = null;
  radioRecorder = null;

  q('radioPtt')
    ?.classList.remove('transmitting');

  if(q('radioPtt')){
    q('radioPtt').innerHTML =
      '<span class="ptt-icon">●</span><strong>SEGURE PARA FALAR</strong>';
  }

  if(q('radioTx')){
    q('radioTx').textContent =
      'PRONTO';
  }
}

/* =========================================================
   INSTRUÇÕES
   ========================================================= */

function openInstructions(){

  showScreen('instructions');

  const title = q('instructionsTitle');
  const body = q('instructionsBody');

  if(title){
    title.textContent =
      state.organizer.briefingTitle;
  }

  if(body){

    body.innerHTML = `
      <p>
        <strong>${state.match.name}</strong>
      </p>

      <p>
        ${state.organizer.briefingText}
      </p>

      <p>
        <strong>MAPA:</strong>
        ${state.match.map}
      </p>

      <p>
        <strong>MODELO:</strong>
        ${state.match.mode}
      </p>
    `;
  }
}

/* =========================================================
   DEV
   ========================================================= */

function openDev(){

  showScreen('dev');
}

function toggleDev(){

  state.dev.enabled =
    !state.dev.enabled;

  save();

  render();
}

function setDevRole(role){

  state.role = role;

  save();

  render();

  if(role === 'organizer'){
    showScreen('organizer');
  }else{
    showScreen('tactical');
  }
}

/* =========================================================
   RENDER
   ========================================================= */

function render(){

  q('headerRole').textContent =
    state.role === 'organizer'
      ? 'ORGANIZADOR'
      : 'JOGADOR';

  q('headerSubtitle').textContent =
    state.role === 'organizer'
      ? 'COMMAND CENTER'
      : 'PLAYER TERMINAL';

  q('headerMatch').textContent =
    state.match.status === 'andamento'
      ? 'EM ANDAMENTO'
      : state.player.participation
        ? 'AGUARDANDO'
        : 'PREPARAÇÃO';

  q('devOpen').textContent =
    state.dev.enabled
      ? 'DEV ATIVO'
      : 'MODO DEV';

  q('tacticalMatch').textContent =
    state.match.name.toUpperCase();

  q('gameClock').textContent =
    fmt(state.match.seconds);

  q('homePlayerName').textContent =
    state.player.name;

  q('homeIdentity').textContent =
    `${state.player.id} · ${state.player.team.toUpperCase()} · ${state.player.class.toUpperCase()}`;

  q('profileName').textContent =
    state.player.name;

  q('profileMeta').textContent =
    `${state.player.id} · ${state.player.team.toUpperCase()}`;

  q('profileClass').textContent =
    state.player.class.toUpperCase();

  q('profileStatus').textContent =
    state.player.status.toUpperCase();

  q('profileRadio').textContent =
    state.player.radio
      ? `CH ${state.player.channel}`
      : 'DESLIGADO';

  q('tacticalState').textContent =
    state.player.status === 'ativo'
      ? 'ATIVO'
      : 'AGUARDANDO';

  q('playerStateTitle').textContent =
    state.player.status === 'ativo'
      ? 'ATIVO'
      : 'AGUARDANDO';

  q('playerStateDesc').textContent =
    state.match.status === 'andamento'
      ? 'Partida em andamento.'
      : 'Aguardando início.';

  q('radioStatus').textContent =
    state.player.radio
      ? `LIGADO · CH ${state.player.channel}`
      : 'DESLIGADO';

  q('radioPower').textContent =
    state.player.radio
      ? 'DESLIGAR'
      : 'LIGAR';

  q('radioChannel').value =
    state.player.channel;

  q('radioVolume').value =
    state.player.radioVolume;

  if(q('briefingAck')){
    q('briefingAck').checked =
      !!state.player.briefingAck;
  }

  updateParticipationButton();

  renderGps();
  renderBriefing();
  renderDev();
  renderOrganizer();

  const controlled =
    Object.values(state.objectives)
      .filter(o => o.control === 'azul')
      .length;

  q('missionProgress').style.width =
    `${controlled / 2 * 100}%`;

  q('missionText').textContent =
    `${Object.values(state.objectives).filter(o => o.control !== 'neutro').length} de 2 setores registrados`;

  positionPlayerOnFictionalMap();

  /* Tela atual */
  document.querySelectorAll('.app-screen')
    .forEach(screen => {
      screen.classList.toggle(
        'active',
        screen.id === `screen-${state.screen}`
      );
    });

  /* Modo DEV */
  q('devOpen').style.display =
    state.role === 'organizer'
      ? 'none'
      : 'block';

  /* Trava */
  if(state.match.status === 'andamento'){
    if(state.player.locked){
      q('touchGuard')
        ?.classList.add('visible');
    }
  }
}

function renderDev(){

  const enabled =
    state.dev.enabled;

  q('devStateText').textContent =
    enabled
      ? 'HABILITADO'
      : 'DESABILITADO';

  q('devStateDot')
    ?.classList.toggle('enabled',enabled);

  q('devToggle').textContent =
    enabled
      ? 'DESABILITAR DEV'
      : 'HABILITAR DEV';

  document.querySelectorAll('.role-option')
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.role === state.role
      );
    });
}

function renderOrganizer(){

  if(!q('orgMatchName')){
    return;
  }

  q('orgMatchName').value =
    state.match.name;

  q('orgMap').value =
    state.match.map;

  q('orgMode').value =
    state.match.mode;

  q('orgBriefingTitle').value =
    state.organizer.briefingTitle;

  q('orgBriefingText').value =
    state.organizer.briefingText;

  q('orgAttendance').textContent =
    state.player.participation
      ? 'CONFIRMADO'
      : 'AGUARDANDO';

  q('orgReadyCount').textContent =
    state.player.participation
      ? '1/1'
      : '0/1';
}

/* =========================================================
   RESET
   ========================================================= */

function resetDemo(){

  clearWatch();
  stopPtt();
  clearInterval(timer);

  state = initial();

  save();

  startTimer();
  render();

  toast('Demonstração resetada.');
}

/* =========================================================
   EVENTOS
   ========================================================= */

function bind(){

  /* DEV */
  q('devOpen')
    ?.addEventListener('click',openDev);

  q('devToggle')
    ?.addEventListener('click',toggleDev);

  document.querySelectorAll('.role-option')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          if(!state.dev.enabled){

            toast('Habilite o modo DEV primeiro.');

            return;
          }

          setDevRole(button.dataset.role);
        }
      );
    });

  /* Voltar */
  document.querySelectorAll('[data-back]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {
          goBack(button.dataset.back);
        }
      );
    });

  /* Detalhes */
  document.querySelectorAll('.detail-tab')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          const detail =
            button.dataset.detail;

          document.querySelectorAll('.detail-tab')
            .forEach(tab => {
              tab.classList.toggle(
                'active',
                tab === button
              );
            });

          document.querySelectorAll('.detail-pane')
            .forEach(pane => {
              pane.classList.toggle(
                'active',
                pane.id === `detail-${detail}`
              );
            });
        }
      );
    });

  document.querySelectorAll('[data-detail]:not(.detail-tab)')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          showScreen('details');

          const detail =
            button.dataset.detail;

          const tab =
            document.querySelector(
              `.detail-tab[data-detail="${detail}"]`
            );

          tab?.click();
        }
      );
    });

  /* Briefing / presença */
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
      e => setChannel(e.target.value)
    );

  q('radioVolume')
    ?.addEventListener(
      'input',
      e => setVolume(e.target.value)
    );

  q('radioPtt')
    ?.addEventListener(
      'pointerdown',
      startPtt
    );

  ['pointerup','pointercancel','pointerleave']
    .forEach(event => {

      q('radioPtt')
        ?.addEventListener(
          event,
          stopPtt
        );
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
      () => toast('Evento de demonstração lançado.')
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

  q('resetDemoButton')
    ?.addEventListener(
      'click',
      resetDemo
    );

  initTouchGuard();

  document.addEventListener(
    'pointerdown',
    () => {

      if(
        state.screen === 'tactical' &&
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
   START
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    bind();
    startTimer();
    render();

    if(state.player.participation){
      startGps();
    }
  }
);
