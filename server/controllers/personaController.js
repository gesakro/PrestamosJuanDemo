import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';
import bcrypt from 'bcryptjs';

let Persona = null;
if (!isDemoMode) {
  const module = await import('../models/Persona.js');
  Persona = module.default;
}

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

export const getPersonas = async (req, res, next) => {
  try {
    const { role, activo, search, page = 1, limit = 50 } = req.query;
    if (isDemoMode) {
      let results = store.findAll('personas');
      if (role) results = results.filter(p => p.role === role);
      if (activo !== undefined) results = results.filter(p => p.activo === (activo === 'true'));
      if (search) {
        const lower = search.toLowerCase();
        results = results.filter(p =>
          (p.nombre && p.nombre.toLowerCase().includes(lower)) ||
          (p.username && p.username.toLowerCase().includes(lower)) ||
          (p.email && p.email.toLowerCase().includes(lower))
        );
      }
      results.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
      const data = results.map(({ password, ...p }) => ({
        ...p, permissions: DEMO_PERMISSIONS[p.role] || {}
      }));
      const total = data.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      return res.status(200).json({ success: true, count: data.length, total, data: data.slice(skip, skip + parseInt(limit)) });
    }
    const query = {};
    if (role) query.role = role;
    if (activo !== undefined) query.activo = activo === 'true';
    if (search) query.$or = [{ nombre: { $regex: search, $options: 'i' } }, { username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const personas = await Persona.find(query).select('-password').sort({ fechaCreacion: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Persona.countDocuments(query);
    res.status(200).json({ success: true, count: personas.length, total, data: personas });
  } catch (error) { next(error); }
};

export const getPersona = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const p = store.findById('personas', req.params.id);
      if (!p) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
      const { password, ...data } = p;
      return res.status(200).json({ success: true, data: { ...data, permissions: DEMO_PERMISSIONS[p.role] || {} } });
    }
    const persona = await Persona.findById(req.params.id).select('-password');
    if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
    res.status(200).json({ success: true, data: persona });
  } catch (error) { next(error); }
};

export const createPersona = async (req, res, next) => {
  try {
    const { username, password, nombre, email, role, ciudad } = req.body;
    if (!username || !password || !nombre || !role) {
      return res.status(400).json({ success: false, error: 'Campos requeridos: username, password, nombre, role' });
    }

    if (isDemoMode) {
      const existing = store.findOne('personas', { username: username.toLowerCase() });
      if (existing) return res.status(400).json({ success: false, error: 'El username ya existe' });
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      const persona = store.create('personas', {
        username: username.toLowerCase(), password: hashedPassword, nombre, email, role, ciudad,
        activo: true, fechaCreacion: new Date(), ocultarProrroga: role !== 'ceo'
      });
      const { password: _, ...data } = persona;
      return res.status(201).json({ success: true, data: { ...data, permissions: DEMO_PERMISSIONS[role] || {} } });
    }

    const existing = await Persona.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, error: 'El username ya existe' });
    const persona = await Persona.create({ username: username.toLowerCase(), password, nombre, email, role, ciudad, activo: true });
    const personaRes = await Persona.findById(persona._id).select('-password');
    res.status(201).json({ success: true, data: personaRes });
  } catch (error) { next(error); }
};

export const updatePersona = async (req, res, next) => {
  try {
    const updates = { ...req.body };

    if (isDemoMode) {
      const persona = store.findById('personas', req.params.id);
      if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
      if (updates.password) {
        const salt = await bcrypt.genSalt(10);
        updates.password = await bcrypt.hash(updates.password, salt);
      }
      if (updates.username) updates.username = updates.username.toLowerCase();
      const updated = store.update('personas', req.params.id, updates);
      const { password, ...data } = updated;
      return res.status(200).json({ success: true, data: { ...data, permissions: DEMO_PERMISSIONS[updated.role] || {} } });
    }

    if (updates.username) updates.username = updates.username.toLowerCase();
    const persona = await Persona.findById(req.params.id);
    if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
    Object.assign(persona, updates);
    await persona.save();
    const personaRes = await Persona.findById(persona._id).select('-password');
    res.status(200).json({ success: true, data: personaRes });
  } catch (error) { next(error); }
};

export const deletePersona = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const persona = store.findById('personas', req.params.id);
      if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
      if (persona.role === 'ceo') return res.status(400).json({ success: false, error: 'No se puede eliminar al CEO' });
      store.delete('personas', req.params.id);
      return res.status(200).json({ success: true, message: 'Persona eliminada correctamente' });
    }
    const persona = await Persona.findById(req.params.id);
    if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
    if (persona.role === 'ceo') return res.status(400).json({ success: false, error: 'No se puede eliminar al CEO' });
    await Persona.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Persona eliminada correctamente' });
  } catch (error) { next(error); }
};

export const getPermissions = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const persona = store.findById('personas', req.params.id);
      if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
      return res.status(200).json({ success: true, data: { role: persona.role, permissions: DEMO_PERMISSIONS[persona.role] || {} } });
    }
    const persona = await Persona.findById(req.params.id);
    if (!persona) return res.status(404).json({ success: false, error: 'Persona no encontrada' });
    res.status(200).json({ success: true, data: { role: persona.role, permissions: persona.getPermissions() } });
  } catch (error) { next(error); }
};
