/**
 * DESERT FALCONS — MOTOR DA DEMO
 * Foco: gerenciamento de partida, equipe, comunicação e eventos.
 * Fluxo: ESTADO -> EVENTO -> UI
 */

const STORAGE_KEY = 'df_demo_state_v2';

const defaultState = () => ({
    app: { currentView: 'inicio' },
    partida: {
        ativa: true,
        status: 'aguardando',
        nome: 'Operação Red Sand',
        tempo: 0,
        ultimoEvento: null
    },
    equipes: {
        azul: { nome: 'AZUL', total: 12, ativos: 12 },
        vermelho: { nome: 'VERMELHO', total: 12, ativos: 12 }
    },
    objetivos: {
        alfa: { nome: 'Setor Alfa', controle: 'neutro' },
        bravo: { nome: 'Setor Bravo', controle: 'neutro' }
    },
    jogador: {
        id: 'DF-001',
        nome: 'DANI',
        equipe: 'azul',
        classe: 'Assalto',
        situacao: 'aguardando',
        radio: { ligado: true, canal: '01', sinal: 'OK' }
    },
    eventos: []
});

let state = loadState();
let clockInterval = null;

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? { ...defaultState(), ...JSON.parse(saved) } : defaultState();
    } catch (error) {
        return defaultState();
    }
}

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initApp() {
    const splash = document.getElementById('view-splash');
    if (splash) splash.classList.remove('active');
    state.app.currentView = 'inicio';
    renderUI();
    switchClock();
}

function switchView(targetView, navElement = null) {
    state.app.currentView = targetView;

    document.querySelectorAll('.view-layer').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`view-${targetView}`);
    if (target) target.classList.add('active');

    if (navElement) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        navElement.classList.add('active');
    }

    const globalNav = document.getElementById('global-nav');
    if (globalNav) {
        globalNav.style.display = ['tatico', 'prejogo', 'splash'].includes(targetView) ? 'none' : 'flex';
    }

    renderUI();
}

function requestEntry() {
    addEvent('CHECK_IN', state.jogador.nome, 'Entrada solicitada');
    switchView('prejogo');
}

function confirmReady() {
    if (state.partida.status === 'andamento') {
        setPlayerStatus('ativo', 'PLAYER_READY');
    }
    addEvent('DEPLOY', state.jogador.nome, 'Jogador pronto');
    switchView('tatico');
}

function logout() {
    state = defaultState();
    persist();
    switchView('inicio');
    switchClock();
}

function dispatch(evento, payload = {}) {
    const actor = payload.origin || state.jogador.nome;

    switch (evento) {
        case 'MATCH_START':
            if (state.partida.status === 'andamento') return;
            state.partida.status = 'andamento';
            state.partida.ultimoEvento = 'Partida iniciada';
            addEvent('MATCH_START', actor, 'Partida iniciada');
            startClock();
            break;

        case 'MATCH_PAUSE':
            if (state.partida.status !== 'andamento') return;
            state.partida.status = 'pausada';
            state.partida.ultimoEvento = 'Partida pausada';
            addEvent('MATCH_PAUSE', actor, 'Partida pausada');
            stopClock();
            break;

        case 'MATCH_RESUME':
            if (state.partida.status !== 'pausada') return;
            state.partida.status = 'andamento';
            state.partida.ultimoEvento = 'Partida retomada';
            addEvent('MATCH_RESUME', actor, 'Partida retomada');
            startClock();
            break;

        case 'MATCH_END':
            state.partida.status = 'encerrada';
            state.partida.ultimoEvento = 'Partida encerrada';
            addEvent('MATCH_END', actor, 'Partida encerrada');
            stopClock();
            break;

        case 'CLASS_CHANGE':
            state.jogador.classe = payload.classe || state.jogador.classe;
            addEvent('CLASS_CHANGE', actor, `Classe alterada para ${state.jogador.classe}`);
            break;

        case 'PLAYER_ACTIVE':
            if (state.partida.status === 'andamento') setPlayerStatus('ativo', 'PLAYER_ACTIVE');
            break;

        case 'PLAYER_OUT':
            if (state.jogador.situacao === 'ativo') {
                setPlayerStatus('fora', 'PLAYER_OUT');
            }
            break;

        case 'TEAM_RETURN':
            setPlayerStatus('aguardando', 'TEAM_RETURN');
            break;

        case 'CAPTURE_OBJ': {
            const target = payload.target;
            if (!state.objetivos[target] || state.jogador.situacao !== 'ativo') return;
            state.objetivos[target].controle = state.jogador.equipe;
            addEvent('OBJECTIVE_UPDATE', actor, `${state.objetivos[target].nome} controlado por ${state.jogador.equipe.toUpperCase()}`);
            break;
        }

        case 'RADIO_TOGGLE':
            state.jogador.radio.ligado = !state.jogador.radio.ligado;
            state.jogador.radio.sinal = state.jogador.radio.ligado ? 'OK' : 'OFF';
            addEvent('RADIO', actor, state.jogador.radio.ligado ? 'Comunicação online' : 'Comunicação offline');
            break;

        case 'RADIO_CHANNEL':
            state.jogador.radio.canal = payload.canal || state.jogador.radio.canal;
            addEvent('RADIO_CHANNEL', actor, `Canal ${state.jogador.radio.canal}`);
            break;

        case 'RADIO_PING':
            if (!state.jogador.radio.ligado) return;
            addEvent('RADIO_PING', actor, `Ping enviado no canal ${state.jogador.radio.canal}`);
            break;

        case 'TEAM_STATUS':
            if (!state.jogador.radio.ligado) return;
            addEvent('TEAM_STATUS', actor, `Status enviado no canal ${state.jogador.radio.canal}`);
            break;
    }

    persist();
    renderUI();
}

