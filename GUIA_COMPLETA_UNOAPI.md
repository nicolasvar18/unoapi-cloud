# 🚀 Guía Definitiva y Documentación Técnica de Unoapi Cloud

Esta guía contiene la documentación integral de **Unoapi Cloud**: configuración inicial, inicio rápido en 5 pasos, explicación detallada de la interfaz gráfica, credenciales y seguridad, tutorial completo de la API REST para desarrolladores, respuestas automáticas / estados de lectura, y recomendaciones de arquitectura para despliegue en producción con múltiples números de WhatsApp.

---

## 📑 Tabla de Contenidos

1. [Arquitectura y Componentes del Sistema](#1-arquitectura-y-componentes-del-sistema)
2. [Credenciales, Puertos y Dónde Modificarlos](#2-credenciales-puertos-y-dónde-modificarlos)
3. [Inicio Rápido: Guía de 5 Pasos (Paso a Paso)](#3-inicio-rápido-guía-de-5-pasos-paso-a-paso)
4. [Recorrido Detallado de la Interfaz Web](#4-recorrido-detallado-de-la-interfaz-web)
5. [Tutorial de la API REST (Uso en tus Aplicaciones)](#5-tutorial-de-la-api-rest-uso-en-tus-aplicaciones)
6. [Respuestas Automáticas, Rechazo de Llamadas y Doble Check Azul](#6-respuestas-automáticas-rechazo-de-llamadas-y-doble-check-azul)
7. [Webhooks: Recepción de Mensajes en Tiempo Real](#7-webhooks-recepción-de-mensajes-en-tiempo-real)
8. [Despliegue en Producción para Múltiples Números](#8-despliegue-en-producción-para-múltiples-números)
9. [Preguntas Frecuentes y Buenas Prácticas](#9-preguntas-frecuentes-y-buenas-prácticas)

---

## 1. Arquitectura y Componentes del Sistema

Unoapi Cloud opera mediante una arquitectura de microservicios contenerizada con Docker:

```mermaid
graph TD
    User([Navegador / Tus Apps]) -->|HTTP / REST / WS| Web[web: unoapi-web :9876]
    Web -->|Sesiones & Config| Redis[(redis: :6379)]
    Web -->|Eventos & Colas| RabbitMQ[(rabbitmq: :5672)]
    Web -->|Archivos / Medios| MinIO[(minio: S3 :9000)]
    
    Worker[worker: unoapi-worker] -->|Consume Trabajos| RabbitMQ
    Worker -->|Lee/Escribe Estados| Redis
    Worker -->|Almacena Fotos/Audios| MinIO
    Worker <==>|Sockets Baileys| WA[Servidores de WhatsApp Web]
```

* **`web` (Puerto 9876):** Servidor HTTP Express y Socket.IO. Provee la interfaz web (`index.html`), gestiona los endpoints REST de Meta Cloud API, y despacha trabajos a RabbitMQ.
* **`worker`:** Proceso en segundo plano que mantiene vivas las conexiones de WhatsApp mediante **Baileys**, procesa los mensajes entrantes/salientes, transfiere archivos multimedia y maneja reconexiones.
* **`redis` (Puerto 6379):** Base de datos en memoria para almacenar tokens de autenticación de WhatsApp, credenciales criptográficas de sesión y estados (`online`, `offline`, `connecting`).
* **`rabbitmq` (Puertos 5672 y 15672):** Message Broker para el encolamiento de mensajes, reintentos y distribución entre clústeres.
* **`minio` (Puertos 9000 y 9001):** Servidor de almacenamiento compatible con Amazon S3 para fotos, audios, documentos y stickers.
* **`insight` (Puerto 5540):** RedisInsight, interfaz gráfica para inspeccionar las claves en Redis.

---

## 2. Credenciales, Puertos y Dónde Modificarlos

Todas las credenciales principales del sistema se configuran en el archivo `.env` en la raíz del proyecto.

### Resumen de Credenciales y URLs Locales

| Servicio | URL / Host | Usuario / Identificador | Contraseña / Token |
| :--- | :--- | :--- | :--- |
| **Panel Web Unoapi** | `http://localhost:9876` | Token de Acceso | `jsdoijohiewr948hwodjqsjdjldasdlk` |
| **API REST WhatsApp** | `http://localhost:9876/v15.0/...` | `Bearer Token` | `jsdoijohiewr948hwodjqsjdjldasdlk` |
| **MinIO Console (S3)** | `http://localhost:9001` | `my-minio` | `2NVQWHTTT3asdasMgqapGchy6yAMZn` |
| **MinIO API (S3)** | `http://localhost:9000` | `my-minio` | `2NVQWHTTT3asdasMgqapGchy6yAMZn` |
| **RabbitMQ Manager** | `http://localhost:15672` | `guest` | `guest` |
| **Redis Database** | `localhost:6379` | *(Sin contraseña por defecto)* | *(Ninguna)* |
| **RedisInsight UI** | `http://localhost:5540` | Host: `redis`, Port: `6379` | *(Sin contraseña)* |

### ¿Dónde y cómo cambiar estas credenciales?

Abre el archivo [`.env`](file:///.env) en el editor:

1. **Token Maestro de la API (`UNOAPI_AUTH_TOKEN`):**
   ```bash
   UNOAPI_AUTH_TOKEN=tu_nuevo_token_secreto_super_seguro_12345
   ```
   * *Uso:* Es el token que debes ingresar en el login de la página web y en la cabecera `Authorization: Bearer <token>` de tus peticiones HTTP.
   * *Importante:* Cada sesión puede tener adicionalmente su propio token secundario si deseas aislar números para clientes distintos.

2. **Claves de MinIO / S3 (`STORAGE_ACCESS_KEY_ID` y `STORAGE_SECRET_ACCESS_KEY`):**
   ```bash
   STORAGE_ACCESS_KEY_ID=tu_usuario_minio
   STORAGE_SECRET_ACCESS_KEY=tu_clave_secreta_minio_larga
   ```

3. **Aplicar los cambios:**
   Cada vez que edites el archivo `.env`, reinicia los contenedores para que carguen las nuevas variables:
   ```bash
   docker compose down
   docker compose up -d
   ```

---

## 3. Inicio Rápido: Guía de 5 Pasos (Paso a Paso)

Sigue estos 5 pasos para poner a punto cualquier número y probar tu sistema de inmediato:

### Paso 1: Abrir el Gestor Visual (Unoapi Manager)
Unoapi incluye un panel de control web listo para usar:
1. Abre en tu navegador: [http://localhost:9876](http://localhost:9876)
2. Verás una pantalla solicitando el Token configurado. Ingresa tu token (definido en `.env`):
   ```text
   jsdoijohiewr948hwodjqsjdjldasdlk
   ```
3. Haz clic en **Ingresar** (o Conectar). Entrarás a la tabla de sesiones de Unoapi.

---

### Paso 2: Crear una Sesión y Escanear el Código QR
1. En la barra superior derecha, haz clic en el ícono de engranaje (⚙️) y selecciona **"Agregar Instancia"** (o Adicionar Instância).
2. Escribe tu número de teléfono con el código de país (sin el signo `+`, sin guiones ni espacios):
   * Ejemplo Colombia: `573001234567`
   * Ejemplo México: `5215512345678`
   * Ejemplo España: `34612345678`
3. Haz clic en **Configurar**.
4. En el formulario que se abre:
   * Coloca el nombre en **"Identificación / Nombre del Número"** (ej: `Ventas`).
   * Mantén el campo **"Servidor"** con su valor por defecto `server_1`.
   * Haz clic en **Guardar**.
5. En la tabla principal, haz clic en el botón verde **Conectar** de ese número.
6. Te mostrará el **Código QR fresco** en pantalla:
   * Abre WhatsApp en tu teléfono celular.
   * Ve a **Ajustes** (o los 3 puntos) > **Dispositivos vinculados**.
   * Toca **Vincular un dispositivo** y escanea el código QR que aparece en tu navegador.
7. Una vez escaneado, la pantalla actualizará el estado con un aviso verde de éxito y pasará a **En línea (online)**.

---

### Paso 3: Enviar tu primer mensaje de WhatsApp (Prueba de envío)
Unoapi emula la API oficial de WhatsApp Cloud de Meta. Puedes enviar mensajes mediante `curl` o Postman.

Abre una terminal y ejecuta el siguiente comando reemplazando:
* `TU_NUMERO_CONECTADO`: el número que escaneó el QR (con código de país, ej: `573208738309`).
* `NUMERO_DESTINO`: el número al que le quieres enviar el mensaje de prueba (con código de país, ej: `573001234567`).

```bash
curl -i -X POST \
  http://localhost:9876/v15.0/TU_NUMERO_CONECTADO/messages \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk' \
  -d '{
    "messaging_product": "whatsapp",
    "to": "NUMERO_DESTINO",
    "type": "text",
    "text": {
      "body": "¡Hola! Este es un mensaje de prueba enviado desde Unoapi Cloud en local 🚀"
    }
  }'
```

*Si todo está bien, el servidor responderá con código `200 OK` y el `message_id` generado por WhatsApp, y el mensaje llegará al teléfono de destino.*

---

### Paso 4: Configurar recepción de mensajes (Webhooks)
Para que tu aplicación o backend reciba los mensajes que te envían los usuarios a ese WhatsApp:
1. En el panel [http://localhost:9876](http://localhost:9876), haz clic en el botón **Editar** (ícono de lápiz) de tu sesión.
2. Desplázate a la sección **Webhooks** al final del modal y pulsa **Agregar Webhook**.
3. Ingresa la URL a la que deseas que Unoapi le envíe los eventos (por ejemplo: tu servidor local `http://mi-backend:3000/webhook`, Chatwoot, n8n, o una URL temporal de pruebas como [webhook.site](https://webhook.site/)).
4. Marca los eventos que requieres (ej: **Enviar Nuevos Mensajes** para mensajes entrantes).
5. Guarda los cambios. A partir de ese momento, cada mensaje entrante generará una petición `POST` hacia esa URL con el payload estándar de WhatsApp Cloud API.

---

### Paso 5: Monitorear la infraestructura (Opcional)
Puedes abrir los paneles de soporte que están corriendo en tu Docker:
1. **RedisInsight (Ver sesiones y caché en Redis):**
   * Entra a: [http://localhost:5540](http://localhost:5540)
   * Haz clic en **Add Redis Database** > Host: `redis`, Puerto: `6379`.
   * Podrás ver las claves de autenticación y los estados de cada sesión.
2. **MinIO Console (Ver archivos multimedia recibidos/enviados):**
   * Entra a: [http://localhost:9001](http://localhost:9001)
   * Usuario: `my-minio` | Contraseña: `2NVQWHTTT3asdasMgqapGchy6yAMZn`
   * Verás el bucket `unoapi` con los audios, imágenes y documentos transferidos.
3. **RabbitMQ Dashboard (Ver colas y tráfico de mensajes):**
   * Entra a: [http://localhost:15672](http://localhost:15672)
   * Usuario: `guest` | Contraseña: `guest`
   * Podrás inspeccionar las colas de mensajes salientes, reintentos y transcripciones.

---

## 4. Recorrido Detallado de la Interfaz Web

Ingresa desde tu navegador a: **`http://localhost:9876`**

### Menú Superior y Opciones
En la barra de navegación superior (icono de engranaje ⚙️):
* **➕ Agregar Instancia:** Abre el diálogo para registrar un nuevo número de WhatsApp.
* **🚪 Cerrar Sesión:** Borra el token guardado del navegador y regresa a la pantalla de login.

### Tabla Principal de Sesiones
La tabla central lista todos los números vinculados con las siguientes columnas:
* **Identificación:** Nombre amigable para reconocer la línea (ej. `Ventas`, `Soporte`, `Nicolas`, `Beatriz`).
* **Número:** Número en formato internacional con código de país (ej. `573208738309`).
* **Estado:**
  * 🟢 **En línea (online):** Conectado a WhatsApp y listo para enviar y recibir mensajes.
  * 🟡 **Conectando...:** Estableciendo socket o esperando escaneo del código QR.
  * 🔴 **Desconectado:** Sesión cerrada o desconectada de WhatsApp.
  * ⚪ **Desconectado (offline):** Sin sesión activa en memoria.
* **Servidor:** Nombre del nodo clúster (debe permanecer siempre en `server_1` en despliegues estándar).
* **Acciones:**
  * ✏️ **Editar:** Modifica configuraciones avanzadas, webhooks y respuestas automáticas.
  * 🔗 **Conectar:** Abre el modal para escanear el código QR y vincular el teléfono.
  * 🗑️ **Eliminar:** Cierra la sesión en WhatsApp y borra la configuración de Redis.
  * 🚀 **Probar:** Abre un modal para enviar un mensaje de prueba a cualquier número sin programar nada.

---

## 5. Tutorial de la API REST (Uso en tus Aplicaciones)

Unoapi Cloud implementa la especificación oficial de **Meta WhatsApp Cloud API (Graph API)**. Esto significa que si ya sabes usar la API oficial de WhatsApp de Meta, puedes usar exactamente el mismo formato aquí.

* **Base URL:** `http://localhost:9876` (o tu dominio en producción)
* **Header de Autenticación Obligatorio:**
  ```http
  Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk
  Content-Type: application/json
  ```

---

### 5.1. Listar todas las sesiones
Permite consultar el estado de todos tus números:

* **Método:** `GET`
* **Endpoint:** `/sessions`

```bash
curl -X GET "http://localhost:9876/sessions" \
  -H "Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk"
```

**Respuesta de ejemplo (200 OK):**
```json
{
  "data": [
    {
      "display_phone_number": "573208738309",
      "label": "NICOLAS",
      "status": "online",
      "server": "server_1"
    },
    {
      "display_phone_number": "573125054325",
      "label": "beatriz",
      "status": "online",
      "server": "server_1"
    }
  ]
}
```

---

### 5.2. Enviar Mensaje de Texto Simple

* **Método:** `POST`
* **Endpoint:** `/v15.0/:phone/messages`
* *(Reemplaza `:phone` por el número emisor registrado en Unoapi, ej: `573208738309`)*

```bash
curl -X POST "http://localhost:9876/v15.0/573208738309/messages" \
  -H "Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "573001234567",
    "type": "text",
    "text": {
      "preview_url": false,
      "body": "¡Hola! Este es un mensaje automatizado desde nuestro sistema."
    }
  }'
```

**Respuesta de ejemplo (200 OK):**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    { "wa_id": "573001234567" }
  ],
  "messages": [
    { "id": "UNO.INC.DA945460C10411F1B8FF6F2BB93E606B" }
  ]
}
```

---

### 5.3. Enviar Imagen con Texto (Caption)

* **Método:** `POST`
* **Endpoint:** `/v15.0/:phone/messages`

```bash
curl -X POST "http://localhost:9876/v15.0/573208738309/messages" \
  -H "Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "573001234567",
    "type": "image",
    "image": {
      "link": "https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=600",
      "caption": "Mira nuestra nueva promoción de temporada 🚀"
    }
  }'
```

---

### 5.4. Enviar Documento PDF

* **Método:** `POST`
* **Endpoint:** `/v15.0/:phone/messages`

```bash
curl -X POST "http://localhost:9876/v15.0/573208738309/messages" \
  -H "Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "573001234567",
    "type": "document",
    "document": {
      "link": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      "caption": "Adjunto enviamos tu factura de compra #1024",
      "filename": "Factura_1024.pdf"
    }
  }'
```

---

### 5.5. Enviar Nota de Voz / Audio

* **Método:** `POST`
* **Endpoint:** `/v15.0/:phone/messages`

```bash
curl -X POST "http://localhost:9876/v15.0/573208738309/messages" \
  -H "Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "573001234567",
    "type": "audio",
    "audio": {
      "link": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    }
  }'
```

---

### 5.6. Reaccionar a un Mensaje (Emoji)

```bash
curl -X POST "http://localhost:9876/v15.0/573208738309/messages" \
  -H "Authorization: Bearer jsdoijohiewr948hwodjqsjdjldasdlk" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "573001234567",
    "type": "reaction",
    "reaction": {
      "message_id": "ID_DEL_MENSAJE_A_REACCIONAR",
      "emoji": "👍"
    }
  }'
```

---

## 6. Respuestas Automáticas, Rechazo de Llamadas y Doble Check Azul

En la ventana **Editar Sesión** (botón amarillo **Editar** de cada número), dispones de configuraciones clave para automatizaciones:

### 6.1. Deshabilitar la Lectura Automática (Evitar Doble Check Azul)
* **Campo:** `Marcar leído al recibir` (`readOnReceipt`)
* **Comportamiento:**
  * Si está **Marcado (Activado):** En cuanto un cliente te envía un mensaje, Unoapi le envía inmediatamente el estado `read`, marcándolo en el WhatsApp del cliente con **doble check azul**.
  * Si está **Desmarcado (Desactivado):** Unoapi procesará el mensaje, lo enviará a tus webhooks y lo guardará, pero **NO lo marcará como leído** en el WhatsApp del cliente. El cliente seguirá viendo únicamente el doble check gris hasta que un operador humano abra el chat o tu sistema envíe explícitamente la confirmación de lectura.

---

### 6.2. Rechazo Automático de Llamadas con Mensaje
WhatsApp Web y las APIs de WhatsApp no pueden contestar llamadas de voz o video. Unoapi incluye un módulo para interceptar llamadas y enviar una respuesta automática:

1. **Mensaje al Rechazar Llamadas (`rejectCalls`):**
   * Escribe el texto que recibirá el usuario si intenta llamarte por WhatsApp.
   * *Ejemplo:* `"Hola, este es un número de atención automatizado y no recibe llamadas telefónicas. Por favor escríbenos tu consulta por aquí y te atenderemos con gusto."`
   * Si lo dejas **completamente en blanco**, Unoapi no colgará ni responderá nada a las llamadas.
2. **Mensaje de Llamada Recibida y/o Rechazada (`rejectCallsWebhook`):**
   * Mensaje que se genera internamente para el webhook cuando entra una llamada perdida.

---

### 6.3. Indicador de Escritura ("Escribiendo...")
* **Campo:** `Simular escritura` (`composingMessage`)
* Cuando está activado, antes de despachar un mensaje saliente, WhatsApp mostrará el estado *"escribiendo..."* durante un breve momento, dando una apariencia mucho más humana a tus bots.

---

### 6.4. Integración con Inteligencia Artificial (OpenAI)
Cada sesión tiene campos para conectar directamente con OpenAI:
* **Clave de API de OpenAI (`openaiApiKey`):** Tu clave `sk-...`
* **Modelo de Transcripción (`openaiApiTranscribeModel`):** `whisper-1`. Si un cliente te envía una nota de voz, Unoapi la transcribirá automáticamente a texto y te enviará el texto transcrito a tu webhook.
* **Modelo de Voz (TTS) (`openaiApiSpeechModel` y `openaiApiSpeechVoice`):** Permite convertir respuestas de texto en audios de voz naturales.

---

## 7. Webhooks: Recepción de Mensajes en Tiempo Real

Para recibir mensajes entrantes y crear un bot o conectar un CRM, debes configurar un **Webhook**:

1. En la tabla de sesiones, haz clic en **Editar** en el número deseado.
2. Desplázate hasta la sección **Webhooks** al final del modal.
3. Haz clic en **Agregar Webhook**:
   * **URL Absoluta:** La URL de tu backend donde quieres recibir los eventos (ej: `https://tu-api.com/api/whatsapp-webhook` o un webhook de n8n / Make).
   * **Token (Opcional):** Un token secreto para validar la procedencia.
   * **Enviar Nuevos Mensajes:** Actívalo para recibir mensajes entrantes de los clientes.
   * **Enviar Actualizaciones de Mensajes:** Actívalo si deseas saber cuándo tus mensajes fueron entregados (`delivered`) o leídos (`read`).
   * **Enviar Transcripción de Audio:** Actívalo si usas Whisper para recibir el audio convertido en texto.
4. Haz clic en **Guardar**.

### Formato del Payload que enviará Unoapi a tu Webhook:

Cuando un cliente te escribe, tu servidor recibirá un `POST` con esta estructura estándar de Meta:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "573208738309",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "573208738309",
              "phone_number_id": "573208738309"
            },
            "contacts": [
              {
                "profile": { "name": "Camilo Vargas" },
                "wa_id": "573502299834"
              }
            ],
            "messages": [
              {
                "from": "573502299834",
                "id": "3EB0AA52F4673BA3D85757",
                "timestamp": "1791235402",
                "text": {
                  "body": "Hola, quisiera consultar el catálogo de productos"
                },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

---

## 8. Despliegue en Producción para Múltiples Números

### ⚠️ ¿Por qué Render NO es la mejor opción para este proyecto?

1. **Arquitectura Multi-Contenedor Compleja:** Unoapi requiere **5 servicios interactuando simultáneamente** (`web`, `worker`, `redis`, `rabbitmq`, `minio`). En Render no puedes correr un `docker-compose.yml` unificado de forma directa en un plan básico; tendrías que crear 4 o 5 servicios independientes.
2. **Costo Elevado por Memoria (RAM):**
   * Cada conexión activa de WhatsApp con Baileys consume aproximadamente entre **80 MB y 150 MB de memoria RAM**.
   * Si vas a conectar **10, 20 o 50 números**, vas a requerir entre **4 GB y 8 GB de RAM** solo para el worker.
   * En Render, un servicio con 4 GB de RAM cuesta alrededor de **$40 - $85 USD/mes**, más las bases de datos y almacenamiento.
3. **Mantenimiento de Sockets WebSocket:** Render suspende o reinicia instancias gratuitas/básicas tras periodos de inactividad, lo que desconectaría constantemente tus sesiones de WhatsApp.

---

### 🏆 La Mejor Opción: Servidor VPS Dedicado (Cloud VPS)

Para manejar múltiples números de forma estable, rápida y económica, la mejor solución es contratar un **VPS Cloud** y desplegar con **Docker Compose** o con **Coolify**:

#### Proveedores Recomendados (Excelente relación Costo / Potencia):
1. **Hetzner Cloud (La opción más recomendada):**
   * Plan **CPX31** (4 vCPU AMD, 8 GB RAM, 160 GB NVMe, 20 TB tráfico): **~€12.50 / mes (~$13.50 USD)**.
   * Plan **CPX41** (8 vCPU AMD, 16 GB RAM, 240 GB NVMe): **~€24.00 / mes (~$26 USD)**.
   * Soporta cómodamente **30 a 70 números de WhatsApp** conectados 24/7 sin degradación.
2. **Contabo Cloud VPS:**
   * Plan **Cloud VPS 2** (6 vCPU, 16 GB RAM, 400 GB SSD): **~$12 USD / mes**.
   * Mucha memoria RAM por un precio muy bajo.
3. **DigitalOcean / Linode / Vultr:**
   * Planes de 4GB - 8GB de RAM disponibles desde $24 a $48 USD / mes.

---

### Paso a Paso para Desplegar en el VPS

#### Método A: Con Coolify (El "Render" autohospedado, gratuito y con SSL automático)
[Coolify](https://coolify.io) es una plataforma open-source que instalas en tu VPS con un solo comando. Te da una interfaz gráfica idéntica a Render o Vercel.

1. En tu VPS nuevo (Ubuntu 22.04 / 24.04), ejecuta:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
2. Entra a `http://IP_DE_TU_VPS:8000` y crea tu cuenta de administrador.
3. Haz clic en **+ New Resource > Docker Compose**.
4. Conecta tu repositorio de GitHub de `unoapi-cloud`.
5. Coolify detectará el `docker-compose.yml`, levantará los 5 contenedores, le asignará tu dominio (ej: `whatsapp.tudominio.com`) y generará el certificado **SSL HTTPS gratuito (Let's Encrypt)** automáticamente.

---

#### Método B: Despliegue Directo con Docker Compose + Caddy / Nginx

1. **Instalar Docker y Docker Compose en tu VPS:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. **Clonar tu repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/unoapi-cloud.git
   cd unoapi-cloud
   ```
3. **Configurar el archivo `.env` de producción:**
   ```bash
   cp .env.example .env # o edita tu .env
   nano .env
   ```
   * Modifica `UNOAPI_AUTH_TOKEN` con un token seguro de producción.
   * Ajusta los secretos de MinIO.
4. **Levantar los contenedores:**
   ```bash
   docker compose up -d --build
   ```
5. **Configurar dominio con HTTPS automático usando Caddy:**
   Instala Caddy en el servidor (`sudo apt install caddy`) y crea un archivo `/etc/caddy/Caddyfile`:
   ```caddy
   whatsapp.tudominio.com {
       reverse_proxy localhost:9876
   }

   s3.tudominio.com {
       reverse_proxy localhost:9001
   }
   ```
   Reinicia Caddy: `sudo systemctl restart caddy`.
   ¡Y listo! Ya tendrás tu API y panel web con candado verde SSL (`https://whatsapp.tudominio.com`).

---

## 9. Preguntas Frecuentes y Buenas Prácticas

1. **¿Qué hacer si un número se desconecta?**
   En la interfaz web, haz clic en **Conectar** y regenera el código QR para escanearlo nuevamente.
2. **¿Cómo evitar baneos de WhatsApp?**
   * No envíes mensajes masivos a números desconocidos que no te tengan guardado en sus contactos de forma repentina.
   * Añade retardos (delays) entre mensajes masivos (al menos 3 a 7 segundos).
   * Activa la opción `composingMessage` (simular escritura) para que el comportamiento imite a un humano.
3. **¿Cómo hacer respaldo de las sesiones conectadas?**
   Toda la persistencia de las sesiones reside en el volumen de **Redis** y en las carpetas de datos. Haciendo un snapshot de tu VPS o un backup del volumen Docker de Redis, nunca perderás los números conectados.
