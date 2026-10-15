import os
import time
import uuid
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
from google import genai
import firebase_admin
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import credentials, firestore
from argon2 import PasswordHasher
import jwt
from dotenv import load_dotenv

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from pydantic import BaseModel


load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")


cred = credentials.Certificate(
    r"C:\Users\PC_User\IdeaProjects\untitled1\src\intelij-80a96-firebase-adminsdk-fbsvc-d6164db51c.json"
)

firebase_admin.initialize_app(cred)
db = firestore.client()

print("Firestore接続成功")


limiter = Limiter(key_func=get_remote_address)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler
)


security = HTTPBearer()


def get_current_uid(
        credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=["HS256"]
        )

        uid = payload.get("uid")

        if uid is None:
            raise HTTPException(
                status_code=401,
                detail="ログインが必要です"
            )

        return uid

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="ログインの有効期限が切れています"
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="無効なログイン情報です"
        )


def check_calendar_permission(
        calendar_id: str,
        uid: str,
        required_roles: list[str]
):
    member_ref = (
        db.collection("calendars")
        .document(calendar_id)
        .collection("members")
        .document(uid)
    )

    member_doc = member_ref.get()

    if not member_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="カレンダーが見つかりません"
        )

    member_data = member_doc.to_dict()
    role = member_data.get("role")

    if role not in required_roles:
        raise HTTPException(
            status_code=403,
            detail="この操作をする権限がありません"
        )

    return role


@app.get("/")
def test():
    return {
        "message": "Pythonサーバー起動成功"
    }


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/login")
@limiter.limit("5/minute")
def login(
        request: Request,
        login_request: LoginRequest
):
    password_hasher = PasswordHasher()

    docs = db.collection("users").where(
        "username", "==", login_request.username
    ).limit(1).stream()

    doc = next(docs, None)

    if doc is None:
        return {
            "message": "ユーザー名またはパスワードが間違っています"
        }

    user_data = doc.to_dict()
    stored_hash = user_data.get("passwordHash")

    try:
        password_hasher.verify(
            stored_hash,
            login_request.password
        )

        uid = doc.id

        token = jwt.encode(
            {
                "uid": uid,
                "exp": int(time.time()) + 60 * 60 * 24
            },
            SECRET_KEY,
            algorithm="HS256"
        )

        return {
            "message": "ログイン成功",
            "username": login_request.username,
            "token": token
        }

    except Exception:
        return {
            "message": "ユーザー名またはパスワードが間違っています"
        }


class RegisterRequest(BaseModel):
    username: str
    password: str


@app.get("/login-status")
def login_status(token: str):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=["HS256"]
        )

        uid = payload.get("uid")

        if uid is None:
            return {
                "message": "未ログイン"
            }

        user_doc = db.collection("users").document(uid).get()

        if not user_doc.exists:
            return {
                "message": "未ログイン"
            }

        user_data = user_doc.to_dict()

        return {
            "message": "ログイン中",
            "username": user_data.get("username")
        }

    except Exception:
        return {
            "message": "未ログイン"
        }


@app.post("/register")
def register(request: RegisterRequest):
    print("登録処理開始:", request.username)

    existing_users = db.collection("users").where(
        "username", "==", request.username
    ).limit(1).stream()

    if next(existing_users, None) is not None:
        return {
            "message": "そのユーザー名はすでに使われています"
        }

    password_hasher = PasswordHasher()

    hashed_password = password_hasher.hash(
        request.password
    )

    uid = str(uuid.uuid4())

    db.collection("users").document(uid).set({
        "username": request.username,
        "passwordHash": hashed_password
    })

    return {
        "message": "ユーザー登録成功",
        "username": request.username
    }


class CalendarCreate(BaseModel):
    name: str
    type: str


@app.post("/calendars")
def create_calendar(
        data: CalendarCreate,
        uid: str = Depends(get_current_uid)
):
    calendar_ref = db.collection("calendars").document()

    calendar_ref.set({
        "name": data.name,
        "type": data.type,
        "ownerId": uid,
        "createdAt": firestore.SERVER_TIMESTAMP
    })

    calendar_ref.collection("members").document(uid).set({
        "role": "owner",
        "addedAt": firestore.SERVER_TIMESTAMP
    })

    return {
        "message": "カレンダー作成成功",
        "calendarId": calendar_ref.id
    }


@app.get("/calendars/{calendar_id}")
def get_calendar(
        calendar_id: str,
        uid: str = Depends(get_current_uid)
):
    check_calendar_permission(
        calendar_id,
        uid,
        ["owner", "editor", "viewer"]
    )

    calendar_ref = db.collection("calendars").document(calendar_id)

    calendar_doc = calendar_ref.get()

    if not calendar_doc.exists:
        raise HTTPException(
            status_code=404,
            detail="カレンダーが見つかりません"
        )

    calendar_data = calendar_doc.to_dict()

    return {
        "calendarId": calendar_id,
        "name": calendar_data.get("name"),
        "type": calendar_data.get("type"),
        "ownerId": calendar_data.get("ownerId")
    }
class EventCreate(BaseModel):
    calendarId: str
    title: str
    startAt: datetime
    endAt: datetime
    location: str | None = None
    description: str | None = None
    source: str
    status: str
@app.post("/events")
def create_event(
        data: EventCreate,
        uid: str = Depends(get_current_uid)
):
    check_calendar_permission(
        data.calendarId,
        uid,
        ["owner", "editor"]
    )

    event_ref = db.collection("events").document()

    event_ref.set({
        "calendarId": data.calendarId,
        "title": data.title,
        "startAt": data.startAt,
        "endAt": data.endAt,
        "location": data.location,
        "description": data.description,
        "source": data.source,
        "status": data.status,
        "createdBy": uid,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP
    })

    return {
        "message": "イベント作成成功",
        "eventId": event_ref.id
    }
