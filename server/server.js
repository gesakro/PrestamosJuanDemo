import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { connectDB } from './config/database.js';
import { isDemoMode } from './config/demoMode.js';
import store from './repositories/inMemoryStore.js';
import { applySecurityMiddleware } from './middleware/security.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import routes from './routes/index.js';

// Cargar variables de entorno
dotenv.config();

// Inicializar base de datos (o modo demo)
const startServer = async () => {
  // Conectar DB o inicializar store en memoria
  if (isDemoMode) {
    await store.init();
  } else {
    await connectDB();
  }

  // Inicializar Express
  const app = express();

  // Middleware de seguridad
  applySecurityMiddleware(app);

  // Body parser - con límite aumentado para importación de backups grandes
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Logger de requests (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  // Rutas de la API
  app.use('/api', routes);

  // Endpoint de reset para modo demo
  if (isDemoMode) {
    app.post('/api/demo/reset', async (req, res) => {
      try {
        await store.reset();
        res.json({
          success: true,
          message: 'Datos demo reiniciados correctamente'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Error al reiniciar datos demo'
        });
      }
    });

    app.get('/api/demo/status', (req, res) => {
      res.json({
        success: true,
        demoMode: true,
        message: 'Servidor corriendo en modo DEMO',
        collections: Object.keys(store.collections).reduce((acc, key) => {
          acc[key] = store.collections[key].size;
          return acc;
        }, {})
      });
    });
  }

  // Ruta raíz
  app.get('/', (req, res) => {
    res.json({
      message: isDemoMode
        ? '🎭 API de Sistema de Gestión de Créditos (DEMO)'
        : 'API de Sistema de Gestión de Préstamos',
      version: '1.0.0',
      demoMode: isDemoMode,
      endpoints: {
        clientes: '/api/clientes',
        creditos: '/api/creditos',
        movimientosCaja: '/api/movimientos-caja',
        alertas: '/api/alertas',
        health: '/api/health',
        ...(isDemoMode && {
          demoReset: '/api/demo/reset',
          demoStatus: '/api/demo/status'
        })
      }
    });
  });

  // Middleware de manejo de errores
  app.use(notFound);
  app.use(errorHandler);

  // Configurar puerto
  const PORT = process.env.PORT || 5000;

  // Iniciar servidor
  app.listen(PORT, () => {
    if (isDemoMode) {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║      🎭  MODO DEMO ACTIVO                   ║');
      console.log('║  Los datos se almacenan solo en memoria      ║');
      console.log('║  No se requiere MongoDB                      ║');
      console.log('║  Reinicia el servidor para resetear datos    ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
      console.log('👤 Usuarios demo:');
      console.log('   admin / demo123 (CEO - acceso total)');
      console.log('   asesor / demo123 (Administrador)');
      console.log('   cobrador / demo123 (Domiciliario)');
      console.log('');
    }
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📝 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API disponible en: http://localhost:${PORT}/api`);
  });
};

startServer().catch(err => {
  console.error('❌ Error al iniciar el servidor:', err);
  process.exit(1);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('❌ Error no manejado (Rejection):', err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado (Exception):', err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
