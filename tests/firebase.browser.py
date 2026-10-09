"""Integration browser checks; requires Python Playwright and installed Chromium."""
import os, tempfile, subprocess, json, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
cache=Path("/tmp/firebase-sdk");cache.mkdir(exist_ok=True)
for part in ["app","auth","database","functions"]:
 target=cache/("firebase-"+part+".js")
 if not target.exists(): target.write_bytes(urllib.request.urlopen("https://www.gstatic.com/firebasejs/10.10.0/"+target.name,timeout=30).read())
with tempfile.TemporaryDirectory() as temp:
 env=dict(os.environ,OPERATOR_KEY='test-operator-secret',DATABASE_PATH=temp+'/game.sqlite',PORT='3107',HOST='127.0.0.1')
 server=subprocess.Popen(['python','-u','-m','http.server','3107','--bind','127.0.0.1'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 import time
 time.sleep(.4)
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   operator_context=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True)
   player_context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   op=operator_context.new_page();player=player_context.new_page();errors=[]
   for page in [op,player]:
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://www.gstatic.com/firebasejs/10.10.0/*',lambda route:route.fulfill(path='/tmp/firebase-sdk/'+route.request.url.rsplit('/',1)[-1],content_type='text/javascript'))
    page.goto('http://127.0.0.1:3107/?emulator')
   player.locator('[data-role="player"]').click();player.locator('#openRegister').click();expect(player.locator('#registerModal')).to_be_visible()
   player.locator('#registerName').fill('Jogador móvel');player.locator('#registerEmail').fill('mobile@example.test');player.locator('#registerPassword').fill('mobile-password-123');player.locator('#registerConfirm').fill('different-password');player.locator('#registerSubmit').click();expect(player.locator('#registerError')).to_have_text('As senhas não coincidem.')
   player.locator('#registerConfirm').fill('mobile-password-123');player.locator('#registerSubmit').click();expect(player.locator('#loginModal')).to_be_visible();expect(player.locator('#loginEmail')).to_have_value('mobile@example.test');assert player.locator('#loginName').count()==0
   player.locator('#loginKey').fill('wrong-password');player.locator('#loginSubmit').click();expect(player.locator('#loginError')).to_contain_text('inválidos')
   player.locator('#forgotPassword').click();expect(player.locator('#loginStatus')).to_contain_text('instruções de recuperação');player.locator('#loginKey').fill('mobile-password-123');player.locator('#loginSubmit').click();expect(player.locator('#joinModal')).to_be_visible();expect(player.locator('#accountName')).to_contain_text('Jogador móvel');player.locator('#loginTeam').select_option('B');player.locator('#joinSubmit').click()
   expect(player.locator('#playerWait')).to_be_visible()
   op.locator('[data-role="organizer"]').click();op.locator('#loginEmail').fill('operator@example.test');op.locator('#loginKey').fill('test-password-123');op.locator('#loginSubmit').click();expect(op.locator('#joinModal')).to_be_visible();op.locator('#joinSubmit').click()
   expect(op.locator('#operatorIntro')).to_be_visible();op.locator('#tutorialBegin').click()
   expect(op.locator('#tutorialProgress')).to_have_text('Etapa 1 de 6')
   op.locator('[data-apply-modal="modesModal"]').click();expect(op.locator('#tutorialProgress')).to_have_text('Etapa 2 de 6')
   op.locator('#oName').fill('Partida integrada');op.locator('#oLoc').fill('Campo Falcons');op.locator('#oDur').fill('60');op.locator('[data-apply-modal="rulesModal"]').click()
   expect(player.locator('#playerReady')).to_be_visible();expect(player.locator('#pName')).to_have_text('Partida integrada')
   expect(op.locator('#tutorialProgress')).to_have_text('Etapa 3 de 6');op.locator('#btnGenMap').click();op.locator('[data-apply-modal="mapModal"]').click()
   expect(op.locator('#tutorialProgress')).to_have_text('Etapa 4 de 6')
   op.locator('.editor-tool').filter(has_text='Base').click();op.locator('#mapEditorCanvas').click(position={'x':100,'y':100})
   op.locator('.editor-tool').filter(has_text='Bandeira').click();op.locator('#mapEditorCanvas').click(position={'x':250,'y':100})
   op.locator('#mapEditorApply').click();expect(op.locator('#tutorialProgress')).to_have_text('Etapa 5 de 6')
   op.locator('#confirmStart').check();expect(op.locator('#tutorialProgress')).to_have_text('Etapa 6 de 6')
   player.locator('#btnConfirm').click();expect(player.locator('#btnConfirm')).to_contain_text('CONFIRMADA')
   op.locator('#btnStartMatch').click();expect(op.locator('#playerLive')).to_be_visible();expect(player.locator('#playerLive')).to_be_visible()
   # Touch gestures scroll at fit size, then pinch and pan automatically after zoom.
   surface=player.locator('#playerMapSurface');canvas=player.locator('#playerMapCanvas')
   bounds=canvas.bounding_box()
   assert bounds['height'] >= 844*.5, 'map must be the main player area on a phone'
   expect(surface).to_have_attribute('data-orientation','portrait')
   assert player.locator('#playerMapDragToggle').count()==0, 'gestures must not require a mode button'
   cdp=player_context.new_cdp_session(player)
   def swipe(dx,dy):
    box=canvas.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for i in range(1,9):
     cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+dx*i/8,'y':y+dy*i/8}]})
     player.wait_for_timeout(35)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    player.wait_for_timeout(350)
   player.locator('[data-screen="player"]').evaluate('(el)=>el.scrollTop=0')
   swipe(0,-90)
   assert player.locator('[data-screen="player"]').evaluate('(el)=>el.scrollTop') > 25, 'touching map should not trap page scrolling'
   player.locator('[data-screen="player"]').evaluate('(el)=>el.scrollTop=0');player.wait_for_timeout(300)
   # Pinch with two fingers automatically zooms; dragging then pans without a mode selector.
   box=canvas.bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-30,'y':cy},{'x':cx+30,'y':cy}]})
   for i in range(1,9):
    spread=30+30*i/8;cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-spread,'y':cy},{'x':cx+spread,'y':cy}]});player.wait_for_timeout(35)
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});player.wait_for_timeout(250)
   expect(player.locator('#playerZoomValue')).to_have_text('200%')
   before_image=canvas.screenshot();before_scroll=player.locator('[data-screen="player"]').evaluate('(el)=>el.scrollTop')
   swipe(-60,-35)
   assert canvas.screenshot()!=before_image, 'drag must move the zoomed map'
   assert abs(player.locator('[data-screen="player"]').evaluate('(el)=>el.scrollTop')-before_scroll)<5, 'map drag must not scroll page in map mode'
   player.locator('#playerMapCenter').click();expect(player.locator('#playerZoomValue')).to_have_text('100%')
   player.set_viewport_size({'width':844,'height':390});expect(surface).to_have_attribute('data-orientation','original');player.set_viewport_size({'width':390,'height':844});expect(surface).to_have_attribute('data-orientation','portrait')
   before=op.evaluate('import("./firebase-client.js").then(m=>m.request("/api/state"))')
   op.locator('#modeOperator').click();expect(op.locator('[data-screen="organizer"]')).to_be_visible();op.locator('#modePlayer').click();expect(op.locator('#playerLive')).to_be_visible()
   after=op.evaluate('import("./firebase-client.js").then(m=>m.request("/api/state"))')
   assert before['match']['startAt']==after['match']['startAt'] and before['match']['id']==after['match']['id']
   def action(name):
    if not player.locator('#'+name).is_visible():player.locator('#sessionMenu').click()
    player.locator('#'+name).click()
   expect(player.locator('#modeSwitch')).to_be_hidden();action('definitionsButton');expect(player.locator('#editDefinitions')).to_be_hidden();expect(player.locator('#definitionsList')).to_contain_text('Partida integrada');player.locator('#definitionsBack').click()
   op.locator('#modeOperator').click();op.locator('#openControlFromMenu').click();op.locator('#liveRespawnDelay').fill('0');op.locator('#btnApplyLiveRules').click()
   action('definitionsButton');expect(player.locator('#definitionsList')).to_contain_text('Respawn (s)');player.locator('#definitionsBack').click()
   player.locator('#btnHit').click();player.locator('#confirmOk').click();expect(player.locator('#pAlive')).to_contain_text('2 vida')
   player.reload();expect(player.locator('#playerLive')).to_be_visible();expect(player.locator('#pAlive')).to_contain_text('2 vida')
   action('historyButton');expect(player.locator('#historyList')).to_contain_text('Partida iniciada');expect(player.locator('#historyList')).to_contain_text('HIT registrado');player.locator('#historySearch').fill('HIT');expect(player.locator('#historyList')).to_contain_text('HIT');player.locator('#historyBack').click()
   action('logoutAccount');expect(player.locator('[data-screen="role"]')).to_be_visible();player.locator('[data-role="player"]').click();player.locator('#loginEmail').fill('mobile@example.test');player.locator('#loginKey').fill('mobile-password-123');player.locator('#loginSubmit').click();expect(player.locator('#joinModal')).to_be_visible();expect(player.locator('#accountName')).to_contain_text('Jogador móvel');player.locator('#joinSubmit').click();expect(player.locator('#playerLive')).to_be_visible();expect(player.locator('#pAlive')).to_contain_text('2 vida')
   assert player.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
   # Repeat the tutorial against a mobile operator viewport, test real highlight positioning.
   op.set_viewport_size({'width':390,'height':844});op.locator('#tutorialAgain').click();op.locator('#tutorialBegin').click();expect(op.locator('#tutorialShade')).to_be_visible();expect(op.locator('.tutorial-highlight')).to_be_visible();Path(root/'tests/artifacts').mkdir(exist_ok=True);op.screenshot(path=str(root/'tests/artifacts/operator-mobile-tutorial.png'),full_page=True);op.locator('#tutorialClose').click()
   Path(temp+'/mobile.png').parent.mkdir(exist_ok=True);player.screenshot(path=str(root/'tests/artifacts/player-mobile.png'),full_page=True)
   assert not errors, errors
   print(json.dumps({'result':'PASS','scenarios':['separate registration and login screens','password confirmation and invalid credentials','permanent profile and logout/login preserves lives','waiting before match','authorized Firebase operator login','six-step interactive tutorial','configuration and map editor','player waiting','Firebase realtime automatic start','operator/player switching preserves match','read-only definitions','live respawn update','HIT','reload','persistent history and search','mobile layout and tutorial','touch scrolling over map','automatic pinch and pan','automatic portrait and landscape orientation'],'page_errors':errors},ensure_ascii=False))
   browser.close()
 finally:
  server.terminate();server.wait(timeout=10)