class MessageCreate(BaseModel):
    chatId: str
    text: str
@app.post("/messages")
def create_message(
        data: MessageCreate,
        uid: str = Depends(get_current_uid)
):
    message_ref = (
        db.collection("chats")
        .document(data.chatId)
        .collection("messages")
        .document()
    )

    message_ref.set({
        "senderId": uid,
        "text": data.text,
        "createdAt": firestore.SERVER_TIMESTAMP
    })

    return {
        "message": "メッセージ送信成功",
        "messageId": message_ref.id
    }
@app.get("/messages/{chat_id}")
def get_messages(
        chat_id: str,
        uid: str = Depends(get_current_uid)
):
    messages_ref = (
        db.collection("chats")
        .document(chat_id)
        .collection("messages")
        .order_by("createdAt")
    )

    messages = []

    for doc in messages_ref.stream():
        data = doc.to_dict()

        messages.append({
            "messageId": doc.id,
            "senderId": data.get("senderId"),
            "text": data.get("text"),
            "createdAt": data.get("createdAt")
        })

    return {
        "messages": messages
    }

class EventExtractRequest(BaseModel):
    text: str


@app.post("/extract-events")
def extract_events(
        data: EventExtractRequest,
        uid: str = Depends(get_current_uid)
):
    client = genai.Client(
        api_key=os.getenv("GEMINI_API_KEY")
    )


    now_jst = datetime.now(JST)

    prompt = f"""
あなたは日本語の文章から予定を抽出するAIです。

現在の日本時間：
{now_jst.isoformat()}

次の文章から予定を抽出してください。

文章：
{data.text}

ルール：
1. 日時は日本時間（JST）で扱う。
2. 「今日」「明日」「来週」などは現在日時を基準に解釈する。
3. 開始日時と終了日時はISO 8601形式で返す。
4. 日時には必ず +09:00 を付ける。
5. 日時が特定できない場合は推測せず、空文字列を返す。
6. 予定が存在しない場合はeventsを空配列にする。

以下のJSON形式だけで返してください。

{{
  "events": [
    {{
      "title": "予定のタイトル",
      "start": "2026-10-11T14:00:00+09:00",
      "end": "2026-10-11T16:00:00+09:00"
    }}
  ]
}}
"""


    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=prompt,
        config={
            "response_mime_type": "application/json",
            "response_schema": {
                "type": "object",
                "properties": {
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "start": {"type": "string"},
                                "end": {"type": "string"}
                            },
                            "required": ["title", "start"]
                        }
                    }
                },
                "required": ["events"]
            }
        }
    )

    if not response.text:
        raise HTTPException(
            status_code=502,
            detail="Geminiから抽出結果を取得できませんでした"
        )

    result = response.parsed

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="予定抽出結果が不正です"
        )


    for event in result.get("events", []):
        for field in ("start", "end"):
            value = event.get(field)

            # 未確定の日時はnullとして扱う
            if value is None or value == "":
                event[field] = None
                continue

            try:
                parsed = datetime.fromisoformat(value)

                if parsed.utcoffset() != timedelta(hours=9):
                    raise ValueError("日本時間ではありません")

            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=422,
                    detail=f"{field}の日時形式が不正です"
                )

        if event["start"] is not None and event["end"] is not None:
            start = datetime.fromisoformat(event["start"])
            end = datetime.fromisoformat(event["end"])

            if end <= start:
                raise HTTPException(
                    status_code=422,
                    detail="終了日時が開始日時以前です"
                )


    return result


@app.get("/calendars")
def get_calendars(
        uid: str = Depends(get_current_uid)
):
    calendars = []

    docs = db.collection("calendars").stream()

    for doc in docs:
        member_doc = (
            doc.reference
            .collection("members")
            .document(uid)
            .get()
        )

        if not member_doc.exists:
            continue

        data = doc.to_dict()

        calendars.append({
            "calendarId": doc.id,
            "name": data.get("name"),
            "type": data.get("type"),
            "role": member_doc.to_dict().get("role")
        })

    return {
        "calendars": calendars
    }


@app.get("/calendars/{calendar_id}/events")
def get_calendar_events(
        calendar_id: str,
        uid: str = Depends(get_current_uid)
):
    check_calendar_permission(
        calendar_id,
        uid,
        ["owner", "editor", "viewer"]
    )

    # Filter by calendar first. Sort locally to avoid requiring a composite index.
    docs = db.collection("events").where(
        "calendarId", "==", calendar_id
    ).stream()
    events = []
    for doc in docs:
        data = doc.to_dict()
        events.append({
            "eventId": doc.id,
            "calendarId": calendar_id,
            "title": data.get("title"),
            "startAt": data.get("startAt"),
            "endAt": data.get("endAt"),
            "location": data.get("location"),
            "description": data.get("description"),
            "source": data.get("source"),
            "status": data.get("status")
        })

    events.sort(key=lambda event: (
        event["startAt"] or datetime.max.replace(tzinfo=timezone.utc),
        event["eventId"]
    ))
    return {"events": events}


@app.get("/session")
def get_session(uid: str = Depends(get_current_uid)):
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists:
        raise HTTPException(status_code=401, detail="ログイン情報が無効です")
    return {"uid": uid, "username": user_doc.to_dict().get("username", "")}
