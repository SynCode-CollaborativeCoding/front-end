// --- VARIABLES GLOBALES ---
let socket;
let myId = null;
let myUsername = "";
let room = "";
let selectedAvatar = "";
let targetId = null;
let isSignUp = false;
let chatHistory = [];
let dbUsers = {}; // Almacena {id: {username, avatar}}
let authToken = null; // JWT
const HOST = "localhost:3000";

// --- ELEMENTOS DEL DOM ---
const editor = document.getElementById('editor');
const chatMessages = document.getElementById("messages-log");
const msgInput = document.getElementById("msg-input");
const btnConnect = document.getElementById("btn-connect");
const linkSwitch = document.getElementById("link-switch");

// --- 1. INICIALIZACIÓN DE AVATARES ---
const avatarGrid = document.getElementById("avatar-grid");
for (let i = 1; i <= 8; i++) {
    const img = document.createElement("img");
    // Public Avatar api
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

// --- 2. LÓGICA DE AUTENTICACIÓN (LOGIN / SIGN UP) ---
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
    document.getElementById("link-switch").onclick = linkSwitch.onclick;
};

btnConnect.onclick = async () => {
    const usernameInput = document.getElementById("username-input").value;
    const passwordInput = document.getElementById("password-input").value;
    const roomInput = document.getElementById("room-input").value;

    if (!usernameInput || !passwordInput || (isSignUp && !selectedAvatar) || (!isSignUp && !roomInput)) {
        alert("Please fill in all fields.");
        return;
    }

    const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login';
    const payload = { username: usernameInput, password: passwordInput, avatar: selectedAvatar };

    try {
        const response = await fetch(`http://${HOST}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            if (isSignUp) {
                alert("Account created! Now you can log in.");
                linkSwitch.click();
            } else {
                authToken = data.token;
                myUsername = data.username;
                selectedAvatar = data.avatar;
                room = roomInput;
                
                localStorage.setItem('syncode_token', authToken);
                connectWebSocket();
            }
        } else {
            alert(data.error || "Authentication failed");
        }
    } catch (error) {
        alert("Error connecting to server.");
    }
};

// --- 3. WEBSOCKET ---

function connectWebSocket() {
    socket = new WebSocket(`ws://${HOST}/room/${room}`);
    setupSocket();
}

function setupSocket() {
    socket.onopen = () => {
        socket.send(JSON.stringify({ 
            type: 'login', 
            username: myUsername, 
            avatar: selectedAvatar,
            token: authToken 
        }));
        
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("chat-app").style.display = "flex";
        document.getElementById("room-display").innerText = "Room: " + room;
        updateUserList();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'set-id': myId = data.id; break;
            case 'user-connected':
                appendMessage("System", `User ${data.id} joined`, "#5865F2", false);
                checkAndSendHistory(data.id);
                break;
            case 'login':
                dbUsers[data.authorId] = { username: data.username, avatar: data.avatar };
                updateUserList();
                break;
            case 'history-sync':
                editor.value = data.code;
                data.chat.forEach(m => appendMessage(m.user, m.text, getUsernameColor(m.user), false));
                chatHistory = data.chat;
                dbUsers = { ...dbUsers, ...data.users };
                updateUserList();
                break;
            case 'code-update':
                if (data.content !== editor.value) editor.value = data.content;
                break;
            case 'chat':
                appendMessage(data.user, data.text, getUsernameColor(data.user), false);
                chatHistory.push({ user: data.user, text: data.text });
                break;
            case 'user-disconnected':
                appendMessage("System", `User ${data.id} left`, "#ff4444", false);
                delete dbUsers[data.id];
                updateUserList();
                break;
        }
    };
}

// --- 4. SINCRONIZACIÓN DEL EDITOR ---

editor.addEventListener('input', () => {
    socket.send(JSON.stringify({ type: 'code-update', content: editor.value }));
});

function checkAndSendHistory(newId) {
    const userIds = Object.keys(dbUsers).map(id => parseInt(id));
    const isOldest = userIds.every(id => id >= myId);
    if (isOldest && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'history-sync', targetId: newId,
            code: editor.value, chat: chatHistory,
            users: { [myId]: { username: myUsername, avatar: selectedAvatar }, ...dbUsers }
        }));
    }
}

// --- 5. CHAT Y UI ---

function appendMessage(user, text, color, isOwn) {
    const div = document.createElement("div");
    const isMe = user === myUsername || isOwn;
    div.className = `message-row ${isMe ? 'own-message' : 'other-message'}`;
    div.innerHTML = `<div class="bubble"><strong style="color:${color}">${user}</strong><br>${text}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateUserList() {
    const list = document.getElementById("users-list");
    list.innerHTML = "";
    
    // Usuario local
    const selfLi = document.createElement("li");
    selfLi.className = "user-item";
    selfLi.innerHTML = `<img src="${selectedAvatar}" class="avatar"><span>${myUsername} (You)</span>`;
    list.appendChild(selfLi);
    
    // Otros usuarios
    for (let id in dbUsers) {
        const user = dbUsers[id];
        const li = document.createElement("li");
        li.className = "user-item";
        li.innerHTML = `<img src="${user.avatar}" class="avatar"><span>${user.username}</span>`;
        list.appendChild(li);
    }
}

// --- 6. CONTROLES DE INTERFAZ ---

function toggleSidebar() {
    const layout = document.getElementById("main-layout");
    const btnShow = document.getElementById("btn-show-sidebar");
    layout.classList.toggle("sidebar-hidden");
    btnShow.style.display = layout.classList.contains("sidebar-hidden") ? "block" : "none";
}

function toggleChat() {
    document.getElementById("chat-collapsible").classList.toggle("chat-hidden");
}

function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    socket.send(JSON.stringify({ type: 'chat', user: myUsername, text: text }));
    appendMessage(myUsername, text, getUsernameColor(myUsername), true);
    chatHistory.push({ user: myUsername, text: text });
    msgInput.value = "";
}

document.getElementById("btn-send").onclick = sendMessage;
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

document.querySelectorAll(".emoji-btn").forEach(btn => {
    btn.onclick = () => { msgInput.value += btn.innerText; msgInput.focus(); };
});

// --- UTILIDADES ---

function getUsernameColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}