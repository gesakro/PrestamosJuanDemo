import { isDemoMode } from '../config/demoMode.js';
import store from '../repositories/inMemoryStore.js';

// Importar modelos solo si NO estamos en modo demo
let Credito = null;
let Cliente = null;
let registrarBorrado = null;

if (!isDemoMode) {
  const mongoose = await import('mongoose');
  const creditoModule = await import('../models/Credito.js');
  const clienteModule = await import('../models/Cliente.js');
  const historialCtrl = await import('./historialBorradoController.js');
  Credito = creditoModule.default;
  Cliente = clienteModule.default;
  registrarBorrado = historialCtrl.registrarBorrado;
}

// Helper: registrar borrado en demo
function registrarBorradoDemo(data) {
  store.create('historialBorrados', {
    tipo: data.tipo, idOriginal: data.idOriginal, detalles: data.detalles,
    usuario: data.usuario, usuarioNombre: data.usuarioNombre, metadata: data.metadata,
    fechaBorrado: new Date()
  });
}

// Helper demo: sincronizar crédito con créditos embebidos del cliente
function syncCreditoToClienteDemo(creditoId) {
  const credito = store.findById('creditos', creditoId);
  if (!credito) return;
  const cliente = store.findById('clientes', credito.cliente);
  if (!cliente) return;

  const idx = (cliente.creditos || []).findIndex(c => c.id === creditoId || c._id === creditoId);
  const creditoEmb = {
    ...credito, id: creditoId, _id: creditoId
  };

  if (idx !== -1) {
    cliente.creditos[idx] = creditoEmb;
  } else {
    cliente.creditos = cliente.creditos || [];
    cliente.creditos.push(creditoEmb);
  }
  store.update('clientes', cliente._id, { creditos: cliente.creditos });
}

// ===== Producción: sync helper =====
const syncCreditoToCliente = async (creditoId) => {
  if (isDemoMode) { syncCreditoToClienteDemo(creditoId); return; }
  try {
    const credito = await Credito.findById(creditoId);
    if (!credito) return;
    const cliente = await Cliente.findById(credito.cliente);
    if (!cliente) return;
    const idx = cliente.creditos.findIndex(c => c.id === creditoId || c.id === credito._id.toString());
    if (idx !== -1) {
      cliente.creditos[idx] = {
        id: creditoId, monto: credito.monto, papeleria: credito.papeleria,
        montoEntregado: credito.montoEntregado, tipo: credito.tipo,
        tipoQuincenal: credito.tipoQuincenal, fechaInicio: credito.fechaInicio,
        totalAPagar: credito.totalAPagar, valorCuota: credito.valorCuota,
        numCuotas: credito.numCuotas, cuotas: credito.cuotas, abonos: credito.abonos,
        abonosMulta: credito.abonosMulta || [], multas: credito.multas,
        descuentos: credito.descuentos, notas: credito.notas, etiqueta: credito.etiqueta,
        fechaEtiqueta: credito.fechaEtiqueta, renovado: credito.renovado,
        fechaRenovacion: credito.fechaRenovacion, creditoRenovacionId: credito.creditoRenovacionId,
        esRenovacion: credito.esRenovacion, creditoAnteriorId: credito.creditoAnteriorId,
        fechaCreacion: credito.fechaCreacion
      };
      await cliente.save();
    }
  } catch (error) {
    console.error(`Error sincronizando crédito ${creditoId}:`, error);
  }
};

