const BASE_URL = "http://127.0.0.1:8000";

// Android版と同じテスト用ID
const CHAT_ID = "test-chat";

let token = localStorage.getItem("token");
let username = localStorage.getItem("username") || "";
let calendarLoadId = 0;
let eventLoadId = 0;
let calendarEvents = [];
let calendarReady = false;
let selectedCalendarDate = jstDateKey(new Date());
let displayedCalendarMonth = selectedCalendarDate.slice(0, 7);
let sessionVerified = false;
let sessionCheckId = 0;
let authGeneration = 0;
const protectedScreens = ["home", "chatScreen", "calendarScreen", "aiScreen"];

// -------------------------
// 画面切り替え
// -------------------------

function show(id, updateHistory = true) {
    const screens = ["login", "register", "sessionCheck", ...protectedScreens];
    if (!screens.includes(id)) id = sessionVerified ? "home" : "login";
    if (protectedScreens.includes(id) && !sessionVerified) id = "login";
    if (sessionVerified && (id === "login" || id === "register")) id = "home";
    for (const screen of screens) {
        document.getElementById(screen).hidden = screen !== id;
    }
    const insideApp = sessionVerified && protectedScreens.includes(id);
    document.getElementById("appNavigation").hidden = !insideApp;
    document.getElementById("calendarContext").hidden = !insideApp
        || !["calendarScreen", "aiScreen"].includes(id);
    document.querySelectorAll("[data-screen]").forEach(button => {
        if (button.dataset.screen === id) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    if (updateHistory && location.hash !== "#" + id) {
        history.pushState(null, "", "#" + id);
    }
    const heading = document.querySelector(`#${id} h1`);
    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({preventScroll: true});
    }
    window.scrollTo(0, 0);
}

window.addEventListener("popstate", () => show(location.hash.slice(1) || "home", false));
window.addEventListener("hashchange", () => show(location.hash.slice(1) || "home", false));

// -------------------------
// FastAPI通信
// -------------------------

async function request(path, options = {}) {
    const sentAuthorization = options.headers && options.headers.Authorization;
    const generation = authGeneration;
    const response = await fetch(BASE_URL + path, options);
    const data = await response.json().catch(() => ({}));
    if (sentAuthorization && generation !== authGeneration) {
        throw new Error("ログイン状態が変更されたため、処理を中止しました");
    }
    if (!response.ok) {
        if (response.status === 401 && sentAuthorization && token
            && sentAuthorization === `Bearer ${token}`) {
            logout("ログインの有効期限が切れたか、ログイン情報が無効です。再ログインしてください。");
        }
        const error = new Error(data.detail || data.message || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
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

        const enteredUsername = userInput.value;

        const data = await request(
            "/login",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username: enteredUsername,
                    password: passwordInput.value
                })
            }
        );

        message.textContent =
            data.message || "";

        if (data.token) {

            token = data.token;
            username = data.username || enteredUsername;
            authGeneration++;
            sessionCheckId++;
            sessionVerified = true;
            passwordInput.value = "";

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
        document.getElementById("chatStatus");

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
        document.getElementById("chatStatus");

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
    const form = document.getElementById("eventForm");
    const button = document.getElementById("createEventButton");
    const status = document.getElementById("manualEventStatus");
    if (button.disabled) return;
    const calendarId = getSelectedCalendarId();
    if (!calendarId) return;
    const title = document.getElementById("manualTitle").value.trim();
    const start = document.getElementById("manualStart").value;
    const end = document.getElementById("manualEnd").value;
    const location = document.getElementById("manualLocation").value.trim();
    const description = document.getElementById("manualDescription").value.trim();

    if (!title || !start || !end) {
        status.textContent = "タイトル・開始日時・終了日時を入力してください";
        return;
    }
    const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const startAt = start + ":00+09:00";
    const endAt = end + ":00+09:00";
    if (!datePattern.test(start) || !datePattern.test(end)
        || !Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt))) {
        status.textContent = "日時を正しく入力してください";
        return;
    }
    if (Date.parse(endAt) <= Date.parse(startAt)) {
        status.textContent = "終了日時は開始日時より後にしてください";
        return;
    }
    const calendarName = document.getElementById("calendarSelect").selectedOptions[0].textContent;
    if (!confirm(`「${calendarName}」に「${title}」を登録しますか？`)) return;

    const requestToken = token;
    button.disabled = true;
    status.textContent = "予定を登録しています...";
    try {
        const data = await request("/events", {
            method: "POST",
            headers: auth(true),
            body: JSON.stringify({
                calendarId, title, startAt, endAt,
                location: location || null,
                description: description || null,
                source: "manual",
                status: "confirmed"
            })
        });
        if (token !== requestToken) return;
        form.reset();
        status.textContent = "予定を登録しました！ ID: " + data.eventId;
        if (document.getElementById("calendarSelect").value === calendarId) {
            selectedCalendarDate = jstDateKey(new Date(startAt));
            displayedCalendarMonth = selectedCalendarDate.slice(0, 7);
            await loadEvents();
        }
    } catch (error) {
        if (token !== requestToken) return;
        status.textContent = "予定登録エラー：" + error.message;
    } finally {
        button.disabled = false;
    }
}

