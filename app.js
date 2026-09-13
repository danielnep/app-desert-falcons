/**
 * AIRSOFT TACTICAL OS - MOTOR CENTRAL (CORRIGIDO)
 * Arquitetura: Estado -> Regras -> UI
 */

const state = {
    app: { currentView: 'splash' },
    partida: {
        ativa: false,
        status: 'aguardando',
        nome: 'Operação Red Sand',
        tempo: 0,
        mecanicas: { medico: true, bleedoutTime: 60, granada: true, uav: true, jammer: false }
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
        situacao: 'aguardando',
        timerBleedout: 0,
        recursos: { granadas: 2, uavAtivo: false }
    }
};

let clockInterval = null;
let bleedoutInterval = null;

function initApp() {
    setTimeout(() => {
        state.partida.ativa = true;
        // Força a remoção da splash e ativa o início sem falha de DOM
        const splash = document.getElementById('view-splash');
        if(splash) splash.classList.remove('active');
        
        switchView('inicio');
        renderUI();
    }, 800);
}

function switchView(targetView, navElement = null) {
    state.app.currentView = targetView;
    
    document.querySelectorAll('.view-layer').forEach(el => el.classList.remove('active'));
    
    const targetElement = document.getElementById(`view-${targetView}`);
    if(targetElement) {
        targetElement.classList.add('active');
    }

    if(navElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        navElement.classList.add('active');
    }

    const globalNav = document.getElementById('global-nav');
    if(globalNav) {
        if(targetView === 'tatico' || targetView === 'prejogo' || targetView === 'splash') {
            globalNav.style.display = 'none';
        } else {
            globalNav.style.display = 'flex';
        }
    }

    renderUI();
}

function requestEntry() { switchView('prejogo'); }
function confirmReady() { 
    if(state.partida.status === 'andamento') {
        state.jogador.situacao = 'ativo';
    }
    switchView('tatico'); 
}
function logout() { switchView('splash'); setTimeout(initApp, 800); }

function dispatch(evento, payload = null) {
    const timeLog = new Date().toTimeString().substring(0, 8);
    const origin = payload?.origin || 'SISTEMA';
    logEvent(timeLog, evento, origin);

    switch(evento) {
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

        case 'CLASS_CHANGE':
            state.jogador.classe = payload.classe;
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
            }
            break;

        case 'USE_UAV':
            if(!state.jogador.recursos.uavAtivo && state.jogador.situacao === 'ativo') {
                state.jogador.recursos.uavAtivo = true;
                setTimeout(() => {
                    state.jogador.recursos.uavAtivo = false;
                    dispatch('UAV_EXPIRED');
                }, 15000);
            }
            break;

        case 'CAPTURE_OBJ':
            if(state.jogador.situacao === 'ativo') {
                state.objetivos[payload.target].controle = state.jogador.equipe;
            }
            break;
    }
    renderUI();
}

function logEvent(time, event, actor) {
    const logsContainer = document.getElementById('cmd-live-logs');
    if(!logsContainer) return;
    logsContainer.innerHTML = `<div class="log-line"><span class="log-time">[${time}]</span><span class="log-actor">${actor}:</span> ${event}</div>` + logsContainer.innerHTML;
}

function startClock() {
    clearInterval(clockInterval);
    clockInterval = setInterval(() => { state.partida.tempo++; renderClock(); }, 1000);
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
        } else { renderUI(); }
    }, 1000);
}

function updatePlayerClass(newClass) {
    dispatch('CLASS_CHANGE', { origin: state.jogador.nome, classe: newClass });
}