function setPlayerStatus(nextStatus, eventType = 'PLAYER_STATUS') {
    const previous = state.jogador.situacao;
    if (previous === nextStatus) return;

    if (previous === 'ativo') {
        state.equipes[state.jogador.equipe].ativos = Math.max(0, state.equipes[state.jogador.equipe].ativos - 1);
    }

    if (nextStatus === 'ativo') {
        state.equipes[state.jogador.equipe].ativos = Math.min(
            state.equipes[state.jogador.equipe].total,
            state.equipes[state.jogador.equipe].ativos + 1
        );
    }

    state.jogador.situacao = nextStatus;
    addEvent(eventType, state.jogador.nome, `Estado: ${previous.toUpperCase()} → ${nextStatus.toUpperCase()}`);
}

function addEvent(type, actor, message) {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour12: false });
    state.eventos.unshift({ time, type, actor, message });
    state.eventos = state.eventos.slice(0, 40);
    state.partida.ultimoEvento = message;
    renderLogs();
}

function startClock() {
    stopClock();
    clockInterval = setInterval(() => {
        state.partida.tempo += 1;
        persist();
        renderClock();
    }, 1000);
}

function stopClock() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = null;
}

function switchClock() {
    stopClock();
    if (state.partida.status === 'andamento') startClock();
}

function updatePlayerClass(newClass) {
    dispatch('CLASS_CHANGE', { origin: state.jogador.nome, classe: newClass });
}

function renderUI() {
    renderHome();
    renderPreGame();
    renderCommand();
    renderProfile();
    renderTacticalHUD();
    renderLogs();
    renderClock();
    persist();
}

function renderHome() {
    const name = document.getElementById('home-op-name');
    const status = document.getElementById('home-op-status');
    if (name) name.innerText = state.partida.nome;
    if (status) status.innerText = labelStatus(state.partida.status);
}

function renderPreGame() {
    const playerName = document.getElementById('pre-player-name');
    const team = document.getElementById('pre-player-team');
    const select = document.getElementById('pre-player-class');
    const briefing = document.getElementById('pre-briefing-text');
    const mechList = document.getElementById('pre-mechanics-list');

    if (playerName) playerName.innerText = state.jogador.nome;
    if (team) team.innerText = state.equipes[state.jogador.equipe].nome;
    if (select) select.value = state.jogador.classe;
    if (briefing) briefing.innerText = 'Partida configurada. Acompanhe o estado da equipe, objetivos e comunicação pelo painel.';

    if (mechList) {
        mechList.innerHTML = `
            <li>Controle de estado do jogador</li>
            <li>Eventos em tempo real</li>
            <li>Comunicação por canal</li>
            <li>Objetivos com estado persistente</li>
        `;
    }
}

function renderCommand() {
    const status = document.getElementById('cmd-motor-status');
    const start = document.getElementById('cmd-btn-start');
    const pause = document.getElementById('cmd-btn-pause');
    const end = document.getElementById('cmd-btn-end');
    const blue = document.getElementById('cmd-blue-count');
    const red = document.getElementById('cmd-red-count');
    const grid = document.getElementById('cmd-objectives-list');

    if (status) status.innerText = labelStatus(state.partida.status);
    if (start) start.style.display = state.partida.status === 'aguardando' ? 'block' : 'none';
    if (pause) {
        pause.style.display = state.partida.status === 'andamento' ? 'block' : 'none';
        pause.innerText = 'PAUSAR';
    }
    if (end) end.style.display = ['andamento', 'pausada'].includes(state.partida.status) ? 'block' : 'none';

    if (blue) blue.innerText = state.equipes.azul.ativos;
    if (red) red.innerText = state.equipes.vermelho.ativos;

    if (grid) {
        grid.innerHTML = Object.values(state.objetivos).map(obj => {
            const owner = obj.controle === 'neutro' ? 'NEUTRO' : obj.controle.toUpperCase();
            const css = obj.controle === 'azul' ? 'obj-azul' : obj.controle === 'vermelho' ? 'obj-verm' : 'obj-neutro';
            return `<div class="obj-item ${css}"><span>${obj.nome}</span><span>${owner}</span></div>`;
        }).join('');
    }
}

