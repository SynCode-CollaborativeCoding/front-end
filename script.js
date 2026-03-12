// --- VARIABLES GLOBALES ---
let socket, myId, myUsername, room, myAvatar, authToken, codeEditor;
let currentProjectId = null, currentProjectName = null;
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

        // Load current project info
        await loadProjectInfo();

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
        case 'project-changed':
            currentProjectId = data.projectId;
            currentProjectName = data.projectName;
            updateProjectDisplay();
            break;
        case 'user-disconnected':
            delete dbUsers[data.id];
            updateUserList();
            break;
    }
}

async function loadProjectInfo() {
    try {
        // Fetch all rooms to find the current one
        const roomsResp = await fetch(`http://${HOST}/api/rooms`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const rooms = await roomsResp.json();
        const currentRoom = rooms.find(r => r.room_name === room);

        if (currentRoom && currentRoom.actual_project_id) {
            currentProjectId = currentRoom.actual_project_id;

            // Fetch the project info (works even if user doesn't own it)
            const projectResp = await fetch(`http://${HOST}/api/projects/${currentProjectId}/info`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const project = await projectResp.json();

            if (project && project.project_name) {
                currentProjectName = project.project_name;
                updateProjectDisplay();
            }
        } else {
            currentProjectId = null;
            currentProjectName = null;
            document.getElementById("project-display").innerText = "Project: (None)";
        }
    } catch (e) {
        console.error("Error loading project info", e);
    }
}

function updateProjectDisplay() {
    if (currentProjectName) {
        document.getElementById("project-display").innerText = "Project: " + currentProjectName;
    } else {
        document.getElementById("project-display").innerText = "Project: (None)";
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
    const label = prompt("Version label (optional):", "");
    try {
        const resp = await fetch(`http://${HOST}/api/projects/save-current`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ 
                room_name: room, 
                content: codeEditor.getValue(),
                version_label: label || undefined
            })
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
        const projects = await resp.json();

        for (const p of projects) {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.innerText = p.project_name;
            opt.dataset.projectId = p.id;
            select.appendChild(opt);
        }
        document.getElementById("import-project-modal").style.display = "flex";
    } catch (e) { alert("Error loading projects"); }
};

document.getElementById("btn-confirm-import").onclick = async () => {
    const select = document.getElementById("select-import-project");
    const projectId = parseInt(select.value, 10);
    if (!projectId) return;

    try {
        const resp = await fetch(`http://${HOST}/api/projects/${projectId}/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const history = await resp.json();

        if (history.length === 0) {
            alert("Project has no saved versions yet");
            return;
        }

        // Get the latest version
        const latestVersion = history[0];
        codeEditor.setValue(latestVersion.content_snapshot);

        // Update room's actual_project_id
        const updateResp = await fetch(`http://${HOST}/api/rooms/${room}/project`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ project_id: projectId })
        });

        if (updateResp.ok) {
            // Update the current project variables and display
            const projResp = await fetch(`http://${HOST}/api/projects`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const projects = await projResp.json();
            const project = projects.find(p => p.id === projectId);
            if (project) {
                currentProjectId = projectId;
                currentProjectName = project.project_name;
                updateProjectDisplay();

                // Broadcast to all users in the room
                if (socket?.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'project-changed',
                        projectId: projectId,
                        projectName: project.project_name
                    }));
                }
            }
        } else {
            console.error("Failed to link project to room");
        }

        document.getElementById("import-project-modal").style.display = "none";
    } catch (e) {
        alert("Error loading project content");
        console.error(e);
    }
};

// --- 6. PROJECTS MENU ---

document.getElementById("btn-projects").onclick = async () => {
    document.getElementById("projects-menu-modal").style.display = "flex";
    await loadProjectsMenu();
};

document.getElementById("btn-close-projects-menu").onclick = () => {
    document.getElementById("projects-menu-modal").style.display = "none";
};

