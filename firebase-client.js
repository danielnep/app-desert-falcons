import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js';
import {getAuth,signInAnonymously,signInWithEmailAndPassword,onAuthStateChanged,connectAuthEmulator} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js';
import {getDatabase,ref,get,onValue,onDisconnect,set,connectDatabaseEmulator} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js';
import {getFunctions,httpsCallable,connectFunctionsEmulator} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-functions.js';
const app=initializeApp({apiKey:'AIzaSyBF7Qe4HV3m7QmhtWbIMv-Nxzm10Ms-InI',authDomain:'deseart-falcons-githib.firebaseapp.com',databaseURL:'https://deseart-falcons-githib-default-rtdb.firebaseio.com',projectId:'deseart-falcons-githib',storageBucket:'deseart-falcons-githib.firebasestorage.app',messagingSenderId:'816488814155',appId:'1:816488814155:web:0824afebbbc651dd541fce'});
const auth=getAuth(app),db=getDatabase(app),functions=getFunctions(app,'us-central1');
if(['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).has('emulator')){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectDatabaseEmulator(db,'127.0.0.1',9000);connectFunctionsEmulator(functions,'127.0.0.1',5001);}
await new Promise(resolve=>{const stop=onAuthStateChanged(auth,()=>{stop();resolve();});});
const invoke=httpsCallable(functions,'airsoft');
let stops=[],live=false;
async function performRequest(path,body){
 if(path==='/api/login'){
  if(body.role==='organizer')await signInWithEmailAndPassword(auth,body.email,body.key);
  else if(!auth.currentUser)await signInAnonymously(auth);
  const result=(await invoke({action:'login',...body})).data;
  if(!result.match) return {...result,match:JSON.parse(localStorage.getItem('df_empty_match'))};
  return result;
 }
 if(!auth.currentUser)return {identity:null,match:null};
 if(path.startsWith('/api/events')){const [a,b]=await Promise.all([get(ref(db,'airsoftV2/events')),get(ref(db,'airsoftV2/matches'))]);const filter=new URL(path,location.href).searchParams.get('match');return {events:Object.values(a.val()||{}).filter(e=>!filter||e.match_id===filter).sort((a,b)=>a.at-b.at),matches:Object.values(b.val()||{})};}
 if(path==='/api/command')return (await invoke(body)).data;
 return (await get(ref(db,'airsoftV2/views/'+auth.currentUser.uid))).val()||(await invoke({action:'state'})).data;
}
export function connect(receive,status){stops.forEach(stop=>stop());stops=[];if(!auth.currentUser)return;const uid=auth.currentUser.uid;stops.push(onValue(ref(db,'airsoftV2/views/'+uid),snapshot=>{if(snapshot.exists()){live=snapshot.val().match?.status==='live';receive(snapshot.val());}},error=>status('Sem acesso · '+error.message)));stops.push(onValue(ref(db,'.info/connected'),async snap=>{status(snap.val()?'Conectado · Firebase em tempo real':'Reconectando · Firebase');if(snap.val()){const presence=ref(db,'presence/'+uid);await onDisconnect(presence).set(false);await set(presence,true);}}));}

let ticking=false;setInterval(async()=>{if(ticking||!live||!auth.currentUser||document.hidden)return;ticking=true;try{await invoke({action:"tick"});}catch{}finally{ticking=false;}},2000);

export async function request(path,body){try{return await performRequest(path,body);}catch(error){const messages={"auth/invalid-credential":"E-mail ou senha inválidos.","auth/operation-not-allowed":"O administrador precisa habilitar o provedor de acesso no Firebase.","auth/network-request-failed":"Sem conexão com o Firebase. Verifique a internet.","functions/not-found":"O backend Firebase ainda não foi publicado. Consulte as instruções de implantação.","functions/internal":"Não foi possível concluir a ação no Firebase. Verifique a conexão e a implantação."};throw new Error(messages[error.code]||error.message);}}
