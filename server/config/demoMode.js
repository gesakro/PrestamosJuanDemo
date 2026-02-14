/**
 * Configuración de Modo Demo
 * Cuando DEMO_MODE=true, el sistema funciona sin MongoDB
 * usando almacenamiento en memoria.
 */
import dotenv from 'dotenv';
dotenv.config();

export const isDemoMode = process.env.DEMO_MODE?.trim() === 'true';

// JWT secret por defecto para demo (en producción debe ser diferente)
if (isDemoMode && !process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'demo-secret-key-not-for-production';
}

export default isDemoMode;