// ===== recalcularCreditoCompleto — lógica pura, sin dependencia de DB =====
const recalcularCreditoCompleto = (credito) => {
  // 1. Resetear cuotas
  credito.cuotas.forEach(cuota => {
    cuota.saldoPendiente = credito.valorCuota;
    cuota.abonoAplicado = 0;
    cuota.pagado = false;
    cuota.tieneAbono = false;
    cuota.abonosCuota = [];
  });

  // Resetear multas
  if (credito.multas) {
    credito.multas.forEach(m => { m.pagada = false; m.abonoAplicado = 0; });
  }

  // 2. Procesar Abonos de Multas
  if (credito.abonosMulta && credito.abonosMulta.length > 0) {
    credito.abonosMulta.forEach(abonoMulta => {
      const multa = credito.multas ? credito.multas.find(m => m.id === abonoMulta.multaId) : null;
      if (multa) {
        multa.abonoAplicado = (multa.abonoAplicado || 0) + abonoMulta.valor;
        multa.pagada = (multa.abonoAplicado || 0) >= multa.valor;
      }
    });
  }

  // 3. Ordenar abonos cronológicamente
  const abonosOrdenados = [...(credito.abonos || [])].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const fechaPagoPorCuota = {};

  // 4. Procesar Abonos de Cuotas
  for (const abono of abonosOrdenados) {
    let montoDisponible = abono.valor;
    let nroCuotaTarget = abono.nroCuota;

    if (!nroCuotaTarget && abono.descripcion) {
      const match = abono.descripcion.match(/(?:Cuota|cuota)\s*#(\d+)/);
      if (match) nroCuotaTarget = parseInt(match[1], 10);
    }

    if (nroCuotaTarget) {
      const cuota = credito.cuotas.find(c => c.nroCuota === nroCuotaTarget);
      if (cuota) {
        const saldoAntes = cuota.saldoPendiente;
        cuota.abonosCuota.push({
          id: abono.id, valor: montoDisponible, fecha: abono.fecha,
          fechaCreacion: abono.fechaCreacion || new Date()
        });
        cuota.abonoAplicado = (cuota.abonoAplicado || 0) + montoDisponible;
        cuota.saldoPendiente -= montoDisponible;
        if (saldoAntes > 10 && cuota.saldoPendiente <= 10) fechaPagoPorCuota[nroCuotaTarget] = abono.fecha;
      }
    } else {
      for (const cuota of credito.cuotas) {
        if (montoDisponible <= 0) break;
        if (cuota.saldoPendiente <= 0) continue;
        const saldoAntes = cuota.saldoPendiente;
        const aplicar = Math.min(montoDisponible, cuota.saldoPendiente);
        cuota.saldoPendiente -= aplicar;
        cuota.abonoAplicado = (cuota.abonoAplicado || 0) + aplicar;
        if (saldoAntes > 10 && cuota.saldoPendiente <= 10) fechaPagoPorCuota[cuota.nroCuota] = abono.fecha;
        montoDisponible -= aplicar;
      }
    }
  }

  // 5. Finalizar estados
  credito.cuotas.forEach(cuota => {
    if (cuota.saldoPendiente < 0) cuota.saldoPendiente = 0;
    cuota.pagado = cuota.saldoPendiente <= 10;
    cuota.tieneAbono = cuota.abonoAplicado > 0;
    if (cuota.pagado) {
      const fp = fechaPagoPorCuota[cuota.nroCuota];
      if (fp) {
        cuota.fechaPago = normalizarFecha(fp);
      } else if (cuota.abonosCuota && cuota.abonosCuota.length > 0) {
        cuota.fechaPago = normalizarFecha(cuota.abonosCuota[cuota.abonosCuota.length - 1].fecha);
      } else if (!cuota.fechaPago) {
        cuota.fechaPago = new Date();
      }
    } else {
      cuota.fechaPago = null;
    }
  });

  // 6. Recalcular totalAPagar
  let totalMultasPendientes = 0;
  if (credito.multas) {
    credito.multas.forEach(multa => {
      const saldo = multa.valor - (multa.abonoAplicado || 0);
      if (saldo > 0) totalMultasPendientes += saldo;
    });
  }
  credito.totalAPagar = (credito.valorCuota * credito.numCuotas) + totalMultasPendientes;
  return credito;
};

// Helper para normalizar fechas
function normalizarFecha(fecha) {
  if (!fecha) return new Date();
  if (fecha instanceof Date) {
    return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 12, 0, 0, 0));
  }
  if (typeof fecha === 'string') {
    const partes = fecha.split('T')[0].split('-');
    if (partes.length === 3) {
      return new Date(Date.UTC(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 12, 0, 0, 0));
    }
  }
  return new Date(fecha);
}

