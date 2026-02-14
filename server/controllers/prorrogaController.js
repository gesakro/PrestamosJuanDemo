import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let ProrrogaCuota = null;
if (!isDemoMode) {
  const module = await import('../models/ProrrogaCuota.js');
  ProrrogaCuota = module.default;
}

export const obtenerTodasProrrogas = async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({ success: true, data: store.findAll('prorrogas') });
    }
    const prorrogas = await ProrrogaCuota.find({});
    res.json({ success: true, data: prorrogas });
  } catch (error) {
    console.error('Error al obtener todas las prórrogas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener prórrogas' });
  }
};

export const obtenerProrrogasPorCredito = async (req, res) => {
  try {
    const { clienteId, creditoId } = req.params;
    if (isDemoMode) {
      const results = store.findAll('prorrogas').filter(p => p.clienteId === clienteId && p.creditoId === creditoId);
      return res.json({ success: true, data: results });
    }
    const prorrogas = await ProrrogaCuota.find({ clienteId, creditoId });
    res.json({ success: true, data: prorrogas });
  } catch (error) {
    console.error('Error al obtener prórrogas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener prórrogas' });
  }
};

export const guardarProrrogas = async (req, res) => {
  try {
    const { clienteId, creditoId, prorrogas } = req.body;
    if (isDemoMode) {
      for (const { nroCuota, fechaProrroga } of prorrogas) {
        const all = store.findAll('prorrogas');
        const existing = all.find(p => p.clienteId === clienteId && p.creditoId === creditoId && p.nroCuota === nroCuota);
        if (existing) {
          store.update('prorrogas', existing._id, { fechaProrroga: new Date(fechaProrroga), fechaModificacion: new Date() });
        } else {
          store.create('prorrogas', { clienteId, creditoId, nroCuota, fechaProrroga: new Date(fechaProrroga), fechaModificacion: new Date() });
        }
      }
      return res.json({ success: true, message: 'Prórrogas guardadas correctamente' });
    }
    const bulkOps = prorrogas.map(({ nroCuota, fechaProrroga }) => ({
      updateOne: { filter: { clienteId, creditoId, nroCuota }, update: { fechaProrroga: new Date(fechaProrroga), fechaModificacion: new Date() }, upsert: true }
    }));
    await ProrrogaCuota.bulkWrite(bulkOps);
    res.json({ success: true, message: 'Prórrogas guardadas correctamente' });
  } catch (error) {
    console.error('Error al guardar prórrogas:', error);
    res.status(500).json({ success: false, message: 'Error al guardar prórrogas' });
  }
};

export const eliminarProrroga = async (req, res) => {
  try {
    const { clienteId, creditoId, nroCuota } = req.params;
    if (isDemoMode) {
      const all = store.findAll('prorrogas');
      const existing = all.find(p => p.clienteId === clienteId && p.creditoId === creditoId && String(p.nroCuota) === String(nroCuota));
      if (existing) store.delete('prorrogas', existing._id);
      return res.json({ success: true, message: 'Prórroga eliminada correctamente' });
    }
    await ProrrogaCuota.deleteOne({ clienteId, creditoId, nroCuota });
    res.json({ success: true, message: 'Prórroga eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar prórroga:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar prórroga' });
  }
};
