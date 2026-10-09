import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the actual browser transport with SDK doubles; no real accounts.
async function harness({existing=false,name=null,password='correct',operator=false}={}) {
 const calls=[];const user={uid:'same-uid',displayName:name,isAnonymous:false,getIdTokenResult:async()=>({claims:{operator}})};
 const auth={currentUser:null};
 const fail=code=>Object.assign(new Error(code),{code});
 const context={URLSearchParams,URL,console,location:{hostname:'example.test',href:'https://example.test'},document:{hidden:false},localStorage:{getItem:()=>null},setInterval:()=>{},
 initializeApp:()=>({}),getAuth:()=>auth,getDatabase:()=>({}),getFunctions:()=>({}),
 onAuthStateChanged:(_a,cb)=>{queueMicrotask(cb);return ()=>{};},
 httpsCallable:()=>async()=>{calls.push('function');throw fail('functions/internal');},
 createUserWithEmailAndPassword:async(_a,email,key)=>{calls.push('create');if(existing)throw fail('auth/email-already-in-use');auth.currentUser=user;},
 signInWithEmailAndPassword:async(_a,email,key)=>{calls.push('signIn');if(key!==password)throw fail('auth/invalid-credential');auth.currentUser=user;},
 updateProfile:async(u,data)=>{calls.push('updateProfile');Object.assign(u,data);},
 signOut:async()=>{calls.push('signOut');auth.currentUser=null;},
 ref:(_db,path)=>path,set:async()=>{},get:async()=>{calls.push('database');throw fail('PERMISSION_DENIED');},
 sendPasswordResetEmail:async()=>{},EmailAuthProvider:{credential:()=>({})},linkWithCredential:async()=>{}};
 const source=readFileSync(new URL('../firebase-client.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
 const request=await vm.runInNewContext('(async()=>{'+source+';return request;})()',context);
 return {request,calls,user,auth};
}
test('signup succeeds while game function and database are unavailable',async()=>{
 const h=await harness();const result=await h.request('/api/register',{email:'player@example.test',key:'correct',name:'Jogador'});
 assert.equal(result.registered,true);assert.equal(h.user.displayName,'Jogador');assert.equal(h.auth.currentUser,null);assert.deepEqual(h.calls,['create','updateProfile','signOut']);
});
test('duplicate signup proves password ownership and completes missing name using same UID',async()=>{
 const h=await harness({existing:true});const result=await h.request('/api/register',{email:'player@example.test',key:'correct',name:'Jogador'});
 assert.equal(result.recovered,true);assert.equal(h.user.uid,'same-uid');assert.equal(h.user.displayName,'Jogador');assert.deepEqual(h.calls,['create','signIn','updateProfile','signOut']);
});
test('duplicate signup with wrong password cannot change existing name',async()=>{
 const h=await harness({existing:true,name:'Original'});await assert.rejects(h.request('/api/register',{email:'player@example.test',key:'wrong',name:'Outro'}),{code:'auth/invalid-credential'});
 assert.equal(h.user.displayName,'Original');assert.deepEqual(h.calls,['create','signIn']);
});
test('recovered account preserves existing name',async()=>{
 const h=await harness({existing:true,name:'Original'});await h.request('/api/register',{email:'player@example.test',key:'correct',name:'Outro'});assert.equal(h.user.displayName,'Original');assert.ok(!h.calls.includes('updateProfile'));
});
test('authentication succeeds without access to separate database or function',async()=>{
 const h=await harness({name:'Jogador'});assert.equal((await h.request('/api/authenticate',{email:'player@example.test',key:'correct',role:'player'})).name,'Jogador');assert.deepEqual(h.calls,['signIn']);
 await assert.rejects(h.request('/api/login',{role:'player',team:'A'}),error=>error.code==='functions/internal'&&error.message.includes('conta está autenticada'));
});
test('operator authorization remains enforced',async()=>{
 const h=await harness({name:'Jogador'});await assert.rejects(h.request('/api/authenticate',{email:'player@example.test',key:'correct',role:'organizer'}),/não está autorizada/);
});
