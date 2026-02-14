import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

// Importar modelos solo si NO estamos en modo demo
let Cliente = null;
let Credito = null;
let HistorialBorrado = null;
let registrarBorrado = null;

if (!isDemoMode) {
  const clienteModule = await import('../models/Cliente.js');
  const creditoModule = await import('../models/Credito.js');
  const historialModule = await import('../models/HistorialBorrado.js');
  const historialCtrl = await import('./historialBorradoController.js');
  Cliente = clienteModule.default;
  Credito = creditoModule.default;
  HistorialBorrado = historialModule.default;
  registrarBorrado = historialCtrl.registrarBorrado;
}

// Helper: registrar borrado en demo
function registrarBorradoDemo(data) {
  store.create('historialBorrados', {
    tipo: data.tipo,
    idOriginal: data.idOriginal,
    detalles: data.detalles,
    usuario: data.usuario,
    usuarioNombre: data.usuarioNombre,
    metadata: data.metadata,
    fechaBorrado: new Date()
  });
}

// Helper para tipo de pago
const obtenerTipoPagoCliente = (cliente) => {
  if (!cliente || !cliente.creditos || cliente.creditos.length === 0) {
    return cliente?.tipoPagoEsperado || null;
  }
  const creditoActivo = cliente.creditos.find(c => {
    if (!c.cuotas || c.cuotas.length === 0) return false;
    return c.cuotas.some(cuota => !cuota.pagado) && c.tipo;
  });
  if (creditoActivo && creditoActivo.tipo) return creditoActivo.tipo;
  return cliente.tipoPagoEsperado || null;
};

