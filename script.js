// --- VARIABLES GLOBALES ---
let socket, myId, myUsername, room, selectedAvatar, authToken, codeEditor;
let isSignUp = false;
let chatHistory = [];
let dbUsers = {}; 
const HOST = "localhost:3000";

// --- 1. INICIALIZACIÓN SEGURA (ESPERAR AL DOM) ---
document.addEventListener("DOMContentLoaded", () => {
    // Referencias al DOM
    const editorTextArea = document.getElementById('editor');
    const avatarGrid = document.getElementById("avatar-grid");
    const linkSwitch = document.getElementById("link-switch");
    const btnConnect = document.getElementById("btn-connect");
    const msgInput = document.getElementById("msg-input");
    const btnSend = document.getElementById("btn-send");

    // A. Inicializar CodeMirror (si existe el textarea)
    if (editorTextArea) {
        codeEditor = CodeMirror.fromTextArea(editorTextArea, {
            lineNumbers: true, mode: "python", theme: "dracula",
            tabSize: 4, indentUnit: 4, lineWrapping: true
        });
        codeEditor.on("change", (instance, change) => {
            if (change.origin !== "setValue" && socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'code-update', content: instance.getValue() }));
            }
        });
    }

    // B. Inicializar Avatares (si existe el grid)
    if (avatarGrid) {
        for (let i = 1; i <= 8; i++) {
            const img = document.createElement("img");
            img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`;
            img.className = i === 1 ? "avatar-option selected" : "avatar-option";
            if(i === 1) selectedAvatar = img.src;
            img.onclick = () => {
                document.querySelectorAll(".avatar-option").forEach(el => el.classList.remove("selected"));
                img.classList.add("selected");
                selectedAvatar = img.src;
            };
            avatarGrid.appendChild(img);
        }
        avatarGrid.style.display = "none";
    }

    // C. Eventos de Auth
    if (linkSwitch) {
        linkSwitch.onclick = (e) => {
            e.preventDefault();
            isSignUp = !isSignUp;
            const title = document.getElementById("auth-title");
            const switchText = document.getElementById("switch-text");
            const roomInput = document.getElementById("room-input");
            
            if (isSignUp) {
                title.innerText = "Create Account";
                btnConnect.innerText = "Register & Join";
                switchText.innerHTML = 'Already have an account? <a href="#" id="link-switch">Log In</a>';
                avatarGrid.style.display = "grid";
                roomInput.style.display = "none";
            } else {
                title.innerText = "Join SynCode Room";
                btnConnect.innerText = "Connect & Sync";
                switchText.innerHTML = 'Don\'t have an account? <a href="#" id="link-switch">Sign Up</a>';
                avatarGrid.style.display = "none";
                roomInput.style.display = "block";
            }
            // Re-vincular porque el innerHTML destruye el nodo anterior
            document.getElementById("link-switch").onclick = linkSwitch.onclick;
        };
    }

    if (btnConnect) btnConnect.onclick = handleAuth;
    if (btnSend) btnSend.onclick = sendMessage;
    if (msgInput) msgInput.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

    // D. Emojis
    document.querySelectorAll(".emoji-btn").forEach(btn => {
        btn.onclick = () => { if(msgInput) { msgInput.value += btn.innerText; msgInput.focus(); } };
    });
});

// --- 2. LÓGICA DE AUTENTICACIÓN Y WEBSOCKET ---

async function handleAuth() {
    const userIn = document.getElementById("username-input").value;
    const passIn = document.getElementById("password-input").value;
    const roomIn = document.getElementById("room-input").value;

    if (!userIn || !passIn || (!isSignUp && !roomIn)) return alert("Fill all fields");

    const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login';
    try {
        const resp = await fetch(`http://${HOST}${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userIn, password: passIn, avatar: selectedAvatar })
        });
        const data = await resp.json();
        if (resp.ok) {
            if (isSignUp) { alert("Created!"); document.getElementById("link-switch").click(); }
            else { 
                authToken = data.token; myUsername = data.username; 
                selectedAvatar = data.avatar; room = roomIn;
                connectWebSocket(); 
            }
        } else alert(data.error);
    } catch (e) { alert("Server error"); }
}

function connectWebSocket() {
    socket = new WebSocket(`ws://${HOST}/room/${room}`);
    socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'login', username: myUsername, avatar: selectedAvatar, token: authToken }));
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("chat-app").style.display = "flex";
        document.getElementById("room-display").innerText = "Room: " + room;
        updateUserList();
        setTimeout(() => codeEditor.refresh(), 100);
    };
    socket.onmessage = handleSocketMessage;
}

