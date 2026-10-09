import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {fresh,execute,advance} from '../local-engine.js';

const source=readFileSync(new URL('../local-client.js',import.meta.url),'utf8').replace(/^import .*;\n/,'').replaceAll('export ','');
function environment(){
 const shared=new Map();let chain=Promise.resolve();
 const storage=map=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)});
 return {shared,client(session=new Map()){
  const listeners={};const context={fresh,execute,advance,structuredClone,crypto:webcrypto,URL,location:{href:'https://example.test/'},document:{hidden:false},localStorage:storage(shared),sessionStorage:storage(session),navigator:{locks:{request:(_name,cb)=>{const result=chain.then(cb);chain=result.catch(()=>{});return result;}}},addEventListener:(type,cb)=>listeners[type]=cb,setInterval:()=>{}};
  const api=vm.runInNewContext(source+';({request,connect})',context);return {...api,session,emitStorage:()=>listeners.storage({key:'df_local_room_v1'}),emitPageHide:()=>listeners.pagehide()};
 }};
}
const call=(client,action,data={})=>client.request('/api/command',{action,...data});
async function configure(op){const data=await op.request('/api/state');const config={...data.match,name:'Teste local',location:'Campo',modes:['respawn'],respawnPolicy:'choice',respawnDelay:0,map:{dataUrl:'data:image/png;base64,aGVsbG8=',marks:[{id:'base',type:'base',label:'Base',x:.5,y:.5,size:.1}]}};config.bomb=Object.fromEntries(['bombsPerPlayer','durationMin','disarmSeconds','blastRadius','armPolicy','timingPolicy','carrierId'].map(k=>[k,config.bomb[k]]));const keys=['name','location','durationMin','playerCount','modes','mergeModes','livesPerPlayer','respawnDelay','respawnPolicy','teamVisibility','enemyVisibility','enemyVisibilitySeconds','zoneCaptureSeconds','zonePoints','map','bomb'];return call(op,'configure',{revision:data.match.revision,config:Object.fromEntries(keys.map(k=>[k,config[k]]))});}

test('roles enter directly; a player waits without a match and cannot configure',async()=>{
 const e=environment(),p=e.client();const waiting=await p.request('/api/login',{role:'player'});assert.equal(waiting.identity.role,'player');assert.equal(waiting.match,null);assert.equal(waiting.host.joinUrls.length,0);await assert.rejects(call(p,'start',{confirmed:true}),/Aguarde o operador/);
 const op=e.client();await op.request('/api/login',{role:'organizer'});assert.equal((await p.request('/api/state')).operatorTaken,true);await assert.rejects(call(p,'end'),/exclusivo do operador/);
});
test('simultaneous operator claims allow exactly one and reload preserves its reservation',async()=>{
 const e=environment(),a=e.client(),b=e.client();const results=await Promise.allSettled([a.request('/api/login',{role:'organizer'}),b.request('/api/login',{role:'organizer'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/Já existe um operador/);
 const reload=e.client(a.session);assert.equal((await reload.request('/api/state')).identity.role,'organizer');await assert.rejects(b.request('/api/login',{role:'organizer'}),/Já existe/);
 await reload.request('/api/logout');assert.equal((await b.request('/api/login',{role:'organizer'})).identity.role,'organizer');
});
test('configuration persists, starts for waiting participant, HIT and respawn work, history survives new match',async()=>{
 const e=environment(),op=e.client(),p=e.client();await p.request('/api/login',{role:'player'});await op.request('/api/login',{role:'organizer'});await configure(op);
 assert.equal((await e.client(op.session).request('/api/state')).match.name,'Teste local');await assert.rejects(call(op,'start',{confirmed:false}),/Confirme/);await call(op,'start',{confirmed:true});
 let data=await p.request('/api/state');assert.equal(data.match.status,'live');assert.equal(data.identity.role,'player');data=await call(p,'hit');assert.equal(data.match.players.find(p=>p.isMe).lives,2);await call(p,'respawn',{baseId:'base'});assert.equal((await p.request('/api/state')).match.players.find(p=>p.isMe).status,'ATIVO');
 const oldId=data.match.id;await call(op,'new');const history=await p.request('/api/events');assert.ok(history.matches.some(m=>m.id===oldId));assert.ok(history.events.some(e=>e.type==='start'));assert.equal((await p.request('/api/state')).match.status,'open');
});
test('tabs receive state updates, devices remain independent',async()=>{
 const e=environment(),op=e.client(),p=e.client();await p.request('/api/login',{role:'player'});let latest;p.connect(data=>latest=data,()=>{});await op.request('/api/login',{role:'organizer'});p.emitStorage();assert.equal(latest.match.status,'open');assert.equal(latest.operatorTaken,true);
 const other=environment().client();assert.equal((await other.request('/api/state')).match,null);assert.equal((await other.request('/api/login',{role:'organizer'})).identity.role,'organizer');
});
test('browser engine stays equivalent to maintained engine except ID provider',()=>{
 const server=readFileSync(new URL('../functions/engine.js',import.meta.url),'utf8').split('\n').slice(1).join('\n').replaceAll("randomBytes(12).toString('hex')",'newId()');
 const browser=readFileSync(new URL('../local-engine.js',import.meta.url),'utf8').split('\n').slice(2).join('\n');assert.equal(browser,server);
});

test('old or abandoned operator reservations cannot lock entry forever',async()=>{
 const e=environment(),old=e.client(),next=e.client();await old.request('/api/login',{role:'organizer'});
 const room=JSON.parse(e.shared.get('df_local_room_v1'));delete room.operatorSeenAt;e.shared.set('df_local_room_v1',JSON.stringify(room));
 assert.equal((await next.request('/api/state')).operatorTaken,false);await next.request('/api/login',{role:'organizer'});assert.equal((await old.request('/api/state')).identity.role,'player');
 next.emitPageHide();assert.equal((await old.request('/api/login',{role:'organizer'})).identity.role,'organizer');
});
