import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let HistorialBorrado = null;
if (!isDemoMode) {
    const module = await import('../models/HistorialBorrado.js');
    HistorialBorrado = module.default;
}

export const obtenerHistorial = async (req, res, next) => {
    try {
        const { tipo, desde, hasta } = req.query;
        if (isDemoMode) {
            let results = store.findAll('historialBorrados');
            if (tipo) results = results.filter(r => r.tipo === tipo);
            if (desde) results = results.filter(r => new Date(r.fechaBorrado) >= new Date(desde));
            if (hasta) results = results.filter(r => new Date(r.fechaBorrado) <= new Date(hasta));
            results.sort((a, b) => new Date(b.fechaBorrado) - new Date(a.fechaBorrado));
            return res.status(200).json({ success: true, count: results.length, data: results.slice(0, 500) });
        }
        const query = {};
        if (tipo) query.tipo = tipo;
        if (desde || hasta) { query.fechaBorrado = {}; if (desde) query.fechaBorrado.$gte = new Date(desde); if (hasta) query.fechaBorrado.$lte = new Date(hasta); }
        const historial = await HistorialBorrado.find(query).sort({ fechaBorrado: -1 }).limit(500);
        res.status(200).json({ success: true, count: historial.length, data: historial });
    } catch (error) { next(error); }
};

export const obtenerRegistro = async (req, res, next) => {
    try {
        if (isDemoMode) {
            const r = store.findById('historialBorrados', req.params.id);
            if (!r) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
            return res.status(200).json({ success: true, data: r });
        }
        const registro = await HistorialBorrado.findById(req.params.id);
        if (!registro) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
        res.status(200).json({ success: true, data: registro });
    } catch (error) { next(error); }
};

export const eliminarRegistro = async (req, res, next) => {
    try {
        if (isDemoMode) {
            const r = store.findById('historialBorrados', req.params.id);
            if (!r) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
            store.delete('historialBorrados', req.params.id);
            return res.status(200).json({ success: true, data: {} });
        }
        const registro = await HistorialBorrado.findByIdAndDelete(req.params.id);
        if (!registro) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) { next(error); }
};

export const vaciarHistorial = async (req, res, next) => {
    try {
        if (isDemoMode) {
            const all = store.findAll('historialBorrados');
            all.forEach(r => store.delete('historialBorrados', r._id));
            return res.status(200).json({ success: true, data: {} });
        }
        await HistorialBorrado.deleteMany({});
        res.status(200).json({ success: true, data: {} });
    } catch (error) { next(error); }
};

export const registrarBorrado = async ({ tipo, idOriginal, detalles, usuario, usuarioNombre, metadata }) => {
    try {
        if (isDemoMode) {
            store.create('historialBorrados', { tipo, idOriginal, detalles, usuario, usuarioNombre, metadata, fechaBorrado: new Date() });
            return true;
        }
        await HistorialBorrado.create({ tipo, idOriginal, detalles, usuario, usuarioNombre, metadata });
        return true;
    } catch (error) {
        console.error('Error al registrar borrado en historial:', error);
        return false;
    }
};
