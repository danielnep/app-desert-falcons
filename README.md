# Desert Falcons — Firebase e celulares

Branch de trabalho: `feat/airsoft-functional-match`. A interface existente e seus componentes foram preservados.

A aplicação principal agora usa o projeto Firebase fornecido `deseart-falcons-githib`. O operador pode usar Android ou iPhone; jogadores acessam o mesmo endereço HTTPS em Android, iPhone ou computador. O telefone administra a partida pelo navegador; não precisa executar Node nem funcionar como servidor HTTP. Cada pessoa cria uma conta permanente na tela Cadastro (nome, e-mail e senha). Depois usa a tela Login, somente com e-mail e senha; a escolha de equipe acontece após a autenticação. O nome e o perfil privado são salvos em `users/UID`, enquanto a senha é gerenciada pelo Firebase Authentication e nunca é gravada no Realtime Database. O operador não precisa cadastrar jogadores manualmente. Recuperação de senha e saída da conta estão disponíveis; a sessão é mantida pelo Firebase no próprio navegador. Contas anônimas anteriores podem ser vinculadas ao cadastro sem trocar o UID. É necessária conexão com a internet para sincronizar. O mapa mantém destaque na tela do jogador, ajusta a orientação ao celular e permite rolar a página; ao ampliar, os gestos movem o mapa.

## Preparação do Firebase pelo administrador

1. Habilitar o provedor **E-mail/senha** no Firebase Authentication e adicionar o domínio da aplicação aos domínios autorizados.
2. Instalar dependências: `npm install` e `npm ci --prefix functions`. Autenticar o Firebase CLI na conta administradora do projeto.
3. Executar os testes abaixo. Só depois publicar: `firebase deploy --only database,functions,hosting --project deseart-falcons-githib`. Cloud Functions e o agendamento podem exigir o plano Blaze. Conferir custos e plano no projeto antes da implantação.
4. O operador também cria sua conta na tela Cadastro do aplicativo. Com credenciais administrativas de aplicação disponíveis, executar uma vez `node functions/set-operator.js EMAIL_DO_OPERADOR`. A permissão usa a claim `operator`; criar uma conta ou escolher o botão Operador não concede essa permissão. Nenhuma chave administrativa deve ir para o navegador.
5. Abrir o endereço HTTPS publicado. Todos usam Login com e-mail e senha. O Firebase preserva a sessão nesse navegador. Jogadores cadastram-se por conta própria e escolhem a equipe após entrar. Compartilhar usa o próprio endereço da aplicação.

As regras bloqueiam alterações diretas de jogadores nas configurações. As funções validam cada comando e publicam uma visão individual, ocultando coordenadas conforme as regras de visibilidade. Histórico e partidas anteriores ficam persistidos no Realtime Database. Os caminhos originais `match` e `players` são preservados. Na primeira criação, a configuração antiga em `match` é importada quando compatível, sem apagar os dados antigos; dados incompatíveis geram erro em vez de falsa confirmação.

A troca para `deseart-falcons-githib` não copia automaticamente as partidas do projeto Firebase anterior. O banco anterior não foi apagado nem alterado. As funções, regras e provedores de autenticação precisam ser preparados neste novo projeto.

## Testes locais

`npm run check`: sintaxe.

`npm test`: 11 testes do motor Firebase e regressões das funcionalidades anteriores.

`npm run test:firebase`: emuladores reais de Authentication, Realtime Database e Functions, incluindo cadastro permanente, conversão de conta anônima, perfil privado, login, espera, permissões, configuração, início em tempo real, HIT, recarga e histórico. Requer Java 21 e Node compatível com o Firebase CLI.

`FIREBASE_BROWSER_TEST=1 npm run test:firebase`: inclui o teste Chromium com operador e jogador em telas móveis (requer Python Playwright e Chromium). O SDK é baixado de gstatic e as operações usam os emuladores reais.

`npm start`: emuladores, interface em `http://127.0.0.1:5000/?emulator`. Não usar dados nem credenciais reais nos emuladores.

O temporizador avança a cada dois segundos enquanto existe uma página conectada em primeiro plano. Um agendamento no Firebase recupera os prazos uma vez por minuto quando todos os navegadores estão suspensos; prazos absolutos são preservados e conferidos antes de cada ação. Essa recuperação não depende do Android do operador permanecer acordado.

O servidor Node/SQLite continua em `server.js` como alternativa preservada e para regressão; a interface padrão usa Firebase. Os testes anteriores em `tests/browser.py` referem-se à versão anterior do transporte e precisam ser executados contra a configuração correspondente; não comprovam a nova integração Firebase.

## Limites da validação

Testes em emulador não demonstram que as regras, provedores e funções já foram implantados no projeto real. Não há credenciais administrativas Firebase disponíveis nesta sessão. Não houve deploy de produção. A validação física em Android/iPhone, GPS real, Safari e rede de campo continua necessária antes de usar numa partida real.
