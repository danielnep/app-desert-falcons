/* =========================================================
   DESERT FALCONS — GAME CORE
   Estado único compartilhado entre DEV/JOGADOR/ORGANIZADOR
   ========================================================= */

const KEY = 'df_game_terminal_v7';

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
  lat:-19.9167,
  lng:-43.9345
};


/* =========================================================
   ESTADO INICIAL
   ========================================================= */

function initial(){

  return {

    role:'player',

    screen:'lobby',

    dev:{
      enabled:false,
      simulatedPlayers:0
    },

    match:{

      created:false,

      name:'Operação Red Sand',

      status:'draft',

      seconds:0,

      map:'Complexo Industrial',

      mode:'Simulação'

    },

    organizer:{

      name:'Daniel',

      participates:false,

      briefingTitle:'Briefing da Operação',

      briefingText:
        'Objetivo, regras da partida, condições de participação e orientações gerais.'

    },

    player:{

      id:'DF-001',

      name:'Daniel',

      team:'azul',

      class:'Assalto',

      participation:false,

      request:'none',

      status:'aguardando',

      radio:true,

      channel:'01',

      radioVolume:70,

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

    }

  };
}


/* =========================================================
   STORAGE
   ========================================================= */

function load(){

  try{

    const raw =
      localStorage.getItem(KEY);

    if(!raw){
      return initial();
    }

    return merge(
      initial(),
      JSON.parse(raw)
    );

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
    }

  };
}