function handleSocketMessage(event) {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'set-id': myId = data.id; break;
        case 'user-connected': checkAndSendHistory(data.id); break;
        case 'login':
            dbUsers[data.authorId] = { username: data.username, avatar: data.avatar };
            updateUserList();
            break;
        case 'history-sync':
            codeEditor.setValue(data.code);
            data.chat.forEach(m => appendMessage(m.user, m.text, getUsernameColor(m.user), false));
            chatHistory = data.chat;
            dbUsers = { ...dbUsers, ...data.users };
            updateUserList();
            break;
        case 'code-update':
            if (data.content !== codeEditor.getValue()) {
                const cur = codeEditor.getCursor();
                codeEditor.setValue(data.content);
                codeEditor.setCursor(cur);
            }
            break;
        case 'chat':
            appendMessage(data.user, data.text, getUsernameColor(data.user), false);
            chatHistory.push({ user: data.user, text: data.text });
            break;
        case 'user-disconnected':
            delete dbUsers[data.id];
            updateUserList();
            break;
    }
}

function checkAndSendHistory(newId) {
    const ids = Object.keys(dbUsers).map(Number);
    if (ids.every(id => id >= myId) && socket?.readyState === 1) {
        socket.send(JSON.stringify({
            type: 'history-sync', targetId: newId,
            code: codeEditor.getValue(), chat: chatHistory,
            users: { [myId]: { username: myUsername, avatar: selectedAvatar }, ...dbUsers }
        }));
    }
}

function appendMessage(user, text, color, isOwn) {
    const log = document.getElementById("messages-log");
    const div = document.createElement("div");
    const isMe = user === myUsername || isOwn;
    div.className = `message-row ${isMe ? 'own-message' : 'other-message'}`;
    div.innerHTML = `<div class="bubble"><strong style="color:${color}">${user}</strong><br>${text}</div>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function updateUserList() {
    const list = document.getElementById("users-list");
    list.innerHTML = `<li class="user-item"><img src="${selectedAvatar}" class="avatar"><span>${myUsername} (You)</span></li>`;
    for (let id in dbUsers) {
        const u = dbUsers[id];
        list.innerHTML += `<li class="user-item"><img src="${u.avatar}" class="avatar"><span>${u.username}</span></li>`;
    }
}

function toggleSidebar() {
    document.getElementById("main-layout").classList.toggle("sidebar-hidden");
    document.getElementById("btn-show-sidebar").style.display = 
        document.getElementById("main-layout").classList.contains("sidebar-hidden") ? "block" : "none";
    setTimeout(() => codeEditor.refresh(), 350);
}

function toggleChat() {
    document.getElementById("chat-collapsible").classList.toggle("chat-hidden");
    setTimeout(() => codeEditor.refresh(), 350);
}

function changeLanguage() {
    const langIndicator = document.getElementById("lang-indicator");
    if (codeEditor.getOption("mode") === "python") {
        codeEditor.setOption("mode", "javascript");
        langIndicator.innerText = "🟨 JavaScript";
        langIndicator.style.color = "#333";
        langIndicator.style.backgroundColor = "#f0db4f";
        langIndicator.style.border = "1px solid #000000";
    } else {
        codeEditor.setOption("mode", "python");
        langIndicator.innerText = "🐍 Python";
        langIndicator.style.color = "#ffde57";
        langIndicator.style.backgroundColor = "#3776ab";
        langIndicator.style.border = "1px solid #ffde57";
    }
    codeEditor.refresh();
}

function sendMessage() {
    const inp = document.getElementById("msg-input");
    if (!inp.value.trim()) return;
    socket.send(JSON.stringify({ type: 'chat', user: myUsername, text: inp.value }));
    appendMessage(myUsername, inp.value, getUsernameColor(myUsername), true);
    chatHistory.push({ user: myUsername, text: inp.value });
    inp.value = "";
}

function getUsernameColor(u) {
    let hash = 0;
    for (let i = 0; i < u.length; i++) hash = u.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}

// DEBUG FUNCTIONS
// Fill editor with dummy code
function fillDummyCode() {
    const pythonDummy = `def greet_users(names):
    """Prints a simple greeting to each user in a list."""
    for name in names:
        if name.lower() == "admin":
            print(f"Hello {name}, would you like to see a status report?")
        else:
            print(f"Hello {name}, thank you for logging in again.")

# Example usage
user_list = ["Alice", "Bob", "Admin", "Charlie"]
greet_users(user_list)`;
    const jsDummy = `function greetUsers(names) {
    names.forEach(name => {
        if (name.toLowerCase() === "admin") {
            console.log("Hello ${name}, would you like to see a status report?");
        } else {
            console.log("Hello ${name}, thank you for logging in again.");
        }
    });
}`;
    const currentMode = codeEditor.getOption("mode");
    if (currentMode === "python") {
        codeEditor.setValue(pythonDummy);
    } else {
        codeEditor.setValue(jsDummy);
    }

    // Send update to others
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'code-update', content: codeEditor.getValue() }));
    }
}