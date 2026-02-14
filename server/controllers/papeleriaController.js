import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let PapeleriaModel = null;
if (!isDemoMode) {
  const module = await import('../models/Papeleria.js');
  PapeleriaModel = module.default;
}

export const getPapeleria = async (req, res, next) => {
  try {
    const { tipo, fechaInicio, fechaFin, search, ciudadPapeleria } = req.query;

    if (isDemoMode) {
      let results = store.findAll('papeleria');
      // Filtro por ciudad según rol
      if (req.user && req.user.role === 'domiciliario') {
        const ciudad = req.user.ciudad === 'Ciudad Demo 2' ? 'Ciudad Demo 2' : 'Ciudad Demo 1';
        results = results.filter(p => p.ciudadPapeleria === ciudad);
      } else if (ciudadPapeleria) {
        results = results.filter(p => p.ciudadPapeleria === ciudadPapeleria);
      }
      if (tipo && tipo !== 'all') results = results.filter(p => p.tipo === tipo);
      if (fechaInicio) { const d = new Date(fechaInicio); d.setHours(0, 0, 0, 0); results = results.filter(p => new Date(p.fecha) >= d); }
      if (fechaFin) { const d = new Date(fechaFin); d.setHours(23, 59, 59, 999); results = results.filter(p => new Date(p.fecha) <= d); }
      if (search) {
        const lower = search.toLowerCase();
        results = results.filter(p => (p.descripcion && p.descripcion.toLowerCase().includes(lower)) || (p.prestamoId && p.prestamoId.toLowerCase().includes(lower)));
      }
      results.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return res.status(200).json({ success: true, count: results.length, data: results });
    }

    const query = {};
    if (req.user && req.user.role === 'domiciliario') {
      query.ciudadPapeleria = req.user.ciudad === 'Guadalajara de Buga' ? 'Guadalajara de Buga' : 'Tuluá';
    } else if (ciudadPapeleria) { query.ciudadPapeleria = ciudadPapeleria; }
    if (tipo && tipo !== 'all') query.tipo = tipo;
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) { const d = new Date(fechaInicio); d.setHours(0, 0, 0, 0); query.fecha.$gte = d; }
      if (fechaFin) { const d = new Date(fechaFin); d.setHours(23, 59, 59, 999); query.fecha.$lte = d; }
    }
    if (search) query.$or = [{ descripcion: { $regex: search, $options: 'i' } }, { prestamoId: { $regex: search, $options: 'i' } }];
    const transacciones = await PapeleriaModel.find(query).sort({ fecha: -1 });
    res.status(200).json({ success: true, count: transacciones.length, data: transacciones });
  } catch (error) { next(error); }
};

export const createPapeleria = async (req, res, next) => {
  try {
    const { fecha } = req.body;
    let fechaTransaccion = new Date();
    if (fecha) {
      const f = new Date(fecha);
      if (!isNaN(f.getTime())) { f.setHours(12, 0, 0, 0); fechaTransaccion = f; }
    }
    let ciudadPapeleria = req.body.ciudadPapeleria;
    if (!ciudadPapeleria && req.user) {
      if (isDemoMode) {
        ciudadPapeleria = req.user.ciudad === 'Ciudad Demo 2' ? 'Ciudad Demo 2' : 'Ciudad Demo 1';
      } else {
        ciudadPapeleria = req.user.ciudad === 'Guadalajara de Buga' ? 'Guadalajara de Buga' : 'Tuluá';
      }
    }
    if (!ciudadPapeleria) ciudadPapeleria = isDemoMode ? 'Ciudad Demo 1' : 'Tuluá';

    if (isDemoMode) {
      const item = store.create('papeleria', {
        ...req.body, fecha: fechaTransaccion, ciudadPapeleria,
        registradoPor: req.user ? req.user.nombre : 'Sistema'
      });
      return res.status(201).json({ success: true, data: item });
    }

    const nuevaTransaccion = await PapeleriaModel.create({
      ...req.body, fecha: fechaTransaccion, ciudadPapeleria,
      registradoPor: req.user ? req.user.nombre : 'Sistema'
    });
    res.status(201).json({ success: true, data: nuevaTransaccion });
  } catch (error) { next(error); }
};

export const updatePapeleria = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const item = store.findById('papeleria', req.params.id);
      if (!item) return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
      const data = { ...req.body };
      if (data.fecha) { const f = new Date(data.fecha); f.setHours(12, 0, 0, 0); data.fecha = f; }
      else delete data.fecha;
      data.registradoPor = req.user ? (req.user.nombre || req.user.username || 'Sistema') : 'Sistema';
      const updated = store.update('papeleria', req.params.id, data);
      return res.status(200).json({ success: true, data: updated });
    }

    let transaccion = await PapeleriaModel.findById(req.params.id);
    if (!transaccion) return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
    const datosActualizar = { ...req.body };
    if (datosActualizar.fecha) { const f = new Date(datosActualizar.fecha); f.setHours(12, 0, 0, 0); datosActualizar.fecha = f; }
    else delete datosActualizar.fecha;
    datosActualizar.registradoPor = req.user ? (req.user.nombre || req.user.username || 'Sistema') : 'Sistema';
    transaccion = await PapeleriaModel.findByIdAndUpdate(req.params.id, datosActualizar, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: transaccion });
  } catch (error) { next(error); }
};

export const deletePapeleria = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const item = store.findById('papeleria', req.params.id);
      if (!item) return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
      store.delete('papeleria', req.params.id);
      return res.status(200).json({ success: true, data: {} });
    }
    const transaccion = await PapeleriaModel.findById(req.params.id);
    if (!transaccion) return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
    await PapeleriaModel.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, data: {} });
  } catch (error) { next(error); }
};
