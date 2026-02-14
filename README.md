# 🚀 FinanDemo - Versión de Demostración

Este repositorio contiene una versión **exclusiva para demostración** del Sistema de Gestión de Créditos "FinanDemo".

Esta versión está optimizada para ejecutarse localmente sin necesidad de una base de datos externa (MongoDB), utilizando almacenamiento en memoria volátil.

## 📋 Prerrequisitos

- [Node.js](https://nodejs.org/) (versión 16 o superior).

## 🛠️ Instalación

1.  **Clonar el repositorio** (si aún no lo has hecho).
2.  **Instalar dependencias del Servidor:**
    ```bash
    cd server
    npm install
    ```
3.  **Instalar dependencias del Cliente:**
    ```bash
    cd ../client
    npm install
    ```

## ▶️ Ejecución de la Demo

Para iniciar la demostración completa (Frontend + Backend en modo memoria), necesitas dos terminales:

### Terminal 1: Backend (Servidor)
```bash
cd server
npm run demo:win
```
*Nota: Esto iniciará el servidor en el puerto 5000 con datos de prueba precargados.*

### Terminal 2: Frontend (Cliente)
```bash
cd client
npm run dev
```
*El sistema estará disponible en: [http://localhost:5173](http://localhost:5173)*

## 🔑 Credenciales de Acceso

El sistema viene con usuarios preconfigurados para probar los diferentes roles:

| Rol | Usuario | Contraseña | Descripción |
| :--- | :--- | :--- | :--- |
| **CEO / Super Admin** | `admin` | `demo123` | Acceso total al sistema, todas las carteras y configuraciones. |
| **Administrador** | `asesor` | `demo123` | Gestión de clientes y créditos, vista de reportes. |
| **Domiciliario** | `cobrador` | `demo123` | Vista limitada a sus rutas y recuado en campo. |

## 📝 Notas Importantes

- **Datos Volátiles:** Al ser una demo en memoria, **todos los datos creados o modificados se perderán** al detener el servidor (Backend). Cada vez que inicies `npm run demo:win`, el sistema volverá a su estado inicial.
- **Modo Demo:** Verás una etiqueta "MODO DEMO" en la interfaz para recordarte que estás en un entorno de pruebas.
- **Funcionalidades Simuladas:** Algunas funciones como copias de seguridad o validaciones estrictas de base de datos están simuladas para facilitar la experiencia de uso rápido.

---
*FinanDemo - Sistema de Gestión de Créditos*
