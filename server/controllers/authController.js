import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';
import { generateToken } from '../utils/generateToken.js';
import bcrypt from 'bcryptjs';

// Importar Persona solo si NO estamos en modo demo
let Persona = null;
if (!isDemoMode) {
  const module = await import('../models/Persona.js');
  Persona = module.default;
}

// Permisos por rol (para modo demo)
const DEMO_PERMISSIONS = {
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

/**
 * @desc    Autenticar usuario y obtener token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Por favor proporciona usuario y contraseña'
      });
    }

    if (isDemoMode) {
      // ---- MODO DEMO: buscar en memoria ----
      const persona = store.findOne('personas', { username: username.toLowerCase() });

      if (!persona) {
        return res.status(401).json({
          success: false,
          error: 'Usuario o contraseña incorrectos'
        });
      }

      if (!persona.activo) {
        return res.status(401).json({
          success: false,
          error: 'Usuario inactivo'
        });
      }

      // Verificar contraseña con bcrypt
      const isMatch = await bcrypt.compare(password, persona.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Usuario o contraseña incorrectos'
        });
      }

      // Actualizar último acceso
      store.update('personas', persona._id, { ultimoAcceso: new Date() });

      const token = generateToken(persona._id);

      const personaData = {
        id: persona._id,
        username: persona.username,
        nombre: persona.nombre,
        email: persona.email,
        role: persona.role,
        permissions: DEMO_PERMISSIONS[persona.role] || {},
        ultimoAcceso: new Date(),
        ciudad: persona.ciudad || null,
        ocultarProrroga: persona.ocultarProrroga
      };

      return res.status(200).json({
        success: true,
        token,
        data: personaData
      });
    }

    // ---- MODO PRODUCCIÓN: Mongoose ----
    const persona = await Persona.findOne({ username: username.toLowerCase() }).select('+password');

    if (!persona) {
      return res.status(401).json({
        success: false,
        error: 'Usuario o contraseña incorrectos'
      });
    }

    if (!persona.activo) {
      return res.status(401).json({
        success: false,
        error: 'Usuario inactivo'
      });
    }

    const isMatch = await persona.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Usuario o contraseña incorrectos'
      });
    }

    persona.ultimoAcceso = new Date();
    await persona.save();

    const token = generateToken(persona._id);

    const personaData = {
      id: persona._id,
      username: persona.username,
      nombre: persona.nombre,
      email: persona.email,
      role: persona.role,
      permissions: persona.getPermissions(),
      ultimoAcceso: persona.ultimoAcceso,
      ciudad: persona.ciudad || null,
      ocultarProrroga: persona.ocultarProrroga
    };

    res.status(200).json({
      success: true,
      token,
      data: personaData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener usuario actual
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const persona = store.findById('personas', req.user._id);
      if (!persona) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      }
      return res.status(200).json({
        success: true,
        data: {
          id: persona._id,
          username: persona.username,
          nombre: persona.nombre,
          email: persona.email,
          role: persona.role,
          permissions: DEMO_PERMISSIONS[persona.role] || {},
          ultimoAcceso: persona.ultimoAcceso,
          fechaCreacion: persona.fechaCreacion,
          ciudad: persona.ciudad || null,
          ocultarProrroga: persona.ocultarProrroga
        }
      });
    }

    // Producción
    const persona = await Persona.findById(req.user._id);
    if (!persona) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    res.status(200).json({
      success: true,
      data: {
        id: persona._id,
        username: persona.username,
        nombre: persona.nombre,
        email: persona.email,
        role: persona.role,
        permissions: persona.getPermissions(),
        ultimoAcceso: persona.ultimoAcceso,
        fechaCreacion: persona.fechaCreacion,
        ciudad: persona.ciudad || null,
        ocultarProrroga: persona.ocultarProrroga
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cambiar contraseña
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Por favor proporciona la contraseña actual y la nueva contraseña'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres'
      });
    }

    if (isDemoMode) {
      const persona = store.findById('personas', req.user._id);
      const isMatch = await bcrypt.compare(currentPassword, persona.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      store.update('personas', persona._id, { password: hashedPassword });
      return res.status(200).json({ success: true, message: 'Contraseña actualizada (modo demo — se reiniciará al reiniciar servidor)' });
    }

    // Producción
    const persona = await Persona.findById(req.user._id).select('+password');
    const isMatch = await persona.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });
    }

    persona.password = newPassword;
    await persona.save();

    res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    next(error);
  }
};
