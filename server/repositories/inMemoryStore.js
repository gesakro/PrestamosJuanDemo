/**
 * InMemoryStore — Repositorio central en memoria para modo demo.
 * Reemplaza MongoDB cuando DEMO_MODE=true.
 * 
 * Cada colección es un Map<string, object>.
 * Se inicializa con datos de seedData.js y se puede reiniciar en cualquier momento.
 */
import bcrypt from 'bcryptjs';
import {
    demoPersonas, demoClientes, demoCreditos, demoAlertas,
    demoMovimientosCaja, demoVisitas, demoProrrogas, demoOrdenesCobro,
    demoHistorialBorrados, demoTotalMultas, demoNotas, demoPapeleria
} from '../data/seedData.js';

class InMemoryStore {
    constructor() {
        this.collections = {};
        this._initialized = false;
    }

    /**
     * Inicializa el store con datos de seed.
     * Hashea las contraseñas de los usuarios demo.
     */
    async init() {
        if (this._initialized) return;

        // Hashear contraseñas de personas demo
        const hashedPersonas = [];
        for (const p of demoPersonas) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(p.password, salt);
            hashedPersonas.push({ ...p, password: hashedPassword });
        }

        this._loadCollection('personas', hashedPersonas);
        this._loadCollection('clientes', demoClientes);
        this._loadCollection('creditos', demoCreditos);
        this._loadCollection('alertas', demoAlertas);
        this._loadCollection('movimientosCaja', demoMovimientosCaja);
        this._loadCollection('visitas', demoVisitas);
        this._loadCollection('prorrogas', demoProrrogas);
        this._loadCollection('ordenesCobro', demoOrdenesCobro);
        this._loadCollection('historialBorrados', demoHistorialBorrados);
        this._loadCollection('totalMultas', demoTotalMultas);
        this._loadCollection('notas', demoNotas);
        this._loadCollection('papeleria', demoPapeleria);

        this._initialized = true;
        console.log('✅ InMemoryStore inicializado con datos demo');
        console.log(`   📊 ${hashedPersonas.length} usuarios, ${demoClientes.length} clientes, ${demoCreditos.length} créditos`);
    }

    /**
     * Reinicia el store a datos originales de seed.
     */
    async reset() {
        this._initialized = false;
        this.collections = {};
        await this.init();
        console.log('🔄 InMemoryStore reiniciado a datos originales');
    }

    // ---- Carga interna ----
    _loadCollection(name, items) {
        this.collections[name] = new Map();
        for (const item of items) {
            const id = item._id || this._generateId();
            this.collections[name].set(id, { ...item, _id: id, id: id });
        }
    }

    _generateId() {
        return 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
    }

    // ===========================================================
    // CRUD GENÉRICO
    // ===========================================================

    /**
     * Obtener todos los documentos de una colección.
     * @param {string} collection - Nombre de la colección
     * @param {object} filter - Filtros simples { campo: valor }
     * @returns {Array}
     */
    findAll(collection, filter = {}) {
        const col = this.collections[collection];
        if (!col) return [];

        let results = Array.from(col.values());

        // Aplicar filtros simples
        for (const [key, value] of Object.entries(filter)) {
            if (value === undefined || value === null) continue;
            results = results.filter(item => {
                const itemValue = item[key];
                if (itemValue === undefined || itemValue === null) return false;
                // Búsqueda case-insensitive para strings
                if (typeof value === 'string' && typeof itemValue === 'string') {
                    return itemValue.toLowerCase().includes(value.toLowerCase());
                }
                return itemValue === value;
            });
        }

        return results;
    }

    /**
     * Buscar un documento por ID.
     */
    findById(collection, id) {
        const col = this.collections[collection];
        if (!col) return null;
        return col.get(id) || null;
    }

    /**
     * Buscar un documento por campo.
     */
    findOne(collection, filter = {}) {
        const results = this.findAll(collection, filter);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Crear un documento.
     */
    create(collection, data) {
        const col = this.collections[collection];
        if (!col) {
            this.collections[collection] = new Map();
        }
        const id = data._id || this._generateId();
        const now = new Date();
        const doc = {
            ...data,
            _id: id,
            id: id,
            createdAt: data.createdAt || now,
            updatedAt: now
        };
        this.collections[collection].set(id, doc);
        return doc;
    }

    /**
     * Actualizar un documento.
     */
    update(collection, id, data) {
        const col = this.collections[collection];
        if (!col) return null;
        const existing = col.get(id);
        if (!existing) return null;

        const updated = {
            ...existing,
            ...data,
            _id: id, // No permitir cambiar el ID
            id: id,
            updatedAt: new Date()
        };
        col.set(id, updated);
        return updated;
    }

    /**
     * Eliminar un documento.
     */
    delete(collection, id) {
        const col = this.collections[collection];
        if (!col) return false;
        return col.delete(id);
    }

    /**
     * Contar documentos en una colección con filtro.
     */
    count(collection, filter = {}) {
        return this.findAll(collection, filter).length;
    }

    /**
     * Buscar con paginación.
     */
    findPaginated(collection, filter = {}, page = 1, limit = 50, sort = null) {
        let results = this.findAll(collection, filter);

        // Sorting simple
        if (sort) {
            const [field, order] = Object.entries(sort)[0];
            results.sort((a, b) => {
                const aVal = a[field];
                const bVal = b[field];
                if (aVal < bVal) return order === 1 ? -1 : 1;
                if (aVal > bVal) return order === 1 ? 1 : -1;
                return 0;
            });
        }

        const total = results.length;
        const startIndex = (page - 1) * limit;
        const data = results.slice(startIndex, startIndex + limit);

        return { data, total, page, pages: Math.ceil(total / limit) };
    }

    /**
     * Búsqueda de texto simple en múltiples campos.
     */
    textSearch(collection, searchText, fields = []) {
        if (!searchText) return this.findAll(collection);
        const lower = searchText.toLowerCase();
        return this.findAll(collection).filter(item =>
            fields.some(field => {
                const val = item[field];
                return val && String(val).toLowerCase().includes(lower);
            })
        );
    }
}

// Singleton
const store = new InMemoryStore();
export default store;