// -------------------------
// ログアウト
// -------------------------

function logout(message = "") {
    sessionVerified = false;
    sessionCheckId++;
    authGeneration++;

    localStorage.removeItem("token");
    localStorage.removeItem("username");

    token = null;
    username = "";
    calendarLoadId++;
    eventLoadId++;
    calendarEvents = [];
    calendarReady = false;
    selectedCalendarDate = jstDateKey(new Date());
    displayedCalendarMonth = selectedCalendarDate.slice(0, 7);
    renderMonthCalendar();
    document.getElementById("eventForm").reset();
    document.getElementById("manualEventStatus").textContent = "";
    document.getElementById("calendarSelect").replaceChildren(new Option("カレンダーを選択してください", ""));
    document.getElementById("eventList").replaceChildren();
    document.getElementById("eventsStatus").textContent = "カレンダーを選択してください";

    document.getElementById(
        "user"
    ).value = "";

    document.getElementById(
        "pass"
    ).value = "";

    document.getElementById("messages").replaceChildren();
    document.getElementById("extractResult").replaceChildren();
    for (const id of ["chat", "eventText", "rpass"]) document.getElementById(id).value = "";
    for (const id of ["status", "chatStatus", "registerMsg", "who"]) document.getElementById(id).textContent = "";
    document.getElementById("loginMsg").textContent = message;
    show("login");
}

// -------------------------
// ページ起動時
// -------------------------

async function verifySession() {
    const checkId = ++sessionCheckId;
    if (!token) {
        show(location.hash === "#register" ? "register" : "login");
        return;
    }
    const desiredScreen = location.hash.slice(1);
    sessionVerified = false;
    show("sessionCheck", false);
    document.getElementById("sessionMessage").textContent = "サーバーにログイン状態を確認しています...";
    document.getElementById("sessionRetry").hidden = true;
    try {
        const data = await request("/session", {headers: auth()});
        if (checkId !== sessionCheckId || !token) return;
        username = data.username || "";
        localStorage.setItem("username", username);
        sessionVerified = true;
        document.getElementById("who").textContent = username;
        show(protectedScreens.includes(desiredScreen) ? desiredScreen : "home");
        await loadCalendars();
    } catch (error) {
        if (checkId !== sessionCheckId || !token) return;
        // Network/server errors do not establish that a token has expired.
        document.getElementById("sessionMessage").textContent =
            "ログイン状態を確認できませんでした。サーバーの起動・接続を確認して再接続してください。";
        document.getElementById("sessionRetry").hidden = false;
    }
}

