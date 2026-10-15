"""Browser checks with real event route/auth definitions and an in-memory datastore.
Run: python web-app/tests/event_list_smoke.py (requires Playwright and Chromium).
"""
import importlib.util,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('api_tests', root/'python-server/tests/test_calendar_events.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
fixture=module.EventRoutesTest();fixture.setUp()
client=fixture.client; store=fixture.store
assert client.post('/events',headers=fixture.auth,json=fixture.event(title='<img src=x onerror=alert(1)>')).status_code==200
store['events','b-event']=dict(fixture.event('b','別のカレンダー'),startAt=module.datetime(2026,10,17,4,tzinfo=module.timezone.utc),endAt=None)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page();errors=[];dialogs=[];held=[];hold=[False];fail=[False]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
 token=fixture.auth['Authorization'].split(' ',1)[1]
 page.add_init_script('localStorage.setItem("token",'+json.dumps(token)+');localStorage.setItem("username","tester")')
 def handle(r):
  req=r.request
  if req.url.startswith('http://app.test/'):
   name=req.url.rsplit('/',1)[-1] or 'index.html'
   r.fulfill(body=(root/'web-app'/name).read_bytes(),content_type={'html':'text/html','js':'application/javascript','css':'text/css'}[name.split('.')[-1]]);return
  path=req.url.split(':8000')[-1]
  if path=='/calendars':r.fulfill(json={'calendars':[{'calendarId':'a','name':'研究用'},{'calendarId':'b','name':'授業用'}]});return
  if path=='/extract-events':r.fulfill(json={'events':[{'title':'AI予定','start':'2026-10-18T10:00:00+09:00','end':'2026-10-18T11:00:00+09:00'}]});return
  if path.endswith('/events') and req.method=='GET' and fail[0]:r.fulfill(status=500,json={'detail':'取得失敗'});return
  response=client.request(req.method,path,headers={'Authorization':req.headers.get('authorization','')},**({'json':req.post_data_json} if req.method=='POST' else {}))
  if hold[0] and path=='/calendars/a/events':held.append((r,response));return
  r.fulfill(status=response.status_code,body=response.content,content_type='application/json')
 page.route('**/*',handle)
 page.goto('http://app.test/index.html');page.wait_for_function('document.querySelector("#calendarSelect").options.length===3')
 assert page.inner_text('#eventsStatus')=='カレンダーを選択してください'
 page.select_option('#calendarSelect','a');page.wait_for_function('document.querySelectorAll("#eventList li").length===1')
 assert '2026/10/16 10:00' in page.inner_text('#eventList')
 assert page.locator('#eventList img').count()==0
 assert '<img src=x' in page.inner_text('#eventList')
 print('PASS authorized calendar list, JST conversion, titles rendered as text',flush=True)
 page.select_option('#calendarSelect','b');page.wait_for_function('document.querySelector("#eventList").textContent.includes("別のカレンダー")')
 assert '研究' not in page.inner_text('#eventList') and '日時未設定' in page.inner_text('#eventList')
 print('PASS switching calendars and missing date',flush=True)
 page.select_option('#calendarSelect','a');page.wait_for_function('document.querySelector("#eventList").textContent.includes("<img")')
 page.fill('#eventText','日曜研究');page.click('button[onclick="extractEvents()"]');page.wait_for_selector('#extractResult button');page.click('#extractResult button')
 page.wait_for_function('document.querySelectorAll("#eventList li").length===2')
 assert 'AI予定' in page.inner_text('#eventList')
 print('PASS real event creation route followed by automatic list refresh (fake datastore)',flush=True)
 fail[0]=True;page.click('button[onclick="loadEvents()"]');page.wait_for_function('document.querySelector("#eventsStatus").textContent.includes("取得失敗")');assert page.locator('#eventList li').count()==0
 fail[0]=False;store.pop(('events','b-event'));page.select_option('#calendarSelect','b');page.wait_for_function('document.querySelector("#eventsStatus").textContent.includes("予定がありません")')
 print('PASS error and empty states clear previous results',flush=True)
 hold[0]=True;page.select_option('#calendarSelect','a');page.wait_for_timeout(100);assert held
 page.select_option('#calendarSelect','b');page.wait_for_function('document.querySelector("#eventsStatus").textContent.includes("予定がありません")')
 r,response=held.pop();r.fulfill(status=response.status_code,body=response.content,content_type='application/json');page.wait_for_timeout(100)
 assert page.locator('#eventList li').count()==0
 print('PASS stale response cannot overwrite newly selected calendar',flush=True)
 page.select_option('#calendarSelect','a');page.wait_for_timeout(100);assert held
 page.click('button[onclick="logout()"]')
 r,response=held.pop();r.fulfill(status=response.status_code,body=response.content,content_type='application/json');page.wait_for_timeout(100)
 assert page.locator('#eventList li').count()==0 and page.locator('#login').is_visible()
 assert page.input_value('#calendarSelect')==''
 assert not errors,errors
 print('PASS logout clears list and ignores pending response; no JS errors',flush=True)
 b.close()