// ==============================================================
// GET CREDITOS
// ==============================================================
export const getCreditos = async (req, res, next) => {
  try {
    const { cliente, tipo, page = 1, limit = 50 } = req.query;

    if (isDemoMode) {
      let results = store.findAll('creditos');
      if (cliente) results = results.filter(c => c.cliente === cliente);
      if (tipo) results = results.filter(c => c.tipo === tipo);

      // Filtro por rol
      if (req.user && req.user.role === 'domiciliario') {
        const clientes = store.findAll('clientes');
        let clienteIds;
        if (req.user.ciudad === 'Ciudad Demo 2') {
          clienteIds = clientes.filter(c => c.cartera === 'K3').map(c => c._id);
        } else {
          clienteIds = clientes.filter(c => c.cartera === 'K1' || c.cartera === 'K2' || !c.cartera).map(c => c._id);
        }
        results = results.filter(c => clienteIds.includes(c.cliente));
      }

      results.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
      const total = results.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const data = results.slice(skip, skip + parseInt(limit));

      // Enriquecer con datos del cliente
      const enriched = data.map(cr => {
        const cl = store.findById('clientes', cr.cliente);
        return { ...cr, cliente: cl ? { _id: cl._id, nombre: cl.nombre, documento: cl.documento, telefono: cl.telefono, cartera: cl.cartera } : cr.cliente };
      });

      return res.status(200).json({ success: true, count: enriched.length, total, data: enriched });
    }

    // ---- PRODUCCIÓN ----
    const query = {};
    if (cliente) query.cliente = cliente;
    if (tipo) query.tipo = tipo;

    if (req.user && req.user.role === 'domiciliario') {
      if (req.user.ciudad === 'Guadalajara de Buga') {
        const ids = await Cliente.find({ cartera: 'K3' }).select('_id');
        query.cliente = { $in: ids.map(c => c._id.toString()) };
      } else {
        const ids = await Cliente.find({ $or: [{ cartera: 'K1' }, { cartera: 'K2' }, { cartera: { $exists: false } }] }).select('_id');
        query.cliente = { $in: ids.map(c => c._id.toString()) };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const creditos = await Credito.find(query).populate('cliente', 'nombre documento telefono cartera').sort({ fechaCreacion: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Credito.countDocuments(query);

    res.status(200).json({ success: true, count: creditos.length, total, data: creditos });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// GET CREDITO BY ID
// ==============================================================
export const getCredito = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }
    const credito = await Credito.findById(req.params.id).populate('cliente');
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    res.status(200).json({ success: true, data: credito });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// CREATE CREDITO
// ==============================================================
export const createCredito = async (req, res, next) => {
  try {
    const { clienteId, ...creditoData } = req.body;

    if (isDemoMode) {
      const cliente = store.findById('clientes', clienteId);
      if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });

      const creditoId = creditoData.id || `CRED-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const cuotasProcesadas = (creditoData.cuotas || []).map(c => ({
        ...c,
        saldoPendiente: c.saldoPendiente !== undefined ? c.saldoPendiente : creditoData.valorCuota,
        pagado: c.pagado || false
      }));

      const credito = store.create('creditos', {
        ...creditoData, _id: creditoId, cuotas: cuotasProcesadas, cliente: clienteId,
        abonos: creditoData.abonos || [], abonosMulta: creditoData.abonosMulta || [],
        multas: creditoData.multas || [], descuentos: creditoData.descuentos || [],
        notas: creditoData.notas || [], fechaCreacion: new Date()
      });

      // Embebir en cliente
      syncCreditoToClienteDemo(creditoId);
      const cl = store.findById('clientes', clienteId);
      return res.status(201).json({ success: true, data: { ...credito, cliente: cl || clienteId } });
    }

    // ---- PRODUCCIÓN ----
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });

    const mongoose = (await import('mongoose')).default;
    const creditoId = creditoData.id || `CRED-${new mongoose.Types.ObjectId().toString()}`;
    const cuotasProcesadas = creditoData.cuotas.map(c => ({
      ...c,
      saldoPendiente: c.saldoPendiente !== undefined ? c.saldoPendiente : creditoData.valorCuota,
      pagado: c.pagado || false
    }));

    const credito = await Credito.create({ ...creditoData, _id: creditoId, cuotas: cuotasProcesadas, cliente: clienteId });

    const creditoEmbebido = {
      id: creditoId, monto: creditoData.monto, papeleria: creditoData.papeleria || 0,
      montoEntregado: creditoData.montoEntregado, tipo: creditoData.tipo,
      tipoQuincenal: creditoData.tipoQuincenal || null, fechaInicio: creditoData.fechaInicio,
      totalAPagar: creditoData.totalAPagar, valorCuota: creditoData.valorCuota,
      numCuotas: creditoData.numCuotas, cuotas: cuotasProcesadas,
      abonos: creditoData.abonos || [], abonosMulta: creditoData.abonosMulta || [],
      multas: creditoData.multas || [], descuentos: creditoData.descuentos || [],
      notas: creditoData.notas || [], etiqueta: creditoData.etiqueta || null,
      esRenovacion: creditoData.esRenovacion || false,
      creditoAnteriorId: creditoData.creditoAnteriorId || null, fechaCreacion: new Date()
    };

    cliente.creditos.push(creditoEmbebido);
    await cliente.save();

    const creditoPopulado = await Credito.findById(credito._id).populate('cliente');
    res.status(201).json({ success: true, data: creditoPopulado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// UPDATE CREDITO
// ==============================================================
export const updateCredito = async (req, res, next) => {
  try {
    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      Object.assign(credito, req.body);
      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    let credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    Object.assign(credito, req.body);
    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    res.status(200).json({ success: true, data: credito });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// DELETE CREDITO
// ==============================================================
export const deleteCredito = async (req, res, next) => {
  try {
    if (isDemoMode) {
      const credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      const cliente = store.findById('clientes', credito.cliente);
      if (cliente) {
        cliente.creditos = (cliente.creditos || []).filter(c => c.id !== req.params.id && c._id !== req.params.id);
        store.update('clientes', cliente._id, { creditos: cliente.creditos });
      }
      registrarBorradoDemo({
        tipo: 'credito', idOriginal: req.params.id, detalles: credito,
        usuario: req.user._id, usuarioNombre: req.user.nombre,
        metadata: { clienteId: credito.cliente, nombreCliente: cliente?.nombre || 'Desconocido', monto: credito.monto }
      });
      store.delete('creditos', req.params.id);
      return res.status(200).json({ success: true, message: 'Crédito eliminado correctamente' });
    }

    const credito = await Credito.findById(req.params.id).populate('cliente');
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    const cliente = await Cliente.findById(credito.cliente);
    if (cliente) {
      cliente.creditos = cliente.creditos.filter(c => c.id !== req.params.id && c.id !== credito._id.toString());
      await cliente.save();
    }
    await Credito.findByIdAndDelete(req.params.id);
    await registrarBorrado({
      tipo: 'credito', idOriginal: req.params.id, detalles: credito,
      usuario: req.user._id, usuarioNombre: req.user.nombre,
      metadata: { clienteId: credito.cliente?._id || credito.cliente, nombreCliente: credito.cliente?.nombre || 'Desconocido', monto: credito.monto }
    });
    res.status(200).json({ success: true, message: 'Crédito eliminado correctamente' });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// REGISTRAR PAGO
// ==============================================================
export const registrarPago = async (req, res, next) => {
  try {
    const { nroCuota, fechaPago } = req.body;
    const nroCuotaInt = parseInt(nroCuota, 10);

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });

      credito = recalcularCreditoCompleto(credito);
      const cuota = credito.cuotas.find(c => c.nroCuota === nroCuotaInt);
      if (!cuota) return res.status(404).json({ success: false, error: 'Cuota no encontrada' });

      if (cuota.saldoPendiente > 0) {
        const fechaNorm = fechaPago ? normalizarFecha(fechaPago) : new Date();
        credito.abonos = credito.abonos || [];
        credito.abonos.push({
          id: Date.now().toString(), valor: cuota.saldoPendiente,
          descripcion: `Pago total Cuota #${nroCuotaInt}`, fecha: fechaNorm,
          tipo: 'abono', nroCuota: nroCuotaInt
        });
        credito = recalcularCreditoCompleto(credito);
        store.update('creditos', req.params.id, credito);
        syncCreditoToClienteDemo(req.params.id);
      }

      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    // ---- PRODUCCIÓN ----
    let credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    credito = recalcularCreditoCompleto(credito);
    const cuota = credito.cuotas.find(c => c.nroCuota === nroCuotaInt);
    if (!cuota) return res.status(404).json({ success: false, error: 'Cuota no encontrada' });

    if (cuota.saldoPendiente > 0) {
      const fechaNorm = fechaPago ? normalizarFecha(fechaPago) : new Date();
      credito.abonos.push({
        id: Date.now().toString(), valor: cuota.saldoPendiente,
        descripcion: `Pago total Cuota #${nroCuotaInt}`, fecha: fechaNorm,
        tipo: 'abono', nroCuota: nroCuotaInt
      });
      credito = recalcularCreditoCompleto(credito);
      await credito.save();
      await syncCreditoToCliente(req.params.id);
    }

    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(200).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// AGREGAR NOTA
// ==============================================================
export const agregarNota = async (req, res, next) => {
  try {
    const { texto } = req.body;

    if (isDemoMode) {
      const credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      credito.notas = credito.notas || [];
      credito.notas.push({ id: Date.now().toString(), texto, fecha: new Date() });
      store.update('creditos', req.params.id, { notas: credito.notas });
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(201).json({ success: true, data: { ...store.findById('creditos', req.params.id), cliente: cl || credito.cliente } });
    }

    const credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    credito.notas.push({ id: Date.now().toString(), texto, fecha: new Date() });
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(201).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// ELIMINAR NOTA
// ==============================================================
export const eliminarNota = async (req, res, next) => {
  try {
    const { id, notaId } = req.params;

    if (isDemoMode) {
      const credito = store.findById('creditos', id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      const nota = (credito.notas || []).find(n => n.id === notaId);
      if (!nota) return res.status(404).json({ success: false, error: 'Nota no encontrada' });
      credito.notas = credito.notas.filter(n => n.id !== notaId);
      store.update('creditos', id, { notas: credito.notas });
      registrarBorradoDemo({
        tipo: 'nota', idOriginal: notaId, detalles: nota,
        usuario: req.user._id, usuarioNombre: req.user.nombre,
        metadata: { creditoId: id, textoNota: nota.texto }
      });
      syncCreditoToClienteDemo(id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...store.findById('creditos', id), cliente: cl || credito.cliente } });
    }

    const credito = await Credito.findById(id).populate('cliente');
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    const notaI = credito.notas.findIndex(n => n.id === notaId);
    if (notaI === -1) return res.status(404).json({ success: false, error: 'Nota no encontrada' });
    const notaEliminada = credito.notas[notaI];
    credito.notas = credito.notas.filter(n => n.id !== notaId);
    await credito.save();
    await registrarBorrado({
      tipo: 'nota', idOriginal: notaId, detalles: notaEliminada,
      usuario: req.user._id, usuarioNombre: req.user.nombre,
      metadata: { creditoId: id, textoNota: notaEliminada.texto, nombreCliente: credito.cliente?.nombre || 'Desconocido' }
    });
    await syncCreditoToCliente(id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(200).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// AGREGAR ABONO
// ==============================================================
export const agregarAbono = async (req, res, next) => {
  try {
    const { valor, descripcion, fecha, tipo, nroCuota, multaId } = req.body;

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });

      if (multaId || tipo === 'multa') {
        if (!multaId) return res.status(400).json({ success: false, error: 'multaId es requerido para abonos de multa' });
        credito.abonosMulta = credito.abonosMulta || [];
        credito.abonosMulta.push({
          id: Date.now().toString(), valor: parseFloat(valor),
          descripcion: descripcion || 'Abono a multa', fecha: fecha ? normalizarFecha(fecha) : new Date(),
          multaId
        });
      } else {
        credito.abonos = credito.abonos || [];
        credito.abonos.push({
          id: Date.now().toString(), valor: parseFloat(valor),
          descripcion: descripcion || 'Abono al crédito', fecha: fecha || new Date(),
          nroCuota: nroCuota ? parseInt(nroCuota, 10) : null
        });
      }

      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(201).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    // ---- PRODUCCIÓN ----
    let credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });

    if (multaId || tipo === 'multa') {
      if (!multaId) return res.status(400).json({ success: false, error: 'multaId es requerido para abonos de multa' });
      const fechaAbonoMulta = fecha ? normalizarFecha(fecha) : new Date();
      credito.abonosMulta = credito.abonosMulta || [];
      credito.abonosMulta.push({
        id: Date.now().toString(), valor: parseFloat(valor),
        descripcion: descripcion || 'Abono a multa', fecha: fechaAbonoMulta, multaId
      });
    } else {
      credito.abonos.push({
        id: Date.now().toString(), valor: parseFloat(valor),
        descripcion: descripcion || 'Abono al crédito', fecha: fecha || new Date(),
        nroCuota: nroCuota ? parseInt(nroCuota, 10) : null
      });
    }

    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(201).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// ELIMINAR ABONO
// ==============================================================
export const eliminarAbono = async (req, res, next) => {
  try {
    const abonoId = req.params.abonoId;

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });

      let abonoEliminado = (credito.abonos || []).find(a => a.id === abonoId);
      if (abonoEliminado) {
        credito.abonos = credito.abonos.filter(a => a.id !== abonoId);
      } else {
        abonoEliminado = (credito.abonosMulta || []).find(a => a.id === abonoId);
        if (abonoEliminado) credito.abonosMulta = credito.abonosMulta.filter(a => a.id !== abonoId);
      }
      if (abonoEliminado) {
        registrarBorradoDemo({
          tipo: 'abono', idOriginal: abonoId, detalles: abonoEliminado,
          usuario: req.user._id, usuarioNombre: req.user.nombre,
          metadata: { creditoId: req.params.id, valorAbono: abonoEliminado.valor }
        });
      }
      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    // ---- PRODUCCIÓN ----
    let credito = await Credito.findById(req.params.id).populate('cliente');
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    let abonoEliminado = credito.abonos.find(a => a.id === abonoId);
    if (abonoEliminado) {
      credito.abonos = credito.abonos.filter(a => a.id !== abonoId);
    } else {
      const am = (credito.abonosMulta || []).find(a => a.id === abonoId);
      if (am) { abonoEliminado = am; credito.abonosMulta = credito.abonosMulta.filter(a => a.id !== abonoId); }
    }
    if (abonoEliminado) {
      await registrarBorrado({
        tipo: 'abono', idOriginal: abonoId, detalles: abonoEliminado,
        usuario: req.user._id, usuarioNombre: req.user.nombre,
        metadata: { creditoId: req.params.id, valorAbono: abonoEliminado.valor, nombreCliente: credito.cliente?.nombre || 'Desconocido' }
      });
    }
    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(200).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// EDITAR ABONO
// ==============================================================
export const editarAbono = async (req, res, next) => {
  try {
    const { valor, descripcion, fecha, tipo, nroCuota } = req.body;
    const abonoId = req.params.abonoId;

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });

      let idx = (credito.abonos || []).findIndex(a => a.id === abonoId);
      let esMulta = false;
      if (idx === -1) { idx = (credito.abonosMulta || []).findIndex(a => a.id === abonoId); esMulta = idx !== -1; }
      if (idx === -1) return res.status(404).json({ success: false, error: 'Abono no encontrado' });

      const fechaNorm = fecha ? normalizarFecha(fecha) : null;
      if (esMulta) {
        const abono = credito.abonosMulta[idx];
        credito.abonosMulta[idx] = {
          ...abono, valor: valor !== undefined ? parseFloat(valor) : abono.valor,
          descripcion: descripcion !== undefined ? descripcion : abono.descripcion,
          fecha: fechaNorm || abono.fecha
        };
      } else {
        const abono = credito.abonos[idx];
        credito.abonos[idx] = {
          ...abono, valor: valor ? parseFloat(valor) : abono.valor,
          descripcion: descripcion !== undefined ? descripcion : abono.descripcion,
          fecha: fechaNorm || abono.fecha, tipo: tipo || abono.tipo,
          nroCuota: nroCuota ? parseInt(nroCuota, 10) : (nroCuota === null ? null : abono.nroCuota)
        };
      }

      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    // ---- PRODUCCIÓN ----
    let credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    let idx = credito.abonos.findIndex(a => a.id === abonoId);
    let esMulta = false;
    if (idx === -1) { idx = (credito.abonosMulta || []).findIndex(a => a.id === abonoId); esMulta = idx !== -1; }
    if (idx === -1) return res.status(404).json({ success: false, error: 'Abono no encontrado' });

    const fechaNorm = fecha ? normalizarFecha(fecha) : null;
    if (esMulta) {
      const abono = credito.abonosMulta[idx];
      const updated = { ...abono, valor: valor !== undefined ? parseFloat(valor) : abono.valor, descripcion: descripcion !== undefined ? descripcion : abono.descripcion, fecha: fechaNorm || abono.fecha };
      const nuevos = credito.abonosMulta.map((a, i) => i === idx ? updated : a);
      credito.set('abonosMulta', nuevos);
    } else {
      const abono = credito.abonos[idx];
      credito.abonos[idx] = {
        ...abono, id: abono.id || abonoId,
        valor: valor ? parseFloat(valor) : abono.valor,
        descripcion: descripcion !== undefined ? descripcion : abono.descripcion,
        fecha: fechaNorm || abono.fecha, tipo: tipo || abono.tipo,
        nroCuota: nroCuota ? parseInt(nroCuota, 10) : (nroCuota === null ? null : abono.nroCuota)
      };
    }

    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(200).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// AGREGAR MULTA
// ==============================================================
export const agregarMulta = async (req, res, next) => {
  try {
    const { nroCuota, valor, motivo } = req.body;

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      credito.multas = credito.multas || [];
      credito.multas.push({
        id: Date.now().toString(), valor: parseFloat(valor),
        motivo: motivo + (nroCuota ? ` (Ref. Cuota #${nroCuota})` : ''),
        fecha: new Date(), pagada: false
      });
      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(201).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    let credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    credito.multas = credito.multas || [];
    credito.multas.push({
      id: Date.now().toString(), valor: parseFloat(valor),
      motivo: motivo + (nroCuota ? ` (Ref. Cuota #${nroCuota})` : ''),
      fecha: new Date(), pagada: false
    });
    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(201).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// EDITAR MULTA
// ==============================================================
export const editarMulta = async (req, res, next) => {
  try {
    const { multaId } = req.params;
    const { valor, fecha, motivo } = req.body;

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      const multa = (credito.multas || []).find(m => m.id === multaId);
      if (!multa) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
      if (valor !== undefined) multa.valor = parseFloat(valor);
      if (fecha !== undefined) multa.fecha = new Date(fecha);
      if (motivo !== undefined) {
        const match = multa.motivo.match(/\(Ref\. Cuota #(\d+)\)/);
        const ref = match ? match[1] : null;
        multa.motivo = motivo + (ref ? ` (Ref. Cuota #${ref})` : '');
      }
      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    let credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    const multa = credito.multas.find(m => m.id === multaId);
    if (!multa) return res.status(404).json({ success: false, error: 'Multa no encontrada' });
    if (valor !== undefined) multa.valor = parseFloat(valor);
    if (fecha !== undefined) multa.fecha = new Date(fecha);
    if (motivo !== undefined) {
      const match = multa.motivo.match(/\(Ref\. Cuota #(\d+)\)/);
      const ref = match ? match[1] : null;
      multa.motivo = motivo + (ref ? ` (Ref. Cuota #${ref})` : '');
    }
    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(200).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// ELIMINAR MULTA
// ==============================================================
export const eliminarMulta = async (req, res, next) => {
  try {
    const { multaId } = req.params;

    if (isDemoMode) {
      let credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      const multaEliminada = (credito.multas || []).find(m => m.id === multaId);
      credito.multas = (credito.multas || []).filter(m => m.id !== multaId);
      credito.abonosMulta = (credito.abonosMulta || []).filter(a => a.multaId !== multaId);
      if (multaEliminada) {
        registrarBorradoDemo({
          tipo: 'multa', idOriginal: multaId, detalles: multaEliminada,
          usuario: req.user._id, usuarioNombre: req.user.nombre,
          metadata: { creditoId: req.params.id, valorMulta: multaEliminada.valor }
        });
      }
      credito = recalcularCreditoCompleto(credito);
      store.update('creditos', req.params.id, credito);
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(200).json({ success: true, data: { ...credito, cliente: cl || credito.cliente } });
    }

    let credito = await Credito.findById(req.params.id).populate('cliente');
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    const multaEliminada = (credito.multas || []).find(m => m.id === multaId);
    credito.multas = (credito.multas || []).filter(m => m.id !== multaId);
    credito.abonosMulta = (credito.abonosMulta || []).filter(a => a.multaId !== multaId);
    if (multaEliminada) {
      await registrarBorrado({
        tipo: 'multa', idOriginal: multaId, detalles: multaEliminada,
        usuario: req.user._id, usuarioNombre: req.user.nombre,
        metadata: { creditoId: req.params.id, valorMulta: multaEliminada.valor, nombreCliente: credito.cliente?.nombre || 'Desconocido' }
      });
    }
    credito = recalcularCreditoCompleto(credito);
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(200).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};

// ==============================================================
// AGREGAR DESCUENTO
// ==============================================================
export const agregarDescuento = async (req, res, next) => {
  try {
    const { valor, tipo, descripcion } = req.body;

    if (isDemoMode) {
      const credito = store.findById('creditos', req.params.id);
      if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
      credito.descuentos = credito.descuentos || [];
      credito.descuentos.push({ id: Date.now().toString(), valor, tipo, descripcion, fecha: new Date() });
      store.update('creditos', req.params.id, { descuentos: credito.descuentos });
      syncCreditoToClienteDemo(req.params.id);
      const cl = store.findById('clientes', credito.cliente);
      return res.status(201).json({ success: true, data: { ...store.findById('creditos', req.params.id), cliente: cl || credito.cliente } });
    }

    const credito = await Credito.findById(req.params.id);
    if (!credito) return res.status(404).json({ success: false, error: 'Crédito no encontrado' });
    credito.descuentos.push({ id: Date.now().toString(), valor, tipo, descripcion, fecha: new Date() });
    await credito.save();
    await syncCreditoToCliente(req.params.id);
    const creditoActualizado = await Credito.findById(credito._id).populate('cliente');
    res.status(201).json({ success: true, data: creditoActualizado });
  } catch (error) {
    next(error);
  }
};
