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

### Resumen de Credenciales y Puertos de Producción / Local

> ⚠️ **IMPORTANTE PARA REPOSITORIOS PÚBLICOS:**
> Los valores mostrados a continuación son **placeholders / plantillas**. Nunca subas contraseñas reales a GitHub. En tu servidor o máquina local, copia el archivo [`.env.example`](file:///.env.example) como [`.env`](file:///.env) y define tus contraseñas privadas.

| Servicio | URL / Host | Usuario / Identificador | Contraseña / Token | Notas de Seguridad |
| :--- | :--- | :--- | :--- | :--- |
| **Panel Web Unoapi** | `https://tu-dominio.com` | `usuario_panel_web` (ej: `admin`) | `clave_panel_web` | Acceso con usuario y contraseña definidos en `.env` |
| **API REST WhatsApp** | `https://tu-dominio.com/v15.0/...` | Bearer Token | `tu_token_secreto_unoapi` | En cabecera `Authorization: Bearer <token>` |
| **MinIO Console (S3)** | `http://IP_DE_TU_SERVIDOR:9001` | `usuario_minio` | `clave_minio` | Panel web de gestión S3 |
| **MinIO API (S3)** | `http://IP_DE_TU_SERVIDOR:9000` | `usuario_minio` | `clave_minio` | Endpoint S3 para uploads/downloads |
| **RabbitMQ Manager** | `http://IP_DE_TU_SERVIDOR:15672` | `usuario_rabbitmq` | `clave_rabbitmq` | El usuario `guest` debe ser eliminado |
| **Redis Database** | `127.0.0.1:6379` | `default` | `clave_redis` | Protegido con `requirepass` y enlace a localhost |
| **RedisInsight UI** | `http://IP_DE_TU_SERVIDOR:5540` | Host: `redis`, Port: `6379` | `clave_redis` | Panel web para inspeccionar llaves Redis |

### ¿Dónde y cómo cambiar o rotar estas credenciales?

Todas las variables se configuran en el archivo [`.env`](file:///.env) (ignorado por Git en `.gitignore`) y se transmiten a los contenedores mediante `docker-compose.yml`:

1. **Token Maestro de la API (`UNOAPI_AUTH_TOKEN`):**
   ```bash
   UNOAPI_AUTH_TOKEN=tu_token_secreto_unoapi
   ```
2. **MinIO / S3 (`STORAGE_ACCESS_KEY_ID` y `STORAGE_SECRET_ACCESS_KEY`):**
   ```bash
   STORAGE_ACCESS_KEY_ID=usuario_minio
   STORAGE_SECRET_ACCESS_KEY=clave_minio
   MINIO_ROOT_USER=usuario_minio
   MINIO_ROOT_PASSWORD=clave_minio
   ```
3. **RabbitMQ (`RABBITMQ_DEFAULT_USER` y `RABBITMQ_DEFAULT_PASS`):**
   ```bash
   RABBITMQ_DEFAULT_USER=usuario_rabbitmq
   RABBITMQ_DEFAULT_PASS=clave_rabbitmq
   AMQP_URL=amqp://usuario_rabbitmq:clave_rabbitmq@rabbitmq:5672?frameMax=8192
   ```
4. **Redis (`REDIS_PASSWORD`):**
   ```bash
   REDIS_PASSWORD=clave_redis
   REDIS_URL=redis://:clave_redis@redis:6379
   ```

5. **Aplicar los cambios en el servidor:**
   ```bash
   docker compose down
   docker compose up -d
   ```

---

## 2.1 Descripción Detallada: ¿Para qué sirve cada página / servicio y cómo funciona?

Para entender el ecosistema completo de Unoapi Cloud y sacarle el máximo provecho, aquí tienes el desglose exacto de cada uno de los 7 componentes y páginas del sistema:

---

### 1. Panel Web Unoapi (Unoapi Manager)
* **URL en Producción:** `https://tu-dominio.com` (o `http://localhost:9876` en local)
* **Acceso:** Token de autenticación (`tu_token_secreto_unoapi`)
* **¿Para qué sirve?**
  Es la **consola de administración visual** pensada para los humanos. Te permite:
  1. Ver todos tus números de WhatsApp conectados en una sola tabla organizada con su estado en vivo (`online`, `connecting`, `offline`).
  2. Crear nuevas instancias con **"Agregar Instancia"** asignándoles un nombre identificador (ej: *Ventas*, *Soporte*, *Cobranzas*).
  3. Generar y mostrar en pantalla el **Código QR fresco** para escanear con la app de WhatsApp de tu celular (o generar el código de emparejamiento numérico de 8 dígitos).
  4. Configurar opciones avanzadas por cada número: URL del Webhook, rechazo automático de llamadas telefónicas (`rejectCalls`), confirmaciones de lectura automáticas (`readOnReceipt`), e ignorar mensajes de grupos.
* **¿Cómo funciona por detrás?**
  Es una aplicación web servida por el contenedor `web` (Express + Bootstrap) que se comunica en tiempo real con el navegador mediante **WebSockets (Socket.IO)**. Cuando haces clic en "Conectar", envía una señal interna al contenedor `worker`. El `worker` inicializa el socket de Baileys, solicita un código QR a los servidores de WhatsApp, y lo envía al navegador en formato Base64. Al escanearlo con el teléfono celular, el estado se guarda inmediatamente en **Redis** como `online`.

---

### 2. API REST WhatsApp Cloud API
* **URL en Producción:** `https://tu-dominio.com/v15.0/:phone/messages` (o `http://localhost:9876/v15.0/:phone/messages` en local)
* **Acceso:** Cabecera HTTP `Authorization: Bearer tu_token_secreto_unoapi`
* **¿Para qué sirve?**
  Es la **interfaz programática para tus sistemas y aplicaciones** (tu backend en Node.js, Python, PHP, Laravel, tu CRM, tus chatbots de IA, n8n, etc.). Permite enviar mensajes de texto, fotos, documentos PDF, audios de voz `.ogg`, botones y reacciones a cualquier persona en el mundo sin necesidad de abrir un navegador web.
* **¿Cómo funciona por detrás?**
  Emula al 100% el formato oficial de la **Meta / Facebook WhatsApp Cloud API**:
  1. Tu software hace una petición HTTP `POST` a la ruta `/v15.0/:phone/messages` con el cuerpo en formato JSON.
  2. El contenedor `web` verifica el Bearer Token. Si es correcto, **no hace esperar a tu aplicación**; encola el mensaje en **RabbitMQ** y le responde inmediatamente a tu sistema con `200 OK` y un identificador único de mensaje (`wamid...`).
  3. El contenedor `worker` toma el mensaje de la cola de RabbitMQ y lo transmite a los servidores de WhatsApp utilizando la sesión activa de Baileys.
  4. Cuando WhatsApp entrega o lee el mensaje, Unoapi dispara un evento hacia tu **Webhook** para avisarle a tu sistema del cambio de estado.

---

### 3. MinIO Console (S3 Web UI)
* **URL en Producción:** `http://IP_DE_TU_SERVIDOR:9001` (o `http://localhost:9001` en local)
* **Acceso:** Usuario: `usuario_minio` | Contraseña: `clave_minio`
* **¿Para qué sirve?**
  Es un panel web visual idéntico a la consola de **Amazon Web Services (AWS S3)**, pero alojado 100% privado en tu propio servidor. Sirve para:
  1. Explorar, previsualizar y descargar manualmente los archivos multimedia que entran y salen por WhatsApp (audios de voz, fotos, videos, documentos PDF, fotos de perfil).
  2. Gestionar el espacio de almacenamiento y los "Buckets" (actualmente el bucket principal `unoapi`).
* **¿Cómo funciona por detrás?**
  Es la interfaz web de MinIO Server. Muestra el sistema de archivos montado en el volumen `/data` del contenedor Docker. Permite auditar qué archivos se están guardando y generar enlaces de descarga directos.

---

### 4. MinIO API (S3 Storage Endpoint)
* **URL en Producción:** `http://IP_DE_TU_SERVIDOR:9000` (o `http://localhost:9000` en local)
* **Acceso:** Access Key: `usuario_minio` | Secret Key: `clave_minio`
* **¿Para qué sirve?**
  Es el **endpoint técnico de almacenamiento S3** utilizado internamente por Unoapi para subir y descargar archivos binarios de forma rápida y eficiente.
* **¿Cómo funciona por detrás?**
  Cuando un usuario de WhatsApp te envía una foto o una nota de voz, guardar esos megabytes directamente en Redis o en RabbitMQ saturaría la memoria RAM del servidor. Por ello, el `worker` descarga el archivo binario de WhatsApp y lo transfiere vía protocolo S3 al puerto 9000 de MinIO, guardando en Redis únicamente la URL de referencia. Cuando tu backend consulta o recibe el archivo por Webhook, lo descarga velozmente desde este endpoint.

---

### 5. RabbitMQ Manager (Gestor de Colas de Mensajería)
* **URL en Producción:** `http://IP_DE_TU_SERVIDOR:15672` (o `http://localhost:15672` en local)
* **Acceso:** Usuario: `usuario_rabbitmq` | Contraseña: `clave_rabbitmq`
* **¿Para qué sirve?**
  Es el panel de control del **Message Broker (Gestor de Colas)**. Sirve para:
  1. Monitorear el volumen y la velocidad de tráfico de mensajes por segundo.
  2. Ver cuántos mensajes están encolados esperando a ser enviados (cola `unoapi.incoming`).
  3. Ver cuántos eventos recibidos están esperando a ser entregados a tus Webhooks (cola `unoapi.outgoing`).
  4. Diagnosticar si algún mensaje falló o si hay reintentos programados.
* **¿Cómo funciona por detrás?**
  RabbitMQ aísla la recepción de peticiones del envío real:
  - Si tu sistema envía 5,000 mensajes de golpe por la API REST, el contenedor `web` los deposita en RabbitMQ en segundos sin bloquearse.
  - El `worker` va consumiendo esos mensajes a un ritmo controlado para proteger la salud de tu número de teléfono y evitar bloqueos por parte de WhatsApp.
  - Si el servidor de WhatsApp tiene un corte de red temporal, los mensajes no se pierden: RabbitMQ los retiene en cola y los reintenta automáticamente tan pronto vuelve la conexión.

---

### 6. Redis Database (Base de Datos en Memoria)
* **Host Interno:** `redis:6379` | **Host Servidor:** `127.0.0.1:6379`
* **Acceso:** Usuario: `default` | Contraseña: `clave_redis`
* **¿Para qué sirve?**
  Es el **motor de almacenamiento de ultra alta velocidad en memoria RAM** donde reside el "cerebro" y la memoria activa de cada sesión de WhatsApp:
  1. Almacena las claves criptográficas privadas de WhatsApp (Multi-Device Auth Keys de Baileys).
  2. Guarda el estado de conexión de cada número (`online`, `offline`, `connecting`).
  3. Guarda los metadatos de grupos, nombres de contactos y los estados de entrega de cada mensaje (`sent`, `delivered`, `read`).
* **¿Cómo funciona por detrás?**
  WhatsApp utiliza cifrado de extremo a extremo con algoritmos criptográficos que requieren cientos de lecturas de claves por segundo. Redis opera en memoria RAM pura (con persistencia en disco `appendonly yes`), permitiendo lecturas en menos de 1 milisegundo. Cuando reinicias el servidor o el contenedor del `worker`, este lee inmediatamente las claves desde Redis y restablece la conexión con WhatsApp en menos de 1 segundo sin requerir que vuelvas a escanear el código QR. Por seguridad, está protegido con contraseña obligatoria (`--requirepass`) y vinculado a localhost.

---

### 7. RedisInsight UI (Panel Gráfico para Redis)
* **URL en Producción:** `http://IP_DE_TU_SERVIDOR:5540` (o `http://localhost:5540` en local)
* **Acceso:** Host: `redis`, Puerto: `6379`, Password: `clave_redis`
* **¿Para qué sirve?**
  Es la **interfaz gráfica oficial desarrollada por Redis** para inspeccionar las entrañas de la base de datos sin necesidad de usar la consola negra de comandos. Te permite:
  1. Explorar visualmente las claves almacenadas (`unoapi-*`).
  2. Ver el JSON exacto de configuración de tus sesiones activas.
  3. Ver gráficas de consumo de memoria RAM de Redis y número de operaciones por segundo.
  4. Abrir una consola interactiva CLI directamente en el navegador si necesitas ejecutar consultas avanzadas de Redis.
* **¿Cómo funciona por detrás?**
  Es un contenedor web independiente (`redis/redisinsight`) que se conecta internamente a `redis:6379` utilizando la contraseña configurada. Te ofrece un explorador tipo árbol para buscar y visualizar datos estructurados en tiempo real.

---

## 3. Inicio Rápido: Guía de 5 Pasos (Paso a Paso)

Sigue estos 5 pasos para poner a punto cualquier número y probar tu sistema de inmediato:

### Paso 1: Abrir el Gestor Visual (Unoapi Manager)
Unoapi incluye un panel de control web listo para usar:
1. Abre en tu navegador: [http://localhost:9876](http://localhost:9876)
2. Verás una pantalla solicitando el Token configurado. Ingresa tu token (definido en `.env`):
   ```text
   tu_token_secreto_unoapi
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
  -H 'Authorization: Bearer tu_token_secreto_unoapi' \
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
   * Entra a: [http://localhost:5540](http://localhost:5540) (o tu servidor en el puerto 5540)
   * Haz clic en **Add Redis Database** > Host: `redis`, Puerto: `6379`, Password: `clave_redis` (la que configuraste en tu `.env`).
   * Podrás ver las claves de autenticación y los estados de cada sesión.
2. **MinIO Console (Ver archivos multimedia recibidos/enviados):**
   * Entra a: [http://localhost:9001](http://localhost:9001) (o tu servidor en el puerto 9001)
   * Usuario: `usuario_minio` | Contraseña: `clave_minio` (definidas en tu `.env`)
   * Verás el bucket `unoapi` con los audios, imágenes y documentos transferidos.
3. **RabbitMQ Dashboard (Ver colas y tráfico de mensajes):**
   * Entra a: [http://localhost:15672](http://localhost:15672) (o tu servidor en el puerto 15672)
   * Usuario: `usuario_rabbitmq` | Contraseña: `clave_rabbitmq` (definidas en tu `.env`)
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
  Authorization: Bearer tu_token_secreto_unoapi
  Content-Type: application/json
  ```

---

### 5.1. Listar todas las sesiones
Permite consultar el estado de todos tus números:

* **Método:** `GET`
* **Endpoint:** `/sessions`

```bash
curl -X GET "http://localhost:9876/sessions" \
  -H "Authorization: Bearer tu_token_secreto_unoapi"
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
  -H "Authorization: Bearer tu_token_secreto_unoapi" \
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
  -H "Authorization: Bearer tu_token_secreto_unoapi" \
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
  -H "Authorization: Bearer tu_token_secreto_unoapi" \
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
  -H "Authorization: Bearer tu_token_secreto_unoapi" \
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
  -H "Authorization: Bearer tu_token_secreto_unoapi" \
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

El **Webhook** es el mecanismo mediante el cual Unoapi **le notifica a tu sistema en tiempo real (Push Notification)** cada vez que ocurre un evento en WhatsApp, eliminando la necesidad de consultar la API constantemente.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as 👤 Cliente en WhatsApp
    participant Worker as ⚙️ Unoapi (Worker/Baileys)
    participant Broker as 📬 RabbitMQ
    participant Webhook as 🌐 Tu Servidor / Webhook

    Cliente->>Worker: Envía mensaje: "Hola, información por favor"
    Note over Worker: Procesa y descarga audios/fotos a MinIO
    Worker->>Broker: Encola evento en unoapi.outgoing
    Broker->>Webhook: HTTP POST con JSON del mensaje
    Webhook-->>Broker: Responde HTTP 200 OK
    Note over Webhook: Tu bot responde o tu CRM guarda el chat
```

---

### 7.1. Explicación Detallada de cada Interruptor y Opción del Webhook

Al hacer clic en **Editar** en una sesión y abrir la sección de **Webhooks**, encontrarás **8 opciones e interruptores configurables**:

| Interruptor / Opción | ¿Qué hace internamente? | ¿Cuándo activarlo? | Recomendación |
| :--- | :--- | :--- | :---: |
| **1. Enviar Nuevos Mensajes** | Notifica al webhook cuando **tu propia API genera y envía un mensaje nuevo exitosamente** (`POST /v15.0/:phone/messages`), devolviendo una copia con su identificador único (`wamid...`). | Si tu base de datos o CRM necesita registrar la confirmación inmediata de los mensajes que tú mismo envías desde el sistema. | 🔵 **ON** |
| **2. Enviar Mensajes de Grupos** | Reenvía al webhook los mensajes que ocurren dentro de **grupos de WhatsApp** donde tu número sea miembro. | **Apágalo** si el número está en grupos de trabajo/amigos y no quieres que tu bot se active en ellos. **Enciéndelo** solo si estás creando un bot grupal. | ⚪ **OFF** (para bots individuales) |
| **3. Enviar Mensajes de Canales/Boletines** | Reenvía las publicaciones y noticias recibidas de los **Canales informativos de WhatsApp (Newsletters)** a los que estés suscrito. | Déjalo apagado a menos que estés construyendo un agregador o monitor de canales públicos. | ⚪ **OFF** |
| **4. Enviar Mensajes Salientes** | Se dispara cuando **un humano responde o escribe directamente desde la aplicación de WhatsApp oficial en el celular físico o WhatsApp Web**. | **Muy recomendado:** Si tienes agentes humanos en el celular, permite que tu CRM guarde lo que el asesor le contestó al cliente y el chat quede completo. | 🔵 **ON** |
| **5. Enviar Mensajes Entrantes** | **El interruptor más importante.** Se dispara cada vez que **un cliente te escribe un mensaje privado** (texto, audios, fotos, documentos PDF). | **Indispensable:** Es la vía principal para que tus bots, chatbots de IA o CRM se enteren de lo que los clientes te dicen. | 🔵 **ON (Obligatorio)** |
| **6. Enviar Actualizaciones de Mensajes (Entregado/Leído)** | Envía notificaciones de cambio de estado de entrega de los mensajes (el doble check): `sent`, `delivered`, `read` (doble check azul), o `failed`. | Actívalo si en tu CRM o pantalla muestras las tildes grises/azules de lectura. Desactívalo si deseas ahorrar peticiones HTTP en tu servidor. | 🔵 **ON** o ⚪ **OFF** |
| **7. Enviar Transcripción de Audio** | Si un cliente envía una **nota de voz**, Unoapi la procesa a través de un motor de transcripción de voz a texto (Google Speech o OpenAI Whisper) y envía el texto transcrito al webhook. | Actívalo si tienes configurada una clave de IA y quieres que tu bot pueda "leer" y responder a las notas de voz de los clientes. | ⚪ **OFF** (o 🔵 si usas Whisper) |
| **8. Agregar a lista negra al enviar mensaje saliente por X seg (TTL)** | **Intervención Humana (Human Takeover):** Si un asesor humano responde manualmente desde el celular físico, Unoapi **pausa al bot para ese cliente específico durante X segundos** (ej: `300` seg = 5 min). | **Altamente recomendado:** Evita que el bot de IA interrumpa o se meta a responder mientras un agente humano está hablando con el cliente. | `300` seg (5 minutos) |

---

### 7.2. Configuración Recomendada por Tipo de Caso de Uso

#### Caso A: Chatbot de Inteligencia Artificial / Asistente Virtual
* **Enviar Mensajes Entrantes:** 🔵 ON
* **Enviar Mensajes Salientes:** 🔵 ON
* **Enviar Mensajes de Grupos:** ⚪ OFF *(Crucial para no responder en grupos)*
* **Enviar Mensajes de Canales:** ⚪ OFF
* **Agregar a lista negra (TTL):** `300` a `600` segundos *(Pausa al bot si interviene un humano)*

#### Caso B: CRM Multiagente / Bandeja de Entrada Compartida
* **Enviar Nuevos Mensajes:** 🔵 ON
* **Enviar Mensajes Entrantes:** 🔵 ON
* **Enviar Mensajes Salientes:** 🔵 ON
* **Enviar Actualizaciones (Entregado/Leído):** 🔵 ON *(Para ver el doble check azul)*
* **Enviar Mensajes de Grupos:** 🔵 ON o ⚪ OFF *(según si atienden grupos)*

---

### 7.3. Formato del Payload que enviará Unoapi a tu Webhook:

Cuando un cliente te escribe, tu servidor recibe una petición `POST` con la estructura estándar oficial de Meta / WhatsApp Cloud API:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "573204004097",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "573204004097",
              "phone_number_id": "573204004097"
            },
            "contacts": [
              {
                "profile": { "name": "Carlos Gomez" },
                "wa_id": "573001234567"
              }
            ],
            "messages": [
              {
                "from": "573001234567",
                "id": "wamid.HBgLMTY1MDUwNzY1MjAVAgARGBI5QTNDQTVCM0Q0Q0Q2RTY3RTcA",
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

### 7.4. Cómo Probar tu Webhook en 30 Segundos (Sin Programar)
1. Abre **[webhook.site](https://webhook.site)** en tu navegador. Te generará una URL temporal única (ej: `https://webhook.site/xxxx-xxxx`).
2. En tu panel de Unoapi, edita tu número y pega esa URL en el campo **URL Absoluta** del Webhook.
3. Asegúrate de tener activo **Enviar Mensajes Entrantes**.
4. Envía un mensaje desde cualquier teléfono al WhatsApp conectado.
5. Verás aparecer inmediatamente en la pantalla de Webhook.site la tarjeta con el JSON completo del mensaje recibido en tiempo real.

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

---

## 10. Acceso con Usuario y Contraseña & Alertas de Desconexión por Correo

### 10.1. Inicio de Sesión en el Panel Web

Anteriormente el panel requería ingresar directamente el Token Bearer de la API. Ahora cuenta con un formulario moderno y seguro de **Usuario y Contraseña**:

1. En tu archivo `.env`, define tus credenciales:
   ```env
   DASHBOARD_USERNAME=admin
   DASHBOARD_PASSWORD=tu_clave_segura_aqui
   ```
2. Al ingresar a tu URL (ej: `https://wapp-services.appoio.site`), verás la tarjeta de inicio de sesión.
3. Ingresa tu usuario y contraseña. El sistema validará tus credenciales y guardará automáticamente la sesión para que no tengas que escribirla en cada recarga.
4. Si deseas cerrar sesión, haz clic en el ícono de engranaje (⚙️) en la barra superior y selecciona **Cerrar Sesión**.
5. *(Opcional)* Si necesitas acceder directamente con un Token Bearer por propósitos de depuración técnica, puedes desplegar la opción **"O ingresar con Token de API"** en la parte inferior de la tarjeta.

---

### 10.2. Notificaciones por Correo ante Desconexión de Números

Unoapi monitorea constantemente el estado del socket de WhatsApp (Baileys). Si un celular se desconecta (por ejemplo, porque cerraron la sesión desde el WhatsApp del teléfono, porque se conectó en otro navegador, o por una caída permanente de red), el sistema enviará inmediatamente un correo de alerta a las direcciones que configures.

#### Paso 1: Configurar el Servidor SMTP en tu archivo `.env`

Agrega las siguientes variables en tu archivo `.env`:

```env
# Configuración SMTP (Ejemplo con Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx     # Contraseña de aplicación de 16 caracteres de Google
SMTP_FROM=Unoapi Alertas <tu_correo@gmail.com>
SMTP_SECURE=false

# Opcional: Correos de alerta por defecto (si un número no tiene configurados individualmente)
ALERT_EMAILS=administrador@empresa.com
```

> [!TIP]
> **¿Cómo generar una contraseña de aplicación en Gmail?**
> 1. Entra a tu Cuenta de Google -> **Seguridad**.
> 2. Activa la **Verificación en 2 pasos** si aún no la tienes.
> 3. Busca en la barra superior de tu cuenta de Google **"Contraseñas de aplicaciones"**.
> 4. Crea una nueva con el nombre `Unoapi` y copia la clave generada de 16 letras en la variable `SMTP_PASS`.

#### Paso 2: Asignar los Correos de Notificación por Número en el Panel

Puedes asignar destinatarios distintos según el número (por ejemplo, notificar al equipo de Ventas si se cae el número de ventas, o al equipo de Soporte si se cae el de soporte):

1. En la tabla principal de sesiones, haz clic en el botón de **Editar (ícono de lápiz)** del número deseado.
2. Desplázate hacia abajo hasta la sección **"Alertas de Desconexión por Correo"**.
3. En el campo **"Correos de notificación (separados por coma)"**, ingresa las direcciones:
   ```text
   gerencia@empresa.com, soporte@empresa.com, comercial@empresa.com
   ```
4. Haz clic en el botón **"Probar Envío"** para enviar un correo de prueba de inmediato y comprobar que la configuración SMTP funcione correctamente.
5. Haz clic en **Guardar Cambios**.

#### Paso 3: ¿Qué contiene el Correo de Alerta?

Cuando un número pierde la conexión, los destinatarios recibirán un correo con:
* ⚠️ **Alerta en Rojo:** Número de WhatsApp desconectado y Nombre/Identificación asignada.
* 📋 **Motivo de la Desconexión:** Explica claramente la causa (ej: *Sesión cerrada desde el celular*, *Conexión reemplazada en otro dispositivo*, o *Error de conexión a internet*).
* 🕒 **Fecha y Hora Exacta** de la desconexión.
* 🔘 **Botón Directo "Reconectar Número":** Al hacer clic, abre de inmediato el panel web para escanear el nuevo código QR.
* ⏳ **Ventana de Gracia Inteligente (10 segundos):** Si la conexión cae por un corte intermitente de internet o parpadeo de red y se restablece en menos de 10 segundos, Unoapi descarta automáticamente la alerta y no envía ningún correo innecesario. Solo si el número permanece desconectado tras 10 segundos se dispara la notificación.
* 🛡️ **Filtro Anti-Spam (Debounce de 5 minutos):** Si un teléfono permanece desconectado o falla repetidamente, Unoapi respetará un intervalo mínimo de 5 minutos entre alertas por número para evitar saturar tu bandeja de entrada.

