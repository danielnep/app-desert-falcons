import {initializeApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onValueWritten} from 'firebase-functions/v2/database';
import {fresh,execute,advance,validate,roster,normalize} from './engine.js';
initializeApp({databaseURL:'https://deseart-falcons-githib-default-rtdb.firebaseio.com'});
const db=getDatabase(), root=db.ref('airsoftV2');
function publish(room) {
  const m=normalize(room.match); room.match=m; room.views={};
  for(const [uid,s] of Object.entries(room.sessions||{})) {
    const out=structuredClone(m);const me=out.players.find(p=>s.match_id===m.id&&p.id===s.player_id);
    for(const p of out.players){p.isMe=p===me;p.mock=false;const benefit=m.visibilityBenefits?.[me?.team];p.visible=s.role==='organizer'||p.isMe||(me&& (p.team===me.team ? m.teamVisibility==='always'||m.teamVisibility==='benefit'&&benefit?.teamUntil>Date.now():m.enemyVisibility==='always'||m.enemyVisibility==='benefit'&&benefit?.enemyUntil>Date.now()));if(!p.visible){p.lat=null;p.lng=null;p.x=null;p.y=null;}}
    out.logs=Object.values(room.events||{}).filter(e=>e.match_id===m.id).sort((a,b)=>b.at-a.at).slice(0,100).map(e=>({at:e.at,text:e.description}));
    room.views[uid]={match:out,identity:{role:s.role,name:s.name,playerId:s.match_id===m.id?s.player_id:null}};
  }
  room.matches||={};room.matches[m.id]={id:m.id,name:m.name||'Configuração'};
  return JSON.parse(JSON.stringify(room));
}
function add(room,records){room.events||={};for(const e of records)room.events[e.id]=e;}
export const airsoft=onCall({region:'us-central1',maxInstances:10},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Identifique-se novamente.');
  const uid=request.auth.uid,data=request.data||{};
  // Custom claim is assigned by the project administrator, never by the UI.
  const authorized=request.auth.token.operator===true;
  if(data.action==='register'){
    if(request.auth.token.firebase?.sign_in_provider!=='password')throw new HttpsError('failed-precondition','Cadastre sua conta com e-mail e senha.');
    if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw new HttpsError('invalid-argument','Informe seu nome (até 80 caracteres).');
    const profile=db.ref('users/'+uid);const existing=(await profile.get()).val();
    await profile.update({displayName:data.name.trim(),email:request.auth.token.email,createdAt:existing?.createdAt||Date.now(),preferredTeam:existing?.preferredTeam||'A'});
    return {registered:true};
  }
  if(data.action==='login'){
    if(request.auth.token.firebase?.sign_in_provider!=='password')throw new HttpsError('failed-precondition','Entre com seu e-mail e senha.');
    const profile=(await db.ref('users/'+uid).get()).val();
    data.name=profile?.displayName||request.auth.token.name||data.name;
  }
  if(data.action==='state'){const view=(await root.child('views/'+uid).get()).val();if(view)return view;const s=(await root.child('sessions/'+uid).get()).val();return {match:null,identity:s?{role:s.role,name:s.name,playerId:null}:null};}
  let problem=null;
  const legacy=data.action==='login'&&authorized?(await db.ref('match').get()).val():null;
  const initial=(await root.get()).val();
  const result=await root.transaction(value=>{
    value ??= initial;
    try {
      const room=value||{sessions:{},events:{},matches:{}};room.sessions||={};
      let s=room.sessions[uid];
      if(data.action==='login') {
        if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw new Error('Informe seu nome (até 80 caracteres).');
        if(!['player','organizer'].includes(data.role))throw new Error('Perfil inválido.');
        if(data.role==='organizer'&&!authorized)throw new Error('Esta conta não está autorizada como operador.');
        if(!room.match&&data.role==='organizer') {
          room.match=fresh();
          const imported=data.legacy||legacy;
          if(imported) {
            if(imported.durationMin){Object.assign(room.match,structuredClone(imported),{id:room.match.id,revision:0});room.match.bomb={...fresh().bomb,...imported.bomb};}
            else {room.match.name=imported.name||'';room.match.location=imported.location||'';room.match.durationMin=Number(imported.duration)||60;room.match.map.dataUrl=imported.mapImage||'';room.match.map.marks=Array.isArray(imported.marks)?imported.marks:[];room.match.startAt=imported.startedAt||null;room.match.status=imported.status==='live'?'live':'open';}
            validate(room.match);room.match.players=[];roster(room.match);
          }
          add(room,[{id:'creation-'+room.match.id,match_id:room.match.id,at:Date.now(),type:'creation',actor:data.name,description:imported?'Partida importada. Dados originais preservados nos caminhos match e players.':'Partida criada. Configuração em andamento.'}]);
        }
        s={...s,role:data.role,name:data.name.trim(),team:data.team==='B'?'B':'A'};room.sessions[uid]=s;
        if(room.match)join(room,s);
      } else {
        if(!s)throw new Error('Entre na partida primeiro.');
        if(!room.match)throw new Error('Aguarde o operador criar a partida.');
        s.role=authorized&&s.role==='organizer'?'organizer':'player';
        const advanced=advance(room.match);room.match=advanced.match;add(room,advanced.records);
        if(data.action==='tick'&&!advanced.changed)return;
        const next=data.action==='tick'?{match:room.match,session:s,records:[],archives:{}}:execute(room.match,s,data);room.match=next.match;room.sessions[uid]=next.session;add(room,next.records);
        room.archives={...room.archives,...next.archives};
      }
      if(room.match){for(const waiting of Object.values(room.sessions))if(waiting.match_id!==room.match.id)join(room,waiting);return publish(room);}
      return room;
    }catch(error){problem=error.message;return;}
  });
  if(!result.committed&&data.action==='tick'&&!problem)return (await root.child('views/'+uid).get()).val();
  if(!result.committed)throw new HttpsError('failed-precondition',problem||'Não foi possível salvar.');
  if(data.action==='login'){
    const session=result.snapshot.child('sessions/'+uid).val();
    const profile=db.ref('users/'+uid);const existing=(await profile.get()).val();
    await profile.update({displayName:session.name,preferredTeam:session.team,email:request.auth.token.email||null,createdAt:existing?.createdAt||Date.now(),lastLoginAt:Date.now()});
  }
  return result.snapshot.child('views/'+uid).val()||{match:null,identity:{role:'player',name:data.name,playerId:null}};
});
function join(room,s){const m=room.match;let p=s.match_id===m.id&&m.players.find(p=>p.id===s.player_id);if(!p){p=m.players.find(p=>!p.joined&&p.team===s.team);if(!p)throw new Error('Equipe sem vagas disponíveis.');s.match_id=m.id;s.player_id=p.id;Object.assign(p,{joined:true,name:s.name});add(room,[{id:crypto.randomUUID(),match_id:m.id,at:Date.now(),type:'join',actor:s.name,description:`${s.name} entrou na equipe ${p.team}.`}]);}p.left=false;p.connected=true;}
export const gameClock=onSchedule({schedule:'every 1 minutes',region:'us-central1'},async()=>{const initial=(await root.get()).val();await root.transaction(room=>{room ??=initial;if(!room?.match)return;const next=advance(room.match);if(!next.changed)return;room.match=next.match;add(room,next.records);return publish(room);});});
export const presence=onValueWritten({ref:'/presence/{uid}',region:'us-central1'},async event=>{const uid=event.params.uid,connected=event.data.after.val()===true;const initial=(await root.get()).val();await root.transaction(room=>{room ??=initial;const s=room?.sessions?.[uid],p=s&&room.match?.players.find(p=>p.id===s.player_id&&s.match_id===room.match.id);if(!p||p.connected===connected)return;p.connected=connected;add(room,[{id:crypto.randomUUID(),match_id:room.match.id,at:Date.now(),type:connected?'reconnect':'disconnect',actor:s.name,description:connected?'Participante reconectado.':'Conexão interrompida. Participação preservada.'}]);return publish(room);});});
