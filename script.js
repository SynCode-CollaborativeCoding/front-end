// --- VARIABLES GLOBALES ---
let socket, myId, myUsername, room, myAvatar, authToken, codeEditor;
let selectedAvatar = null;
let isSignUp = false;
let chatHistory = [];
let dbUsers = {}; 
const HOST = "localhost:3000";

// --- 1. INICIALIZACIÓN SEGURA ---
document.addEventListener("DOMContentLoaded", () => {
    const editorTextArea = document.getElementById('editor');
    const avatarGrid = document.getElementById("avatar-grid");
    const linkSwitch = document.getElementById("link-switch");
    const btnConnect = document.getElementById("btn-connect");
    const msgInput = document.getElementById("msg-input");
    const btnSend = document.getElementById("btn-send");

    // A. Reconexión automática
    authToken = localStorage.getItem("authToken");
    myUsername = localStorage.getItem("myUsername");
    myAvatar = localStorage.getItem("myAvatar");
    room = localStorage.getItem("room");

    if (authToken && myUsername) {
        if (room) connectWebSocket();
        else showLobby();
    }

    // B. Inicializar CodeMirror
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

    // C. Avatares
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

    // D. Eventos UI & Auth
    if (linkSwitch) {
        linkSwitch.onclick = (e) => {
            e.preventDefault();
            isSignUp = !isSignUp;
            const title = document.getElementById("auth-title");
            if (isSignUp) {
                title.innerText = "Create Account";
                btnConnect.innerText = "Register & Join";
                document.getElementById("switch-text").innerHTML = 'Already have an account? <a href="#" id="link-switch">Log In</a>';
                avatarGrid.style.display = "grid";
            } else {
                title.innerText = "Join SynCode Room";
                btnConnect.innerText = "Connect & Sync";
                document.getElementById("switch-text").innerHTML = 'Don\'t have an account? <a href="#" id="link-switch">Sign Up</a>';
                avatarGrid.style.display = "none";
            }
            document.getElementById("link-switch").onclick = linkSwitch.onclick;
        };
    }

    if (btnConnect) btnConnect.onclick = handleAuth;
    if (btnSend) btnSend.onclick = sendMessage;
    if (msgInput) msgInput.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

    // E. Emojis
    document.querySelectorAll(".emoji-btn").forEach(btn => {
        btn.onclick = () => { if(msgInput) { msgInput.value += btn.innerText; msgInput.focus(); } };
    });

    // F. Botones de Modal Proyectos
    document.getElementById("btn-create-room-cancel").onclick = () => {
        document.getElementById("create-room-modal").style.display = "none";
    };
    document.getElementById("btn-cancel-import").onclick = () => {
        document.getElementById("import-project-modal").style.display = "none";
    };
});

// --- 2. AUTENTICACIÓN Y WEBSOCKET ---

async function handleAuth() {
    const userIn = document.getElementById("username-input").value;
    const passIn = document.getElementById("password-input").value;
    if (!userIn || (!isSignUp && !passIn)) return alert("Fill all fields");

    const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login';
    try {
        const resp = await fetch(`http://${HOST}${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userIn, password: passIn, avatar: selectedAvatar})
        });
        const data = await resp.json();
        if (resp.ok) {
            if (isSignUp) { 
                alert("Account created! Please log in.");
                document.getElementById("link-switch").click();
            } else { 
                authToken = data.token;
                myUsername = data.username;
                myAvatar = data.avatar;
                localStorage.setItem("authToken", authToken);
                localStorage.setItem("myUsername", myUsername);
                localStorage.setItem("myAvatar", myAvatar);
                showLobby();
            }
        } else alert(data.error);
    } catch (e) { alert("Server error connecting to API"); }
}

function connectWebSocket() {
    socket = new WebSocket(`ws://${HOST}/room/${room}?token=${authToken}`);
    
    socket.onopen = async () => {
        socket.send(JSON.stringify({ type: 'login', username: myUsername, avatar: myAvatar }));
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("chat-app").style.display = "flex";
        document.getElementById("room-display").innerText = "Room: " + room;
        document.getElementById("lobby-screen").style.display = "none";
        updateUserList();

        // P2P: Cargar proyecto si la sala está vacía
        setTimeout(async () => {
            if (Object.keys(dbUsers).length === 0) {
                try {
                    const resp = await fetch(`http://${HOST}/api/rooms/${room}/content`, {
                        headers: { 'Authorization': `Bearer ${authToken}` }
                    });
                    const data = await resp.json();
                    if (data.content) codeEditor.setValue(data.content);
                } catch (e) { console.error("Error loading project content", e); }
            }
        }, 500);
        setTimeout(() => codeEditor.refresh(), 100);
    };
    
    socket.onmessage = handleSocketMessage;
    socket.onclose = (e) => {
        if (e.code === 4004) {
            localStorage.removeItem("room");
            alert("Room does not exist.");
        };
        location.reload();
    };
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

// --- 3. GESTIÓN DE SALAS Y LOBBY ---

async function showLobby() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("chat-app").style.display = "none";
    document.getElementById("lobby-screen").style.display = "flex";
    try {
        const resp = await fetch(`http://${HOST}/api/rooms`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        renderRooms(await resp.json());
    } catch (e) { alert("Error loading rooms"); }
}

function renderRooms(roomsArray) {
    const container = document.getElementById("rooms-container");
    container.innerHTML = roomsArray.length === 0 ? "<p>No rooms found.</p>" : "";
    roomsArray.forEach(r => {
        const card = document.createElement("div");
        card.className = "room-card";
        card.innerHTML = `<h4>${r.room_name}</h4><p>${r.description || ''}</p>`;
        card.onclick = () => {
            room = r.room_name;
            localStorage.setItem("room", room);
            connectWebSocket();
        };
        container.appendChild(card);
    });
}

document.getElementById("btn-open-create-room").onclick = async () => {
    const select = document.getElementById("select-project-choice");
    select.innerHTML = '<option value="new">-- Create New Empty Project --</option>';
    try {
        const resp = await fetch(`http://${HOST}/api/projects`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const projects = await resp.json();
        projects.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id; opt.innerText = p.project_name;
            select.appendChild(opt);
        });
    } catch (e) { console.error(e); }
    document.getElementById("create-room-modal").style.display = "flex";
};

document.getElementById("btn-create-room-save").onclick = async () => {
    const roomName = document.getElementById("new-room-name").value;
    const roomDesc = document.getElementById("new-room-desc").value;
    const projectChoice = document.getElementById("select-project-choice").value;
    const newProjectName = document.getElementById("new-project-name-input").value;

    if (!roomName) return alert("Room name required");

    let finalProjectId = projectChoice;

    try {
        // A. Si elige crear un proyecto nuevo
        if (projectChoice === "new") {
            if (!newProjectName) return alert("Please name your new project");
            
            const projResp = await fetch(`http://${HOST}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ project_name: newProjectName })
            });
            const projData = await projResp.json();
            finalProjectId = projData.id; // Obtenemos el ID del proyecto recién creado
        }

        // B. Crear la sala vinculada al proyecto (nuevo o existente)
        const roomResp = await fetch(`http://${HOST}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ 
                room_name: roomName, 
                description: roomDesc, 
                actual_project_id: finalProjectId 
            })
        });

        if (roomResp.ok) {
            document.getElementById("create-room-modal").style.display = "none";
            showLobby();
        } else {
            alert("Error creating room");
        }
    } catch (e) {
        console.error(e);
        alert("Server error");
    }
};