function renderUI() {
    renderClock();

    if(state.partida.ativa) {
        const noMatch = document.getElementById('no-match-alert');
        const availMatch = document.getElementById('available-match-card');
        if(noMatch) noMatch.style.display = 'none';
        if(availMatch) availMatch.style.display = 'block';
        const homeStatus = document.getElementById('home-op-status');
        if(homeStatus) homeStatus.innerText = state.partida.status.toUpperCase();
    }

    const selectClass = document.getElementById('pre-player-class');
    if(selectClass) selectClass.value = state.jogador.classe;
    
    const mechList = document.getElementById('pre-mechanics-list');
    if(mechList) {
        mechList.innerHTML = `
            <li class="${state.partida.mecanicas.medico ? '' : 'disabled'}">Sistema Médico (${state.partida.mecanicas.bleedoutTime}s)</li>
            <li class="${state.partida.mecanicas.granada ? '' : 'disabled'}">Granadas Digitais</li>
            <li class="${state.partida.mecanicas.uav ? '' : 'disabled'}">UAV / Radar</li>
        `;
    }

    const cmdStatus = document.getElementById('cmd-motor-status');
    if(cmdStatus) cmdStatus.innerText = state.partida.status.toUpperCase();
    
    const btnStart = document.getElementById('cmd-btn-start');
    const btnPause = document.getElementById('cmd-btn-pause');
    const btnEnd = document.getElementById('cmd-btn-end');
    
    if(btnStart) btnStart.style.display = state.partida.status === 'aguardando' ? 'block' : 'none';
    if(btnPause) btnPause.style.display = state.partida.status === 'andamento' ? 'block' : 'none';
    if(btnEnd) btnEnd.style.display = (state.partida.status === 'andamento' || state.partida.status === 'pausada') ? 'block' : 'none';
    
    const blueCount = document.getElementById('cmd-blue-count');
    const redCount = document.getElementById('cmd-red-count');
    if(blueCount) blueCount.innerText = state.equipes.azul.vivos;
    if(redCount) redCount.innerText = state.equipes.vermelho.vivos;

    const objGrid = document.getElementById('cmd-objectives-list');
    if(objGrid) {
        objGrid.innerHTML = '';
        Object.keys(state.objetivos).forEach(key => {
            const obj = state.objetivos[key];
            const cssClass = obj.controle === 'azul' ? 'obj-azul' : (obj.controle === 'vermelho' ? 'obj-verm' : 'obj-neutro');
            objGrid.innerHTML += `<div class="obj-item ${cssClass}"><span>${obj.nome}</span><span>${obj.controle.toUpperCase()}</span></div>`;
        });
    }

    renderTacticalHUD();
}

function renderTacticalHUD() {
    const hudIndicator = document.getElementById('hud-status-indicator');
    const hudTitle = document.getElementById('hud-state-title');
    const hudDesc = document.getElementById('hud-state-desc');
    const criticalAction = document.getElementById('hud-critical-action');
    const modulesGrid = document.getElementById('hud-modules-grid');

    if(!hudIndicator || !hudTitle) return;

    criticalAction.innerHTML = '';
    modulesGrid.innerHTML = '';

    if(state.partida.status !== 'andamento') {
        hudIndicator.className = 'status-indicator';
        hudIndicator.innerText = state.partida.status.toUpperCase();
        hudTitle.innerText = 'FORA DE COMBATE';
        hudTitle.style.color = 'var(--text-muted)';
        hudDesc.innerText = 'Aguarde o comando da operação.';
        return;
    }

    switch(state.jogador.situacao) {
        case 'ativo':
            hudIndicator.className = 'status-indicator active';
            hudIndicator.innerText = 'OPERACIONAL';
            hudTitle.innerText = 'SETOR SEGURO';
            hudTitle.style.color = 'var(--tactical-green-light)';
            hudDesc.innerText = `Pronto para engajamento. | ${state.jogador.classe}`;
            
            criticalAction.innerHTML = `<button class="btn-danger" onclick="dispatch('PLAYER_HIT', {origin: '${state.jogador.nome}'})">DECLARAR HIT</button>`;
            
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
            modulesGrid.innerHTML += `<button onclick="dispatch('CAPTURE_OBJ', {target: 'alfa', origin: '${state.jogador.nome}'})">CAPTURAR ALFA</button>`;
            break;

        case 'atingido':
        case 'bleedout':
            hudIndicator.className = 'status-indicator hit';
            hudIndicator.innerText = 'FERIDO';
            hudTitle.innerText = 'VOCÊ FOI ATINGIDO';
            hudTitle.style.color = 'var(--tactical-yellow)';
            hudDesc.innerText = `Aguardando atendimento médico. Tempo restante: ${state.jogador.timerBleedout}s`;
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

window.onload = initApp;
