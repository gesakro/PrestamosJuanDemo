import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let NotaDiaria = null;
if (!isDemoMode) {
    const module = await import('../models/NotaDiaria.js');
    NotaDiaria = module.default;
}

export const getNotas = async (req, res, next) => {
    try {
        const { fecha } = req.params;
        if (isDemoMode) {
            const notas = store.findAll('notasDiarias');
            let nota = notas.find(n => n.fecha === fecha && n.usuario === 'ceo');
            if (!nota) {
                nota = {
                    fecha, visitas: ['', '', '', '', ''],
                    prestamosNuevos: [], pendientes: [],
                    trabajadores: [], notaGeneral: ''
                };
            }
            return res.status(200).json({ success: true, data: { notaGeneral: nota.notaGeneral, notaDiaria: nota } });
        }
        let notaD = await NotaDiaria.findOne({ fecha, usuario: 'ceo' });
        if (!notaD) {
            notaD = { fecha, visitas: ['', '', '', '', ''], prestamosNuevos: [], pendientes: [], trabajadores: [], notaGeneral: '' };
        }
        res.status(200).json({ success: true, data: { notaGeneral: notaD.notaGeneral, notaDiaria: notaD } });
    } catch (error) { next(error); }
};

export const saveNotaDiaria = async (req, res, next) => {
    try {
        const { fecha, visitas, prestamosNuevos, pendientes, trabajadores, notaGeneral } = req.body;
        if (isDemoMode) {
            const notas = store.findAll('notasDiarias');
            const existing = notas.find(n => n.fecha === fecha && n.usuario === 'ceo');
            if (existing) {
                const updated = store.update('notasDiarias', existing._id, { visitas, prestamosNuevos, pendientes, trabajadores, notaGeneral });
                return res.status(200).json({ success: true, data: updated });
            }
            const nota = store.create('notasDiarias', { fecha, usuario: 'ceo', visitas, prestamosNuevos, pendientes, trabajadores, notaGeneral });
            return res.status(200).json({ success: true, data: nota });
        }
        const notaD = await NotaDiaria.findOneAndUpdate(
            { fecha, usuario: 'ceo' },
            { visitas, prestamosNuevos, pendientes, trabajadores, notaGeneral },
            { new: true, upsert: true }
        );
        res.status(200).json({ success: true, data: notaD });
    } catch (error) { next(error); }
};
