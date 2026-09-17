# Módulo Frontend Web (Dashboard + Autenticación LDAP)

Este módulo implementa la interfaz web de usuario servida mediante **Nginx**, integrando pantalla de Login con validación contra el directorio **OpenLDAP**, monitor en vivo de rotación de secretos para 3 servicios y visualización de datos cifrados con Fernet.

---

## 🏛️ Características Principales

1. **Pantalla de Login LDAP**:
   - Autenticación directa contra `openldap:389` a través del backend.
   - Acceso rápido con botones de autocompletado para `alice` y `bob`.
   - Visualización de datos de perfil (DN, nombre completo, email y roles de grupo).
2. **Sincronización en Caliente sin Caché**:
   - `env-config.js` servido con cabeceras `Cache-Control: no-cache, no-store`.
   - Detección automática en segundo plano de nuevas claves tras la rotación periódica.
3. **Bóveda Cifrada Interactiva**:
   - Consulta de registros desencriptados en vivo mediante `x-api-key`.
   - Inserción de nuevos secretos con cifrado simétrico en reposo.
   - Inspección visual de ciphertexts en la base de datos SQLite.

---

## 🛠️ Ejecución Local

Acceder vía navegador a:
```text
http://localhost:8080
```
