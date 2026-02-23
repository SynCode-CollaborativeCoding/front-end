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

// --- 2. LÓGICA DE AUTENTICACIÓN (LOGIN / SIGN UP) ---
linkSwitch.onclick = (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    
    const title = document.getElementById("auth-title");
    const switchText = document.getElementById("switch-text");

    if (isSignUp) {
        title.innerText = "Create Account";
        btnConnect.innerText = "Register & Join";
        switchText.innerHTML = 'Already have an account? <a href="#" id="link-switch">Log In</a>';
    } else {
        title.innerText = "Join SynCode Room";
        btnConnect.innerText = "Connect & Sync";
        switchText.innerHTML = 'Don\'t have an account? <a href="#" id="link-switch">Sign Up</a>';
    }
    document.getElementById("link-switch").onclick = linkSwitch.onclick;
};

// --- 3. CONEXIÓN WEBSOCKET ---
btnConnect.onclick = () => {
    myUsername = document.getElementById("username-input").value;
    room = document.getElementById("room-input").value;
    const password = document.getElementById("password-input").value;

    if (myUsername && room && password) {
        // Simulación de validación (DB fetch en el futuro)
        console.log(isSignUp ? "Registrando..." : "Logueando...", { myUsername, room });
        
        socket = new WebSocket(`ws://localhost:3000/room/${room}`);
        setupSocket();
    } else {
        alert("Please fill in all fields (Username, Password and Room).");
    }
};

function setupSocket() {
    socket.onopen = () => {
        // Enviamos el login inicial con nuestro avatar
        socket.send(JSON.stringify({ 
            type: 'login', 
            username: myUsername, 
            avatar: selectedAvatar 
        }));
        
        // Cambio de vista
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("chat-app").style.display = "flex";
        document.getElementById("room-display").innerText = "Room: " + room;

        // Update user list al entrar
        updateUserList();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'set-id':
                myId = data.id;
                break;

            case 'user-connected':
                // Notificar en el chat y pedir historial si somos los más antiguos
                appendMessage("System", `User ${data.id} joined the workspace`, "#5865F2", false);
                checkAndSendHistory(data.id);
                break;

            case 'login':
                // Guardar datos de otros usuarios
                dbUsers[data.authorId] = { username: data.username, avatar: data.avatar };
                updateUserList();
                break;

            case 'history-sync':
                // Sincronización total al entrar (Código + Chat)
                editor.value = data.code;
                data.chat.forEach(m => appendMessage(m.user, m.text, getUsernameColor(m.user), false));
                chatHistory = data.chat;
                break;

            case 'code-update':
                // Actualizar editor solo si el contenido es diferente (evita bucles)
                if (data.content !== editor.value) {
                    editor.value = data.content;
                }
                break;

            case 'chat':
                appendMessage(data.user, data.text, getUsernameColor(data.user), false);
                chatHistory.push({ user: data.user, text: data.text });
                break;

            case 'user-disconnected':
                appendMessage("System", `User ${data.id} disconnected`, "#ff4444", false);
                delete dbUsers[data.id];
                updateUserList();
                break;
        }
    };
}

// --- 4. SINCRONIZACIÓN DE CÓDIGO Y ESTADO ---

// Cada vez que escribo, envío el código al servidor
editor.addEventListener('input', () => {
    socket.send(JSON.stringify({ 
        type: 'code-update', 
        content: editor.value 
    }));
});

function checkAndSendHistory(newId) {
    // Lógica del "Host": El usuario con el ID más bajo envía el estado actual al nuevo
    const userIds = Object.keys(dbUsers).map(id => parseInt(id));
    const isOldest = userIds.every(id => id >= myId);

    if (isOldest && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'history-sync',
            targetId: newId,
            code: editor.value,
            chat: chatHistory
        }));
    }
}

// --- 5. CHAT Y UI ---

function appendMessage(user, text, color, isOwn) {
    const div = document.createElement("div");
    const isMe = user === myUsername || isOwn;
    div.className = `message-row ${isMe ? 'own-message' : 'other-message'}`;
    
    div.innerHTML = `
        <div class="bubble">
            <strong style="color:${color}">${user}</strong><br>
            <span class="msg-content">${text}</span>
        </div>`;
        
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateUserList() {
    const list = document.getElementById("users-list");
    // Limpiar la lista
    list.innerHTML = "";
    
    // You
    const selfLi = document.createElement("li");
    selfLi.className = "user-item";
    selfLi.innerHTML = `
        <img src="${selectedAvatar}" class="avatar">
        <span>${myUsername} (You)</span>
    `;
    list.appendChild(selfLi);
    
    for (let id in dbUsers) {
        const user = dbUsers[id];
        
        const li = document.createElement("li");
        li.className = "user-item";
        li.innerHTML = `
            <img src="${user.avatar}" class="avatar">
            <span>${user.username}</span>
        `;
        list.appendChild(li);
    }
}

function toggleSidebar() {
    const layout = document.getElementById("main-layout");
    const btnShow = document.getElementById("btn-show-sidebar");
    
    layout.classList.toggle("sidebar-hidden");
    
    // Mostrar/ocultar el botón de "abrir" según el estado
    if (layout.classList.contains("sidebar-hidden")) {
        btnShow.style.display = "block";
    } else {
        btnShow.style.display = "none";
    }
}

function toggleChat() {
    const chat = document.getElementById("chat-collapsible");
    chat.classList.toggle("chat-hidden");
}

// El chat se abre automáticamente al recibir un mensaje si está cerrado
const originalAppendMessage = appendMessage;
appendMessage = function(user, text, color, isOwn) {
    originalAppendMessage(user, text, color, isOwn);
    if (!isOwn) {
        document.getElementById("chat-collapsible").classList.remove("chat-hidden");
    }
};

// Enviar mensajes
function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;

    const msgObj = { 
        type: 'chat', 
        user: myUsername, 
        text: text,
        targetId: targetId // Reservado para mensajes privados... en el futuro
    };

    socket.send(JSON.stringify(msgObj));
    appendMessage(myUsername, text, getUsernameColor(myUsername), true);
    chatHistory.push({ user: myUsername, text: text });
    msgInput.value = "";
}

document.getElementById("btn-send").onclick = sendMessage;
msgInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

// Emojis
document.querySelectorAll(".emoji-btn").forEach(btn => {
    btn.onclick = () => {
        msgInput.value += btn.innerText;
        msgInput.focus();
    };
});

// Helper: Color único por usuario
function getUsernameColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}