function save(){

  try{

    localStorage.setItem(
      KEY,
      JSON.stringify(state)
    );

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
  .map(
    x => String(x).padStart(2,'0')
  )
  .join(':');

}


function toast(text){

  const element =
    document.createElement('div');

  element.className =
    'app-toast';

  element.textContent =
    text;

  element.style.cssText = `
    position:fixed;
    left:50%;
    bottom:18px;
    transform:translateX(-50%);
    z-index:10000;
    padding:10px 14px;
    background:#222;
    border:1px solid #555;
    color:#fff;
    font-size:10px;
  `;

  document.body.appendChild(element);

  setTimeout(
    () => element.remove(),
    2200
  );
}


/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

function showScreen(screen){

  state.screen = screen;

  document
    .querySelectorAll('.app-screen')
    .forEach(element => {

      element.classList.toggle(
        'active',
        element.id === `screen-${screen}`
      );

    });

  save();

  render();

}


function goBack(screen){

  showScreen(screen);

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

  /*
    IMPORTANTE:

    trocar de papel NÃO cria estado novo.

    O mesmo state continua existindo.
  */

  state.role = role;

  save();

  if(role === 'organizer'){

    showScreen('organizer');

  }else{

    showScreen(
      state.match.status === 'live'
        ? 'tactical'
        : 'lobby'
    );

  }

}


function setSimulatedPlayers(count){

  state.dev.simulatedPlayers =
    Number(count);

  save();

  render();

}


/* =========================================================
   PARTIDA
   ========================================================= */

function saveMatch(){

  state.match.name =
    q('orgMatchName')?.value.trim() ||
    state.match.name;

  state.match.map =
    q('orgMap')?.value ||
    state.match.map;

  state.match.mode =
    q('orgMode')?.value ||
    state.match.mode;

  state.organizer.briefingTitle =
    q('orgBriefingTitle')?.value.trim() ||
    state.organizer.briefingTitle;

  state.organizer.briefingText =
    q('orgBriefingText')?.value.trim() ||
    state.organizer.briefingText;


  state.match.created = true;

  if(state.match.status !== 'live'){
    state.match.status = 'scheduled';
  }


  save();

  render();

  openMatchSavedModal();

}


/* =========================================================
   POPUP APÓS SALVAR
   ========================================================= */

function openMatchSavedModal(){

  modal(
    'PARTIDA SALVA',
    `
      <p>
        <strong>${escapeHtml(state.match.name)}</strong>
      </p>

      <p>
        A partida foi criada e agora está disponível
        para entrada dos jogadores.
      </p>

      <p>
        ${state.match.map} ·
        ${state.match.mode}
      </p>

      <div class="modal-actions">

        <button
          class="primary-large"
          onclick="enterSavedMatch()">
          ENTRAR NO JOGO
        </button>

        <button
          class="secondary-large"
          onclick="closeModal()">
          CONTINUAR ORGANIZAÇÃO
        </button>

      </div>
    `
  );

}


function enterSavedMatch(){

  closeModal();

  if(
    state.role === 'organizer' &&
    state.organizer.participates
  ){

    state.player.participation = true;

    state.player.status =
      state.match.status === 'live'
        ? 'ativo'
        : 'aguardando';

    save();

    showScreen(
      state.match.status === 'live'
        ? 'tactical'
        : 'lobby'
    );

    return;
  }

  showScreen('lobby');

}


/* =========================================================
   PARTICIPAÇÃO DO ORGANIZADOR
   ========================================================= */

function toggleOrganizerParticipation(){

  state.organizer.participates =
    !state.organizer.participates;

  if(state.organizer.participates){

    state.player.participation = true;

  }else{

    state.player.participation = false;

  }

  save();

  render();

}


/* =========================================================
   JOGADOR
   ========================================================= */

function openMatchDetails(){

  if(!state.match.created){

    toast(
      'Nenhuma partida está disponível.'
    );

    return;
  }

  showScreen('details');

}


function confirmPresence(){

  if(!state.match.created){

    toast(
      'Nenhuma partida disponível.'
    );

    return;
  }


  if(state.match.status === 'scheduled'){

    state.player.participation = true;

    state.player.request = 'confirmed';

    state.player.status = 'aguardando';

    save();

    toast(
      'Presença confirmada.'
    );

    showScreen('lobby');

    return;
  }


  if(state.match.status === 'live'){

    state.player.request = 'requested';

    save();

    toast(
      'Solicitação de entrada enviada ao organizador.'
    );

    render();

  }

}


/* =========================================================
   INICIAR PARTIDA
   ========================================================= */

function startMatch(){

  /*
    DEV permite iniciar com apenas Daniel.
    Não exigimos número mínimo de jogadores.
  */

  if(!state.match.created){

    saveMatch();

    return;
  }


  state.match.status = 'live';

  state.match.seconds = 0;


  if(state.organizer.participates){

    state.player.participation = true;

    state.player.status = 'ativo';

  }


  save();


  if(
    state.role === 'organizer'
  ){

    state.player.locked = true;

    showScreen('tactical');

    lockPanel();

  }else{

    showScreen('lobby');

  }

  render();

}


/* =========================================================
   DEV — JOGADORES SIMULADOS
   ========================================================= */

function getSimulatedNames(){

  return [
    'FALCON-02',
    'FALCON-03',
    'FALCON-04'
  ];
}


function simulatedPlayerCount(){

  return state.dev.simulatedPlayers;
}


function totalPlayers(){

  const own =
    state.organizer.participates
      ? 1
      : 0;

  return own +
    simulatedPlayerCount();
}


/* =========================================================
   TIMER
   ========================================================= */

function startTimer(){

  clearInterval(timer);

  timer =
    setInterval(
      () => {

        if(
          state.match.status !== 'live'
        ){
          return;
        }

        state.match.seconds++;

        if(q('gameClock')){

          q('gameClock').textContent =
            fmt(state.match.seconds);

        }

        save();

      },
      1000
    );

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

  state.player.channel =
    value;

  save();

  render();

}


function setVolume(value){

  state.player.radioVolume =
    Number(value);

  save();

}


async function startPtt(){

  if(!state.player.radio){

    toast(
      'Rádio desligado.'
    );

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
        new MediaRecorder(
          radioStream
        );

      radioRecorder.ondataavailable =
        e => {

          if(e.data.size){
            radioChunks.push(e.data);
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

  radioStream
    ?.getTracks()
    .forEach(
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
   GPS
   ========================================================= */

function startGps(){

  if(!navigator.geolocation){
    return;
  }

  clearWatch();

  watchId =
    navigator.geolocation.watchPosition(

      position => {

        state.gps = {

          lat:
            position.coords.latitude,

          lng:
            position.coords.longitude,

          accuracy:
            position.coords.accuracy,

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

    navigator.geolocation.clearWatch(
      watchId
    );

    watchId = null;

  }

}


function renderGps(){

  const status =
    q('gpsStatus');

  const coords =
    q('gpsCoords');

  const accuracy =
    q('gpsAccuracy');

  if(!status || !coords || !accuracy){
    return;
  }


  if(state.gps.ready){

    status.textContent =
      '● GPS ATIVO';

    coords.textContent =
      `${state.gps.lat.toFixed(6)}, ${state.gps.lng.toFixed(6)}`;

    accuracy.textContent =
      `PRECISÃO ±${Math.round(state.gps.accuracy)} M`;

  }else{

    status.textContent =
      '● GPS AGUARDANDO';

    coords.textContent =
      'LOCALIZAÇÃO DEMO';

    accuracy.textContent =
      'PRECISÃO —';

  }

}


function positionPlayerOnFictionalMap(){

  const marker =
    q('playerMapMarker');

  if(!marker){
    return;
  }


  const lat =
    state.gps.ready
      ? state.gps.lat
      : DEMO_CENTER.lat;

  const lng =
    state.gps.ready
      ? state.gps.lng
      : DEMO_CENTER.lng;


  const dx =
    Math.max(
      -1,
      Math.min(
        1,
        (lng - DEMO_CENTER.lng) * 700
      )
    );


  const dy =
    Math.max(
      -1,
      Math.min(
        1,
        (lat - DEMO_CENTER.lat) * 700
      )
    );


  marker.style.left =
    `${50 + dx * 24}%`;

  marker.style.top =
    `${52 - dy * 24}%`;

}


function centerMap(){

  positionPlayerOnFictionalMap();

}


/* =========================================================
   BRIEFING
   ========================================================= */

function renderInstructions(){

  const body =
    q('instructionsBody');

  if(!body){
    return;
  }


  body.innerHTML = `
    <p>
      <strong>${escapeHtml(state.match.name)}</strong>
    </p>

    <p>
      ${escapeHtml(state.organizer.briefingText)}
    </p>

    <p>
      <strong>MAPA:</strong>
      ${escapeHtml(state.match.map)}
    </p>

    <p>
      <strong>MODELO:</strong>
      ${escapeHtml(state.match.mode)}
    </p>
  `;

}


/* =========================================================
   TRAVA
   ========================================================= */

function lockPanel(){

  state.player.locked = true;

  q('touchGuard')
    ?.classList.add('visible');

  q('manualLock')
    ?.classList.remove('hidden');

  save();

  resetInactivity();

}


function unlockPanel(){

  state.player.locked = false;

  q('touchGuard')
    ?.classList.remove('visible');

  q('manualLock')
    ?.classList.remove('hidden');

  save();

  resetInactivity();

}


function resetInactivity(){

  clearTimeout(
    inactivityTimer
  );

  if(
    state.match.status !== 'live' ||
    state.player.locked
  ){
    return;
  }


  inactivityTimer =
    setTimeout(
      lockPanel,
      30000
    );

}


function manualLock(){

  if(
    state.match.status === 'live'
  ){

    lockPanel();

  }

}


function initTouchGuard(){

  const guard =
    q('touchGuard');

  if(!guard){
    return;
  }


  const begin = event => {

    if(
      state.match.status !== 'live'
    ){
      return;
    }

    event.preventDefault();

    unlockStart =
      performance.now();


    const bar =
      guard.querySelector(
        '.unlock-track i'
      );


    clearInterval(
      unlockTimer
    );


    unlockTimer =
      setInterval(
        () => {

          const progress =
            Math.min(
              100,
              ((performance.now() - unlockStart) / 1200) * 100
            );


          if(bar){
            bar.style.width =
              `${progress}%`;
          }


          if(progress >= 100){

            clearInterval(
              unlockTimer
            );

            unlockPanel();

            navigator.vibrate?.(25);

          }

        },
        25
      );

  };


  const cancel = () => {

    clearInterval(
      unlockTimer
    );

    const bar =
      guard.querySelector(
        '.unlock-track i'
      );

    if(bar){
      bar.style.width = '0';
    }

  };


  guard.addEventListener(
    'pointerdown',
    begin
  );


  [
    'pointerup',
    'pointercancel',
    'pointerleave'
  ]
  .forEach(
    event =>
      guard.addEventListener(
        event,
        cancel
      )
  );

}


/* =========================================================
   MODAL
   ========================================================= */

function modal(title,body){

  closeModal();

  q('modalRoot').innerHTML = `

    <div class="modal-backdrop"
         onclick="if(event.target===this)closeModal()">

      <div class="modal">

        <div class="modal-head">

          <h2>
            ${title}
          </h2>

          <button
            class="modal-close"
            onclick="closeModal()">
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

  q('modalRoot').innerHTML = '';

}


function escapeHtml(value){

  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");

}


/* =========================================================
   RENDER
   ========================================================= */

function render(){

  /* ---------- HEADER ---------- */

  q('headerRole').textContent =
    state.role === 'organizer'
      ? 'ORGANIZADOR'
      : 'JOGADOR';


  q('headerSubtitle').textContent =
    state.role === 'organizer'
      ? 'COMMAND CENTER'
      : 'PLAYER TERMINAL';


  q('headerMatch').textContent =
    !state.match.created
      ? 'SEM PARTIDA'
      : state.match.status === 'live'
        ? 'EM ANDAMENTO'
        : 'PROGRAMADA';


  q('devOpen').textContent =
    state.dev.enabled
      ? `DEV · ${state.role === 'organizer' ? 'ORG' : 'PLAYER'}`
      : 'DEV · OFF';


  /* ---------- LOBBY ---------- */

  q('lobbyPlayerName').textContent =
    state.player.name;


  q('lobbyPlayerMeta').textContent =
    `${state.player.id} · ${state.player.team.toUpperCase()} · ${state.player.class.toUpperCase()}`;


  if(state.match.created){

    q('lobbyMatchName').textContent =
      state.match.name;

    q('lobbyMatchState').textContent =
      state.match.status === 'live'
        ? 'EM ANDAMENTO'
        : 'PROGRAMADA';

    q('lobbyMap').textContent =
      state.match.map;

    q('lobbyMode').textContent =
      state.match.mode;

    q('lobbyPlayers').textContent =
      totalPlayers();

    q('lobbyOrganizer').textContent =
      'ONLINE';


    if(state.match.status === 'live'){

      q('lobbyPrimary').textContent =
        state.player.request === 'requested'
          ? 'SOLICITAÇÃO ENVIADA'
          : 'SOLICITAR ENTRADA';

    }else{

      q('lobbyPrimary').textContent =
        state.player.participation
          ? 'PRESENÇA CONFIRMADA'
          : 'CONFIRMAR PRESENÇA';

    }

  }else{

    q('lobbyMatchName').textContent =
      'Nenhuma partida criada';

    q('lobbyMatchState').textContent =
      '—';

    q('lobbyMap').textContent =
      '—';

    q('lobbyMode').textContent =
      '—';

    q('lobbyPlayers').textContent =
      '0';

    q('lobbyOrganizer').textContent =
      '—';

    q('lobbyPrimary').textContent =
      'AGUARDANDO PARTIDA';

  }


  /* ---------- DETALHES ---------- */

  q('detailsMatchName').textContent =
    state.match.name;

  q('detailsMap').textContent =
    state.match.map;

  q('detailsMode').textContent =
    state.match.mode;

  q('detailsPlayers').textContent =
    totalPlayers();


  q('detailsStateLabel').textContent =
    state.match.status === 'live'
      ? 'PARTIDA EM ANDAMENTO'
      : 'PARTIDA PROGRAMADA';


  if(state.match.status === 'live'){

    q('presenceTitle').textContent =
      'Entrar na partida';

    q('presenceText').textContent =
      'A partida já começou. Envie uma solicitação de entrada ao organizador.';

    q('confirmPresenceButton').textContent =
      state.player.request === 'requested'
        ? 'SOLICITAÇÃO ENVIADA'
        : 'SOLICITAR ENTRADA';

  }else{

    q('presenceTitle').textContent =
      'Confirmar presença';

    q('presenceText').textContent =
      'Confirme sua presença para entrar na partida.';

    q('confirmPresenceButton').textContent =
      state.player.participation
        ? 'PRESENÇA CONFIRMADA'
        : 'CONFIRMAR PRESENÇA';

  }


  q('presenceStatus').textContent =
    state.player.participation
      ? 'CONFIRMADO'
      : state.player.request === 'requested'
        ? 'SOLICITADO'
        : 'AGUARDANDO';


  /* ---------- TÁTICO ---------- */

  q('tacticalMatch').textContent =
    state.match.name.toUpperCase();

  q('gameClock').textContent =
    fmt(state.match.seconds);

  q('tacticalState').textContent =
    state.player.status === 'ativo'
      ? 'ATIVO'
      : 'AGUARDANDO';

  q('playerStateTitle').textContent =
    state.player.status === 'ativo'
      ? 'ATIVO'
      : 'AGUARDANDO';

  q('playerStateDesc').textContent =
    state.match.status === 'live'
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


  /* ---------- ORGANIZADOR ---------- */

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


  q('organizerParticipateToggle').textContent =
    state.organizer.participates
      ? 'SIM'
      : 'NÃO';


  q('organizerParticipateToggle')
    .classList.toggle(
      'on',
      state.organizer.participates
    );


  q('orgReadyCount').textContent =
    totalPlayers();


  q('orgSimCount').textContent =
    state.dev.simulatedPlayers;


  /* ---------- DEV ---------- */

  q('devStateText').textContent =
    state.dev.enabled
      ? 'HABILITADO'
      : 'DESABILITADO';


  q('devStateDot')
    .classList.toggle(
      'enabled',
      state.dev.enabled
    );


  q('devToggle').textContent =
    state.dev.enabled
      ? 'DESABILITAR DEV'
      : 'HABILITAR DEV';


  document
    .querySelectorAll('.role-option')
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.role === state.role
      );

    });


  document
    .querySelectorAll('[data-sim-count]')
    .forEach(button => {

      button.classList.toggle(
        'active',
        Number(button.dataset.simCount) ===
        state.dev.simulatedPlayers
      );

    });


  q('devSimInfo').textContent =
    state.dev.simulatedPlayers === 0
      ? 'Nenhum jogador simulado.'
      : `${state.dev.simulatedPlayers} jogador(es) simulado(s).`;


  /* ---------- GPS ---------- */

  renderGps();

  positionPlayerOnFictionalMap();

  renderInstructions();


  /* ---------- TELAS ---------- */

  document
    .querySelectorAll('.app-screen')
    .forEach(screen => {

      screen.classList.toggle(
        'active',
        screen.id === `screen-${state.screen}`
      );

    });


  /* ---------- TRAVA ---------- */

  if(
    state.screen === 'tactical' &&
    state.match.status === 'live' &&
    state.player.locked
  ){

    q('touchGuard')
      ?.classList.add('visible');

  }

}


/* =========================================================
   RESET
   ========================================================= */

function resetDemo(){

  clearWatch();

  stopPtt();

  clearInterval(timer);

  closeModal();

  state = initial();

  save();

  startTimer();

  showScreen('lobby');

  toast('Ambiente resetado.');

}


/* =========================================================
   EVENTOS
   ========================================================= */

function bind(){

  /* DEV */

  q('devOpen')
    ?.addEventListener(
      'click',
      openDev
    );


  q('devToggle')
    ?.addEventListener(
      'click',
      toggleDev
    );


  document
    .querySelectorAll('.role-option')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          if(!state.dev.enabled){

            toast(
              'Habilite o modo DEV primeiro.'
            );

            return;
          }

          setDevRole(
            button.dataset.role
          );

        }
      );

    });


  document
    .querySelectorAll('[data-sim-count]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          if(!state.dev.enabled){

            toast(
              'Habilite o modo DEV primeiro.'
            );

            return;
          }

          setSimulatedPlayers(
            button.dataset.simCount
          );

        }
      );

    });


  /* NAVEGAÇÃO */

  document
    .querySelectorAll('[data-back]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          goBack(
            button.dataset.back
          );

        }
      );

    });


  /* LOBBY */

  q('lobbyPrimary')
    ?.addEventListener(
      'click',
      () => {

        if(!state.match.created){

          toast(
            'Nenhuma partida disponível.'
          );

          return;
        }


        if(state.match.status === 'live'){

          confirmPresence();

        }else{

          confirmPresence();

        }

      }
    );


  q('openDetailsButton')
    ?.addEventListener(
      'click',
      openMatchDetails
    );


  q('organizerQuickButton')
    ?.addEventListener(
      'click',
      () => {

        if(
          state.role !== 'organizer' &&
          !state.dev.enabled
        ){

          toast(
            'Ative o DEV e selecione ORGANIZADOR.'
          );

          return;
        }

        state.role = 'organizer';

        save();

        showScreen('organizer');

      }
    );


  /* DETALHES */

  q('confirmPresenceButton')
    ?.addEventListener(
      'click',
      confirmPresence
    );


  /* ORGANIZADOR */

  q('organizerParticipateToggle')
    ?.addEventListener(
      'click',
      toggleOrganizerParticipation
    );


  q('saveMatchButton')
    ?.addEventListener(
      'click',
      saveMatch
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


  /* RÁDIO */

  q('radioPower')
    ?.addEventListener(
      'click',
      toggleRadio
    );


  q('radioChannel')
    ?.addEventListener(
      'change',
      event =>
        setChannel(
          event.target.value
        )
    );


  q('radioVolume')
    ?.addEventListener(
      'input',
      event =>
        setVolume(
          event.target.value
        )
    );


  q('radioPtt')
    ?.addEventListener(
      'pointerdown',
      startPtt
    );


  [
    'pointerup',
    'pointercancel',
    'pointerleave'
  ]
  .forEach(event => {

    q('radioPtt')
      ?.addEventListener(
        event,
        stopPtt
      );

  });


  /* MAPA */

  q('mapCenter')
    ?.addEventListener(
      'click',
      centerMap
    );


  /* INSTRUÇÕES */

  q('instructionsButton')
    ?.addEventListener(
      'click',
      () => {

        showScreen('instructions');

      }
    );


  q('hitButton')
    ?.addEventListener(
      'click',
      () => {

        toast(
          'Evento de demonstração lançado.'
        );

      }
    );


  /* TRAVA */

  q('manualLock')
    ?.addEventListener(
      'click',
      manualLock
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
    {passive:true}
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

    if(
      state.player.participation
    ){

      startGps();

    }

  }
);
