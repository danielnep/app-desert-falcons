"""Integration browser checks; requires Python Playwright and installed Chromium."""
import os, tempfile, subprocess, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temp:
 env=dict(os.environ,OPERATOR_KEY='test-operator-secret',DATABASE_PATH=temp+'/game.sqlite',PORT='3107',HOST='127.0.0.1')
 server=subprocess.Popen(['node','server.js'],cwd=root,env=env,stdout=subprocess.PIPE,text=True)
 assert 'disponível' in server.stdout.readline()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   operator_context=browser.new_context(viewport={'width':1280,'height':900})
   player_context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   op=operator_context.new_page();player=player_context.new_page();errors=[]
   for page in [op,player]:
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:3107')
   player.locator('[data-role="player"]').click();player.locator('#loginName').fill('Jogador móvel');player.locator('#loginTeam').select_option('B');player.locator('#loginSubmit').click()
   expect(player.locator('#playerWait')).to_be_visible()
   op.locator('[data-role="organizer"]').click();op.locator('#loginName').fill('Operador');op.locator('#loginKey').fill('test-operator-secret');op.locator('#loginSubmit').click()
   expect(op.locator('#operatorIntro')).to_be_visible();op.locator('#tutorialBegin').click()
   expect(op.locator('#tutorialProgress')).to_have_text('Etapa 1 de 6')
   op.locator('[data-apply-modal="modesModal"]').click();expect(op.locator('#tutorialProgress')).to_have_text('Etapa 2 de 6')
   op.locator('#oName').fill('Partida integrada');op.locator('#oLoc').fill('Campo Falcons');op.locator('#oDur').fill('60');op.locator('[data-apply-modal="rulesModal"]').click()
   expect(player.locator('#playerReady')).to_be_visible();expect(player.locator('#pName')).to_have_text('Partida integrada')
   expect(op.locator('#tutorialProgress')).to_have_text('Etapa 3 de 6');op.locator('#btnGenMap').click();op.locator('[data-apply-modal="mapModal"]').click()
   expect(op.locator('#tutorialProgress')).to_have_text('Etapa 4 de 6')
   op.locator('.editor-tool').filter(has_text='Base').click();op.locator('#mapEditorCanvas').click(position={'x':300,'y':200})
   op.locator('.editor-tool').filter(has_text='Bandeira').click();op.locator('#mapEditorCanvas').click(position={'x':450,'y':200})
   op.locator('#mapEditorApply').click();expect(op.locator('#tutorialProgress')).to_have_text('Etapa 5 de 6')
   op.locator('#confirmStart').check();expect(op.locator('#tutorialProgress')).to_have_text('Etapa 6 de 6')
   player.locator('#btnConfirm').click();expect(player.locator('#btnConfirm')).to_contain_text('CONFIRMADA')
   op.locator('#btnStartMatch').click();expect(op.locator('#playerLive')).to_be_visible();expect(player.locator('#playerLive')).to_be_visible()
   before=op.evaluate('fetch("/api/state").then(r=>r.json())')
   op.locator('#modeOperator').click();expect(op.locator('[data-screen="organizer"]')).to_be_visible();op.locator('#modePlayer').click();expect(op.locator('#playerLive')).to_be_visible()
   after=op.evaluate('fetch("/api/state").then(r=>r.json())')
   assert before['match']['startAt']==after['match']['startAt'] and before['match']['id']==after['match']['id']
   expect(player.locator('#modeSwitch')).to_be_hidden();player.locator('#definitionsButton').click();expect(player.locator('#editDefinitions')).to_be_hidden();expect(player.locator('#definitionsList')).to_contain_text('Partida integrada');player.locator('#definitionsBack').click()
   op.locator('#modeOperator').click();op.locator('#openControlFromMenu').click();op.locator('#liveRespawnDelay').fill('0');op.locator('#btnApplyLiveRules').click()
   player.locator('#definitionsButton').click();expect(player.locator('#definitionsList')).to_contain_text('Respawn (s)');player.locator('#definitionsBack').click()
   player.locator('#btnHit').click();player.locator('#confirmOk').click();expect(player.locator('#pAlive')).to_contain_text('2 vida')
   player.reload();expect(player.locator('#playerLive')).to_be_visible();expect(player.locator('#pAlive')).to_contain_text('2 vida')
   player.locator('#historyButton').click();expect(player.locator('#historyList')).to_contain_text('Partida iniciada');expect(player.locator('#historyList')).to_contain_text('HIT registrado');player.locator('#historySearch').fill('HIT');expect(player.locator('#historyList')).to_contain_text('HIT');player.locator('#historyBack').click()
   assert player.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
   # Repeat the tutorial against a mobile operator viewport, test real highlight positioning.
   op.set_viewport_size({'width':390,'height':844});op.locator('#tutorialAgain').click();op.locator('#tutorialBegin').click();expect(op.locator('#tutorialShade')).to_be_visible();expect(op.locator('.tutorial-highlight')).to_be_visible();Path(root/'tests/artifacts').mkdir(exist_ok=True);op.screenshot(path=str(root/'tests/artifacts/operator-mobile-tutorial.png'),full_page=True);op.locator('#tutorialClose').click()
   Path(temp+'/mobile.png').parent.mkdir(exist_ok=True);player.screenshot(path=str(root/'tests/artifacts/player-mobile.png'),full_page=True)
   assert not errors, errors
   print(json.dumps({'result':'PASS','scenarios':['waiting before match','operator authentication','six-step interactive tutorial','configuration and map editor','player waiting','SSE automatic start','operator/player switching preserves match','read-only definitions','live respawn update','HIT','reload','persistent history and search','mobile layout and tutorial'],'page_errors':errors},ensure_ascii=False))
   browser.close()
 finally:
  server.terminate();server.wait(timeout=10)
