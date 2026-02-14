/**
 * Utilidad para generar controladores CRUD dual-mode (demo/producción).
 * Reduce la duplicación de código entre los controladores simples.
 */
import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

/**
 * Genera funciones CRUD estándar para una colección.
 * @param {string} collectionName - Nombre de la colección en el store
 * @param {string} modelName - Nombre del modelo Mongoose (ej: 'Alerta')
 * @param {string} modelPath - Path del modelo (ej: '../models/Alerta.js')
 * @param {object} options - Opciones adicionales
 */
export function createDualCRUD(collectionName, modelName, modelPath, options = {}) {
    const {
        entityName = modelName,
        populateFields = null,
        sortField = 'fechaCreacion',
        sortOrder = -1,
        searchFields = [],
        dateFilterField = null,
        customFilters = {},
        onDelete = null
    } = options;

    let Model = null;

    // Lazy load del modelo solo cuando se necesita (no en demo)
    const getModel = async () => {
        if (isDemoMode) return null;
        if (!Model) {
            const module = await import(modelPath);
            Model = module.default;
        }
        return Model;
    };

    // GET ALL
    const getAll = async (req, res, next) => {
        try {
            const { page = 1, limit = 50, search, fechaInicio, fechaFin, ...queryParams } = req.query;

            if (isDemoMode) {
                let results = store.findAll(collectionName);

                // Aplicar filtros de query params
                for (const [key, value] of Object.entries(queryParams)) {
                    if (value === undefined || value === null || value === '') continue;
                    if (value === 'true') results = results.filter(item => item[key] === true);
                    else if (value === 'false') results = results.filter(item => !item[key]);
                    else results = results.filter(item => item[key] === value);
                }

                // Búsqueda de texto
                if (search && searchFields.length > 0) {
                    const lower = search.toLowerCase();
                    results = results.filter(item =>
                        searchFields.some(field => {
                            const val = field.includes('.') ? getNestedValue(item, field) : item[field];
                            return val && String(val).toLowerCase().includes(lower);
                        })
                    );
                }

                // Filtro por fecha
                if (dateFilterField && (fechaInicio || fechaFin)) {
                    if (fechaInicio) {
                        const inicio = new Date(fechaInicio);
                        results = results.filter(item => new Date(item[dateFilterField]) >= inicio);
                    }
                    if (fechaFin) {
                        const fin = new Date(fechaFin);
                        fin.setHours(23, 59, 59, 999);
                        results = results.filter(item => new Date(item[dateFilterField]) <= fin);
                    }
                }

                // Ordenar
                results.sort((a, b) => {
                    const aVal = a[sortField];
                    const bVal = b[sortField];
                    return sortOrder === -1 ? new Date(bVal) - new Date(aVal) : new Date(aVal) - new Date(bVal);
                });

                const total = results.length;
                const skip = (parseInt(page) - 1) * parseInt(limit);
                const data = results.slice(skip, skip + parseInt(limit));

                return res.status(200).json({ success: true, count: data.length, total, data });
            }

            // ---- PRODUCCIÓN ----
            const M = await getModel();
            const query = {};
            for (const [key, value] of Object.entries(queryParams)) {
                if (value === undefined || value === null || value === '') continue;
                if (value === 'true') query[key] = true;
                else if (value === 'false') query[key] = false;
                else query[key] = value;
            }

            if (search && searchFields.length > 0) {
                query.$or = searchFields.map(field => ({ [field]: { $regex: search, $options: 'i' } }));
            }

            if (dateFilterField && (fechaInicio || fechaFin)) {
                query[dateFilterField] = {};
                if (fechaInicio) { const d = new Date(fechaInicio); d.setHours(0, 0, 0, 0); query[dateFilterField].$gte = d; }
                if (fechaFin) { const d = new Date(fechaFin); d.setHours(23, 59, 59, 999); query[dateFilterField].$lte = d; }
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            let q = M.find(query).sort({ [sortField]: sortOrder }).skip(skip).limit(parseInt(limit));
            if (populateFields) {
                if (Array.isArray(populateFields)) populateFields.forEach(p => { q = q.populate(p); });
                else q = q.populate(populateFields);
            }
            const items = await q;
            const total = await M.countDocuments(query);

            res.status(200).json({ success: true, count: items.length, total, data: items });
        } catch (error) {
            next(error);
        }
    };

    // GET BY ID
    const getById = async (req, res, next) => {
        try {
            if (isDemoMode) {
                const item = store.findById(collectionName, req.params.id);
                if (!item) return res.status(404).json({ success: false, error: `${entityName} no encontrado` });
                return res.status(200).json({ success: true, data: item });
            }
            const M = await getModel();
            let q = M.findById(req.params.id);
            if (populateFields) {
                if (Array.isArray(populateFields)) populateFields.forEach(p => { q = q.populate(p); });
                else q = q.populate(populateFields);
            }
            const item = await q;
            if (!item) return res.status(404).json({ success: false, error: `${entityName} no encontrado` });
            res.status(200).json({ success: true, data: item });
        } catch (error) {
            next(error);
        }
    };

    // CREATE
    const create = async (req, res, next) => {
        try {
            if (isDemoMode) {
                const item = store.create(collectionName, req.body);
                return res.status(201).json({ success: true, data: item });
            }
            const M = await getModel();
            const item = await M.create(req.body);
            res.status(201).json({ success: true, data: item });
        } catch (error) {
            next(error);
        }
    };

    // UPDATE
    const update = async (req, res, next) => {
        try {
            if (isDemoMode) {
                const item = store.update(collectionName, req.params.id, req.body);
                if (!item) return res.status(404).json({ success: false, error: `${entityName} no encontrado` });
                return res.status(200).json({ success: true, data: item });
            }
            const M = await getModel();
            const item = await M.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
            if (!item) return res.status(404).json({ success: false, error: `${entityName} no encontrado` });
            res.status(200).json({ success: true, data: item });
        } catch (error) {
            next(error);
        }
    };

    // DELETE
    const remove = async (req, res, next) => {
        try {
            if (isDemoMode) {
                const item = store.findById(collectionName, req.params.id);
                if (!item) return res.status(404).json({ success: false, error: `${entityName} no encontrado` });
                if (onDelete) onDelete(item, req, store);
                store.delete(collectionName, req.params.id);
                return res.status(200).json({ success: true, message: `${entityName} eliminado correctamente` });
            }
            const M = await getModel();
            const item = await M.findById(req.params.id);
            if (!item) return res.status(404).json({ success: false, error: `${entityName} no encontrado` });
            await M.findByIdAndDelete(req.params.id);
            res.status(200).json({ success: true, message: `${entityName} eliminado correctamente` });
        } catch (error) {
            next(error);
        }
    };

    return { getAll, getById, create, update, remove };
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => acc && acc[key], obj);
}
