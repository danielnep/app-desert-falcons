const gameState = {
    partida: {
        status: "aguardando",
        tempoDecorrido: 0
    },
    jogador: {
        nome: "Dani (Você)",
        equipe: "Azul",
        situacao: "aguardando",
        bleedoutTimer: 0
    },
    estatisticas: { azul: 12, vermelho: 12 }
};

let engineInterval;
let bleedoutInterval;

function dispararEvento(tipo, origem = "SISTEMA") {
    const hora = new Date().toTimeString().substring(0, 8);
    registrarLog(hora, tipo, origem);

    switch(tipo) {
        case 'MATCH_START':
            gameState.partida.status = "andamento";
            gameState.jogador.situacao = "ativo";
            iniciarRelogioPartida();
            break;
        
        case 'MATCH_END':
            gameState.partida.status = "encerrada";
            gameState.jogador.situacao = "aguardando";
            clearInterval(engineInterval);
            clearInterval(bleedoutInterval);
            break;

        case 'PLAYER_HIT':
            if (gameState.jogador.situacao === 'ativo') {
                gameState.jogador.situacao = 'atingido';
                gameState.estatisticas.azul--;
                iniciarBleedOut(60);
            }
            break;
            
        case 'MEDIC_HEAL':
            if (gameState.jogador.situacao === 'atingido') {
                clearInterval(bleedoutInterval);
                gameState.jogador.situacao = 'ativo';
                gameState.estatisticas.azul++;
            }
            break;
            
        case 'BLEEDOUT_END':
            gameState.jogador.situacao = 'morto';
            break;
    }
    
    atualizarTelas();
}

function registrarLog(hora, tipo, origem) {
    const logEntry = `<div class="log-entry"><span class="log-time">[${hora}]</span> <span style="color:#555;">${origem}:</span> <span class="log-event">${tipo}</span></div>`;
    const logBox = document.getElementById('cmd-logs');
    logBox.innerHTML = logEntry + logBox.innerHTML;
}

function iniciarRelogioPartida() {
    clearInterval(engineInterval);
    engineInterval = setInterval(() => {
        gameState.partida.tempoDecorrido++;
        const horas = Math.floor(gameState.partida.tempoDecorrido / 3600).toString().padStart(2, '0');
        const mins = Math.floor((gameState.partida.tempoDecorrido % 3600) / 60).toString().padStart(2, '0');
        const secs = (gameState.partida.tempoDecorrido % 60).toString().padStart(2, '0');
        document.getElementById('ui-time').innerText = `${horas}:${mins}:${secs}`;
    }, 1000);
}

function iniciarBleedOut(segundos) {
    gameState.jogador.bleedoutTimer = segundos;
    clearInterval(bleedoutInterval);
    bleedoutInterval = setInterval(() => {
        gameState.jogador.bleedoutTimer--;
        if (gameState.jogador.bleedoutTimer <= 0) {
            clearInterval(bleedoutInterval);
            dispararEvento('BLEEDOUT_END', gameState.jogador.nome);
        } else {
            atualizarTelas(); 
        }
    }, 1000);
}

function atualizarTelas() {
    document.getElementById('cmd-status').innerText = gameState.partida.status.toUpperCase();
    document.getElementById('cmd-vivos-azul').innerText = gameState.estatisticas.azul;
    
    if (gameState.partida.status === 'andamento') {
        document.getElementById('btn-iniciar').style.display = 'none';
        document.getElementById('btn-encerrar').style.display = 'block';
    } else {
        document.getElementById('btn-iniciar').style.display = 'block';
        document.getElementById('btn-encerrar').style.display = 'none';
    }

    const statusBox = document.getElementById('ui-status-box');
    const statusTitle = document.getElementById('ui-status-title');
    const statusDesc = document.getElementById('ui-status-desc');
    const criticalAction = document.getElementById('ui-critical-action');

    if (gameState.partida.status === 'aguardando' || gameState.partida.status === 'encerrada') {
        statusBox.className = 'status-display offline';
        statusTitle.innerText = 'FORA DE COMBATE';
        statusDesc.innerText = 'Aguarde o Comando iniciar a operação.';
        criticalAction.innerHTML = '';
        return;
    }

    switch(gameState.jogador.situacao) {
        case 'ativo':
            statusBox.className = 'status-display';
            statusTitle.innerText = 'ATIVO';
            statusDesc.innerText = `Zona Liberada.`;
            criticalAction.innerHTML = `<button class="btn-critical" onclick="dispararEvento('PLAYER_HIT', '${gameState.jogador.nome}')">TOMOU TIRO? DECLARAR HIT</button>`;
            break;
        case 'atingido':
            statusBox.className = 'status-display bleedout';
            statusTitle.innerText = 'ATINGIDO';
            statusDesc.innerText = `Bleed-out: ${gameState.jogador.bleedoutTimer}s restantes`;
            criticalAction.innerHTML = `<button class="btn-critical" style="background-color: var(--success);" onclick="dispararEvento('MEDIC_HEAL', 'MÉDICO_LOCAL')">SIMULAR CURA (MÉDICO)</button>`;
            break;
        case 'morto':
            statusBox.className = 'status-display hit';
            statusTitle.innerText = 'ELIMINADO';
            statusDesc.innerText = 'Vá para a Safezone.';
            criticalAction.innerHTML = ``;
            break;
    }
}

function switchView(target) {
    document.querySelectorAll('.view-layer').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.dev-switcher button').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`view-${target}`).classList.add('active');
    document.getElementById(`btn-view-${target.substring(0,3)}`).classList.add('active');
}

registrarLog("00:00:00", "SISTEMA INICIADO", "SERVER");

