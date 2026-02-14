import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

let OrdenCobro = null;
if (!isDemoMode) {
    const module = await import('../models/OrdenCobro.js');
    OrdenCobro = module.default;
}

export const obtenerOrdenesPorFecha = async (req, res) => {
    try {
        const { fecha } = req.params;
        if (isDemoMode) {
            const ordenes = store.findAll('ordenesCobro');
            const fechaStr = new Date(fecha).toISOString().split('T')[0];
            const matched = ordenes.filter(o => {
                const oFecha = new Date(o.fecha).toISOString().split('T')[0];
                return oFecha === fechaStr;
            });
            const ordenesMap = {};
            matched.forEach(o => { ordenesMap[o.clienteId] = o.orden; });
            return res.json({ success: true, data: ordenesMap });
        }
        const ordenes = await OrdenCobro.find({ fecha: new Date(fecha) }).sort({ orden: 1 });
        const ordenesMap = {};
        ordenes.forEach(o => { ordenesMap[o.clienteId] = o.orden; });
        res.json({ success: true, data: ordenesMap });
    } catch (error) {
        console.error('Error al obtener órdenes de cobro:', error);
        res.status(500).json({ success: false, message: 'Error al obtener órdenes de cobro' });
    }
};

export const guardarOrdenes = async (req, res) => {
    try {
        const { fecha, ordenes } = req.body;
        if (isDemoMode) {
            const fechaStr = new Date(fecha).toISOString().split('T')[0];
            for (const [clienteId, orden] of Object.entries(ordenes)) {
                const all = store.findAll('ordenesCobro');
                const existing = all.find(o => new Date(o.fecha).toISOString().split('T')[0] === fechaStr && o.clienteId === clienteId);
                if (existing) {
                    store.update('ordenesCobro', existing._id, { orden, fechaModificacion: new Date() });
                } else {
                    store.create('ordenesCobro', { fecha: new Date(fecha), clienteId, orden, fechaModificacion: new Date() });
                }
            }
            return res.json({ success: true, message: 'Órdenes de cobro guardadas correctamente' });
        }
        const bulkOps = Object.entries(ordenes).map(([clienteId, orden]) => ({
            updateOne: { filter: { fecha: new Date(fecha), clienteId }, update: { orden, fechaModificacion: new Date() }, upsert: true }
        }));
        await OrdenCobro.bulkWrite(bulkOps);
        res.json({ success: true, message: 'Órdenes de cobro guardadas correctamente' });
    } catch (error) {
        console.error('Error al guardar órdenes de cobro:', error);
        res.status(500).json({ success: false, message: 'Error al guardar órdenes de cobro' });
    }
};

export const eliminarOrden = async (req, res) => {
    try {
        const { fecha, clienteId } = req.params;
        if (isDemoMode) {
            const fechaStr = new Date(fecha).toISOString().split('T')[0];
            const all = store.findAll('ordenesCobro');
            const existing = all.find(o => new Date(o.fecha).toISOString().split('T')[0] === fechaStr && o.clienteId === clienteId);
            if (existing) store.delete('ordenesCobro', existing._id);
            return res.json({ success: true, message: 'Orden de cobro eliminada correctamente' });
        }
        await OrdenCobro.deleteOne({ fecha: new Date(fecha), clienteId });
        res.json({ success: true, message: 'Orden de cobro eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar orden de cobro:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar orden de cobro' });
    }
};
