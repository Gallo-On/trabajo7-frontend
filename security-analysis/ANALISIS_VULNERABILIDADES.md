# 🛡️ Informe de Auditoría de Seguridad y Vulnerabilidades: Frontend Dashboard

**Proyecto:** `trabajo7-frontend` (Nginx Web UI & Dynamic Client)  
**Fecha de Análisis:** 21 de Octubre de 2026  
**Versión Evaluada:** Rama `main`  
**Herramientas de Evaluación:** Nuclei Vulnerability Scanner v3.2.0 + SAST Code Review  

---

## 1. Resumen Ejecutivo

Se auditó el componente de **Frontend Web y Servidor Nginx**, responsable de la interfaz gráfica de usuario, la pantalla de autenticación LDAP y la recarga dinámica de claves API rotadas mediante [nginx.conf](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/nginx.conf), [app.js](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/app.js) y [index.html](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/index.html).

Se detectaron **5 vulnerabilidades**:
- 🟠 **1 Alta**
- 🟡 **3 Medias**
- 🔵 **1 Baja**

---

## 2. Matriz de Hallazgos

| ID | Vulnerabilidad | Severidad | CWE / OWASP | Archivo / Componente Afectado | Complejidad de Corrección |
|:---|:---|:---:|:---:|:---|:---:|
| **SEC-FE-01** | Ausencia de Cabeceras de Seguridad Críticas en Nginx (Clickjacking/XSS) | **Alta** | CWE-1021 / OWASP A05 | [nginx.conf:1-27](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/nginx.conf#L1-L27) | Baja |
| **SEC-FE-02** | Divulgación de Versión del Servidor Nginx (Server Tokens) | **Media** | CWE-200 / OWASP A05 | [nginx.conf](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/nginx.conf) | Baja |
| **SEC-FE-03** | Almacenamiento Inseguro de Metadatos de Usuario en `sessionStorage` | **Media** | CWE-312 / OWASP A02 | [app.js:122](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/app.js#L122) | Baja |
| **SEC-FE-04** | Inyección Dinámica de `<script>` en el DOM sin Integridad (SRI) | **Media** | CWE-353 / OWASP A08 | [app.js:56-87](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/app.js#L56-L87) | Media |
| **SEC-FE-05** | Secreto de Respaldo Hardcodeado en el Código del Cliente | **Baja** | CWE-798 / OWASP A07 | [app.js:21](file:///c:/Users/gaela/Desktop/9no/Gestión%20de%20seguridad%20de%20la%20información/12oct/trabajo7-frontend/app.js#L21) | Baja |

---

## 3. Detalle de Vulnerabilidades y Propuestas de Remediación

### SEC-FE-01: Ausencia de Cabeceras de Seguridad Críticas en Nginx
- **Severidad:** 🟠 Alta
- **Descripción:** La configuración de Nginx no define ninguna de las cabeceras recomendadas por OWASP Secure Headers Project:
  - Falta `X-Frame-Options: SAMEORIGIN` (vulnerable a Clickjacking / UI Redressing).
  - Falta `X-Content-Type-Options: nosniff` (vulnerable a ataques de confusión de tipo MIME).
  - Falta `Content-Security-Policy` (CSP).
  - Falta `Referrer-Policy: strict-origin-when-cross-origin`.
- **Impacto:** Posibilidad de embeber el dashboard en un iframe malicioso para engañar al usuario y capturar clics o credenciales.
- **Remediación propuesta:** Incorporar en el bloque `server` de `nginx.conf`:
  ```nginx
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:5000;" always;
  ```

---

### SEC-FE-02: Divulgación de Versión del Servidor Nginx (Server Tokens)
- **Severidad:** 🟡 Media
- **Descripción:** Nginx emite por defecto el encabezado `Server: nginx/1.25.x` con el número de versión exacta.
- **Impacto:** Permite a atacantes identificar versiones específicas con vulnerabilidades conocidas (CVEs de Nginx).
- **Remediación propuesta:** Desactivar la emisión de la versión en `nginx.conf`:
  ```nginx
  server_tokens off;
  ```

---

### SEC-FE-03: Almacenamiento Inseguro de Metadatos de Usuario en `sessionStorage`
- **Severidad:** 🟡 Media
- **Descripción:** Tras el inicio de sesión, `app.js` serializa el objeto completo del usuario recibido del backend (incluyendo DN de LDAP, roles y correo) en `sessionStorage`:
  ```javascript
  sessionStorage.setItem("vault_ldap_user", JSON.stringify(currentUser));
  ```
- **Impacto:** Cualquier script que se ejecute en el contexto del origen (vía XSS o extensión de navegador comprometida) puede leer y exfiltrar la identidad del usuario y estructura del directorio LDAP.
- **Remediación propuesta:** Almacenar únicamente un token de sesión opaco o identificador mínimo, evitando guardar rutas completas de LDAP (`dn`) en el almacenamiento local del navegador.

---

### SEC-FE-04: Inyección Dinámica de `<script>` en el DOM sin Integridad (SRI)
- **Severidad:** 🟡 Media
- **Descripción:** Para refrescar la clave API rotada, la función `reloadEnvConfig()` crea dinámicamente una etiqueta `<script>` y la inserta en `document.head` con un timestamp para burlar el caché:
  ```javascript
  const newScript = document.createElement("script");
  newScript.src = `env-config.js?_t=${Date.now()}`;
  ```
- **Impacto:** El navegador ejecuta código JavaScript arbitrario inyectado en el DOM sin verificar integridad mediante hashes criptográficos ni firmas. Si el archivo compartido es manipulado, se obtiene ejecución de código en el cliente.
- **Remediación propuesta:** Cambiar el mecanismo de sincronización para que el rotador genere un archivo JSON estático (`env-config.json`) y el frontend lo consulte de forma segura mediante `fetch()` y `response.json()`, eliminando la ejecución dinámica de scripts en el DOM.

---

### SEC-FE-05: Secreto de Respaldo Hardcodeado en el Código del Cliente
- **Severidad:** 🔵 Baja
- **Descripción:** En `getApiKey()`, si no existe `window._env_`, se retorna una clave por defecto: `"INITIAL-SECRET-2026-KEY"`.
- **Impacto:** Revela valores por defecto del sistema directamente en los fuentes públicos del frontend.
- **Remediación propuesta:** Si el entorno no está disponible, retornar cadena vacía y mostrar un estado de "Clave no sincronizada" en lugar de utilizar un secreto por defecto.
