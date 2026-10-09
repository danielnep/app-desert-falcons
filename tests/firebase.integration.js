import assert from 'node:assert/strict';
import {initializeApp as initializeAdmin} from '../functions/node_modules/firebase-admin/lib/app/index.js';
import {getDatabase as adminDatabase} from '../functions/node_modules/firebase-admin/lib/database/index.js';
import {getAuth as adminAuth} from '../functions/node_modules/firebase-admin/lib/auth/index.js';
import {initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signInAnonymously} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getDatabase,connectDatabaseEmulator,ref,get,set,onValue} from 'firebase/database';
const projectId='deseart-falcons-githib';initializeAdmin({projectId,databaseURL:`http://127.0.0.1:9000?ns=${projectId}-default-rtdb`});
const user=await adminAuth().createUser({email:'operator@example.test',password:'test-password-123'});await adminAuth().setCustomUserClaims(user.uid,{operator:true});
function client(name){const app=initializeApp({apiKey:'fake-key',projectId,databaseURL:`https://${projectId}-default-rtdb.firebaseio.com`},name);const auth=getAuth(app),fn=getFunctions(app),db=getDatabase(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFunctionsEmulator(fn,'127.0.0.1',5001);connectDatabaseEmulator(db,'127.0.0.1',9000);return {auth,db,call:async data=>(await httpsCallable(fn,'airsoft')(data)).data};}
const op=client('operator'),p=client('player');await signInAnonymously(p.auth);
const waiting=await p.call({action:'login',role:'player',name:'Jogador',team:'B'});assert.equal(waiting.identity.playerId,null);
await assert.rejects(p.call({action:'login',role:'organizer',name:'Intruso'}));
await signInWithEmailAndPassword(op.auth,'operator@example.test','test-password-123');let data=await op.call({action:'login',role:'organizer',name:'Operador',team:'A'});assert.equal(data.match.status,'open');
let player=(await get(ref(p.db,'airsoftV2/views/'+p.auth.currentUser.uid))).val();assert.equal(player.match.status,'open');assert.ok(player.identity.playerId);
await assert.rejects(set(ref(p.db,'airsoftV2/match/name'),'invadido'));
await assert.rejects(get(ref(p.db,'airsoftV2/views/'+op.auth.currentUser.uid)));
const keys=['name','location','durationMin','playerCount','modes','mergeModes','livesPerPlayer','respawnDelay','respawnPolicy','teamVisibility','enemyVisibility','enemyVisibilitySeconds','zoneCaptureSeconds','zonePoints','map'];const config=Object.fromEntries(keys.map(k=>[k,data.match[k]]));config.name='Teste Firebase';config.location='Campo';config.modes=['respawn'];config.map={...data.match.map,dataUrl:'data:image/png;base64,aGVsbG8=',marks:[{id:'base',type:'base',label:'Base',x:.5,y:.5,size:.1}]};config.bomb=Object.fromEntries(['bombsPerPlayer','durationMin','disarmSeconds','blastRadius','armPolicy','timingPolicy','carrierId'].map(k=>[k,data.match.bomb[k]]));
await assert.rejects(p.call({action:'configure',config,revision:data.match.revision}));
data=await op.call({action:'configure',config,revision:data.match.revision});await assert.rejects(op.call({action:'start',confirmed:false}));
const realtime=new Promise(resolve=>{const stop=onValue(ref(p.db,'airsoftV2/views/'+p.auth.currentUser.uid),snap=>{if(snap.val()?.match.status==='live'){stop();resolve(snap.val());}});});
data=await op.call({action:'start',confirmed:true});player=await realtime;assert.equal(player.match.id,data.match.id);assert.equal(data.identity.role,'organizer');
player=await p.call({action:'hit'});assert.equal(player.match.players.find(x=>x.isMe).lives,2);
const reloaded=(await get(ref(p.db,'airsoftV2/views/'+p.auth.currentUser.uid))).val();assert.equal(reloaded.match.status,'live');assert.equal(reloaded.match.players.find(x=>x.isMe).lives,2);
const history=(await get(ref(p.db,'airsoftV2/events'))).val();for(const type of ['creation','join','configuration','start','hit'])assert.ok(Object.values(history).some(e=>e.type===type),type);
await op.call({action:'end'});await op.call({action:'new'});const preserved=(await get(ref(p.db,'airsoftV2/events'))).val();assert.ok(Object.keys(preserved).length>Object.keys(history).length);
console.log('Firebase: espera, autorização, regras, configuração, início em tempo real, HIT, recarga e histórico aprovados.');if(process.env.FIREBASE_BROWSER_TEST==='1'){assert.ok(process.env.FIREBASE_DATABASE_EMULATOR_HOST);await adminDatabase().ref('airsoftV2').remove();const {spawnSync}=await import('node:child_process');const result=spawnSync('python',['tests/firebase.browser.py'],{stdio:'inherit'});assert.equal(result.status,0);}
process.exit(0);
