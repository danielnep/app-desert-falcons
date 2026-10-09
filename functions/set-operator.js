// Run with application default credentials belonging to the Firebase project administrator.
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
initializeApp({projectId:'deseart-falcons-githib'});
const email=process.argv[2];if(!email)throw new Error('Informe o e-mail da conta já criada no Firebase Authentication.');
const user=await getAuth().getUserByEmail(email);await getAuth().setCustomUserClaims(user.uid,{...user.customClaims,operator:true});console.log('Permissão de operador aplicada à conta informada.');
