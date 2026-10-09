import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
const key='test-operator-secret';
async function harness(path=':memory:') {
  const app=createApp({dbPath:path,operatorKey:key});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${app.server.address().port}`;
  function client(cookie='') {return {cookie,async call(path,body){const res=await fetch(url+path,{method:body?'POST':'GET',headers:{Cookie:this.cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(res.headers.get('set-cookie'))this.cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,data:await res.json()};}};}
  return {app,url,client};
}
const cfg=()=>{const m=JSON.parse(readFileSync(new URL('../defaults.json',import.meta.url))).match;delete m.players;delete m.logs;const keys=['name','location','durationMin','playerCount','modes','mergeModes','livesPerPlayer','respawnDelay','respawnPolicy','teamVisibility','enemyVisibility','enemyVisibilitySeconds','zoneCaptureSeconds','zonePoints','map'];const c=Object.fromEntries(keys.map(k=>[k,m[k]]));c.name='Operação teste';c.location='Campo de teste';c.bomb=Object.fromEntries(['bombsPerPlayer','durationMin','disarmSeconds','blastRadius','armPolicy','timingPolicy','carrierId'].map(k=>[k,m.bomb[k]]));c.map={dataUrl:'data:image/png;base64,iVBORw0KGgo=',naturalWidth:10,naturalHeight:10,marks:[{id:'base1',type:'base',label:'Base',x:.5,y:.5,size:.2},{id:'flag1',type:'flag',label:'Bandeira',x:.5,y:.5,size:.2}]};return c;};
async function login(c,role='player',team='A'){const r=await c.call('/api/login',{role,team,name:role==='organizer'?'Operador':'Jogador '+team,key});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
async function configure(c,config=cfg()){const {data}=await c.call('/api/state');return c.call('/api/command',{action:'configure',revision:data.match.revision,config});}

test('waiting, authorization, SSE, start, live changes, HIT, reload and persistent history',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'df-test-'));const path=join(dir,'game.sqlite');let h=await harness(path);
  try {
    const player=h.client();const wait=await login(player);assert.equal(wait.match.status,'none');assert.equal(wait.identity.playerId,null);
    const operator=h.client();assert.equal((await operator.call('/api/login',{role:'organizer',name:'Intruso',key:'wrong'})).status,403);
    const op=await login(operator,'organizer');assert.equal(op.match.status,'open');
    const queued=(await player.call('/api/state')).data;assert.ok(queued.identity.playerId);assert.equal(queued.match.status,'open');
    assert.equal((await player.call('/api/command',{action:'start',confirmed:true})).status,403);
    assert.equal((await player.call('/api/command',{action:'configure',config:cfg(),revision:op.match.revision})).status,403);
    assert.equal((await operator.call('/api/command',{action:'start',confirmed:true})).status,400);
    assert.equal((await configure(operator)).status,200);
    const abort=new AbortController();const stream=await fetch(h.url+'/api/stream',{headers:{Cookie:player.cookie},signal:abort.signal});const reader=stream.body.getReader();await reader.read();
    assert.equal((await operator.call('/api/command',{action:'start',confirmed:false})).status,400);
    const started=await operator.call('/api/command',{action:'start',confirmed:true});assert.equal(started.status,200);assert.equal(started.data.match.status,'live');
    const update=new TextDecoder().decode((await reader.read()).value);assert.match(update,/"status":"live"/);abort.abort();
    assert.equal((await operator.call('/api/command',{action:'start',confirmed:true})).status,409);
    const firstStart=started.data.match.startAt;
    const liveConfig=cfg();liveConfig.respawnDelay=0;assert.equal((await configure(operator,liveConfig)).status,200);
    assert.equal((await player.call('/api/state')).data.match.startAt,firstStart);
    assert.equal((await player.call('/api/command',{action:'hit'})).status,200);
    assert.equal((await player.call('/api/command',{action:'hit'})).status,400);
    await new Promise(r=>setTimeout(r,600));
    const after=(await player.call('/api/state')).data.match;assert.equal(after.hits.A,1);assert.equal(after.players.find(p=>p.isMe).lives,2);
    const cookie=player.cookie;const id=after.id;
    await h.app.close();h=await harness(path);const recovered=await h.client(cookie).call('/api/state');assert.equal(recovered.data.match.id,id);assert.equal(recovered.data.match.startAt,firstStart);assert.equal(recovered.data.match.hits.A,1);
    const restoredOp=h.client(operator.cookie);assert.equal((await restoredOp.call('/api/command',{action:'end'})).status,200);
    const history=await h.client(cookie).call('/api/events');assert.ok(['creation','join','configuration','start','hit','respawn','end'].every(type=>history.data.events.some(e=>e.type===type)));
    await login(restoredOp,'organizer');assert.notEqual((await restoredOp.call('/api/state')).data.match.id,id);
    const all=await restoredOp.call('/api/events');assert.equal(all.data.matches.length,2);assert.ok(all.data.events.some(e=>e.match_id===id));
  } finally {await h.app.close();rmSync(dir,{recursive:true,force:true});}
});
test('invalid configuration and stale saves cannot change active game',async()=>{
  const h=await harness();try{const c=h.client();await login(c,'organizer');const current=(await c.call('/api/state')).data.match;const config=cfg();config.durationMin=-1;assert.equal((await configure(c,config)).status,400);assert.equal((await c.call('/api/state')).data.match.durationMin,current.durationMin);assert.equal((await c.call('/api/command',{action:'configure',revision:-1,config:cfg()})).status,409);assert.equal((await configure(c)).status,200);await c.call('/api/command',{action:'start',confirmed:true});const changed=cfg();changed.playerCount=1;assert.equal((await configure(c,changed)).status,400);}finally{await h.app.close();}
});
test('roster capacity, participant identity and visibility do not trust browser role',async()=>{
  const h=await harness();try{const op=h.client();await login(op,'organizer');const c=cfg();c.playerCount=1;c.bomb.carrierId='A-1';assert.equal((await configure(op,c)).status,200);const a=h.client();assert.equal((await a.call('/api/login',{role:'player',team:'A',name:'Extra'})).status,409);const b=h.client();await login(b,'player','B');const view=(await b.call('/api/state')).data.match;assert.equal(view.players.find(p=>p.team==='A').x,null);assert.equal(view.players.filter(p=>p.isMe).length,1);assert.equal((await b.call('/api/command',{action:'end',role:'organizer'})).status,403);}finally{await h.app.close();}
});

test('bomb arming, GPS disarm validation, flags, zones, benefits and administrative reset',async()=>{
  const h=await harness();try {
    const op=h.client(),b=h.client();await login(op,'organizer');await login(b,'player','B');const c=cfg();c.modes=['bomb','zone','flag'];c.mergeModes=true;c.bomb.carrierId='A-1';c.bomb.armPolicy='anywhere';c.bomb.disarmSeconds=1;c.zoneCaptureSeconds=1;c.enemyVisibility='benefit';c.map.marks.push({id:'zone1',type:'zone',label:'Zona',x:.5,y:.5,size:.2});
    assert.equal((await configure(op,c)).status,200);await op.call('/api/command',{action:'start',confirmed:true});
    assert.equal((await op.call('/api/command',{action:'position',lat:-23,lng:-46,x:.5,y:.5})).status,200);
    assert.equal((await b.call('/api/command',{action:'arm'})).status,400);
    assert.equal((await op.call('/api/command',{action:'arm'})).status,200);
    assert.equal((await b.call('/api/command',{action:'disarm_begin'})).status,400,'Unknown GPS must not fabricate meters');
    await b.call('/api/command',{action:'position',lat:-23,lng:-46,x:.1,y:.1});
    assert.equal((await b.call('/api/command',{action:'disarm_begin'})).status,200);
    assert.equal((await b.call('/api/command',{action:'disarm'})).status,400);
    await new Promise(r=>setTimeout(r,1600));
    assert.equal((await b.call('/api/command',{action:'disarm'})).status,200);
    const state=(await op.call('/api/state')).data.match;assert.equal(state.zones.zone1.captured,true);assert.equal(state.scores.A,75);
    assert.equal((await op.call('/api/command',{action:'flag',flagId:'flag1'})).status,200);
    assert.equal((await op.call('/api/command',{action:'flag',flagId:'flag1'})).status,400);
    assert.equal((await b.call('/api/command',{action:'benefit',team:'B',kind:'enemy'})).status,403);
    assert.equal((await op.call('/api/command',{action:'benefit',team:'B',kind:'enemy'})).status,200);
    assert.equal((await b.call('/api/state')).data.match.players.find(p=>p.team==='A').visible,true);
    const id=state.id;assert.equal((await op.call('/api/command',{action:'new'})).status,200);
    assert.notEqual((await op.call('/api/state')).data.match.id,id);
    assert.equal((await b.call('/api/command',{action:'position',x:.2,y:.2})).status,400,'Old session must not mutate a new match roster');
    assert.ok((await op.call('/api/events')).data.events.some(e=>e.match_id===id&&e.type==='end'));
  }finally{await h.app.close();}
});
test('legacy browser migration preserves live state, scores, player lives and event times',async()=>{
  const h=await harness();try {
    const op=h.client();const legacy=JSON.parse(readFileSync(new URL('../defaults.json',import.meta.url))).match;
    Object.assign(legacy,cfg(),{bomb:{...legacy.bomb,...cfg().bomb},status:'live',startAt:Date.now(),scores:{A:35,B:10},hits:{A:2,B:0},players:[{id:'A-1',team:'A',name:'Antigo',isMe:true,lives:1,hits:2,status:'ATIVO',x:.5,y:.5,lat:null,lng:null}],logs:[{at:1700000000000,text:'Evento antigo'}]});
    const result=await op.call('/api/login',{role:'organizer',name:'Operador',key,legacy});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.match.status,'live');assert.equal(result.data.match.scores.A,35);assert.equal(result.data.match.players.find(p=>p.isMe).lives,1);
    const history=await op.call('/api/events');assert.ok(history.data.events.some(e=>e.description==='Evento antigo'&&e.at===1700000000000));
  }finally{await h.app.close();}
});
test('overdue explosion and match end resume from persisted timestamps after server restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'df-clock-'));const path=join(dir,'game.sqlite');let h=await harness(path);
  try {
    const op=h.client(),b=h.client();await login(op,'organizer');await login(b,'player','B');const c=cfg();c.modes=['bomb'];c.bomb.carrierId='A-1';c.bomb.armPolicy='anywhere';c.respawnDelay=900;assert.equal((await configure(op,c)).status,200);await op.call('/api/command',{action:'start',confirmed:true});
    await op.call('/api/command',{action:'position',lat:-23,lng:-46});await b.call('/api/command',{action:'position',lat:-23,lng:-46});await op.call('/api/command',{action:'arm'});
    let row=h.app.db.prepare('SELECT * FROM matches').get();let saved=JSON.parse(row.state);saved.bomb.expiresAt=Date.now()-1;h.app.db.prepare('UPDATE matches SET state=? WHERE id=?').run(JSON.stringify(saved),row.id);
    const opCookie=op.cookie,bCookie=b.cookie;await h.app.close();h=await harness(path);await new Promise(r=>setTimeout(r,650));
    const recovered=(await h.client(bCookie).call('/api/state')).data.match;assert.equal(recovered.bomb.planted,false);assert.equal(recovered.players.find(p=>p.isMe).lives,2);assert.equal(recovered.scores.A,50);
    row=h.app.db.prepare('SELECT * FROM matches').get();saved=JSON.parse(row.state);saved.startAt=Date.now()-saved.durationMin*60000-1000;h.app.db.prepare('UPDATE matches SET state=? WHERE id=?').run(JSON.stringify(saved),row.id);
    await h.app.close();h=await harness(path);await new Promise(r=>setTimeout(r,650));assert.equal((await h.client(opCookie).call('/api/state')).data.match.status,'ended');
    const events=(await h.client(opCookie).call('/api/events')).data.events;assert.equal(events.filter(e=>e.type==='bomb_explosion').length,1);assert.equal(events.filter(e=>e.type==='end').length,1);
  }finally{await h.app.close();rmSync(dir,{recursive:true,force:true});}
});