document.getElementById("select-project-choice").onchange = (e) => {
    const input = document.getElementById("new-project-name-input");
    input.style.display = (e.target.value === "new") ? "block" : "none";
};

// --- 4. IMPORTAR Y GUARDAR PROYECTOS ---

document.getElementById("btn-save").onclick = async () => {
    try {
        const resp = await fetch(`http://${HOST}/api/projects/save-current`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ room_name: room, content: codeEditor.getValue() })
        });
        if (resp.ok) alert("Saved! ✅");
        else alert((await resp.json()).error);
    } catch (e) { alert("Error saving"); }
};

document.getElementById("btn-import").onclick = async () => {
    const select = document.getElementById("select-import-project");
    select.innerHTML = '<option value="">-- Select Project --</option>';
    try {
        const resp = await fetch(`http://${HOST}/api/projects`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        (await resp.json()).forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.last_content; // Guardamos el contenido directamente en el value
            opt.innerText = p.project_name;
            select.appendChild(opt);
        });
        document.getElementById("import-project-modal").style.display = "flex";
    } catch (e) { alert("Error loading projects"); }
};

document.getElementById("btn-confirm-import").onclick = () => {
    const content = document.getElementById("select-import-project").value;
    if (content !== undefined) {
        codeEditor.setValue(content);
        // El evento 'change' de CodeMirror ya se encarga de enviarlo por WebSocket
        document.getElementById("import-project-modal").style.display = "none";
    }
};

// --- 5. FUNCIONES AUXILIARES ---

function checkAndSendHistory(newId) {
    const ids = Object.keys(dbUsers).map(Number);
    if (ids.every(id => id >= myId) && socket?.readyState === 1) {
        socket.send(JSON.stringify({
            type: 'history-sync', targetId: newId,
            code: codeEditor.getValue(), chat: chatHistory,
            users: { [myId]: { username: myUsername, avatar: myAvatar }, ...dbUsers }
        }));
    }
}

function sendMessage() {
    const inp = document.getElementById("msg-input");
    if (!inp.value.trim()) return;
    const msg = { type: 'chat', user: myUsername, text: inp.value };
    socket.send(JSON.stringify(msg));
    appendMessage(myUsername, inp.value, getUsernameColor(myUsername), true);
    chatHistory.push({ user: myUsername, text: inp.value });
    inp.value = "";
}

function appendMessage(user, text, color, isOwn) {
    const log = document.getElementById("messages-log");
    const div = document.createElement("div");
    div.className = `message-row ${user === myUsername || isOwn ? 'own-message' : 'other-message'}`;
    div.innerHTML = `<div class="bubble"><strong style="color:${color}">${user}</strong><br>${text}</div>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function updateUserList() {
    const list = document.getElementById("users-list");
    list.innerHTML = `<li class="user-item"><img src="${myAvatar}" class="avatar"><span>${myUsername} (You)</span></li>`;
    for (let id in dbUsers) {
        const u = dbUsers[id];
        list.innerHTML += `<li class="user-item"><img src="${u.avatar}" class="avatar"><span>${u.username}</span></li>`;
    }
}

function changeLanguage() {
    const lang = codeEditor.getOption("mode") === "python" ? "javascript" : "python";
    codeEditor.setOption("mode", lang);
    const indicator = document.getElementById("lang-indicator");
    indicator.innerText = lang === "python" ? "🐍 Python" : "🟨 JavaScript";
    indicator.style.backgroundColor = lang === "python" ? "#3776ab" : "#f0db4f";
}

function toggleSidebar() { document.getElementById("main-layout").classList.toggle("sidebar-hidden"); }
function toggleChat() { document.getElementById("chat-collapsible").classList.toggle("chat-hidden"); }
function logout() { localStorage.clear(); location.reload(); }
function changeRoom() { localStorage.removeItem("room"); location.reload(); }
function getUsernameColor(u) {
    let hash = 0;
    for (let i = 0; i < u.length; i++) hash = u.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}