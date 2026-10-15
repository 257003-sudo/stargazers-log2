const BASE_URL = "http://127.0.0.1:8000";

// Android版と同じテスト用ID
const CHAT_ID = "test-chat";
const CALENDAR_ID = "zQbayVLgx9HNvJ9c0vBW";

let token = localStorage.getItem("token");
let username = localStorage.getItem("username") || "";
let calendarLoadId = 0;

// -------------------------
// 画面切り替え
// -------------------------

function show(id) {
    const screens = ["login", "register", "home"];

    for (const screen of screens) {
        document.getElementById(screen).hidden = screen !== id;
    }
}

// -------------------------
// FastAPI通信
// -------------------------

async function request(path, options = {}) {

    const response = await fetch(BASE_URL + path, options);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.detail ||
            data.message ||
            `HTTP ${response.status}`
        );
    }

    return data;
}

function auth(json = false) {

    const headers = {
        "Authorization": `Bearer ${token}`
    };

    if (json) {
        headers["Content-Type"] = "application/json";
    }

    return headers;
}

// -------------------------
// ログイン
// -------------------------

async function login() {

    const userInput =
        document.getElementById("user");

    const passwordInput =
        document.getElementById("pass");

    const message =
        document.getElementById("loginMsg");

    try {

        username = userInput.value;

        const data = await request(
            "/login",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username: username,
                    password: passwordInput.value
                })
            }
        );

        message.textContent =
            data.message || "";

        if (data.token) {

            token = data.token;

            localStorage.setItem(
                "token",
                token
            );

            localStorage.setItem(
                "username",
                username
            );

            document.getElementById(
                "who"
            ).textContent = username;

            show("home");
            await loadCalendars();
        }

    } catch (error) {

        message.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// 新規登録
// -------------------------

async function register() {

    const usernameInput =
        document.getElementById("ruser");

    const passwordInput =
        document.getElementById("rpass");

    const message =
        document.getElementById("registerMsg");

    try {

        const data = await request(
            "/register",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username: usernameInput.value,
                    password: passwordInput.value
                })
            }
        );

        message.textContent =
            data.message;

    } catch (error) {

        message.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// メッセージ送信
// -------------------------

async function sendMessage() {

    const chatInput =
        document.getElementById("chat");

    const status =
        document.getElementById("status");

    try {

        const data = await request(
            "/messages",
            {
                method: "POST",

                headers: auth(true),

                body: JSON.stringify({
                    chatId: CHAT_ID,
                    text: chatInput.value
                })
            }
        );

        status.textContent =
            "メッセージ送信成功: " +
            data.messageId;

    } catch (error) {

        status.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// メッセージ取得
// -------------------------

async function getMessages() {

    const messageArea =
        document.getElementById("messages");

    const status =
        document.getElementById("status");

    try {

        const data = await request(
            "/messages/" + CHAT_ID,
            {
                headers: auth()
            }
        );

        messageArea.replaceChildren();

        for (const message of data.messages || []) {

            const element =
                document.createElement("div");

            element.textContent =
                `${message.senderId}: ${message.text}`;

            messageArea.appendChild(element);
        }

        status.textContent =
            "メッセージ取得成功";

    } catch (error) {

        status.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// カレンダー作成
// -------------------------

async function createCalendar() {

    const status =
        document.getElementById("status");

    try {

        const data = await request(
            "/calendars",
            {
                method: "POST",

                headers: auth(true),

                body: JSON.stringify({
                    name: "テストカレンダー",
                    type: "personal"
                })
            }
        );

        const selectedId = document.getElementById("calendarSelect").value;
        const refreshed = await loadCalendars(selectedId || data.calendarId);

        if (refreshed) {
            status.textContent = "カレンダー作成成功: " + data.calendarId;
        }

    } catch (error) {

        status.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// カレンダー取得
// -------------------------

async function getCalendar() {

    const status =
        document.getElementById("status");

    try {


const calendarId = getSelectedCalendarId();

if (!calendarId) {
    return;
}

const data = await request(
    "/calendars/" + calendarId,
    {
        headers: auth()
    }
);


        status.textContent =
            `カレンダー取得成功
ID: ${data.calendarId}
名前: ${data.name}
種類: ${data.type}
所有者: ${data.ownerId}`;

    } catch (error) {

        status.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// イベント作成
// -------------------------

async function createEvent() {

    const status =
        document.getElementById("status");

    try {

        const data = await request(
            "/events",
            {
                method: "POST",

                headers: auth(true),

                body: JSON.stringify({

                    calendarId:
                        CALENDAR_ID,

                    title:
                        "Webテストイベント",

                    startAt:
                        "2026-09-29T10:00:00+09:00",

                    endAt:
                        "2026-09-29T11:00:00+09:00",

                    location:
                        "Webテスト場所",

                    description:
                        "Webからのイベント作成テスト",

                    source:
                        "manual",

                    status:
                        "confirmed"
                })
            }
        );

        status.textContent =
            "イベント作成成功: " +
            data.eventId;

    } catch (error) {

        status.textContent =
            "通信エラー: " + error.message;
    }
}

// -------------------------
// ログアウト
// -------------------------

function logout() {

    localStorage.removeItem("token");
    localStorage.removeItem("username");

    token = null;
    username = "";

    document.getElementById(
        "user"
    ).value = "";

    document.getElementById(
        "pass"
    ).value = "";

    show("login");
}

// -------------------------
// ページ起動時
// -------------------------

if (token) {

    document.getElementById(
        "who"
    ).textContent = username;

    show("home");
    loadCalendars();

} else {

    show("login");
}

async function extractEvents() {
    const text = document.getElementById("eventText").value.trim();
    const result = document.getElementById("extractResult");

    result.textContent = "";

    if (!text) {
        result.textContent = "予定を入力してください";
        return;
    }

    result.textContent = "AIが予定を抽出しています...";

    try {
        const data = await request("/extract-events", {
            method: "POST",
            headers: auth(true),
            body: JSON.stringify({ text: text })
        });

        result.textContent = "";

        if (!data.events || data.events.length === 0) {
            result.textContent = "予定が見つかりませんでした";
            return;
        }


for (const event of data.events) {
    const item = document.createElement("div");

    const title = document.createElement("input");
    title.value = event.title || "";
    title.placeholder = "予定のタイトル";

    const start = document.createElement("input");
    start.type = "datetime-local";
    start.value = event.start
        ? event.start.slice(0, 16)
        : "";

    const end = document.createElement("input");
    end.type = "datetime-local";
    end.value = event.end
        ? event.end.slice(0, 16)
        : "";

    const note = document.createElement("p");
    note.textContent = "内容と日時を確認・修正してください";

    item.appendChild(note);
    item.appendChild(title);
    item.appendChild(start);
    item.appendChild(end);
    const registerButton = document.createElement("button");
registerButton.textContent = "カレンダーに登録";


registerButton.onclick = async () => {
    const calendarId = getSelectedCalendarId();
    if (!calendarId) return;
    const select = document.getElementById("calendarSelect");
    const calendarName = select.selectedOptions[0].textContent;

    const eventTitle = title.value.trim();
    const startAt = start.value;
    const endAt = end.value;

    if (!eventTitle || !startAt || !endAt) {
        alert("タイトル・開始日時・終了日時を入力してください");
        return;
    }

    if (endAt <= startAt) {
        alert("終了日時は開始日時より後にしてください");
        return;
    }

    if (!confirm(`「${calendarName}」にこの予定を登録しますか？`)) {
        return;
    }

    registerButton.disabled = true;

    try {
        const data = await request("/events", {
            method: "POST",
            headers: auth(true),
            body: JSON.stringify({
                calendarId: calendarId,
                title: eventTitle,
                startAt: startAt + ":00+09:00",
                endAt: endAt + ":00+09:00",
                location: null,
                description: null,
                source: "ai",
                status: "confirmed"
            })
        });

        alert("予定を登録しました！ ID: " + data.eventId);
        registerButton.textContent = "登録済み";

    } catch (error) {
        alert("登録エラー：" + error.message);
        registerButton.disabled = false;
    }
};


item.appendChild(registerButton);

    result.appendChild(item);
}

    } catch (error) {
        result.textContent = "エラー：" + error.message;
    }
}

async function loadCalendars(preferredId) {
    const select = document.getElementById("calendarSelect");
    const status = document.getElementById("status");

    const selectedId = preferredId === undefined ? select.value : preferredId;
    const requestToken = token;
    const requestId = ++calendarLoadId;
    status.textContent = "カレンダー一覧を取得しています...";

    try {
        const data = await request("/calendars", {
            method: "GET",
            headers: auth()
        });

        if (token !== requestToken || requestId !== calendarLoadId) return false;
        select.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "カレンダーを選択してください";
        select.appendChild(placeholder);

        for (const calendar of data.calendars) {
            const option = document.createElement("option");

            option.value = calendar.calendarId;
            option.textContent = calendar.name;

            select.appendChild(option);
        }

        select.value = Array.from(select.options).some(option => option.value === selectedId)
            ? selectedId : "";
        status.textContent =
            data.calendars.length + "件のカレンダーを取得しました";
        return true;

    } catch (error) {
        if (token !== requestToken || requestId !== calendarLoadId) return false;
        status.textContent =
            "カレンダー一覧取得エラー：" + error.message;
        return false;
    }
}

function getSelectedCalendarId() {
    const select = document.getElementById("calendarSelect");
    const calendarId = select.value;

    if (!calendarId) {
        alert("カレンダーを選択してください");
        return null;
    }

    return calendarId;
}

