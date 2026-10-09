import {fresh,execute,advance} from './local-engine.js';

const ROOM_KEY='df_local_room_v1', SESSION_KEY='df_local_session_v1';
const uid=sessionStorage.getItem(SESSION_KEY)||crypto.randomUUID();
sessionStorage.setItem(SESSION_KEY,uid);
let receiver=null,status=null;
const empty=()=>({match:null,sessions:{},operatorId:null,operatorSeenAt:0,events:[],archives:{}});
const OPERATOR_LEASE_MS=20000;
function expireOperator(room){
 if(room.operatorId&&(!room.operatorSeenAt||Date.now()-room.operatorSeenAt>OPERATOR_LEASE_MS)){
  const previous=room.sessions[room.operatorId];if(previous)previous.role='player';
  room.operatorId=null;room.operatorSeenAt=0;return true;
 }return false;
}
function read(){const raw=localStorage.getItem(ROOM_KEY);return raw?JSON.parse(raw):empty();}
function save(room){localStorage.setItem(ROOM_KEY,JSON.stringify(room));}
function view(room){
 const session=room.sessions[uid],role=session?.role==='organizer'&&room.operatorId===uid?'organizer':'player',match=room.match?structuredClone(room.match):null;
 if(match){
  const me=match.players.find(p=>p.id===session?.player_id&&session?.match_id===match.id);
  for(const p of match.players){p.isMe=p===me;p.mock=false;const benefit=match.visibilityBenefits?.[me?.team];p.visible=role==='organizer'||p.isMe||(me&&(p.team===me.team?match.teamVisibility==='always'||match.teamVisibility==='benefit'&&benefit?.teamUntil>Date.now():match.enemyVisibility==='always'||match.enemyVisibility==='benefit'&&benefit?.enemyUntil>Date.now()));if(!p.visible){p.x=null;p.y=null;p.lat=null;p.lng=null;}}
  match.logs=room.events.filter(e=>e.match_id===match.id).slice(-100).reverse().map(e=>({at:e.at,text:e.description}));
 }
 return {match,identity:session?{role,name:session.name,playerId:session.match_id===match?.id?session.player_id:null}:null,operatorTaken:!!room.operatorId&&room.operatorId!==uid,host:{joinUrls:[]}};
}
function attach(room,session){
 if(!room.match)return;
 let p=session.match_id===room.match.id&&room.match.players.find(p=>p.id===session.player_id);
 if(!p){p=room.match.players.find(p=>!p.joined&&p.team===session.team)||room.match.players.find(p=>!p.joined);if(!p)throw new Error('Não há vagas disponíveis. O operador pode aumentar as vagas nas regras.');session.player_id=p.id;session.match_id=room.match.id;session.team=p.team;}
 Object.assign(p,{name:session.name,joined:true,connected:true,left:false});
}
async function locked(callback){if(navigator.locks)return navigator.locks.request('df-local-room',callback);return callback();}
function notify(){if(receiver)receiver(view(read()));}
export async function request(path,body={}){
 return locked(()=>{
  const room=read();if(expireOperator(room))save(room);let session=room.sessions[uid];
  if(path==='/api/state')return view(room);
  if(path.startsWith('/api/events'))return {events:room.events.filter(e=>!new URL(path,location.href).searchParams.get('match')||e.match_id===new URL(path,location.href).searchParams.get('match')),matches:Object.values(room.archives).map(m=>({id:m.id,name:m.name})).concat(room.match?[{id:room.match.id,name:room.match.name||'Configuração'}]:[])};
  if(path==='/api/login'){
   if(!['player','organizer'].includes(body.role))throw new Error('Escolha Jogador ou Operador.');
   if(body.role==='organizer'&&room.operatorId&&room.operatorId!==uid)throw new Error('Já existe um operador neste navegador. Entre como jogador.');
   if(body.role==='organizer'){room.operatorId=uid;room.operatorSeenAt=Date.now();room.match||=fresh();}
   session={...session,role:body.role,name:session?.role===body.role?session.name:(body.role==='organizer'?'Operador':`Jogador ${Object.keys(room.sessions).length+1}`),team:body.team==='B'?'B':'A'};
   room.sessions[uid]=session;
   for(const s of Object.values(room.sessions))attach(room,s);
  }else if(path==='/api/logout'){
   if(room.operatorId===uid){room.operatorId=null;room.operatorSeenAt=0;}
   const p=room.match?.players.find(p=>session?.match_id===room.match.id&&p.id===session.player_id);if(p){p.connected=false;p.left=true;p.joined=false;}
   delete room.sessions[uid];
  }else if(path==='/api/command'){
   if(!session)throw new Error('Escolha seu perfil para continuar.');
   if(!room.match)throw new Error('Aguarde o operador configurar a partida.');
   session.role=room.operatorId===uid&&session.role==='organizer'?'organizer':'player';
   const elapsed=advance(room.match);room.match=elapsed.match;room.events.push(...elapsed.records);
   if(body.action!=='tick'){
    const result=execute(room.match,session,body);room.match=result.match;room.sessions[uid]=result.session;room.events.push(...result.records);Object.assign(room.archives,result.archives);
    for(const s of Object.values(room.sessions))if(s.match_id!==room.match.id)attach(room,s);
   }else if(!elapsed.changed)return view(room);
  }else throw new Error('Ação indisponível nesta versão.');
  save(room);return view(room);
 });
}
export function connect(receive,connectionStatus){receiver=receive;status=connectionStatus;status('Modo local · salvo neste navegador');notify();}
addEventListener('storage',event=>{if(event.key===ROOM_KEY)notify();});
setInterval(async()=>{if(document.hidden)return;try{if(read().match?.status==='live'&&read().sessions[uid]){await request('/api/command',{action:'tick'});notify();}}catch(error){status?.('Modo local · '+error.message);}},1000);

// An abandoned tab must not reserve the operator forever. Refreshing the page
// retains the tab UID; closing/navigating away makes the slot available.
addEventListener('pagehide',()=>{try{const room=read();if(room.operatorId===uid){room.operatorId=null;room.operatorSeenAt=0;save(room);}}catch{}});
setInterval(async()=>{try{await locked(()=>{const room=read();if(room.operatorId===uid){room.operatorSeenAt=Date.now();save(room);}else if(expireOperator(room))save(room);});notify();}catch(error){status?.('Não foi possível salvar neste navegador: '+error.message);}},5000);
