import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let TotalMultas = null;
if (!isDemoMode) {
    const module = await import('../models/TotalMultas.js');
    TotalMultas = module.default;
}

export const getMultas = async (req, res, next) => {
    try {
        const { nombrePersona, fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;

        if (isDemoMode) {
            let results = store.findAll('totalMultas');
            if (nombrePersona) {
                const lower = nombrePersona.toLowerCase();
                results = results.filter(m => m.nombrePersona && m.nombrePersona.toLowerCase().includes(lower));
            }
            if (fechaInicio) results = results.filter(m => new Date(m.fecha) >= new Date(fechaInicio));
            if (fechaFin) results = results.filter(m => new Date(m.fecha) <= new Date(fechaFin));
            results.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            const total = results.length;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const data = results.slice(skip, skip + parseInt(limit));
            // Calcular stats
            let totalIngresos = 0, totalRetiros = 0;
            results.forEach(m => {
                if (m.tipo === 'ingresoMulta') totalIngresos += m.valor || 0;
                if (m.tipo === 'retiroMulta') totalRetiros += m.valor || 0;
            });
            return res.status(200).json({
                success: true, count: data.length, total,
                totalSum: totalIngresos - totalRetiros, totalIngresos, totalRetiros, data
            });
        }

        const query = {};
        if (nombrePersona) query.nombrePersona = { $regex: nombrePersona, $options: 'i' };
        if (fechaInicio && fechaFin) query.fecha = { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) };
        else if (fechaInicio) query.fecha = { $gte: new Date(fechaInicio) };
        else if (fechaFin) query.fecha = { $lte: new Date(fechaFin) };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const multas = await TotalMultas.find(query).populate('registradoPor', 'nombre username').sort({ fecha: -1 }).skip(skip).limit(parseInt(limit));
        const total = await TotalMultas.countDocuments(query);
        const stats = await TotalMultas.aggregate([{ $match: query }, { $group: { _id: null, totalIngresos: { $sum: { $cond: [{ $eq: ['$tipo', 'ingresoMulta'] }, '$valor', 0] } }, totalRetiros: { $sum: { $cond: [{ $eq: ['$tipo', 'retiroMulta'] }, '$valor', 0] } } } }]);
        const s = stats.length > 0 ? stats[0] : { totalIngresos: 0, totalRetiros: 0 };
        res.status(200).json({ success: true, count: multas.length, total, totalSum: s.totalIngresos - s.totalRetiros, totalIngresos: s.totalIngresos, totalRetiros: s.totalRetiros, data: multas });
    } catch (error) { next(error); }
};

export const getMulta = async (req, res, next) => {
    try {
        if (isDemoMode) {
            const m = store.findById('totalMultas', req.params.id);
            if (!m) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
            return res.status(200).json({ success: true, data: m });
        }
        const multa = await TotalMultas.findById(req.params.id).populate('registradoPor', 'nombre username');
        if (!multa) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
        res.status(200).json({ success: true, data: multa });
    } catch (error) { next(error); }
};

export const createMulta = async (req, res, next) => {
    try {
        const { nombrePersona, fecha, valor, tipo } = req.body;
        if (!nombrePersona || !valor) return res.status(400).json({ success: false, error: 'Por favor proporciona todos los campos requeridos' });
        if (isDemoMode) {
            const m = store.create('totalMultas', {
                nombrePersona, fecha: fecha || new Date(), valor, tipo: tipo || 'ingresoMulta',
                registradoPor: req.user._id
            });
            return res.status(201).json({ success: true, data: m });
        }
        const multa = await TotalMultas.create({ nombrePersona, fecha: fecha || Date.now(), valor, tipo: tipo || 'ingresoMulta', registradoPor: req.user._id });
        res.status(201).json({ success: true, data: multa });
    } catch (error) { next(error); }
};

export const updateMulta = async (req, res, next) => {
    try {
        if (isDemoMode) {
            const m = store.findById('totalMultas', req.params.id);
            if (!m) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
            const updated = store.update('totalMultas', req.params.id, req.body);
            return res.status(200).json({ success: true, data: updated });
        }
        let multa = await TotalMultas.findById(req.params.id);
        if (!multa) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
        multa = await TotalMultas.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json({ success: true, data: multa });
    } catch (error) { next(error); }
};

export const deleteMulta = async (req, res, next) => {
    try {
        if (isDemoMode) {
            const m = store.findById('totalMultas', req.params.id);
            if (!m) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
            store.delete('totalMultas', req.params.id);
            return res.status(200).json({ success: true, message: 'Multa eliminada correctamente' });
        }
        const multa = await TotalMultas.findById(req.params.id);
        if (!multa) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
        await TotalMultas.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Multa eliminada correctamente' });
    } catch (error) { next(error); }
};
