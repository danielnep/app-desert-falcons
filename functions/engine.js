import {randomBytes} from 'node:crypto';
const CONFIG_KEYS = ['name','location','durationMin','playerCount','modes','mergeModes','livesPerPlayer','respawnDelay','respawnPolicy','teamVisibility','enemyVisibility','enemyVisibilitySeconds','zoneCaptureSeconds','zonePoints','map'];
const BOMB_KEYS = ['bombsPerPlayer','durationMin','disarmSeconds','blastRadius','armPolicy','timingPolicy','carrierId'];
const copy = value => structuredClone(value);
function fail(message, status = 400) { throw Object.assign(new Error(message), {status}); }
function number(value, min, max, label) { if (!Number.isFinite(value) || value < min || value > max) fail(`${label}: informe entre ${min} e ${max}.`); }
function configuration(match) {
  const c = Object.fromEntries(CONFIG_KEYS.map(k => [k,copy(match[k])]));
  c.bomb = Object.fromEntries(BOMB_KEYS.map(k => [k,copy(match.bomb[k])]));
  return c;
}
function validate(m, start = false) {
  if (typeof m.name !== 'string' || m.name.length > 120 || typeof m.location !== 'string' || m.location.length > 200) fail('Nome ou local inválido.');
  for (const [k,min,max] of [['durationMin',10,480],['playerCount',1,20],['livesPerPlayer',1,20],['respawnDelay',0,900],['enemyVisibilitySeconds',5,900],['zoneCaptureSeconds',1,1800],['zonePoints',0,10000]]) number(m[k],min,max,k);
  if (!Number.isInteger(m.playerCount)) fail('Número de jogadores inválido.');
  if (!Array.isArray(m.modes) || !m.modes.length || m.modes.some(x => !['flag','bomb','zone','respawn'].includes(x)) || (!m.mergeModes && m.modes.length > 1)) fail('Selecione modos compatíveis.');
  for (const [k,values] of Object.entries({respawnPolicy:['nearest','choice','operator'],teamVisibility:['always','benefit','off'],enemyVisibility:['off','always','benefit']})) if (!values.includes(m[k])) fail(`Regra inválida: ${k}.`);
  for (const [k,min,max] of [['bombsPerPlayer',0,20],['durationMin',1,120],['disarmSeconds',1,600],['blastRadius',1,500]]) number(m.bomb[k],min,max,k);
  if (!['areas','anywhere'].includes(m.bomb.armPolicy) || !['predefined','arming'].includes(m.bomb.timingPolicy)) fail('Regra de bomba inválida.');
  if (!m.map || typeof m.map.dataUrl !== 'string' || (m.map.dataUrl && !/^data:image\/(png|jpeg|webp);base64,/.test(m.map.dataUrl)) || !Array.isArray(m.map.marks)) fail('Mapa inválido.');
  if (m.map.marks.length > 300) fail('Excesso de elementos no mapa.');
  for (const mark of m.map.marks) {
    if (!['zone','base','flag','bomb'].includes(mark.type) || typeof mark.id !== 'string' || typeof mark.label !== 'string') fail('Elemento inválido.');
    number(mark.x,0,1,'Posição X'); number(mark.y,0,1,'Posição Y'); number(mark.size,0.001,2,'Tamanho');
  }
  if (start) {
    if (!m.name.trim() || !m.location.trim()) fail('Preencha nome e local da partida.');
    if (!m.map.dataUrl) fail('Configure o mapa antes de iniciar.');
    const required = new Set();
    if (m.modes.includes('flag')) { required.add('base'); required.add('flag'); }
    if (m.modes.includes('respawn')) required.add('base');
    if (m.modes.includes('zone')) required.add('zone');
    if (m.modes.includes('bomb') && m.bomb.armPolicy === 'areas') required.add('bomb');
    for (const type of required) if (!m.map.marks.some(x => x.type === type)) fail(`Adicione ao mapa: ${type}.`);
    if (m.modes.includes('bomb') && !m.players.some(p => p.id === m.bomb.carrierId)) fail('Selecione um portador válido.');
  }
}
function distance(a,b) {
  if ([a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) {
    const rad = n=>n*Math.PI/180;
    const q=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
  }
  // An uploaded image has no calibrated metric scale. Never invent meters.
  return Infinity;
}

const defaults={"name": "", "location": "", "durationMin": 60, "playerCount": 5, "status": "none", "startAt": null, "endAt": null, "modes": ["flag"], "mergeModes": false, "livesPerPlayer": 3, "respawnDelay": 60, "respawnPolicy": "nearest", "teamVisibility": "always", "enemyVisibility": "off", "enemyVisibilitySeconds": 60, "zoneCaptureSeconds": 30, "zonePoints": 100, "bomb": {"bombsPerPlayer": 3, "durationMin": 10, "disarmSeconds": 20, "blastRadius": 20, "armPolicy": "areas", "timingPolicy": "predefined", "carrierId": "A-3", "planted": false, "armedAt": null, "expiresAt": null, "armedByTeam": "A", "x": 0.62, "y": 0.48, "lat": null, "lng": null}, "map": {"dataUrl": "", "naturalWidth": 0, "naturalHeight": 0, "marks": []}, "scores": {"A": 0, "B": 0}, "hits": {"A": 0, "B": 0}, "zones": {}, "players": [], "logs": []};
  function roster(m) {
    const old=m.players || []; const players=[];
    for(const team of ['A','B']) for(let i=1;i<=m.playerCount;i++) {
      const id=`${team}-${i}`,p=old.find(p=>p.id===id);
      players.push(p || {id,team,name:`Vaga ${i}`,joined:false,connected:false,lives:m.livesPerPlayer,hits:0,status:'ATIVO',x:.5,y:.5,lat:null,lng:null,confirmed:false,carryingBomb:false,bombsRemaining:m.bomb.bombsPerPlayer,respawnPendingUntil:null,respawnTargetId:null});
    }
    if(old.some(p=>p.joined&&!players.some(x=>x.id===p.id))) fail('Não reduza vagas ocupadas.');
    m.players=players;
  }
  function operator(s) { if(s?.role!=='organizer') fail('Acesso exclusivo do operador.',403); }
  function hit(m,p) {
    p.hits++;p.lives=Math.max(0,p.lives-1);m.hits[p.team]++;
    p.status=p.lives ? 'HIT' : 'FORA DA OPERAÇÃO';
    p.respawnPendingUntil=p.lives ? Date.now()+m.respawnDelay*1000 : null;
  }
  function respawn(m,p,baseId) {
    const bases=m.map.marks.filter(x=>x.type==='base');
    let base=bases.find(x=>x.id===baseId);
    if (!base && m.respawnPolicy==='nearest') base=bases.sort((a,b)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(p.x-b.x,p.y-b.y))[0];
    if (!base) fail('Selecione uma base válida.');
    p.x=base.x;p.y=base.y;p.status='ATIVO';p.respawnPendingUntil=null;p.respawnTargetId=null;
  }

export function fresh(){const m={...copy(defaults),id:randomBytes(12).toString('hex'),revision:0,status:'open'};roster(m);return m;}
export function execute(current,s,body,records=[],archives={}) {
 let m=normalize(current); const action=body.action; const p=s.match_id===m.id?m.players.find(p=>p.id===s.player_id):null;
 const event=(m,type,actor,description)=>records.push({id:randomBytes(12).toString('hex'),match_id:m.id,at:Date.now(),type,actor,description});
 const archive=m=>{archives[m.id]={id:m.id,name:m.name,state:copy(m)};};
          if(action==='new') {
            operator(s);if(['open','live'].includes(m.status)){m.status='ended';m.endAt=Date.now();m.bomb.planted=false;event(m,'end',s.name,'Partida arquivada antes de iniciar nova configuração.');archive(m);}
            m={...copy(defaults),id:randomBytes(12).toString('hex'),revision:0,status:'open'};roster(m);const owner=m.players.find(x=>x.team===s.team)||m.players[0];Object.assign(owner,{joined:true,connected:true,name:s.name});s.player_id=owner.id;s.match_id=m.id;event(m,'creation',s.name,'Nova partida criada. Histórico anterior preservado.');
          } else if(action==='configure') {
            operator(s);if(body.revision!==m.revision) fail('A partida foi atualizada. Recarregue as definições e tente novamente.',409);
            const beforeConfig=configuration(m);
            const c=body.config;if(c?.bomb && Object.keys(c.bomb).some(k=>!BOMB_KEYS.includes(k)))fail('Definições de bomba inválidas.');if(!c||Object.keys(c).some(k=>![...CONFIG_KEYS,'bomb'].includes(k))) fail('Definições inválidas.');
            if(m.status==='live' && (JSON.stringify(c.modes)!==JSON.stringify(m.modes)||c.playerCount!==m.playerCount||c.livesPerPlayer!==m.livesPerPlayer||JSON.stringify(c.map)!==JSON.stringify(m.map))) fail('Durante o jogo, modos, vagas, vidas iniciais e mapa ficam bloqueados.');
            if(m.status==='live'&&m.bomb.planted&&c.bomb?.carrierId!==m.bomb.carrierId)fail('Não altere o portador enquanto a bomba estiver armada.');
            for(const k of CONFIG_KEYS) if(k in c) m[k]=copy(c[k]);
            for(const k of BOMB_KEYS) if(k in (c.bomb||{})) m.bomb[k]=copy(c.bomb[k]);
            validate(m);roster(m);if(m.modes.includes('bomb')&&!m.players.some(p=>p.id===m.bomb.carrierId))fail('Portador inválido.');m.players.forEach(p=>p.carryingBomb=p.id===m.bomb.carrierId);if(!m.bomb.planted){const carrier=m.players.find(p=>p.id===m.bomb.carrierId);if(carrier)m.bomb.armedByTeam=carrier.team;}const afterConfig=configuration(m);const changedKeys=Object.keys(afterConfig).filter(k=>JSON.stringify(beforeConfig[k])!==JSON.stringify(afterConfig[k]));if(changedKeys.length)event(m,'configuration',s.name,'Definições atualizadas: '+changedKeys.join(', ')+'.');
          } else if(action==='start') {
            operator(s);if(m.status!=='open') fail('A partida já começou ou foi encerrada.',409);
            if(body.confirmed!==true) fail('Confirme a revisão do briefing.');validate(m,true);
            m.status='live';m.startAt=Date.now();m.endAt=null;m.scores={A:0,B:0};m.hits={A:0,B:0};m.zones={};
            m.players.forEach(p=>{p.lives=m.livesPerPlayer;p.hits=0;p.status='ATIVO';p.bombsRemaining=m.bomb.bombsPerPlayer;p.carryingBomb=p.id===m.bomb.carrierId;p.respawnPendingUntil=null;});
            event(m,'start',s.name,'Partida iniciada após confirmação do operador.');
          } else if(action==='end') {
            operator(s);if(!['open','live'].includes(m.status)) fail('Partida já encerrada.',409);
            m.status='ended';m.endAt=Date.now();m.bomb.planted=false;event(m,'end',s.name,'Partida encerrada pelo operador.');
          } else if(action==='leave') {
            if(p) {p.connected=false;p.left=true;event(m,'leave',s.name,'Participante saiu da partida.');}
          } else if(action==='confirm') {
            if(!p) fail('Entre na equipe primeiro.');p.confirmed=true;event(m,'presence',s.name,'Presença confirmada.');
          } else if(action==='position') {
            if(!p) fail('Entre na equipe primeiro.');
            if(body.lat!=null) {number(body.lat,-90,90,'Latitude');number(body.lng,-180,180,'Longitude');p.lat=body.lat;p.lng=body.lng;}
            if(body.x!=null) {number(body.x,0,1,'Posição X');number(body.y,0,1,'Posição Y');p.x=body.x;p.y=body.y;}
            p.updatedAt=Date.now();
          } else {
            if(m.status!=='live') fail('Aguarde o início da partida.');
            if(!p||p.left) fail('Entre na equipe primeiro.');
            if(action==='hit') {
              if(p.status!=='ATIVO') fail('HIT já registrado. Aguarde o respawn.');hit(m,p);event(m,'hit',s.name,'HIT registrado: uma vida removida.');
            } else if(action==='respawn') {
              const target=body.playerId ? m.players.find(x=>x.id===body.playerId) : p;
              if(!target || target.lives<=0 || !['HIT','AGUARDANDO BASE'].includes(target.status)) fail('Respawn indisponível.');
              if(target.id!==p.id||m.respawnPolicy==='operator') operator(s);
              if(target.respawnPendingUntil>Date.now()) fail('Aguarde o tempo de respawn.');
              respawn(m,target,body.baseId);event(m,'respawn',s.name,`${target.name} voltou ao jogo.`);
            } else if(action==='arm') {
              if(!m.modes.includes('bomb')||p.status!=='ATIVO'||m.bomb.planted||m.bomb.carrierId!==p.id||p.bombsRemaining<=0) fail('Bomba indisponível.');
              if(m.bomb.armPolicy==='areas'&&!m.map.marks.some(mark=>mark.type==='bomb'&&Math.hypot(p.x-mark.x,p.y-mark.y)<=mark.size/2)) fail('Entre em uma área de bomba.');
              if(m.bomb.timingPolicy==='arming') {number(body.minutes,1,120,'Tempo da bomba');m.bomb.durationMin=body.minutes;}
              Object.assign(m.bomb,{planted:true,armedAt:Date.now(),expiresAt:Date.now()+m.bomb.durationMin*60000,armedByTeam:p.team,x:p.x,y:p.y,lat:p.lat,lng:p.lng});p.bombsRemaining--;
              event(m,'bomb_arm',s.name,'Bomba armada.');
            } else if(action==='disarm_begin') {
              if(p.status!=='ATIVO'||!m.bomb.planted||m.bomb.armedByTeam===p.team||distance(p,m.bomb)>25) fail('Aproxime-se da bomba inimiga.');
              p.disarmStartedAt=Date.now();event(m,'bomb_disarm_begin',s.name,'Desarme iniciado.');
            } else if(action==='disarm') {
              if(p.status!=='ATIVO'||!m.bomb.planted||m.bomb.armedByTeam===p.team||distance(p,m.bomb)>25||!p.disarmStartedAt||Date.now()-p.disarmStartedAt<m.bomb.disarmSeconds*1000) fail('Desarme ainda não concluído.');
              m.scores[m.bomb.armedByTeam]=Math.max(0,m.scores[m.bomb.armedByTeam]-25);m.bomb.planted=false;m.bomb.expiresAt=null;m.players.forEach(x=>x.disarmStartedAt=null);event(m,'bomb_disarm',s.name,'Bomba desarmada.');
            } else if(action==='transfer') {
              operator(s);const target=m.players.find(x=>x.id===body.playerId&&x.joined&&x.team===m.bomb.armedByTeam&&x.status==='ATIVO');
              if(!target||m.bomb.planted) fail('Portador indisponível.');m.bomb.carrierId=target.id;m.players.forEach(x=>x.carryingBomb=x.id===target.id);event(m,'administration',s.name,`Bomba transferida para ${target.name}.`);
            } else if(action==='bomb_time') {
              operator(s);number(body.minutes,1,120,'Tempo da bomba');m.bomb.durationMin=body.minutes;if(m.bomb.planted)m.bomb.expiresAt=Date.now()+body.minutes*60000;event(m,'administration',s.name,'Tempo da bomba atualizado.');
            } else if(action==='benefit') {
              operator(s);if(!['A','B'].includes(body.team)||!['team','enemy'].includes(body.kind))fail('Benefício inválido.');
              if((body.kind==='team'?m.teamVisibility:m.enemyVisibility)!=='benefit')fail('Ative a regra de benefício temporário nas definições.');
              m.visibilityBenefits||={};m.visibilityBenefits[body.team]||={};m.visibilityBenefits[body.team][body.kind+'Until']=Date.now()+m.enemyVisibilitySeconds*1000;
              event(m,'administration',s.name,`Visibilidade temporária ${body.kind==='team'?'da equipe':'adversária'} concedida à equipe ${body.team} por ${m.enemyVisibilitySeconds}s.`);
            } else if(action==='flag') {
              if(!m.modes.includes('flag')||p.status!=='ATIVO') fail('Captura indisponível.');
              const flag=m.map.marks.find(x=>x.id===body.flagId&&x.type==='flag');
              if(!flag||flag.team===p.team||Math.hypot(p.x-flag.x,p.y-flag.y)>flag.size/2) fail('Aproxime-se da bandeira adversária.');
              if(m.flagCarriers?.[flag.id]) fail('Bandeira já capturada.');m.flagCarriers||={};m.flagCarriers[flag.id]=p.id;event(m,'flag',s.name,`${flag.label} capturada pela equipe ${p.team}.`);
            } else fail('Ação desconhecida.');
          }

 m.revision++; return {match:m,session:s,records,archives};}
export function advance(current,records=[]) {let m=normalize(current);let changed=false;if(m.status!=='live')return {match:m,records,changed};const event=(m,type,actor,description)=>records.push({id:randomBytes(12).toString('hex'),match_id:m.id,at:Date.now(),type,actor,description});
      if(Date.now()>=m.startAt+m.durationMin*60000) {m.status='ended';m.endAt=Date.now();m.bomb.planted=false;event(m,'end','Sistema','Tempo da partida encerrado.');changed=true;}
      if(m.status==='live') {
        for(const benefit of Object.values(m.visibilityBenefits||{}))for(const k of ['teamUntil','enemyUntil'])if(benefit[k]&&benefit[k]<=Date.now()){benefit[k]=null;changed=true;}
        for(const p of m.players.filter(x=>x.joined)) {
          if(p.disarmStartedAt && (p.status!=='ATIVO'||!m.bomb.planted||distance(p,m.bomb)>25)) {p.disarmStartedAt=null;changed=true;}
          if(p.status==='HIT'&&p.lives>0&&p.respawnPendingUntil<=Date.now()) {
            if(m.respawnPolicy==='nearest') {try{respawn(m,p);event(m,'respawn','Sistema',`${p.name} voltou ao jogo.`);}catch{p.status='AGUARDANDO BASE';}}
            else p.status='AGUARDANDO BASE';changed=true;
          }
        }
        if(m.bomb.planted&&m.bomb.expiresAt<=Date.now()) {
          const victims=m.players.filter(p=>p.joined&&p.team!==m.bomb.armedByTeam&&p.status==='ATIVO'&&distance(p,m.bomb)<=m.bomb.blastRadius);
          victims.forEach(p=>hit(m,p));m.scores[m.bomb.armedByTeam]+=victims.length*50;m.bomb.planted=false;m.bomb.expiresAt=null;event(m,'bomb_explosion','Sistema',`Bomba detonou: ${victims.length} atingido(s).`);changed=true;
        }
        if(m.modes.includes('zone')) for(const zone of m.map.marks.filter(x=>x.type==='zone')) {
          const inside=m.players.filter(p=>p.joined&&p.connected&&p.status==='ATIVO'&&Math.hypot(p.x-zone.x,p.y-zone.y)<=zone.size/2);
          const teams=new Set(inside.map(p=>p.team));let progress=m.zones[zone.id];
          if(progress?.captured)continue;
          if(teams.size!==1) {if(progress){delete m.zones[zone.id];changed=true;}continue;}
          const team=inside[0].team;
          if(!progress||progress.team!==team){progress=m.zones[zone.id]={team,startedAt:Date.now(),captured:false};changed=true;}
          if(Date.now()-progress.startedAt>=m.zoneCaptureSeconds*1000){progress.captured=true;m.scores[team]+=m.zonePoints;event(m,'zone','Sistema',`${zone.label} capturada pela equipe ${team}.`);changed=true;}
        }
      }

if(changed)m.revision++;return {match:m,records,changed};}
export {validate,roster};

export function normalize(m){return {...copy(defaults),...m,players:m.players||[],logs:m.logs||[],zones:m.zones||{},scores:m.scores||{A:0,B:0},hits:m.hits||{A:0,B:0},bomb:{...copy(defaults.bomb),...m.bomb},map:{...copy(defaults.map),...m.map,marks:m.map?.marks||[]}};}
