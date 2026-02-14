import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { isDemoMode } from './demoMode.js';

dotenv.config();

/**
 * Conecta a la base de datos MongoDB.
 * En modo DEMO, no se conecta a MongoDB.
 */
export const connectDB = async () => {
  // En modo demo, no conectamos a MongoDB
  if (isDemoMode) {
    console.log('🎭 Modo DEMO activo — sin conexión a MongoDB');
    console.log('📦 Los datos se almacenan en memoria y se reinician al reiniciar el servidor');
    return null;
  }

  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    throw new Error('MONGO_URI no está definida en las variables de entorno');
  }

  try {
    const conn = await mongoose.connect(MONGO_URI, {
      // Opciones recomendadas para Mongoose 6+
    });

    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);

    // Manejar eventos de conexión
    mongoose.connection.on('error', (err) => {
      console.error('❌ Error de conexión a MongoDB:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB desconectado');
    });

    // Cerrar conexión al terminar la aplicación
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB conexión cerrada debido a terminación de la aplicación');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error.message);
    process.exit(1);
  }
};

export default connectDB;