// =============================================================
// GET CLIENTES
// =============================================================
export const getClientes = async (req, res, next) => {
  try {
    const { search, cartera, page = 1, limit = 50, archivados, supervision, rf } = req.query;

    if (isDemoMode) {
      let results = store.findAll('clientes');

      // Filtro archivados
      if (archivados === 'true') {
        results = results.filter(c => c.esArchivado === true);
      } else {
        results = results.filter(c => !c.esArchivado);
      }

      // Filtro supervisión
      if (supervision === 'true') {
        results = results.filter(c => c.enSupervision === true);
      } else if (supervision === 'false') {
        results = results.filter(c => !c.enSupervision);
      }

      // Filtro RF
      if (rf === 'true' || rf === 'RF') {
        results = results.filter(c => c.rf === 'RF');
      }

      // Filtro cartera por rol
      if (req.user && (req.user.role === 'domiciliario' || req.user.role === 'supervisor')) {
        if (req.user.ciudad === 'Ciudad Demo 2') {
          results = results.filter(c => c.cartera === 'K3');
        } else {
          results = results.filter(c => c.cartera === 'K1' || c.cartera === 'K2' || !c.cartera);
        }
      } else if (cartera) {
        results = results.filter(c => c.cartera === cartera);
      }

      // Búsqueda de texto
      if (search) {
        const lower = search.toLowerCase();
        results = results.filter(c =>
          (c.nombre && c.nombre.toLowerCase().includes(lower)) ||
          (c.documento && c.documento.toLowerCase().includes(lower)) ||
          (c.telefono && c.telefono.toLowerCase().includes(lower))
        );
      }

      // Ordenar por fecha de creación (más reciente primero)
      results.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

      const total = results.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const data = results.slice(skip, skip + parseInt(limit));

      return res.status(200).json({ success: true, count: data.length, total, data });
    }

    // ---- PRODUCCIÓN ----
    const query = {};
    const condiciones = [];

    if (archivados === 'true') {
      condiciones.push({ esArchivado: true });
    } else {
      condiciones.push({
        $or: [{ esArchivado: false }, { esArchivado: null }, { esArchivado: { $exists: false } }]
      });
    }

    if (supervision === 'true') {
      condiciones.push({ enSupervision: true });
    } else if (supervision === 'false') {
      condiciones.push({
        $or: [{ enSupervision: false }, { enSupervision: null }, { enSupervision: { $exists: false } }]
      });
    }

    if (rf === 'true' || rf === 'RF') {
      condiciones.push({ rf: 'RF' });
    }

    if (req.user && (req.user.role === 'domiciliario' || req.user.role === 'supervisor')) {
      if (req.user.ciudad === 'Guadalajara de Buga') {
        condiciones.push({ cartera: 'K3' });
      } else if (req.user.ciudad === 'Tuluá') {
        condiciones.push({
          $or: [{ cartera: 'K1' }, { cartera: 'K2' }, { cartera: { $exists: false } }]
        });
      }
    } else if (cartera) {
      condiciones.push({ cartera });
    }

    if (search) {
      condiciones.push({
        $or: [
          { nombre: { $regex: search, $options: 'i' } },
          { documento: { $regex: search, $options: 'i' } },
          { telefono: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (condiciones.length === 1) Object.assign(query, condiciones[0]);
    else if (condiciones.length > 1) query.$and = condiciones;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const clientes = await Cliente.find(query)
      .populate('creditos')
      .sort({ fechaCreacion: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Cliente.countDocuments(query);

    res.status(200).json({ success: true, count: clientes.length, total, data: clientes });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// GET CLIENTE BY ID
// =============================================================
export const getCliente = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const cliente = store.findById('clientes', req.params.id);
      if (!cliente) {
        return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      }
      return res.status(200).json({ success: true, data: cliente });
    }

    const cliente = await Cliente.findById(req.params.id).populate({
      path: 'creditos',
      populate: { path: 'cliente', select: 'nombre documento' }
    });

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    res.status(200).json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// CREATE CLIENTE
// =============================================================
export const createCliente = async (req, res, next) => {
  try {
    const clienteData = {
      ...req.body,
      esArchivado: req.body.esArchivado !== undefined ? req.body.esArchivado : false
    };

    if (isDemoMode) {
      const cliente = store.create('clientes', {
        ...clienteData,
        creditos: [],
        etiqueta: clienteData.etiqueta || 'sin-etiqueta',
        reportado: true,
        rf: '',
        enSupervision: false,
        fechaCreacion: new Date()
      });
      return res.status(201).json({ success: true, data: cliente });
    }

    const cliente = await Cliente.create(clienteData);
    res.status(201).json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// UPDATE CLIENTE
// =============================================================
export const updateCliente = async (req, res, next) => {
  try {
    if (req.body.rf === 'RF' && !req.body.fechaRF) {
      req.body.fechaRF = new Date();
    }

    if (isDemoMode) {
      const cliente = store.update('clientes', req.params.id, req.body);
      if (!cliente) {
        return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      }
      return res.status(200).json({ success: true, data: cliente });
    }

    const cliente = await Cliente.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true
    }).populate('creditos');

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    res.status(200).json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// DELETE CLIENTE
// =============================================================
export const deleteCliente = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const cliente = store.findById('clientes', req.params.id);
      if (!cliente) {
        return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      }
      // Eliminar créditos asociados
      const creditos = store.findAll('creditos', { cliente: req.params.id });
      creditos.forEach(c => store.delete('creditos', c._id));
      // Registrar borrado
      registrarBorradoDemo({
        tipo: 'cliente', idOriginal: req.params.id, detalles: cliente,
        usuario: req.user._id, usuarioNombre: req.user.nombre,
        metadata: { nombreItem: cliente.nombre, documento: cliente.documento }
      });
      store.delete('clientes', req.params.id);
      return res.status(200).json({ success: true, message: 'Cliente eliminado correctamente' });
    }

    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    await Credito.deleteMany({ cliente: req.params.id });
    await Cliente.findByIdAndDelete(req.params.id);
    await registrarBorrado({
      tipo: 'cliente', idOriginal: req.params.id, detalles: cliente,
      usuario: req.user._id, usuarioNombre: req.user.nombre,
      metadata: { nombreItem: cliente.nombre, documento: cliente.documento }
    });
    res.status(200).json({ success: true, message: 'Cliente eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// UPDATE COORDENADAS
// =============================================================
export const updateCoordenadas = async (req, res, next) => {
  try {
    const { tipo, coordenadas, entidad = 'cliente' } = req.body;

    if (isDemoMode) {
      const cliente = store.findById('clientes', req.params.id);
      if (!cliente) {
        return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      }
      const updates = {};
      if (entidad === 'fiador') {
        if (!cliente.fiador) cliente.fiador = {};
        const campo = tipo === 'trabajo' ? 'coordenadasTrabajo' : 'coordenadasResidencia';
        const campoFecha = tipo === 'trabajo' ? 'coordenadasTrabajoActualizada' : 'coordenadasResidenciaActualizada';
        cliente.fiador[campo] = coordenadas;
        cliente.fiador[campoFecha] = new Date();
        updates.fiador = cliente.fiador;
      } else {
        const campo = tipo === 'trabajo' ? 'coordenadasTrabajo' : 'coordenadasResidencia';
        const campoFecha = tipo === 'trabajo' ? 'coordenadasTrabajoActualizada' : 'coordenadasResidenciaActualizada';
        updates[campo] = coordenadas;
        updates[campoFecha] = new Date();
      }
      const updated = store.update('clientes', req.params.id, updates);
      return res.status(200).json({ success: true, data: updated });
    }

    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    if (entidad === 'fiador') {
      if (!cliente.fiador) cliente.fiador = {};
      const campo = tipo === 'trabajo' ? 'coordenadasTrabajo' : 'coordenadasResidencia';
      const campoFecha = tipo === 'trabajo' ? 'coordenadasTrabajoActualizada' : 'coordenadasResidenciaActualizada';
      cliente.fiador[campo] = coordenadas;
      cliente.fiador[campoFecha] = new Date();
    } else {
      const campo = tipo === 'trabajo' ? 'coordenadasTrabajo' : 'coordenadasResidencia';
      const campoFecha = tipo === 'trabajo' ? 'coordenadasTrabajoActualizada' : 'coordenadasResidenciaActualizada';
      cliente[campo] = coordenadas;
      cliente[campoFecha] = new Date();
    }
    await cliente.save();
    res.status(200).json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// ARCHIVAR CLIENTE
// =============================================================
export const archivarCliente = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const cliente = store.findById('clientes', req.params.id);
      if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      if (cliente.esArchivado) return res.status(400).json({ success: false, error: 'El cliente ya está archivado' });
      const updated = store.update('clientes', req.params.id, { posicion: null, esArchivado: true });
      return res.status(200).json({ success: true, message: 'Cliente archivado correctamente', data: updated });
    }

    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    if (cliente.esArchivado) return res.status(400).json({ success: false, error: 'El cliente ya está archivado' });
    cliente.posicion = null;
    cliente.esArchivado = true;
    await cliente.save();
    res.status(200).json({ success: true, message: 'Cliente archivado correctamente', data: cliente });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// DESARCHIVAR CLIENTE
// =============================================================
export const desarchivarCliente = async (req, res, next) => {
  try {
    const { posicion, cartera: nuevaCartera, tipoPago: nuevoTipoPago } = req.body;

    if (isDemoMode) {
      const cliente = store.findById('clientes', req.params.id);
      if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      if (!cliente.esArchivado) return res.status(400).json({ success: false, error: 'El cliente no está archivado' });

      if (nuevaCartera) cliente.cartera = nuevaCartera;
      if (nuevoTipoPago) cliente.tipoPagoEsperado = nuevoTipoPago;

      const cartera = cliente.cartera || 'K1';
      const tipoPagoCliente = obtenerTipoPagoCliente(cliente);
      const capacidadMaxima = (cartera === 'K1' || cartera === 'K3') ? 150 : 225;

      let posicionFinal;
      if (posicion !== undefined && posicion !== null) {
        posicionFinal = parseInt(posicion);
        // Verificar ocupación
        const ocupado = store.findAll('clientes').find(c =>
          c._id !== req.params.id && c.cartera === cartera && c.posicion === posicionFinal && !c.esArchivado
        );
        if (ocupado) {
          return res.status(400).json({ success: false, error: `La posición ${posicion} ya está ocupada por otro cliente` });
        }
        if (posicionFinal < 1 || posicionFinal > capacidadMaxima) {
          return res.status(400).json({ success: false, error: `La posición debe estar entre 1 y ${capacidadMaxima}` });
        }
      } else {
        // Asignar primera disponible
        const ocupadas = store.findAll('clientes')
          .filter(c => c.cartera === cartera && !c.esArchivado && c.posicion)
          .map(c => c.posicion);
        posicionFinal = 1;
        while (ocupadas.includes(posicionFinal) && posicionFinal <= capacidadMaxima) posicionFinal++;
        if (posicionFinal > capacidadMaxima) {
          return res.status(400).json({ success: false, error: 'No hay posiciones disponibles en esta cartera' });
        }
      }

      const updated = store.update('clientes', req.params.id, {
        posicion: posicionFinal, esArchivado: false,
        cartera: cliente.cartera, tipoPagoEsperado: cliente.tipoPagoEsperado
      });
      return res.status(200).json({ success: true, message: 'Cliente desarchivado correctamente', data: updated });
    }

    // ---- PRODUCCIÓN: código original ----
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    if (!cliente.esArchivado) return res.status(400).json({ success: false, error: 'El cliente no está archivado' });

    if (nuevaCartera) cliente.cartera = nuevaCartera;
    if (nuevoTipoPago) cliente.tipoPagoEsperado = nuevoTipoPago;

    const cartera = cliente.cartera || 'K1';
    const tipoPagoCliente = obtenerTipoPagoCliente(cliente);

    if (posicion !== undefined && posicion !== null) {
      const posicionNum = parseInt(posicion);
      if (isNaN(posicionNum)) {
        return res.status(400).json({ success: false, error: 'La posición debe ser un número válido' });
      }
      const queryBase = { cartera, posicion: posicionNum, esArchivado: { $ne: true }, _id: { $ne: req.params.id } };
      let clienteOcupando = await Cliente.findOne(queryBase);

      if ((cartera === 'K1' || cartera === 'K3') && tipoPagoCliente && clienteOcupando) {
        const tipoPagoOcupante = obtenerTipoPagoCliente(clienteOcupando);
        const esGrupoQM = (t) => t === 'quincenal' || t === 'mensual';
        const conflicto = (t1, t2) => t1 === t2 || (esGrupoQM(t1) && esGrupoQM(t2));
        if (!conflicto(tipoPagoCliente, tipoPagoOcupante)) clienteOcupando = null;
      }

      if (clienteOcupando) {
        return res.status(400).json({ success: false, error: `La posición ${posicion} ya está ocupada por otro cliente` });
      }

      const capacidadMaxima = (cartera === 'K1' || cartera === 'K3') ? 150 : 225;
      if (posicionNum < 1 || posicionNum > capacidadMaxima) {
        return res.status(400).json({ success: false, error: `La posición debe estar entre 1 y ${capacidadMaxima} para la cartera ${cartera}` });
      }
      cliente.posicion = posicionNum;
    } else {
      const todosLosClientes = await Cliente.find({ cartera, esArchivado: { $ne: true } });
      const esGrupoQM = (t) => t === 'quincenal' || t === 'mensual';
      const clientesMismoTipo = todosLosClientes.filter(c => {
        if (cartera === 'K2') return true;
        if ((cartera === 'K1' || cartera === 'K3') && tipoPagoCliente) {
          const tOtro = obtenerTipoPagoCliente(c);
          return tOtro === tipoPagoCliente || (esGrupoQM(tOtro) && esGrupoQM(tipoPagoCliente));
        }
        return false;
      });
      const ocupadas = clientesMismoTipo.map(c => c.posicion).filter(Boolean);
      const capacidadMaxima = (cartera === 'K1' || cartera === 'K3') ? 150 : 225;
      let nuevaPosicion = 1;
      while (ocupadas.includes(nuevaPosicion) && nuevaPosicion <= capacidadMaxima) nuevaPosicion++;
      if (nuevaPosicion > capacidadMaxima) {
        return res.status(400).json({ success: false, error: 'No hay posiciones disponibles en esta cartera' });
      }
      cliente.posicion = nuevaPosicion;
    }

    cliente.esArchivado = false;
    await cliente.save();
    res.status(200).json({ success: true, message: 'Cliente desarchivado correctamente', data: cliente });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// POSICIONES DISPONIBLES
// =============================================================
export const getPosicionesDisponibles = async (req, res, next) => {
  try {
    const { cartera } = req.params;
    const { tipoPago } = req.query;

    let capacidadMaxima;
    if (cartera === 'K1' || cartera === 'K3') capacidadMaxima = 150;
    else if (cartera === 'K2') capacidadMaxima = 225;
    else return res.status(400).json({ success: false, error: 'Cartera inválida' });

    if (isDemoMode) {
      const todos = store.findAll('clientes').filter(c =>
        c.cartera === cartera && !c.esArchivado && c.posicion
      );
      const esGrupoQM = (t) => t === 'quincenal' || t === 'mensual';
      const ocupadas = new Set();

      todos.forEach(c => {
        if (cartera === 'K2') {
          ocupadas.add(c.posicion);
          return;
        }
        if (tipoPago) {
          const tc = obtenerTipoPagoCliente(c);
          if (tc === tipoPago || (esGrupoQM(tc) && esGrupoQM(tipoPago))) {
            ocupadas.add(c.posicion);
          }
        }
      });

      const disponibles = [];
      for (let i = 1; i <= capacidadMaxima; i++) {
        if (!ocupadas.has(i)) disponibles.push(i);
      }
      return res.status(200).json({ success: true, data: disponibles });
    }

    // ---- PRODUCCIÓN ----
    const todosLosClientes = await Cliente.find({ cartera, esArchivado: { $ne: true }, posicion: { $ne: null } });
    const esGrupoQM = (t) => t === 'quincenal' || t === 'mensual';
    const clientesOcupando = todosLosClientes.filter(cliente => {
      if (cartera === 'K2') return true;
      if ((cartera === 'K1' || cartera === 'K3') && tipoPago) {
        const tiposActivos = new Set();
        if (cliente.creditos && cliente.creditos.length > 0) {
          cliente.creditos.forEach(credito => {
            if (credito.cuotas && credito.cuotas.some(cuota => !cuota.pagado) && credito.tipo) {
              tiposActivos.add(credito.tipo);
            }
          });
        }
        const tipos = tiposActivos.size > 0 ? Array.from(tiposActivos) : (cliente.tipoPagoEsperado ? [cliente.tipoPagoEsperado] : []);
        return tipos.some(t => t === tipoPago || (esGrupoQM(t) && esGrupoQM(tipoPago)));
      }
      return false;
    });

    const posicionesOcupadas = new Set(clientesOcupando.map(c => c.posicion).filter(Boolean));
    const posicionesDisponibles = [];
    for (let i = 1; i <= capacidadMaxima; i++) {
      if (!posicionesOcupadas.has(i)) posicionesDisponibles.push(i);
    }
    res.status(200).json({ success: true, data: posicionesDisponibles });
  } catch (error) {
    next(error);
  }
};

// =============================================================
// HISTORIAL DOCUMENTO
// =============================================================
export const getHistorialDocumento = async (req, res, next) => {
  try {
    const { documento } = req.params;
    if (!documento || documento.length < 3) {
      return res.status(400).json({ success: false, error: 'El documento debe tener al menos 3 caracteres' });
    }

    if (isDemoMode) {
      const lower = documento.toLowerCase();
      const clientes = store.findAll('clientes').filter(c =>
        c.documento && c.documento.toLowerCase().includes(lower)
      );
      const borrados = store.findAll('historialBorrados').filter(h =>
        h.tipo === 'cliente' && (
          (h.detalles?.documento && h.detalles.documento.toLowerCase().includes(lower)) ||
          (h.metadata?.documento && h.metadata.documento.toLowerCase().includes(lower))
        )
      );

      const clientesInfo = clientes.map(cliente => {
        const notasCreditos = [];
        if (cliente.creditos) {
          cliente.creditos.forEach((credito, idx) => {
            if (credito.notas) {
              credito.notas.forEach(nota => {
                notasCreditos.push({
                  texto: nota.texto, fecha: nota.fecha,
                  creditoIndex: idx + 1, creditoMonto: credito.monto, creditoTipo: credito.tipo
                });
              });
            }
          });
        }
        notasCreditos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        return {
          _id: cliente._id, nombre: cliente.nombre, documento: cliente.documento,
          telefono: cliente.telefono, direccion: cliente.direccion, barrio: cliente.barrio,
          cartera: cliente.cartera, etiqueta: cliente.etiqueta, esArchivado: cliente.esArchivado,
          fechaCreacion: cliente.fechaCreacion, totalCreditos: cliente.creditos?.length || 0,
          notasCreditos, esVetado: cliente.etiqueta === 'vetado', esPerdido: cliente.etiqueta === 'perdido'
        };
      });

      const borradosInfo = borrados.map(r => ({
        nombreOriginal: r.detalles?.nombre || r.metadata?.nombreItem || 'N/A',
        documentoOriginal: r.detalles?.documento || r.metadata?.documento || 'N/A',
        fechaBorrado: r.fechaBorrado, usuarioBorrado: r.usuarioNombre,
        etiquetaOriginal: r.detalles?.etiqueta || null
      }));

      return res.status(200).json({
        success: true,
        data: {
          tieneHistorial: clientes.length > 0 || borrados.length > 0,
          hayVetados: clientesInfo.some(c => c.esVetado),
          hayPerdidos: clientesInfo.some(c => c.esPerdido),
          clientes: clientesInfo,
          borrados: borradosInfo,
          resumen: {
            totalClientes: clientes.length,
            clientesActivos: clientes.filter(c => !c.esArchivado).length,
            clientesArchivados: clientes.filter(c => c.esArchivado).length,
            vecesBorrado: borrados.length,
            totalNotas: clientesInfo.reduce((acc, c) => acc + c.notasCreditos.length, 0)
          }
        }
      });
    }

    // ---- PRODUCCIÓN ----
    const clientes = await Cliente.find({ documento: { $regex: documento, $options: 'i' } }).lean();
    const historialBorrados = await HistorialBorrado.find({
      tipo: 'cliente',
      $or: [
        { 'detalles.documento': { $regex: documento, $options: 'i' } },
        { 'metadata.documento': { $regex: documento, $options: 'i' } }
      ]
    }).sort({ fechaBorrado: -1 }).lean();

    const clientesInfo = clientes.map(cliente => {
      const notasCreditos = [];
      if (cliente.creditos && cliente.creditos.length > 0) {
        cliente.creditos.forEach((credito, idx) => {
          if (credito.notas && credito.notas.length > 0) {
            credito.notas.forEach(nota => {
              notasCreditos.push({
                texto: nota.texto, fecha: nota.fecha,
                creditoIndex: idx + 1, creditoMonto: credito.monto, creditoTipo: credito.tipo
              });
            });
          }
        });
      }
      notasCreditos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      return {
        _id: cliente._id, nombre: cliente.nombre, documento: cliente.documento,
        telefono: cliente.telefono, direccion: cliente.direccion, barrio: cliente.barrio,
        cartera: cliente.cartera, etiqueta: cliente.etiqueta, esArchivado: cliente.esArchivado,
        fechaCreacion: cliente.fechaCreacion, totalCreditos: cliente.creditos?.length || 0,
        notasCreditos, esVetado: cliente.etiqueta === 'vetado', esPerdido: cliente.etiqueta === 'perdido'
      };
    });

    const borradosInfo = historialBorrados.map(r => ({
      nombreOriginal: r.detalles?.nombre || r.metadata?.nombreItem || 'N/A',
      documentoOriginal: r.detalles?.documento || r.metadata?.documento || 'N/A',
      fechaBorrado: r.fechaBorrado, usuarioBorrado: r.usuarioNombre,
      etiquetaOriginal: r.detalles?.etiqueta || null
    }));

    const tieneHistorial = clientes.length > 0 || historialBorrados.length > 0;
    res.status(200).json({
      success: true,
      data: {
        tieneHistorial,
        hayVetados: clientesInfo.some(c => c.esVetado),
        hayPerdidos: clientesInfo.some(c => c.esPerdido),
        clientes: clientesInfo,
        borrados: borradosInfo,
        resumen: {
          totalClientes: clientes.length,
          clientesActivos: clientes.filter(c => !c.esArchivado).length,
          clientesArchivados: clientes.filter(c => c.esArchivado).length,
          vecesBorrado: historialBorrados.length,
          totalNotas: clientesInfo.reduce((acc, c) => acc + c.notasCreditos.length, 0)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
