"""Exercise the actual event routes/auth helpers without starting Firebase or Gemini.

Only the relevant definitions are loaded from main.py: its top-level Firebase
initialization requires the developer's Windows credential file.
Run: python -m unittest discover -s python-server/tests -v
Requires the application's fastapi, httpx and PyJWT dependencies.
"""
import ast
from datetime import datetime, timezone, timedelta
from pathlib import Path
import unittest
from types import SimpleNamespace

import jwt
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from pydantic import BaseModel


class Document:
    def __init__(self, store, path):
        self.store, self.path = store, path
        self.id = path[-1]

    def get(self):
        data = self.store.get(self.path)
        return SimpleNamespace(exists=data is not None, to_dict=lambda: data)

    def set(self, data):
        self.store[self.path] = data

    def collection(self, name):
        return Collection(self.store, self.path + (name,))


class Collection:
    def __init__(self, store, path, condition=None):
        self.store, self.path, self.condition = store, path, condition

    def document(self, name=None):
        if name is None:
            name = f'event-{len(self.store)}'
        return Document(self.store, self.path + (name,))

    def where(self, name, op, value):
        assert op == '=='
        return Collection(self.store, self.path, (name, value))

    def stream(self):
        for path, data in list(self.store.items()):
            if path[:-1] != self.path:
                continue
            if self.condition and data.get(self.condition[0]) != self.condition[1]:
                continue
            yield SimpleNamespace(id=path[-1], to_dict=lambda d=data: d)


class EventRoutesTest(unittest.TestCase):
    def setUp(self):
        self.store = {}
        app = FastAPI()
        namespace = dict(app=app, security=HTTPBearer(), jwt=jwt,
                         SECRET_KEY='test-only-calendar-signing-key-123456',
                         HTTPAuthorizationCredentials=HTTPAuthorizationCredentials,
                         Depends=Depends, HTTPException=HTTPException,
                         BaseModel=BaseModel, datetime=datetime, timezone=timezone,
                         firestore=SimpleNamespace(SERVER_TIMESTAMP=datetime.now(timezone.utc)),
                         db=SimpleNamespace(collection=lambda name: Collection(self.store, (name,))))
        source = ast.parse((Path(__file__).parents[1] / 'main.py').read_text())
        names = {'get_current_uid', 'check_calendar_permission', 'EventCreate',
                 'create_event', 'get_calendar_events'}
        body = [node for node in source.body if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names]
        exec(compile(ast.Module(body=body, type_ignores=[]), 'main.py', 'exec'), namespace)
        self.client = TestClient(app)
        self.key = namespace['SECRET_KEY']
        self.auth = {'Authorization': 'Bearer ' + jwt.encode({'uid':'user'}, self.key, algorithm='HS256')}
        self.store['calendars', 'a', 'members', 'user'] = {'role':'owner'}
        self.store['calendars', 'b', 'members', 'user'] = {'role':'viewer'}

    def event(self, calendar='a', title='研究'):
        return dict(calendarId=calendar, title=title, startAt='2026-10-16T10:00:00+09:00',
                    endAt='2026-10-16T11:00:00+09:00', source='ai', status='confirmed')

    def test_create_then_list_and_filter(self):
        result = self.client.post('/events', json=self.event(), headers=self.auth)
        self.assertEqual(result.status_code, 200)
        self.store['events', 'private'] = dict(self.event('b'), startAt=datetime.now(timezone.utc))
        response = self.client.get('/calendars/a/events', headers=self.auth)
        self.assertEqual(response.status_code, 200)
        events = response.json()['events']
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['eventId'], result.json()['eventId'])
        self.assertEqual(events[0]['calendarId'], 'a')
        self.assertEqual(events[0]['title'], '研究')
        self.assertEqual(datetime.fromisoformat(events[0]['startAt']).utcoffset(), timedelta(hours=9))

    def test_empty(self):
        self.assertEqual(self.client.get('/calendars/a/events', headers=self.auth).json(), {'events':[]})

    def test_viewer_can_read_but_not_create(self):
        self.assertEqual(self.client.get('/calendars/b/events', headers=self.auth).status_code, 200)
        self.assertEqual(self.client.post('/events', json=self.event('b'), headers=self.auth).status_code, 403)

    def test_editor_can_read(self):
        self.store['calendars','a','members','user'] = {'role':'editor'}
        self.assertEqual(self.client.get('/calendars/a/events', headers=self.auth).status_code, 200)

    def test_nonmember_denied(self):
        self.assertEqual(self.client.get('/calendars/private/events', headers=self.auth).status_code, 404)

    def test_unknown_role_denied(self):
        self.store['calendars','a','members','user'] = {'role':'unknown'}
        self.assertEqual(self.client.get('/calendars/a/events', headers=self.auth).status_code, 403)

    def test_invalid_and_expired_tokens(self):
        for token in ['broken', jwt.encode({'uid':'user','exp':0}, self.key, algorithm='HS256')]:
            response = self.client.get('/calendars/a/events', headers={'Authorization':'Bearer '+token})
            self.assertEqual(response.status_code, 401)
        self.assertIn(self.client.get('/calendars/a/events').status_code, [401,403])

    def test_chronological_order_with_missing_date(self):
        for name, start in [('later',datetime(2026,10,18,tzinfo=timezone.utc)),
                            ('undated',None), ('earlier',datetime(2026,10,16,tzinfo=timezone.utc))]:
            self.store['events',name] = dict(self.event(), startAt=start)
        events = self.client.get('/calendars/a/events', headers=self.auth).json()['events']
        self.assertEqual([event['eventId'] for event in events], ['earlier','later','undated'])


if __name__ == '__main__':
    unittest.main()
