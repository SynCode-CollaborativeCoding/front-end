let socket;
let myId = null;
let myUsername = "";
let roomUsers = []; 
let chatHistory = [];

const editor = document.getElementById('editor');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chat-messages');

function connectToRoom() {
    myUsername = document.getElementById('username-input')?.value || "Anonymous";
    const roomId = document.getElementById('roomId').value;
    
    const serverUrl = `ws://localhost:3000/room/${roomId}`;
    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'login', username: myUsername }));
        appendMessage("Sistema", `Conectado como ${myUsername}`);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'set-id':
                myId = data.id;
                break;

            case 'user-connected':
                roomUsers.push(data.id);
                // Enviar el historial de código y chat
                checkAndSendHistory(data.id);
                break;

            case 'history-sync':
                editor.value = data.code;
                data.chat.forEach(msg => {
                    appendMessage(msg.user, msg.text, getUsernameColor(msg.user));
                    chatHistory.push(msg);
                });
                break;

            case 'code-update':
                if (data.content !== editor.value) editor.value = data.content;
                break;

            case 'chat':
                const color = getUsernameColor(data.user);
                appendMessage(data.user, data.text, color);
                chatHistory.push({ user: data.user, text: data.text });
                break;

            case 'user-disconnected':
                roomUsers = roomUsers.filter(id => id !== data.id);
                break;
        }
    };

    editor.addEventListener('input', () => {
        socket.send(JSON.stringify({ type: 'code-update', content: editor.value }));
    });
}

// History
function checkAndSendHistory(newUserId) {
    const isOldest = roomUsers.every(id => id >= myId);
    
    if (isOldest) {
        socket.send(JSON.stringify({
            type: 'history-sync',
            targetId: newUserId,
            code: editor.value,
            chat: chatHistory
        }));
    }
}

function appendMessage(user, text, color = "#aaa") {
    const msg = document.createElement('p');
    msg.innerHTML = `<strong style="color:${color}">${user}:</strong> ${text}`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getUsernameColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
}

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value) {
        const text = chatInput.value;
        const msgObj = { type: 'chat', user: myUsername, text: text };
        
        socket.send(JSON.stringify(msgObj));
        appendMessage(myUsername, text, getUsernameColor(myUsername));
        chatHistory.push({ user: myUsername, text: text }); // Guardar mi mensaje en el historial
        chatInput.value = '';
    }
});