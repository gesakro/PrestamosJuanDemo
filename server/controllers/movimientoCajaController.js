import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let MovimientoCaja = null;
let Papeleria = null;
let registrarBorrado = null;

if (!isDemoMode) {
  const mongoose = await import('mongoose');
  const movModule = await import('../models/MovimientoCaja.js');
  const papModule = await import('../models/Papeleria.js');
  const histCtrl = await import('./historialBorradoController.js');
  MovimientoCaja = movModule.default;
  Papeleria = papModule.default;
  registrarBorrado = histCtrl.registrarBorrado;
}

export const getMovimientosCaja = async (req, res, next) => {
  try {
    const { tipo, tipoMovimiento, fechaInicio, fechaFin, page = 1, limit = 100 } = req.query;

    if (isDemoMode) {
      let results = store.findAll('movimientosCaja');
      if (tipo) results = results.filter(m => m.tipo === tipo);
      if (tipoMovimiento) results = results.filter(m => m.tipoMovimiento === tipoMovimiento);
      if (fechaInicio) { const d = new Date(fechaInicio); d.setHours(0, 0, 0, 0); results = results.filter(m => new Date(m.fecha) >= d); }
      if (fechaFin) { const d = new Date(fechaFin); d.setHours(23, 59, 59, 999); results = results.filter(m => new Date(m.fecha) <= d); }
      results.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const total = results.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const data = results.slice(skip, skip + parseInt(limit));

      // Calcular totales
      const totalesMap = {};
      results.forEach(m => {
        if (!totalesMap[m.tipo]) totalesMap[m.tipo] = 0;
        totalesMap[m.tipo] += m.valor || 0;
      });
      const totales = Object.entries(totalesMap).map(([_id, total]) => ({ _id, total }));

      return res.status(200).json({ success: true, count: data.length, total, totales, data });
    }

    const query = {};
    if (tipo) query.tipo = tipo;
    if (tipoMovimiento) query.tipoMovimiento = tipoMovimiento;
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) { const d = new Date(fechaInicio); d.setHours(0, 0, 0, 0); query.fecha.$gte = d; }
      if (fechaFin) { const d = new Date(fechaFin); d.setHours(23, 59, 59, 999); query.fecha.$lte = d; }
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const movimientos = await MovimientoCaja.find(query).sort({ fecha: -1, fechaCreacion: -1 }).skip(skip).limit(parseInt(limit));
    const total = await MovimientoCaja.countDocuments(query);
    const totales = await MovimientoCaja.aggregate([{ $match: query }, { $group: { _id: '$tipo', total: { $sum: '$valor' } } }]);
    res.status(200).json({ success: true, count: movimientos.length, total, totales, data: movimientos });
  } catch (error) { next(error); }
};

export const getMovimientoCaja = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const m = store.findById('movimientosCaja', req.params.id) ||
        store.findAll('movimientosCaja').find(x => x.id === req.params.id);
      if (!m) return res.status(404).json({ success: false, error: 'Movimiento de caja no encontrado' });
      return res.status(200).json({ success: true, data: m });
    }
    const movimiento = await MovimientoCaja.findOne({ $or: [{ _id: req.params.id }, { id: req.params.id }] });
    if (!movimiento) return res.status(404).json({ success: false, error: 'Movimiento de caja no encontrado' });
    res.status(200).json({ success: true, data: movimiento });
  } catch (error) { next(error); }
};