function renderProfile() {
    const profileName = document.getElementById('profile-name');
    const profileId = document.getElementById('profile-id');
    if (profileName) profileName.innerText = state.jogador.nome;
    if (profileId) profileId.innerText = state.jogador.id;
}

function renderTacticalHUD() {
    const indicator = document.getElementById('hud-status-indicator');
    const title = document.getElementById('hud-state-title');
    const desc = document.getElementById('hud-state-desc');
    const critical = document.getElementById('hud-critical-action');
    const modules = document.getElementById('hud-modules-grid');

    if (!indicator || !title || !desc || !critical || !modules) return;

    indicator.className = 'status-indicator';
    critical.innerHTML = '';
    modules.innerHTML = '';

    if (state.partida.status !== 'andamento') {
        indicator.innerText = labelStatus(state.partida.status);
        title.innerText = state.partida.status === 'encerrada' ? 'PARTIDA ENCERRADA' : 'AGUARDANDO COMANDO';
        title.style.color = 'var(--text-muted)';
        desc.innerText = 'O painel acompanha automaticamente o estado global da partida.';
        return;
    }

    if (state.jogador.situacao === 'ativo') {
        indicator.className = 'status-indicator active';
        indicator.innerText = 'ATIVO';
        title.innerText = 'STATUS OPERACIONAL';
        title.style.color = 'var(--tactical-green-light)';
        desc.innerText = `Equipe ${state.equipes[state.jogador.equipe].nome} • Classe ${state.jogador.classe}`;

        critical.innerHTML = `<button class="btn-warning" onclick="dispatch('PLAYER_OUT')">ALTERAR STATUS</button>`;

        modules.innerHTML = `
            <button class="module-active" onclick="dispatch('RADIO_TOGGLE')">RÁDIO ${state.jogador.radio.ligado ? 'ONLINE' : 'OFFLINE'}</button>
            <button onclick="dispatch('RADIO_PING')">PING EQUIPE</button>
            <button onclick="dispatch('TEAM_STATUS')">STATUS EQUIPE</button>
            <button onclick="dispatch('CAPTURE_OBJ', {target:'alfa'})">ATUALIZAR ALFA</button>
            <button onclick="dispatch('CAPTURE_OBJ', {target:'bravo'})">ATUALIZAR BRAVO</button>
            <button onclick="cycleRadioChannel()">CANAL ${state.jogador.radio.canal}</button>
        `;
        return;
    }

    indicator.className = 'status-indicator hit';
    indicator.innerText = state.jogador.situacao.toUpperCase();
    title.innerText = state.jogador.situacao === 'fora' ? 'FORA DA PARTIDA' : 'AGUARDANDO';
    title.style.color = 'var(--tactical-yellow)';
    desc.innerText = 'O estado pode ser alterado pelo controle da partida.';
    critical.innerHTML = `<button class="btn-success" onclick="dispatch('PLAYER_ACTIVE')">VOLTAR PARA ATIVO</button>`;
    modules.innerHTML = `<button onclick="dispatch('RADIO_TOGGLE')">RÁDIO ${state.jogador.radio.ligado ? 'ONLINE' : 'OFFLINE'}</button>`;
}

function cycleRadioChannel() {
    const channels = ['01', '02', '03', '04', '05', '06'];
    const index = channels.indexOf(state.jogador.radio.canal);
    const next = channels[(index + 1) % channels.length];
    dispatch('RADIO_CHANNEL', { canal: next });
}

function renderLogs() {
    const container = document.getElementById('cmd-live-logs');
    if (!container) return;

    container.innerHTML = state.eventos.map(event => `
        <div class="log-line">
            <span class="log-time">[${event.time}]</span>
            <span class="log-actor">${escapeHtml(event.actor)}:</span>
            ${escapeHtml(event.message)}
        </div>
    `).join('');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderClock() {
    const hudClock = document.getElementById('hud-clock');
    if (!hudClock) return;
    const h = Math.floor(state.partida.tempo / 3600).toString().padStart(2, '0');
    const m = Math.floor((state.partida.tempo % 3600) / 60).toString().padStart(2, '0');
    const s = (state.partida.tempo % 60).toString().padStart(2, '0');
    hudClock.innerText = `${h}:${m}:${s}`;
}

function labelStatus(status) {
    return ({
        aguardando: 'AGUARDANDO',
        briefing: 'BRIEFING',
        andamento: 'EM ANDAMENTO',
        pausada: 'PAUSADA',
        encerrada: 'ENCERRADA'
    })[status] || String(status).toUpperCase();
}

window.onload = initApp;
