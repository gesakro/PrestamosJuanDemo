import { createDualCRUD } from '../utils/dualCRUD.js';
import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

const crud = createDualCRUD('visitas', 'Visita', '../models/Visita.js', {
  entityName: 'Visita',
  sortField: 'fechaVisita', sortOrder: 1,
  searchFields: ['solicitante.nombre', 'solicitante.cc', 'fiador.nombre', 'fiador.cc', 'numeroCliente'],
  dateFilterField: 'fechaVisita'
});

export const getVisitas = crud.getAll;
export const getVisita = crud.getById;
export const createVisita = crud.create;
export const updateVisita = crud.update;
export const deleteVisita = crud.remove;

export const completarVisita = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const visita = store.update('visitas', req.params.id, { completada: true });
      if (!visita) return res.status(404).json({ success: false, error: 'Visita no encontrada' });
      return res.status(200).json({ success: true, data: visita });
    }
    const Visita = (await import('../models/Visita.js')).default;
    const visita = await Visita.findByIdAndUpdate(req.params.id, { completada: true }, { new: true });
    if (!visita) return res.status(404).json({ success: false, error: 'Visita no encontrada' });
    res.status(200).json({ success: true, data: visita });
  } catch (error) { next(error); }
};
