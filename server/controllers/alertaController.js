import { createDualCRUD } from '../utils/dualCRUD.js';
import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

const { getAll: getAlertas, getById: getAlerta, create: createAlerta, update: updateAlerta, remove: deleteAlerta } = createDualCRUD(
  'alertas', 'Alerta', '../models/Alerta.js', {
  entityName: 'Alerta',
  populateFields: [{ path: 'cliente', select: 'nombre documento' }, 'credito'],
  sortField: 'fechaCreacion', sortOrder: -1
}
);

export { getAlertas, getAlerta, createAlerta, updateAlerta, deleteAlerta };

export const marcarComoNotificada = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const alerta = store.update('alertas', req.params.id, { notificada: true });
      if (!alerta) return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
      return res.status(200).json({ success: true, data: alerta });
    }
    const Alerta = (await import('../models/Alerta.js')).default;
    const alerta = await Alerta.findByIdAndUpdate(req.params.id, { notificada: true }, { new: true })
      .populate('cliente', 'nombre documento').populate('credito');
    if (!alerta) return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
    res.status(200).json({ success: true, data: alerta });
  } catch (error) { next(error); }
};
