# SynCode - Frontend

Esta es la interfaz de usuario para la plataforma **SynCode**, desarrollada con tecnologías web estándar para garantizar ligereza y compatibilidad.

## Cómo funciona

El frontend es una **SPA (single-page application) estática** sin frameworks ni compilación. Toda la lógica reside en tres archivos (`index.html`, `script.js`, `style.css`) y se apoya en **CodeMirror 5** como editor de código.

Al cargarse, la app lee `localStorage` para detectar si hay una sesión activa (token JWT + sala) y redirige automáticamente al lobby o a la sala correspondiente. En caso contrario, muestra la pantalla de login/registro.

La navegación entre pantallas (login → lobby → sala) se gestiona ocultando y mostrando `div`s con `style.display`.

Una vez dentro de una sala, la app abre una conexión **WebSocket** (`ws://HOST:3000/room/{sala}?token=JWT`) para sincronizar en tiempo real:

- **Código**: cualquier cambio en el editor se transmite al instante a todos los participantes.
- **Cursores y selecciones**: la posición del cursor de cada usuario se dibuja directamente en el editor con su nombre.
- **Chat**: mensajes en tiempo real con historial sincronizado al entrar.

La sincronización inicial del contenido al unirse a una sala se realiza solicitando el estado al usuario más antiguo conectado o con un fallback a `GET /api/rooms/{sala}/content` si no hay respuesta.

La gestión de proyectos y versiones (guardar, listar, previsualizar y restaurar versiones) se realiza mediante llamadas REST estándar al backend, autenticadas con el token JWT.

## Estructura de archivos

- **`index.html`**: Estructura principal de la aplicación.
- **`style.css`**: Estilos visuales y diseño responsivo.
- **`script.js`**: Lógica de interacción y consumo de la API del backend.

## Instalación y ejecución local

Al ser un proyecto de frontend estático, no requiere compilación compleja:

- **Opción A (simple):** abre el archivo `index.html` directamente en cualquier navegador moderno.
- **Opción B (recomendada):** utiliza una extensión de servidor local como **Live Server** en VS Code para evitar problemas de CORS.

## Configuración de la API

El frontend está configurado para detectar automáticamente la dirección del servidor basándose en la ubicación actual del navegador, apuntando siempre al puerto `3000`:

```js
const HOST = window.location.hostname + ":3000";
```

- En local: apuntará a `localhost:3000`.
- En Azure: apuntará a `4.232.137.224:3000`.

## Despliegue

La versión oficial desplegada se encuentra en:

- **Enlace:** http://4.232.137.224

> **Nota:** El backend debe estar escuchando en el puerto `3000` para que la conexión sea exitosa.
