:root {
    /* Identidade Visual - Desert Falcons */
    --bg-base: #060608;
    --bg-surface: #121214;
    --bg-card: #1C1C20;
    --df-bronze: #A67C52;
    --df-bronze-dark: #7a5836;
    --text-main: #EBEBEB;
    --text-muted: #8c8c94;
    --border-color: #2a2a2e;
    
    /* Cores Táticas */
    --tactical-green: #2F4F3A;
    --tactical-green-light: #4A7C59;
    --tactical-red: #7A2020;
    --tactical-red-light: #A32A2A;
    --tactical-blue: #23405E;
    --tactical-blue-light: #35608C;
    --tactical-yellow: #B8860B;
}

* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif; }

body { background-color: var(--bg-base); color: var(--text-main); height: 100vh; display: flex; flex-direction: column; overflow: hidden; -webkit-tap-highlight-color: transparent; }

/* Tipografia e Utilidades */
h1, h2, h3 { text-transform: uppercase; letter-spacing: 1px; }
.bronze-text { color: var(--df-bronze); }
.text-muted { color: var(--text-muted); font-size: 0.9rem; }
.mt-2 { margin-top: 10px; } .mt-3 { margin-top: 15px; } .mt-4 { margin-top: 20px; }
.mb-2 { margin-bottom: 10px; }
.p-0 { padding: 0 !important; } .p-3 { padding: 15px; }
.text-center { text-align: center; }

/* Grid e Layouts */
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.content-area { flex: 1; overflow-y: auto; padding: 15px; padding-bottom: 80px; }

/* View System */
.view-layer { display: none; flex-direction: column; height: 100%; width: 100%; position: absolute; top: 0; left: 0; background-color: var(--bg-base); }
.view-layer.active { display: flex; z-index: 10; animation: fadeIn 0.2s ease-in-out; }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

/* Telas Específicas */
.fullscreen-center { align-items: center; justify-content: center; background-color: var(--bg-base); }
.splash-logo { width: 120px; margin-bottom: 20px; border: 2px solid var(--df-bronze); border-radius: 50%; padding: 5px; }
.loader { color: var(--df-bronze); font-family: monospace; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 2px; }

