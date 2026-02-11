let socket;
const editor = document.getElementById('editor');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chat-messages');

function connectToRoom() {
    const roomId = document.getElementById('roomId').value;
    if (!roomId) return alert("Introduce un ID de sala");

    // Cambia TU_IP_AZURE por la IP pública de tu máquina
    const serverUrl = `ws://localhost:3000/room/${roomId}`;
    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        appendMessage("Sistema", "Conectado a la sala " + roomId);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'code-update') {
            // Actualiza el editor con lo que escriben otros (sin entrar en bucle)
            if (data.content !== editor.value) {
                editor.value = data.content;
            }
        } else if (data.type === 'chat') {
            appendMessage(data.user, data.text);
        }
    };

    // Enviar código cuando el usuario escribe
    editor.addEventListener('input', () => {
        socket.send(JSON.stringify({
            type: 'code-update',
            content: editor.value
        }));
    });
}

function appendMessage(user, text) {
    const msg = document.createElement('p');
    msg.innerHTML = `<strong>${user}:</strong> ${text}`;
    chatMessages.appendChild(msg);
}

// Enviar chat al pulsar Enter
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        socket.send(JSON.stringify({
            type: 'chat',
            user: 'Usuario', // Aquí iría el nombre del login
            text: chatInput.value
        }));
        chatInput.value = '';
    }
});