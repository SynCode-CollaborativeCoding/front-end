# SynCode - Frontend

Esta es la interfaz de usuario para la plataforma **SynCode**, desarrollada con tecnologías web estándar para garantizar ligereza y compatibilidad.

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
