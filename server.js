import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
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
export function createApp({dbPath = process.env.DATABASE_PATH || join(root,'data','airsoft.sqlite'), operatorKey = process.env.OPERATOR_KEY, secureCookies = process.env.SECURE_COOKIES === 'true', phoneHost = false} = {}) {
  if (!operatorKey || operatorKey.length < 12) throw new Error('Configure OPERATOR_KEY com pelo menos 12 caracteres.');
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath),{recursive:true});
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, at INTEGER NOT NULL, type TEXT NOT NULL, actor TEXT NOT NULL, description TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, player_id TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS current_match(singleton INTEGER PRIMARY KEY CHECK(singleton=1), match_id TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES(1,unixepoch()*1000);`);
  const columns=db.prepare('PRAGMA table_info(sessions)').all().map(x=>x.name);
  if(!columns.includes('match_id'))db.exec('ALTER TABLE sessions ADD COLUMN match_id TEXT');
  if(!columns.includes('team'))db.exec("ALTER TABLE sessions ADD COLUMN team TEXT DEFAULT 'A'");
  db.exec('INSERT OR IGNORE INTO schema_migrations VALUES(2,unixepoch()*1000)');
  const clients = new Map();
  const loginAttempts = new Map();
  let current = db.prepare('SELECT match_id FROM current_match WHERE singleton=1').get()?.match_id;
  const defaults=JSON.parse(readFileSync(join(root,'defaults.json'),'utf8')).match;
  function load() { const row=current && db.prepare('SELECT * FROM matches WHERE id=?').get(current); return row ? {...JSON.parse(row.state),id:row.id,revision:row.revision} : {...copy(defaults),id:null,revision:0}; }
  function event(m,type,actor,description) { db.prepare('INSERT INTO events(match_id,at,type,actor,description) VALUES(?,?,?,?,?)').run(m.id,Date.now(),type,actor,description); }
  function persist(m) {
    m.revision++;
    db.prepare('INSERT INTO matches VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,revision=excluded.revision').run(m.id,JSON.stringify(m),m.revision);
    db.prepare('INSERT INTO current_match VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET match_id=excluded.match_id').run(m.id);
    current=m.id;
  }
  function transaction(fn) { const previousCurrent=current;db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK');current=previousCurrent; throw e; } }
  function localOperator(req) {
    const peer=req.socket.remoteAddress;
    const hostname=new URL('http://'+req.headers.host).hostname;
    return phoneHost && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer) && ['localhost','127.0.0.1','[::1]'].includes(hostname);
  }
  function hostContext(req,s) {
    const address=server.address();
    const listeningOnLan=address && typeof address==='object' && ['0.0.0.0','::'].includes(address.address);
    const canShare=phoneHost && (localOperator(req)||s?.role==='organizer');
    const addresses=canShare&&listeningOnLan ? Object.entries(networkInterfaces()).filter(([name])=>!/^rmnet|^ccmni|^pdp_ip|^wwan|^tun|^docker|^veth/.test(name)).sort(([a],[b])=>Number(/wlan|wifi|^ap|bridge/.test(b))-Number(/wlan|wifi|^ap|bridge/.test(a))).flatMap(([,entries])=>entries||[]).filter(x=>x.family==='IPv4'&&!x.internal&&(/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(x.address))).map(x=>`http://${x.address}:${address.port}`) : [];
    return {phoneHost,localOperator:localOperator(req),joinUrls:[...new Set(addresses)]};
  }
  function session(req) {
    const token=req.headers.cookie?.match(/(?:^|;\s*)df_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    return token && db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token,Date.now());
  }
  function publicState(m,s) {
    const out=copy(m);
    out.players.forEach(p=>{p.isMe=p.id===s?.player_id && s?.match_id===m.id; p.mock=false;p.visible=s?.role==='organizer';});
    out.logs = m.id ? db.prepare('SELECT at,description AS text FROM events WHERE match_id=? ORDER BY id DESC LIMIT 100').all(m.id) : [];
    if (s?.role !== 'organizer') {
      const me=out.players.find(p=>p.isMe);
      out.players=out.players.map(p=>{
        const benefit=m.visibilityBenefits?.[me?.team];
        const visible=Boolean(s&&(p.isMe || (p.team===me?.team ? m.teamVisibility==='always'||(m.teamVisibility==='benefit'&&benefit?.teamUntil>Date.now()) : m.enemyVisibility==='always'||(m.enemyVisibility==='benefit'&&benefit?.enemyUntil>Date.now()))));
        p.visible=visible;
        if (!visible) {p.lat=null;p.lng=null;p.x=null;p.y=null;}
        return p;
      });
    }
    return {match:out,identity:s ? {role:s.role,name:s.name,playerId:s.match_id===m.id?s.player_id:null} : null};
  }
  function broadcast() { const m=load(); for(const [res,s] of clients) {const fresh=db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(s.token,Date.now());if(!fresh){res.end();clients.delete(res);continue;}clients.set(res,fresh);res.write(`data: ${JSON.stringify(publicState(m,fresh))}\n\n`);} }
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
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`http${secureCookies?'s':''}://${req.headers.host}`) fail('Origem inválida.',403);
      let body={};
      if(req.method==='POST') { let raw='',bytes=0; for await(const chunk of req){bytes+=chunk.length;if(bytes>12*1024*1024) fail('Mapa muito grande.',413);raw+=chunk;} try{body=JSON.parse(raw||'{}');}catch{fail('JSON inválido.');} }
      let s=session(req);
      if(url.pathname==='/api/state' && req.method==='GET') return send(200,{...publicState(load(),s),host:hostContext(req,s)});
      if(url.pathname==='/api/login' && req.method==='POST') {
        if(!['organizer','player'].includes(body.role)) fail('Perfil inválido.');
        if(typeof body.name!=='string'||!body.name.trim()||body.name.length>80) fail('Informe seu nome (até 80 caracteres).');
        if(body.role==='organizer') {
          const address=req.socket.remoteAddress;const attempt=loginAttempts.get(address)||{count:0,at:Date.now()};
          if(Date.now()-attempt.at>60000){attempt.count=0;attempt.at=Date.now();}
          attempt.count++;loginAttempts.set(address,attempt);if(attempt.count>10)fail('Aguarde um minuto antes de tentar novamente.',429);
          const key=Buffer.from(String(body.key||'')),expected=Buffer.from(operatorKey);
          if(!localOperator(req) && (key.length!==expected.length||!timingSafeEqual(key,expected))) fail('Chave de operador inválida.',403);
        }
        const token=randomBytes(32).toString('hex');
        const previous=s;
        s={token,role:body.role,name:body.name.trim(),player_id:previous?.player_id || null,match_id:previous?.match_id || null,team:body.team==='B'?'B':'A'};
        transaction(()=>{
          let m=load();
          if(body.role==='organizer' && (!m.id||m.status==='ended')) {
            const imported=body.legacy;
            m={...copy(defaults),...(imported ? copy(imported) : {}),bomb:{...copy(defaults.bomb),...(imported ? copy(imported.bomb) : {})},id:randomBytes(12).toString('hex'),revision:0,status:imported?.status==='live'?'live':'open'};
            validate(m);
            if(!Array.isArray(m.players)||!Array.isArray(m.logs))fail('Dados antigos inválidos.');
            if(m.status==='live'&&(!Number.isFinite(m.startAt)||m.startAt<=0))fail('Horário da partida antiga inválido.');
            for(const p of m.players){p.joined=Boolean(p.joined||p.isMe);p.connected=false;p.mock=false;p.isMe=false;if(p.joined){p.name=s.name;s.player_id=p.id;s.match_id=m.id;}}
            roster(m);persist(m);
            event(m,'creation',s.name,'Partida criada. Configuração em andamento.');
            if(imported) event(m,'migration',s.name,'Configurações e mapa importados do navegador.');
            if(imported?.logs) for(const log of imported.logs.slice().reverse()) db.prepare('INSERT INTO events(match_id,at,type,actor,description) VALUES(?,?,?,?,?)').run(m.id,Number(log.at)||Date.now(),'legacy','Registro anterior',String(log.text).slice(0,500));
            if(!imported){s.player_id=null;s.match_id=null;}
          }
          if(m.id) {
            if(body.role==='organizer' && m.status==='open') {
              for(const waiting of db.prepare("SELECT * FROM sessions WHERE (match_id IS NULL OR match_id!=?) AND role='player' AND expires_at>?").all(m.id,Date.now())) {
                const slot=m.players.find(x=>!x.joined&&x.team===waiting.team&&x.id!==`${s.team}-1`);if(!slot)break;slot.joined=true;slot.connected=true;slot.name=waiting.name;
                db.prepare('UPDATE sessions SET player_id=?,match_id=? WHERE token=?').run(slot.id,m.id,waiting.token);
                for(const [res,online] of clients)if(online.token===waiting.token)online.player_id=slot.id;
                event(m,'join',waiting.name,`${waiting.name} entrou na equipe ${slot.team}.`);
              }
            }
            let p=m.players.find(p=>p.id===s.player_id&&p.joined&&p.name===s.name&&s.match_id===m.id);
            if(!p) { const team=body.team==='B'?'B':'A';p=m.players.find(p=>p.team===team&&!p.joined);if(!p) fail('Equipe sem vagas disponíveis.',409);s.player_id=p.id;p.joined=true;p.name=s.name; }
            p.connected=true;p.left=false;s.match_id=m.id;
            persist(m);event(m,'join',s.name,`${s.name} entrou na equipe ${p.team}.`);
          }
          db.prepare('INSERT INTO sessions(token,role,name,player_id,expires_at,match_id,team) VALUES(?,?,?,?,?,?,?)').run(token,s.role,s.name,s.player_id,Date.now()+7*86400000,s.match_id,s.team);
          if(previous) db.prepare('DELETE FROM sessions WHERE token=?').run(previous.token);
        });
        res.setHeader('Set-Cookie',`df_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookies?'; Secure':''}`);
        broadcast();return send(200,{...publicState(load(),s),host:hostContext(req,s)});
      }
      if(url.pathname==='/api/events' && req.method==='GET') {
        if(!s) fail('Identifique-se para consultar o histórico.',401);
        const filter=url.searchParams.get('match');
        const rows=filter ? db.prepare('SELECT * FROM events WHERE match_id=? ORDER BY at ASC,id ASC').all(filter) : db.prepare('SELECT * FROM events ORDER BY at ASC,id ASC').all();
        return send(200,{events:rows,matches:db.prepare('SELECT id,state FROM matches ORDER BY rowid DESC').all().map(r=>({id:r.id,name:JSON.parse(r.state).name||'Configuração'}))});
      }
      if(url.pathname==='/api/stream' && req.method==='GET') {
        if(!s) fail('Sessão necessária.',401);
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
        clients.set(res,s);res.write(`data: ${JSON.stringify(publicState(load(),s))}\n\n`);
        const ping=setInterval(()=>res.write(': ping\n\n'),15000);
        req.on('close',()=>{clearInterval(ping);clients.delete(res);if(![...clients.values()].some(x=>x.token===s.token)){const m=load();const p=s.match_id===m.id&&m.players.find(x=>x.id===s.player_id);if(p?.connected){transaction(()=>{p.connected=false;event(m,'disconnect',s.name,'Conexão interrompida. Registros e participação preservados.');persist(m);});broadcast();}}});
        const m=load();const p=s.match_id===m.id&&m.players.find(x=>x.id===s.player_id);if(p&&!p.connected){transaction(()=>{p.connected=true;event(m,'reconnect',s.name,'Participante reconectado.');persist(m);});broadcast();}return;
      }
      if(url.pathname==='/api/command' && req.method==='POST') {
        if(!s) fail('Identifique-se novamente.',401);
        let m=load(); if(!m.id) fail('Aguarde o operador criar uma partida.',409);
        const action=body.action;
        const p=s.match_id===m.id ? m.players.find(p=>p.id===s.player_id) : null;
        transaction(()=>{
          if(action==='new') {
            operator(s);if(['open','live'].includes(m.status)){m.status='ended';m.endAt=Date.now();m.bomb.planted=false;event(m,'end',s.name,'Partida arquivada antes de iniciar nova configuração.');persist(m);}
            m={...copy(defaults),id:randomBytes(12).toString('hex'),revision:0,status:'open'};roster(m);const owner=m.players.find(x=>x.team===s.team)||m.players[0];Object.assign(owner,{joined:true,connected:true,name:s.name});s.player_id=owner.id;s.match_id=m.id;db.prepare('UPDATE sessions SET player_id=?,match_id=? WHERE token=?').run(owner.id,m.id,s.token);event(m,'creation',s.name,'Nova partida criada. Histórico anterior preservado.');
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
          persist(m);
        });
        broadcast();return send(200,publicState(m,s));
      }
      if(url.pathname.startsWith('/api/')) fail('Rota não encontrada.',404);
      if(req.method!=='GET') fail('Método inválido.',405);
      const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/logo.png':'logo.png'};
      const path=files[url.pathname];if(!path) fail('Arquivo não encontrado.',404);
      let data;try{data=readFileSync(join(root,path));}catch{fail('Arquivo não encontrado.',404);}
      res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':'text/html','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(data);
    } catch(error) { if(!res.headersSent) send(error.status||500,{error:error.status?error.message:'Falha no servidor. Tente novamente.'});else res.end(); }
  });
  const timer=setInterval(()=>{
    let m=load();if(m.status!=='live')return;
    let changed=false;
    transaction(()=>{
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
      if(changed)persist(m);
    });if(changed)broadcast();
  },500);
  return {server,db,close:async()=>{clearInterval(timer);for(const res of clients.keys())res.end();await new Promise(resolve=>server.close(resolve));db.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const phoneHost=process.argv.includes('--phone');
  const dbPath=process.env.DATABASE_PATH || join(root,'data','airsoft.sqlite');
  let operatorKey=process.env.OPERATOR_KEY;
  if(phoneHost&&!operatorKey) {
    const folder=dirname(dbPath);mkdirSync(folder,{recursive:true});const keyPath=join(folder,'operator-key');
    try{operatorKey=readFileSync(keyPath,'utf8').trim();}catch(error){if(error.code!=='ENOENT')throw error;operatorKey=randomBytes(32).toString('hex');writeFileSync(keyPath,operatorKey,{mode:0o600,flag:'wx'});}
  }
  const app=createApp({dbPath,operatorKey,phoneHost});
  app.server.listen(Number(process.env.PORT)||3000,process.env.HOST||'0.0.0.0',()=>{
    console.log('Desert Falcons disponível na porta '+(process.env.PORT||3000));
    if(phoneHost){const url='http://127.0.0.1:'+(process.env.PORT||3000);console.log('Operador: '+url);if(process.env.TERMUX_VERSION){const opener=spawn('termux-open-url',[url],{stdio:'ignore'});opener.on('error',()=>console.log('Abra o endereço do operador no navegador.'));}}
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
