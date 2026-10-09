# Desert Falcons — Airsoft

Aprimoramento incremental do aplicativo original em HTML, CSS e JavaScript. A interface, os modos, o envio/recorte de mapas e o editor foram reaproveitados. A branch `feat/airsoft-functional-match` preserva `dev-experiments` e não faz deploy.

## Executar

Requer **Node.js 24 ou superior** (SQLite nativo). Não há dependências npm de produção.

```sh
export OPERATOR_KEY='defina-uma-chave-forte-com-pelo-menos-12-caracteres'
export DATABASE_PATH='/caminho/persistente/airsoft.sqlite'
npm start
```

Abra `http://localhost:3000`. Distribua a chave somente aos operadores autorizados. Jogadores entram com nome e equipe; escolher o cartão Operador nunca concede permissão sem validar a chave no servidor. A identidade fica em cookie HttpOnly com validade de sete dias. Trocar Jogador/Operador muda apenas a tela.

Variáveis: `PORT` (3000), `HOST` (0.0.0.0), `DATABASE_PATH` (`data/airsoft.sqlite`), `OPERATOR_KEY` (obrigatória), `SECURE_COOKIES` (`true` em HTTPS). O servidor recusa iniciar sem chave válida. Nenhuma chave deve ser adicionada ao Git.

## Host temporário no dispositivo do operador

Foi acrescentado `npm run phone` para um dispositivo que **já tenha um runtime Node.js 24+**. Esse modo cria e conserva uma chave segura automaticamente, reconhece o operador somente em `127.0.0.1`/`localhost`, disponibiliza o servidor na rede local e apresenta **Convidar jogadores** com o endereço real da rede. Em Termux, também solicita a abertura do navegador local automaticamente. Jogadores na mesma rede usam o link compartilhado, nunca o seu próprio `localhost`.

**Não é possível iniciar esse servidor apenas abrindo HTML no Chrome/Safari.** O runtime precisa ser instalado/executado no sistema. O modo foi testado em Node/Linux; inicialização em Android/Termux e iPhone não foi executada. É necessário confirmar o sistema do celular para integrar uma forma adequada de iniciar o host. Em iPhone, Node/Termux não oferece esse caminho; é necessária uma aplicação nativa compatível ou outro modelo de conexão.

O link HTTP de rede local permite sincronização da partida, mas navegadores podem bloquear GPS fora de contexto seguro. GPS de jogadores nesse arranjo depende de integração nativa ou HTTPS confiável; isso ainda não foi validado no telefone.

## Mapa na área do jogador

O mapa é a área principal, com HUD sobreposto e menu compacto. Em celular vertical, uma imagem horizontal é apresentada verticalmente; ao girar o celular, volta à orientação original. Objetivos e participantes acompanham a mesma transformação, com textos legíveis. A visão inicial mostra todo o campo delimitado. Dois dedos ampliam; depois de ampliar, arrastar move o mapa automaticamente. Centralizar volta à visão completa, na qual arrastar rola a tela. Não há botão para alternar modos de gesto.

## Implantação

1. Use um serviço que execute Node.js 24 continuamente e tenha disco persistente. GitHub Pages sozinho não executa o servidor.
2. Configure as variáveis acima; use HTTPS e `SECURE_COOKIES=true` em produção. O GPS exige HTTPS (ou localhost).
3. Faça proxy das rotas normais e `/api/stream` para o mesmo servidor. Preserve o cabeçalho Host original; desative buffering para SSE e permita conexões longas. Não exponha o arquivo SQLite.
4. Execute uma única instância: este aplicativo possui uma partida corrente e usa SQLite local. Múltiplas instâncias precisariam de banco e canal de eventos compartilhados.
5. Execute os testes antes de publicar. Faça backup do banco: pare o serviço e copie o arquivo SQLite e seus arquivos WAL/SHM, se existirem; alternativamente use backup online próprio do SQLite. Guarde backups fora do Git.

Não foi realizado deploy nem validado um provedor de hospedagem real.

## Fluxos e preservação de dados

- Operador cria uma partida aberta, recebe apresentação e tutorial de seis etapas. Configurar/aplicar não inicia o jogo. O botão final exige revisão confirmada, nome, local, mapa e objetivos necessários ao modo selecionado.
- Jogadores aguardam na sala de espera; SSE atualiza as telas ao iniciar. Jogadores que chegam depois entram em uma vaga da equipe escolhida. Reconexões preservam a sessão, vidas, placar e horários.
- Durante o jogo, mapa, modos, vagas e vidas iniciais ficam bloqueados para evitar invalidar a partida. Demais definições podem ser alteradas pelo operador, com registro e sincronização.
- Definições são somente leitura para jogadores. HIT, respawn, bomba, captura de zonas e registro de bandeiras são processados no servidor. Cronômetros continuam após atualizar o navegador e retomam do horário persistido quando o servidor reinicia.
- Benefícios de visibilidade são concedidos pelo operador quando a definição correspondente usa benefício temporário. A duração usa o campo existente de segundos. Coordenadas ocultas não são enviadas aos jogadores.
- O Histórico consulta o SQLite, por partida e busca textual, incluindo registros antigos. Reset e Nova partida arquivam a partida anterior e preservam o histórico.
- Os dados antigos em `df_airsoft_state_v7` ficam intactos no navegador. No primeiro acesso do operador, a opção de importação migra configurações, mapa, registros e, quando a partida estiver ao vivo, seu horário, placar e vidas. Dados simulados antigos são preservados como vagas sem movimentação fictícia. A migração só ocorre se ainda não há partida no servidor; nunca sobrescreve uma partida existente.
- Migrações SQLite v1/v2 são aditivas e idempotentes. Sessões são vinculadas à partida e não podem controlar uma vaga em uma partida posterior sem entrar novamente.

## Limites reais de localização

O editor original utiliza uma imagem sem georreferenciamento. O GPS real é coletado pelo botão **Ativar GPS**, mas não é convertido ficticiamente em coordenadas da imagem. O participante informa sua posição horizontal/vertical no mapa para objetivos por área. Desarme e raio de explosão em metros usam somente coordenadas GPS reais; distância indisponível não é inventada. Os testes do navegador usam uma tela móvel simulada; GPS físico e uso em campo com aparelhos reais não foram validados.

Bandeiras são registradas como objetivos capturados, sem inventar pontuação ou regras de transporte/entrega que não existiam na especificação. Caso o cliente tenha regras adicionais de bandeira ou georreferenciamento, elas precisam ser fornecidas para implementação.

## Verificação

```sh
npm run check
npm test
python tests/browser.py
```

Os testes do navegador requerem Python, Playwright e Chromium em `/usr/bin/chromium`. Não são dependências de produção. Os testes criam bancos temporários e sessões isoladas; a chave de teste não é usada em produção.

`tests/server.test.js`: autorização, fila de espera, SSE, validação, concorrência, isolamento de vagas, início único, HIT/respawn, persistência após reiniciar servidor, partidas anteriores, bomba/desarme, zonas, bandeiras, benefícios e importação de dados antigos.

`tests/browser.py`: dois contextos Chromium independentes (operador e jogador móvel), tutorial real, configuração/editor, espera/início sem reload, troca de modo, definições, edição ao vivo, HIT, reload, histórico/busca e largura móvel. Detecta erros JavaScript não tratados.