export const createMovimientoCaja = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (!data.id && !data._id) data.id = `MOV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    else if (data._id && !data.id) data.id = data._id.toString();
    else if (data.id && !data._id) data._id = data.id;

    if (data.valor !== undefined) data.valor = Number(data.valor);
    if (data.papeleria !== undefined) data.papeleria = Number(data.papeleria);
    if (data.montoEntregado !== undefined) data.montoEntregado = Number(data.montoEntregado);
    if (data.caja !== undefined) data.caja = Number(data.caja);
    if (data.fecha) { const f = new Date(data.fecha); f.setHours(12, 0, 0, 0); data.fecha = f; }
    if (!data.tipoMovimiento) data.tipoMovimiento = 'flujoCaja';

    if (isDemoMode) {
      const mov = store.create('movimientosCaja', data);
      if (data.tipo === 'prestamo' && data.papeleria > 0) {
        store.create('papeleria', {
          tipo: 'ingreso', descripcion: `Papelería préstamo - ${data.descripcion || 'Sin descripción'}`,
          cantidad: data.papeleria, fecha: data.fecha, movimientoId: mov._id,
          caja: data.caja, tipoMovimiento: 'ingreso',
          ciudadPapeleria: data.caja === 3 ? 'Ciudad Demo 2' : 'Ciudad Demo 1'
        });
      }
      return res.status(201).json({ success: true, data: mov });
    }

    const mongoose = (await import('mongoose')).default;
    if (!data.id) data.id = `MOV-${new mongoose.Types.ObjectId().toString()}`;
    const movimiento = await MovimientoCaja.create(data);
    if (movimiento.tipo === 'prestamo' && movimiento.papeleria > 0) {
      try {
        await Papeleria.create({
          tipo: 'ingreso', descripcion: `Papelería préstamo - ${movimiento.descripcion || 'Sin descripción'}`,
          cantidad: movimiento.papeleria, fecha: movimiento.fecha, movimientoId: movimiento._id,
          caja: movimiento.caja, tipoMovimiento: 'ingreso',
          ciudadPapeleria: movimiento.caja === 3 ? 'Guadalajara de Buga' : 'Tuluá'
        });
      } catch (e) { console.error('Error creando papelería automática:', e); }
    }
    res.status(201).json({ success: true, data: movimiento });
  } catch (error) { next(error); }
};

export const updateMovimientoCaja = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const m = store.findById('movimientosCaja', req.params.id) ||
        store.findAll('movimientosCaja').find(x => x.id === req.params.id);
      if (!m) return res.status(404).json({ success: false, error: 'Movimiento de caja no encontrado' });
      const updated = store.update('movimientosCaja', m._id, req.body);
      return res.status(200).json({ success: true, data: updated });
    }
    const movimiento = await MovimientoCaja.findOneAndUpdate(
      { $or: [{ _id: req.params.id }, { id: req.params.id }] }, req.body, { new: true, runValidators: true }
    );
    if (!movimiento) return res.status(404).json({ success: false, error: 'Movimiento de caja no encontrado' });
    res.status(200).json({ success: true, data: movimiento });
  } catch (error) { next(error); }
};

export const deleteMovimientoCaja = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const m = store.findById('movimientosCaja', req.params.id) ||
        store.findAll('movimientosCaja').find(x => x.id === req.params.id);
      if (!m) return res.status(404).json({ success: false, error: 'Movimiento de caja no encontrado' });
      // Delete associated papeleria
      const papItems = store.findAll('papeleria').filter(p => p.movimientoId === m._id);
      papItems.forEach(p => store.delete('papeleria', p._id));
      store.create('historialBorrados', {
        tipo: 'movimiento-caja', idOriginal: req.params.id, detalles: m,
        usuario: req.user._id, usuarioNombre: req.user.nombre,
        metadata: { nombreItem: m.descripcion || 'Sin descripción', valor: m.valor, tipoCaja: m.tipo },
        fechaBorrado: new Date()
      });
      store.delete('movimientosCaja', m._id);
      return res.status(200).json({ success: true, message: 'Movimiento de caja eliminado correctamente' });
    }

    const movimiento = await MovimientoCaja.findOne({ $or: [{ _id: req.params.id }, { id: req.params.id }] });
    if (!movimiento) return res.status(404).json({ success: false, error: 'Movimiento de caja no encontrado' });
    const deleted = await MovimientoCaja.findOneAndDelete({ $or: [{ _id: req.params.id }, { id: req.params.id }] });
    try {
      if (deleted) {
        await Papeleria.findOneAndDelete({ movimientoId: deleted._id });
        await registrarBorrado({
          tipo: 'movimiento-caja', idOriginal: req.params.id, detalles: deleted,
          usuario: req.user._id, usuarioNombre: req.user.nombre,
          metadata: { nombreItem: deleted.descripcion || 'Sin descripción', valor: deleted.valor, tipoCaja: deleted.tipo, motivo: req.body.motivo || 'No especificado' }
        });
      }
    } catch (e) { console.error('Error post-delete:', e); }
    res.status(200).json({ success: true, message: 'Movimiento de caja eliminado correctamente' });
  } catch (error) { next(error); }
};