async function loadProjectsMenu() {
    try {
        const resp = await fetch(`http://${HOST}/api/projects`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const projects = await resp.json();

        const projectsList = document.getElementById("projects-list");
        projectsList.innerHTML = "";

        if (projects.length === 0) {
            projectsList.innerHTML = '<p style="color: #888;">No projects yet</p>';
            return;
        }

        projects.forEach(p => {
            const btn = document.createElement("button");
            btn.className = "tool-btn";
            btn.style.cssText = "text-align: left; padding: 12px; border: 1px solid #555; justify-content: flex-start;";
            btn.innerHTML = `<strong>${p.project_name}</strong><br><small style="color: #888; font-size: 0.85em;">${new Date(p.updated_at).toLocaleDateString()}</small>`;
            btn.onclick = () => loadProjectVersions(p.id, p.project_name);
            projectsList.appendChild(btn);
        });
    } catch (e) {
        console.error("Error loading projects menu", e);
        document.getElementById("projects-list").innerHTML = '<p style="color: red;">Error loading projects</p>';
    }
}

async function loadProjectVersions(projectId, projectName) {
    try {
        const resp = await fetch(`http://${HOST}/api/projects/${projectId}/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const history = await resp.json();

        document.getElementById("selected-project-name").innerText = `${projectName} - Versions`;
        document.getElementById("versions-section").style.display = "block";
        document.getElementById("no-selection").style.display = "none";

        const versionsList = document.getElementById("versions-list");
        versionsList.innerHTML = "";

        if (history.length === 0) {
            versionsList.innerHTML = '<p style="color: #888;">No versions saved yet</p>';
            return;
        }

        history.forEach((v, idx) => {
            const div = document.createElement("div");
            div.className = "tool-btn";
            div.style.cssText = "text-align: left; padding: 12px; border: 1px solid #555; cursor: pointer; display: flex; justify-content: space-between; align-items: center;";

            const label = v.version_label || `Auto-save ${idx + 1}`;
            const date = new Date(v.saved_at).toLocaleDateString();

            div.innerHTML = `
                <div>
                    <strong>${label}</strong><br>
                    <small style="color: #888;">by ${v.username} • ${date}</small>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="tool-btn success" style="padding: 6px 12px; font-size: 0.9em;" onclick="restoreVersion(${projectId}, ${v.id}, '${label.replace(/'/g, "\\'")}')">Restore</button>
                    <button class="tool-btn secondary" style="padding: 6px 12px; font-size: 0.9em;" onclick="showVersionPreview(${v.id}, ${projectId})">Preview</button>
                </div>
            `;
            versionsList.appendChild(div);
        });

        // Show preview of latest version by default
        if (history.length > 0) {
            showVersionPreview(history[0].id, projectId);
        }
    } catch (e) {
        console.error("Error loading versions", e);
        document.getElementById("versions-list").innerHTML = '<p style="color: red;">Error loading versions</p>';
    }
}

async function showVersionPreview(historyId, projectId) {
    try {
        const resp = await fetch(`http://${HOST}/api/projects/${projectId}/history/${historyId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const version = await resp.json();
        document.getElementById("version-preview").value = version.content_snapshot || "(empty)";
    } catch (e) {
        console.error("Error loading preview", e);
        document.getElementById("version-preview").value = "Error loading preview";
    }
}

async function restoreVersion(projectId, historyId, label) {
    const confirm = window.confirm(`Restore version: "${label}"?`);
    if (!confirm) return;

    try {
        const resp = await fetch(`http://${HOST}/api/projects/${projectId}/history/${historyId}/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
        });

        if (resp.ok) {
            alert("Version restored! ✅");

            // If this is the current project, update the editor
            if (projectId === currentProjectId) {
                const histResp = await fetch(`http://${HOST}/api/projects/${projectId}/history/${historyId}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const version = await histResp.json();
                codeEditor.setValue(version.content_snapshot);
            }

            // Reload versions list
            await loadProjectVersions(projectId, document.getElementById("selected-project-name").innerText.split(" - ")[0]);
        } else {
            alert("Error restoring version");
        }
    } catch (e) {
        console.error("Error restoring version", e);
        alert("Error restoring version");
    }
}

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