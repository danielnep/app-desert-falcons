import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js';
import {getAuth,createUserWithEmailAndPassword,EmailAuthProvider,linkWithCredential,updateProfile,signOut,sendPasswordResetEmail,signInWithEmailAndPassword,onAuthStateChanged,connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js';
import {getDatabase,ref,get,onValue,onDisconnect,set,connectDatabaseEmulator} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js';
import {getFunctions,httpsCallable,connectFunctionsEmulator} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-functions.js';
const app=initializeApp({apiKey:'AIzaSyBF7Qe4HV3m7QmhtWbIMv-Nxzm10Ms-InI',authDomain:'deseart-falcons-githib.firebaseapp.com',databaseURL:'https://deseart-falcons-githib-default-rtdb.firebaseio.com',projectId:'deseart-falcons-githib',storageBucket:'deseart-falcons-githib.firebasestorage.app',messagingSenderId:'816488814155',appId:'1:816488814155:web:0824afebbbc651dd541fce'});
const auth=getAuth(app),db=getDatabase(app),functions=getFunctions(app,'us-central1');
if(['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).has('emulator')){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectDatabaseEmulator(db,'127.0.0.1',9000);connectFunctionsEmulator(functions,'127.0.0.1',5001);}
await new Promise(resolve=>{const stop=onAuthStateChanged(auth,()=>{stop();resolve();});});
const invoke=httpsCallable(functions,'airsoft');
let stops=[],live=false;
async function performRequest(path,body){
 if(path==='/api/register'){
  if(!body.name?.trim())throw new Error('Informe seu nome.');
  if(auth.currentUser?.isAnonymous)await linkWithCredential(auth.currentUser,EmailAuthProvider.credential(body.email,body.key));
  else await createUserWithEmailAndPassword(auth,body.email,body.key);
  await updateProfile(auth.currentUser,{displayName:body.name.trim()});await auth.currentUser.getIdToken(true);
  await invoke({action:'register',name:body.name.trim()});await performRequest('/api/logout');return {registered:true};
 }
 if(path==='/api/reset-password'){try{await sendPasswordResetEmail(auth,body.email);}catch(error){if(error.code!=='auth/user-not-found')throw error;}return {sent:true};}
 if(path==='/api/logout'){stops.forEach(stop=>stop());stops=[];live=false;if(auth.currentUser){try{await set(ref(db,'presence/'+auth.currentUser.uid),false);}catch{}await signOut(auth);}return {signedOut:true};}
 if(path==='/api/authenticate'){
  await signInWithEmailAndPassword(auth,body.email,body.key);
  const token=await auth.currentUser.getIdTokenResult();
  if(body.role==='organizer'&&token.claims.operator!==true)throw new Error('Esta conta não está autorizada como operador.');
  const profile=(await get(ref(db,'users/'+auth.currentUser.uid))).val();const name=profile?.displayName||auth.currentUser.displayName;
  if(!name)throw new Error('Sua conta ainda não tem um nome. Complete seu perfil no cadastro.');
  return {name,team:profile?.preferredTeam||'A'};
 }
 if(path==='/api/login'){
  if(!auth.currentUser||auth.currentUser.isAnonymous)throw new Error('Entre com seu e-mail e senha.');
  const result=(await invoke({action:'login',role:body.role,team:body.team,...(body.legacy?{legacy:body.legacy}:{})})).data;
  if(!result.match)return {...result,match:JSON.parse(localStorage.getItem('df_empty_match'))};return result;
 }
 if(path==='/api/state'&&(!auth.currentUser||auth.currentUser.isAnonymous))return {identity:null,match:null};
 if(!auth.currentUser)throw new Error('Entre na sua conta para continuar.');
 if(path.startsWith('/api/events')){const [a,b]=await Promise.all([get(ref(db,'airsoftV2/events')),get(ref(db,'airsoftV2/matches'))]);const filter=new URL(path,location.href).searchParams.get('match');return {events:Object.values(a.val()||{}).filter(e=>!filter||e.match_id===filter).sort((a,b)=>a.at-b.at),matches:Object.values(b.val()||{})};}
 if(path==='/api/command')return (await invoke(body)).data;
 return (await get(ref(db,'airsoftV2/views/'+auth.currentUser.uid))).val()||(await invoke({action:'state'})).data;
}
export function connect(receive,status){stops.forEach(stop=>stop());stops=[];if(!auth.currentUser)return;const uid=auth.currentUser.uid;stops.push(onValue(ref(db,'airsoftV2/views/'+uid),snapshot=>{if(snapshot.exists()){live=snapshot.val().match?.status==='live';receive(snapshot.val());}},error=>status('Sem acesso · '+error.message)));stops.push(onValue(ref(db,'.info/connected'),async snap=>{status(snap.val()?'Conectado · Firebase em tempo real':'Reconectando · Firebase');if(snap.val()){const presence=ref(db,'presence/'+uid);await onDisconnect(presence).set(false);await set(presence,true);}}));}

let ticking=false;setInterval(async()=>{if(ticking||!live||!auth.currentUser||document.hidden)return;ticking=true;try{await invoke({action:"tick"});}catch{}finally{ticking=false;}},2000);

export async function request(path,body){try{return await performRequest(path,body);}catch(error){const messages={"auth/email-already-in-use":"Este e-mail já está cadastrado. Use o login ou recupere a senha.","auth/weak-password":"Escolha uma senha com pelo menos 6 caracteres.","auth/invalid-email":"Informe um e-mail válido.","auth/too-many-requests":"Muitas tentativas. Aguarde um pouco e tente novamente.","auth/wrong-password":"E-mail ou senha inválidos.","auth/user-not-found":"E-mail ou senha inválidos.","auth/invalid-credential":"E-mail ou senha inválidos.","auth/operation-not-allowed":"O administrador precisa habilitar o provedor de acesso no Firebase.","auth/network-request-failed":"Sem conexão com o Firebase. Verifique a internet.","functions/not-found":"O backend Firebase ainda não foi publicado. Consulte as instruções de implantação.","functions/internal":"Não foi possível concluir a ação no Firebase. Verifique a conexão e a implantação."};throw new Error(messages[error.code]||error.message);}}