verifySession();

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
        if (document.getElementById("calendarSelect").value === calendarId) {
            selectedCalendarDate = jstDateKey(new Date(startAt + ":00+09:00"));
            displayedCalendarMonth = selectedCalendarDate.slice(0, 7);
            await loadEvents();
        }

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
    // Invalidate pending event requests while calendar membership is refreshed.
    eventLoadId++;
    calendarEvents = [];
    calendarReady = false;
    renderMonthCalendar();
    document.getElementById("eventList").replaceChildren();
    document.getElementById("eventsStatus").textContent = "カレンダー一覧を取得しています...";
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
        await loadEvents();
        return true;

    } catch (error) {
        if (token !== requestToken || requestId !== calendarLoadId) return false;
        status.textContent =
            "カレンダー一覧取得エラー：" + error.message;
        document.getElementById("eventsStatus").textContent = "カレンダー一覧の取得に失敗しました。再度更新してください。";
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



function formatEventDate(value) {
    if (!value) return "日時未設定";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(date);
}

function jstDateKey(value) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(value);
    const part = type => parts.find(p => p.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function eventsOnDate(key) {
    const dayStart = Date.parse(key + "T00:00:00+09:00");
    return calendarEvents.filter(event => {
        const start = Date.parse(event.startAt);
        if (!Number.isFinite(start)) return false;
        const endValue = Date.parse(event.endAt);
        const end = Number.isFinite(endValue) && endValue > start ? endValue : start + 1;
        return start < dayStart + 86400000 && end > dayStart;
    });
}

function renderMonthCalendar() {
    const [year, month] = displayedCalendarMonth.split("-").map(Number);
    document.getElementById("calendarMonth").textContent = `${year}年${month}月`;
    const body = document.getElementById("calendarDays");
    body.replaceChildren();
    const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const today = jstDateKey(new Date());
    for (let i = 0; i < Math.ceil((offset + count) / 7) * 7; i++) {
        if (i % 7 === 0) body.appendChild(document.createElement("tr"));
        const cell = document.createElement("td");
        const day = i - offset + 1;
        if (day > 0 && day <= count) {
            const key = `${displayedCalendarMonth}-${String(day).padStart(2, "0")}`;
            const events = eventsOnDate(key);
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.date = key;
            button.disabled = !calendarReady;
            button.setAttribute("aria-pressed", String(selectedCalendarDate === key));
            button.setAttribute("aria-label", `${year}年${month}月${day}日、${events.length}件の予定`);
            if (key === today) button.setAttribute("aria-current", "date");
            const label = document.createElement("span");
            label.textContent = day;
            button.appendChild(label);
            if (events.length) {
                const badge = document.createElement("small");
                badge.className = "event-count";
                badge.textContent = `${events.length}件`;
                button.appendChild(badge);
                button.classList.add("has-events");
            }
            button.onclick = () => {
                selectedCalendarDate = key;
                renderMonthCalendar();
                document.getElementById("calendarDays").querySelector(`[data-date="${key}"]`).focus({preventScroll: true});
                renderCalendarEventList();
            };
            cell.appendChild(button);
        }
        body.lastElementChild.appendChild(cell);
    }
}

function changeCalendarMonth(direction) {
    const [year, month] = displayedCalendarMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + direction, 1));
    // Keep date input and formatting within a four-digit year.
    if (date.getUTCFullYear() < 100 || date.getUTCFullYear() > 9999) return;
    displayedCalendarMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    selectedCalendarDate = displayedCalendarMonth + "-01";
    renderMonthCalendar();
    renderCalendarEventList();
}

function showCalendarToday() {
    selectedCalendarDate = jstDateKey(new Date());
    displayedCalendarMonth = selectedCalendarDate.slice(0, 7);
    renderMonthCalendar();
    renderCalendarEventList();
}

function showAllCalendarEvents() {
    selectedCalendarDate = null;
    renderMonthCalendar();
    renderCalendarEventList();
}

function renderCalendarEventList() {
    const list = document.getElementById("eventList");
    list.replaceChildren();
    document.getElementById("eventListHeading").textContent = selectedCalendarDate
        ? `${selectedCalendarDate.replaceAll("-", "/")} の予定` : "すべての予定";
    if (!calendarReady) return;
    const events = selectedCalendarDate ? eventsOnDate(selectedCalendarDate) : calendarEvents;
    for (const event of events) {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = event.title || "無題の予定";
        const dates = document.createElement("p");
        dates.textContent = `${formatEventDate(event.startAt)} ～ ${formatEventDate(event.endAt)}（日本時間）`;
        item.append(title, dates);
        for (const [label, value] of [["場所", event.location], ["詳細", event.description]]) {
            if (!value) continue;
            const detail = document.createElement("p");
            detail.textContent = `${label}：${value}`;
            item.appendChild(detail);
        }
        list.appendChild(item);
    }
    document.getElementById("eventsStatus").textContent = events.length
        ? `${events.length}件の予定を表示しています`
        : selectedCalendarDate ? "この日の予定はありません" : "このカレンダーには予定がありません";
}

async function loadEvents() {
    const calendarId = document.getElementById("calendarSelect").value;
    const status = document.getElementById("eventsStatus");
    const requestId = ++eventLoadId;
    const requestToken = token;
    const isCurrent = () => requestId === eventLoadId && token === requestToken
        && document.getElementById("calendarSelect").value === calendarId;

    calendarEvents = [];
    calendarReady = false;
    renderMonthCalendar();
    renderCalendarEventList();
    if (!calendarId) {
        status.textContent = "カレンダーを選択してください";
        return;
    }
    status.textContent = "予定を取得しています...";
    try {
        const data = await request(`/calendars/${encodeURIComponent(calendarId)}/events`, {
            headers: auth()
        });
        if (!isCurrent()) return;
        if (!Array.isArray(data.events)) throw new Error("予定一覧の応答形式が不正です");
        calendarEvents = data.events;
        calendarReady = true;
        renderMonthCalendar();
        renderCalendarEventList();
    } catch (error) {
        if (!isCurrent()) return;
        status.textContent = "予定一覧取得エラー：" + error.message;
    }
}

renderMonthCalendar();
renderCalendarEventList();