/* Header Topo */
.top-bar { background-color: var(--bg-surface); border-bottom: 1px solid var(--df-bronze); padding: 15px; display: flex; align-items: center; justify-content: space-between; }
.top-bar.border-red { border-bottom-color: var(--tactical-red-light); }
.top-bar h1 { font-size: 1.1rem; color: var(--text-main); }
.logo-mini { background-color: var(--df-bronze); color: #000; font-weight: 900; padding: 5px 8px; border-radius: 4px; font-size: 1rem; margin-right: 10px; }

/* Cards Genéricos */
.card { background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; }
.card h3 { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; }
.tactical-card { border-left: 4px solid var(--df-bronze); }
.alert-card { border-left: 4px solid var(--tactical-yellow); }

/* Badges e Elementos UI */
.badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-bottom: 8px; }
.badge.warning { background-color: var(--tactical-yellow); color: #000; }
.tactical-select { width: 100%; background-color: var(--bg-surface); color: var(--text-main); border: 1px solid var(--df-bronze); padding: 10px; border-radius: 4px; font-weight: bold; outline: none; }

/* Botões */
button { border: none; border-radius: 6px; font-weight: bold; text-transform: uppercase; cursor: pointer; transition: 0.2s; padding: 14px; width: 100%; }
button:active { filter: brightness(0.8); }
.btn-primary { background-color: var(--df-bronze); color: #000; }
.btn-success { background-color: var(--tactical-green-light); color: #fff; }
.btn-danger { background-color: var(--tactical-red-light); color: #fff; }
.btn-warning { background-color: var(--tactical-yellow); color: #000; }
.btn-large { padding: 18px; font-size: 1.1rem; }
.btn-icon { background: none; color: var(--text-main); width: auto; padding: 5px 10px; font-size: 1.2rem; }

/* Listas */
.mechanics-list { list-style: none; color: var(--text-main); font-size: 0.9rem; }
.mechanics-list li { margin-bottom: 6px; display: flex; align-items: center; }
.mechanics-list li::before { content: "✓"; color: var(--df-bronze); margin-right: 8px; font-weight: bold; }
.mechanics-list li.disabled::before { content: "✗"; color: var(--tactical-red-light); }

/* ---- COMBAT HUD (PAINEL TÁTICO) ---- */
.combat-hud { background-color: #000; padding: 15px; display: flex; flex-direction: column; justify-content: space-between; }
.hud-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--border-color); padding-bottom: 10px; }
.hud-title { display: block; font-size: 1rem; color: var(--df-bronze); font-weight: bold; }
.hud-time { font-family: monospace; font-size: 1.5rem; color: var(--text-main); }
.status-indicator { padding: 5px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; border: 1px solid; }
.status-indicator.active { background-color: rgba(74, 124, 89, 0.2); color: var(--tactical-green-light); border-color: var(--tactical-green-light); }
.status-indicator.hit { background-color: rgba(163, 42, 42, 0.2); color: var(--tactical-red-light); border-color: var(--tactical-red-light); }

.hud-center { flex: 1; display: flex; align-items: center; justify-content: center; }
.state-display { text-align: center; }
.state-display h2 { font-size: 2.2rem; color: var(--tactical-green-light); margin-bottom: 10px; }
.state-display p { font-size: 1.1rem; color: var(--text-muted); }
.state-display.state-hit h2 { color: var(--tactical-red-light); }
.state-display.state-bleedout h2 { color: var(--tactical-yellow); }

.hud-bottom { padding-bottom: 20px; }
.critical-zone button { height: 90px; font-size: 1.8rem; letter-spacing: 2px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); margin-bottom: 15px; }
.modules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.modules-grid button { height: 70px; background-color: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); font-size: 0.95rem; }
.modules-grid button.module-active { border-color: var(--df-bronze); color: var(--df-bronze); }

/* ---- DASHBOARD COMANDO ---- */
.team-stats { display: flex; gap: 10px; }
.team-stats div { flex: 1; padding: 10px; border-radius: 6px; text-align: center; font-weight: bold; }
.team-blue { background-color: rgba(53, 96, 140, 0.2); border: 1px solid var(--tactical-blue-light); color: var(--tactical-blue-light); }
.team-red { background-color: rgba(163, 42, 42, 0.2); border: 1px solid var(--tactical-red-light); color: var(--tactical-red-light); }
.team-stats h2 { font-size: 1.8rem; margin-top: 5px; }

.objectives-grid { display: grid; gap: 10px; }
.obj-item { display: flex; justify-content: space-between; padding: 10px; background-color: var(--bg-surface); border-radius: 4px; font-weight: bold; }
.obj-neutro { border-left: 4px solid var(--text-muted); }
.obj-azul { border-left: 4px solid var(--tactical-blue-light); }
.obj-verm { border-left: 4px solid var(--tactical-red-light); }

.terminal-logs { background-color: #000; height: 180px; overflow-y: auto; padding: 10px; font-family: monospace; font-size: 0.8rem; }
.log-line { margin-bottom: 5px; border-bottom: 1px solid #1a1a1a; padding-bottom: 3px; }
.log-time { color: var(--tactical-yellow); margin-right: 8px; }
.log-actor { color: var(--df-bronze); margin-right: 8px; }

/* Navegação Global */
.bottom-nav { background-color: var(--bg-surface); border-top: 1px solid var(--border-color); display: flex; justify-content: space-around; padding: 10px 5px 25px 5px; position: fixed; bottom: 0; width: 100%; z-index: 100; }
.nav-btn { background: none; border: none; color: var(--text-muted); padding: 10px; width: auto; font-size: 0.8rem; }
.nav-btn.active { color: var(--df-bronze); border-bottom: 2px solid var(--df-bronze); border-radius: 0; }
/**
 * AIRSOFT TACTICAL OS - MOTOR CENTRAL
 * Arquitetura: Estado -> Regras -> UI
 */

// 1. ESTADO GLOBAL DO SISTEMA (A Única Fonte da Verdade)
const state = {
    app: {
        currentView: 'splash' // splash, inicio, prejogo, tatico, comando, perfil
    },
    partida: {
        ativa: false, // Se existe uma partida criada pelo comando
        status: 'aguardando', // aguardando, andamento, pausada, encerrada
        nome: 'Operação Red Sand',
        tempo: 0,
        mecanicas: {
            medico: true,
            bleedoutTime: 60, // Segundos
            granada: true,
            uav: true,
            jammer: false
        }
    },
    objetivos: {
        alfa: { nome: 'Setor Alfa', controle: 'neutro' },
        bravo: { nome: 'Setor Bravo', controle: 'neutro' }
    },
    equipes: {
        azul: { vivos: 12, total: 12 },
        vermelho: { vivos: 12, total: 12 }
    },
    jogador: {
        id: 'DF-001',
        nome: 'Dani',
        equipe: 'azul',
        classe: 'Assalto',
        situacao: 'aguardando', // aguardando, ativo, atingido, bleedout, morto
        timerBleedout: 0,
        recursos: {
            granadas: 2,
            uavAtivo: false
        }
    }
};

// Variáveis de Controle de Tempo
let clockInterval = null;
let bleedoutInterval = null;

// 2. INICIALIZAÇÃO DO SISTEMA
function initApp() {
    setTimeout(() => {
        state.partida.ativa = true; // Simula que o comando abriu uma sala
        switchView('inicio');
        renderUI();
    }, 1500); // Finge um carregamento da Splash Screen
}

// 3. CONTROLE DE NAVEGAÇÃO E VIEWS
function switchView(targetView, navElement = null) {
    state.app.currentView = targetView;
    
    // Esconde todas as telas
    document.querySelectorAll('.view-layer').forEach(el => el.classList.remove('active'));
    
    // Mostra a tela alvo
    const targetElement = document.getElementById(`view-${targetView}`);
    if(targetElement) targetElement.classList.add('active');

    // Atualiza menu inferior (se existir e não for a tela tática que ocupa a tela toda)
    if(navElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        navElement.classList.add('active');
    }

    // Oculta menu global se entrar em combate (Painel Tático) ou Pré-jogo
    const globalNav = document.getElementById('global-nav');
    if(targetView === 'tatico' || targetView === 'prejogo' || targetView === 'splash') {
        if(globalNav) globalNav.style.display = 'none';
    } else {
        if(globalNav) globalNav.style.display = 'flex';
    }

    renderUI();
}

// Ações de Navegação Específicas
function requestEntry() { switchView('prejogo'); }
function confirmReady() { 
    if(state.partida.status === 'andamento') {
        state.jogador.situacao = 'ativo';
    }
    switchView('tatico'); 
}
function logout() { alert('Desconectando dispositivo militar...'); switchView('splash'); setTimeout(initApp, 1000); }

// 4. MOTOR DE EVENTOS (DISPATCHER)
function dispatch(evento, payload = null) {
    const timeLog = new Date().toTimeString().substring(0, 8);
    const origin = payload?.origin || 'SISTEMA';
    logEvent(timeLog, evento, origin);

    switch(evento) {
        // --- EVENTOS DO COMANDO ---
        case 'MATCH_START':
            state.partida.status = 'andamento';
            state.equipes.azul.vivos = state.equipes.azul.total;
            state.equipes.vermelho.vivos = state.equipes.vermelho.total;
            if(state.app.currentView === 'tatico' || state.app.currentView === 'prejogo') {
                state.jogador.situacao = 'ativo';
            }
            startClock();
            break;
            
        case 'MATCH_PAUSE':
            state.partida.status = 'pausada';
            stopClock();
            break;

        case 'MATCH_END':
            state.partida.status = 'encerrada';
            state.jogador.situacao = 'aguardando';
            stopClock();
            clearInterval(bleedoutInterval);
            break;

        // --- EVENTOS DO JOGADOR ---
        case 'CLASS_CHANGE':
            state.jogador.classe = payload.classe;
            // Reseta recursos baseado na classe
            if(payload.classe === 'Assalto') state.jogador.recursos.granadas = 2;
            else if(payload.classe === 'Recon') state.jogador.recursos.granadas = 1;
            else state.jogador.recursos.granadas = 0;
            break;

        case 'PLAYER_HIT':
            if(state.jogador.situacao === 'ativo') {
                state.jogador.situacao = 'atingido';
                state.equipes[state.jogador.equipe].vivos--;
                
                if(state.partida.mecanicas.medico) {
                    startBleedout(state.partida.mecanicas.bleedoutTime);
                } else {
                    state.jogador.situacao = 'morto';
                }
            }
            break;

        case 'MEDIC_HEAL':
            if(state.jogador.situacao === 'atingido' || state.jogador.situacao === 'bleedout') {
                state.jogador.situacao = 'ativo';
                state.equipes[state.jogador.equipe].vivos++;
                clearInterval(bleedoutInterval);
            }
            break;

        case 'BLEEDOUT_END':
            state.jogador.situacao = 'morto';
            break;

        case 'USE_GRENADE':
            if(state.jogador.recursos.granadas > 0 && state.jogador.situacao === 'ativo') {
                state.jogador.recursos.granadas--;
                alert('Granada lançada! Calculando área de impacto via sensores...');
            }
            break;

        case 'USE_UAV':
            if(!state.jogador.recursos.uavAtivo && state.jogador.situacao === 'ativo') {
                state.jogador.recursos.uavAtivo = true;
                setTimeout(() => {
                    state.jogador.recursos.uavAtivo = false;
                    dispatch('UAV_EXPIRED');
                }, 15000); // 15s de simulação
            }
            break;

        case 'CAPTURE_OBJ':
            if(state.jogador.situacao === 'ativo') {
                state.objetivos[payload.target].controle = state.jogador.equipe;
            }
            break;
    }

    renderUI(); // O Estado mudou. A Interface REAGE.
}

// Funções de Tempo e Logs
function logEvent(time, event, actor) {
    const logsContainer = document.getElementById('cmd-live-logs');
    if(!logsContainer) return;
    const logHTML = `<div class="log-line"><span class="log-time">[${time}]</span><span class="log-actor">${actor}:</span> ${event}</div>`;
    logsContainer.innerHTML = logHTML + logsContainer.innerHTML;
}

function startClock() {
    clearInterval(clockInterval);
    clockInterval = setInterval(() => {
        state.partida.tempo++;
        renderClock();
    }, 1000);
}

function stopClock() { clearInterval(clockInterval); }

function startBleedout(seconds) {
    state.jogador.situacao = 'bleedout';
    state.jogador.timerBleedout = seconds;
    
    clearInterval(bleedoutInterval);
    bleedoutInterval = setInterval(() => {
        state.jogador.timerBleedout--;
        if(state.jogador.timerBleedout <= 0) {
            clearInterval(bleedoutInterval);
            dispatch('BLEEDOUT_END', { origin: 'SISTEMA' });
        } else {
            renderUI(); 
        }
    }, 1000);
}

function updatePlayerClass(newClass) {
    dispatch('CLASS_CHANGE', { origin: state.jogador.nome, classe: newClass });
}

// 5. RENDERIZADOR DA INTERFACE (A Reação)
function renderUI() {
    renderClock();

    // -- TELA: INÍCIO --
    if(state.partida.ativa) {
        document.getElementById('no-match-alert').style.display = 'none';
        document.getElementById('available-match-card').style.display = 'block';
        document.getElementById('home-op-status').innerText = state.partida.status.toUpperCase();
    }

    // -- TELA: PRÉ-JOGO (HUB) --
    document.getElementById('pre-player-class').value = state.jogador.classe;
    
    const mechList = document.getElementById('pre-mechanics-list');
    if(mechList) {
        mechList.innerHTML = `
            <li class="${state.partida.mecanicas.medico ? '' : 'disabled'}">Sistema Médico (${state.partida.mecanicas.bleedoutTime}s)</li>
            <li class="${state.partida.mecanicas.granada ? '' : 'disabled'}">Granadas Digitais</li>
            <li class="${state.partida.mecanicas.uav ? '' : 'disabled'}">UAV / Radar</li>
        `;
    }

    const teamList = document.getElementById('pre-team-list');
    if(teamList) {
        teamList.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${state.jogador.nome} (Você)</span><span class="badge warning">${state.jogador.classe}</span></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#555;"><span>Ghost</span><span>Recon</span></div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#555;"><span>Viper</span><span>Médico</span></div>
        `;
    }

    // -- TELA: COMANDO (DASHBOARD) --
    document.getElementById('cmd-motor-status').innerText = state.partida.status.toUpperCase();
    document.getElementById('cmd-btn-start').style.display = state.partida.status === 'aguardando' ? 'block' : 'none';
    document.getElementById('cmd-btn-pause').style.display = state.partida.status === 'andamento' ? 'block' : 'none';
    document.getElementById('cmd-btn-end').style.display = (state.partida.status === 'andamento' || state.partida.status === 'pausada') ? 'block' : 'none';
    
    document.getElementById('cmd-blue-count').innerText = state.equipes.azul.vivos;
    document.getElementById('cmd-red-count').innerText = state.equipes.vermelho.vivos;

    const objGrid = document.getElementById('cmd-objectives-list');
    if(objGrid) {
        objGrid.innerHTML = '';
        Object.keys(state.objetivos).forEach(key => {
            const obj = state.objetivos[key];
            const cssClass = obj.controle === 'azul' ? 'obj-azul' : (obj.controle === 'vermelho' ? 'obj-verm' : 'obj-neutro');
            objGrid.innerHTML += `<div class="obj-item ${cssClass}"><span>${obj.nome}</span><span>${obj.controle.toUpperCase()}</span></div>`;
        });
    }

    // -- TELA: PAINEL TÁTICO (O Coração do Combate) --
    renderTacticalHUD();
}

function renderTacticalHUD() {
    const hudIndicator = document.getElementById('hud-status-indicator');
    const hudTitle = document.getElementById('hud-state-title');
    const hudDesc = document.getElementById('hud-state-desc');
    const criticalAction = document.getElementById('hud-critical-action');
    const modulesGrid = document.getElementById('hud-modules-grid');

    criticalAction.innerHTML = '';
    modulesGrid.innerHTML = '';

    // Se a partida não estiver rodando
    if(state.partida.status !== 'andamento') {
        hudIndicator.className = 'status-indicator';
        hudIndicator.innerText = state.partida.status.toUpperCase();
        hudTitle.innerText = 'FORA DE COMBATE';
        hudTitle.style.color = 'var(--text-muted)';
        hudDesc.innerText = 'Aguarde o comando da operação.';
        return;
    }

    // Comportamento baseado no ESTADO DO JOGADOR
    switch(state.jogador.situacao) {
        
        case 'ativo':
            hudIndicator.className = 'status-indicator active';
            hudIndicator.innerText = 'OPERACIONAL';
            hudTitle.innerText = 'SETOR SEGURO';
            hudTitle.style.color = 'var(--tactical-green-light)';
            hudDesc.innerText = `Pronto para engajamento. | ${state.jogador.classe}`;
            
            criticalAction.innerHTML = `<button class="btn-danger" onclick="dispatch('PLAYER_HIT', {origin: '${state.jogador.nome}'})">DECLARAR HIT</button>`;
            
            // Injeção de Módulos (Somente os permitidos para a classe e partida)
            if(state.partida.mecanicas.granada && state.jogador.recursos.granadas > 0) {
                modulesGrid.innerHTML += `<button onclick="dispatch('USE_GRENADE')">GRANADA (${state.jogador.recursos.granadas})</button>`;
            }
            
            if(state.jogador.classe === 'Médico') {
                modulesGrid.innerHTML += `<button class="module-active" style="color:var(--tactical-green-light); border-color:var(--tactical-green-light);">SCAN NFC MÉDICO</button>`;
            }

            if(state.jogador.classe === 'Recon' && state.partida.mecanicas.uav) {
                if(state.jogador.recursos.uavAtivo) {
                    modulesGrid.innerHTML += `<button class="module-active" style="color:var(--tactical-yellow);">UAV VARRENDO...</button>`;
                } else {
                    modulesGrid.innerHTML += `<button onclick="dispatch('USE_UAV')">SOLICITAR UAV</button>`;
                }
            }

            // Módulo de Objetivo (Geral para quem tá vivo)
            modulesGrid.innerHTML += `<button onclick="dispatch('CAPTURE_OBJ', {target: 'alfa', origin: '${state.jogador.nome}'})">CAPTURAR ALFA</button>`;
            break;

        case 'atingido':
        case 'bleedout':
            hudIndicator.className = 'status-indicator hit';
            hudIndicator.innerText = 'FERIDO';
            hudTitle.innerText = 'VOCÊ FOI ATINGIDO';
            hudTitle.style.color = 'var(--tactical-yellow)';
            hudDesc.innerText = `Aguardando atendimento médico. Tempo restante: ${state.jogador.timerBleedout}s`;
            
            // Botão simula que um médico aliado bateu a tag NFC nele
            criticalAction.innerHTML = `<button class="btn-success" onclick="dispatch('MEDIC_HEAL', {origin: 'SISTEMA/MEDICO'})">SIMULAR CURA ALLIADA</button>`;
            break;

        case 'morto':
            hudIndicator.className = 'status-indicator hit';
            hudIndicator.innerText = 'ELIMINADO';
            hudTitle.innerText = 'BAIXA CONFIRMADA';
            hudTitle.style.color = 'var(--tactical-red-light)';
            hudDesc.innerText = 'Retorne imediatamente para a Safezone. Respawn indisponível.';
            break;
    }
}

function renderClock() {
    const hudClock = document.getElementById('hud-clock');
    if(!hudClock) return;
    const h = Math.floor(state.partida.tempo / 3600).toString().padStart(2, '0');
    const m = Math.floor((state.partida.tempo % 3600) / 60).toString().padStart(2, '0');
    const s = (state.partida.tempo % 60).toString().padStart(2, '0');
    hudClock.innerText = `${h}:${m}:${s}`;
}

// Inicia o app ao carregar o script
window.onload = initApp;

