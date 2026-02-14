import jwt from 'jsonwebtoken';
import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

// Importar Persona solo si NO estamos en modo demo
let Persona = null;
if (!isDemoMode) {
  const module = await import('../models/Persona.js');
  Persona = module.default;
}

/**
 * Middleware para proteger rutas - verificar token JWT
 */
export const protect = async (req, res, next) => {
  let token;

  // Verificar si el token está en el header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado, token no proporcionado'
    });
  }

  try {
    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (isDemoMode) {
      // En demo, buscar en el store en memoria
      const persona = store.findById('personas', decoded.id);
      if (!persona) {
        return res.status(401).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }
      if (!persona.activo) {
        return res.status(401).json({
          success: false,
          error: 'Usuario inactivo'
        });
      }
      // Simular los métodos de Mongoose en el objeto
      const { password, ...userWithoutPassword } = persona;
      req.user = {
        ...userWithoutPassword,
        hasPermission: (permission) => {

          return getDemoPermissions(persona.role)[permission] || false;
        },
        canAccess: (requiredRole) => {
          const roleHierarchy = { domiciliario: 1, supervisor: 2, administrador: 3, ceo: 4 };
          return roleHierarchy[persona.role] >= roleHierarchy[requiredRole];
        },
        getPermissions: () => getDemoPermissions(persona.role)
      };
    } else {
      // En producción, obtener usuario del token (sin password)
      req.user = await Persona.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      if (!req.user.activo) {
        return res.status(401).json({
          success: false,
          error: 'Usuario inactivo'
        });
      }
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado, token inválido'
    });
  }
};

/**
 * Permisos por rol (duplicado de Persona.js para uso en demo sin Mongoose)
 */
function getDemoPermissions(role) {
  const PERMISSIONS = {
    domiciliario: {
      verClientes: true, verCreditosActivos: true, verCreditosFinalizados: true,
      registrarPagos: true, agregarNotas: true, agregarMultas: true,
      crearClientes: false, editarClientes: false, eliminarClientes: false,
      crearCreditos: false, editarCreditos: false, eliminarCreditos: false,
      verEstadisticas: false, verConfiguracion: false, exportarDatos: false,
      importarDatos: false, limpiarDatos: false, verCaja: false, gestionarCaja: false
    },
    supervisor: {
      verClientes: true, verCreditosActivos: true, verCreditosFinalizados: true,
      registrarPagos: false, agregarNotas: true, agregarMultas: false,
      crearClientes: false, editarClientes: true, eliminarClientes: false,
      crearCreditos: false, editarCreditos: false, eliminarCreditos: false,
      verEstadisticas: false, verConfiguracion: false, exportarDatos: false,
      importarDatos: false, limpiarDatos: false, verCaja: false, gestionarCaja: false
    },
    administrador: {
      verClientes: true, verCreditosActivos: true, verCreditosFinalizados: true,
      registrarPagos: true, agregarNotas: true, agregarMultas: true,
      crearClientes: true, editarClientes: true, eliminarClientes: true,
      crearCreditos: true, editarCreditos: true, eliminarCreditos: false,
      verEstadisticas: true, verConfiguracion: false, exportarDatos: true,
      importarDatos: false, limpiarDatos: false, verCaja: true, gestionarCaja: true
    },
    ceo: {
      verClientes: true, verCreditosActivos: true, verCreditosFinalizados: true,
      registrarPagos: true, agregarNotas: true, agregarMultas: true,
      crearClientes: true, editarClientes: true, eliminarClientes: true,
      crearCreditos: true, editarCreditos: true, eliminarCreditos: true,
      verEstadisticas: true, verConfiguracion: true, exportarDatos: true,
      importarDatos: true, limpiarDatos: true, verCaja: true, gestionarCaja: true
    }
  };
  return PERMISSIONS[role] || {};
}

/**
 * Middleware para verificar permisos específicos
 */
export const authorize = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado'
      });
    }

    const hasPermission = permissions.some(permission => {
      if (isDemoMode) {
        return getDemoPermissions(req.user.role)[permission] || false;
      }
      return req.user.hasPermission(permission);
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para realizar esta acción'
      });
    }

    next();
  };
};

/**
 * Middleware para verificar rol mínimo
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado'
      });
    }

    const roleHierarchy = {
      domiciliario: 1,
      supervisor: 2,
      administrador: 3,
      ceo: 4
    };

    const hasRole = roles.some(role =>
      roleHierarchy[req.user.role] >= roleHierarchy[role] || req.user.role === role
    );

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: 'No tienes el rol necesario para realizar esta acción'
      });
    }

    next();
  };
};
