import Cliente from '../models/Cliente.js';
import Credito from '../models/Credito.js';
import HistorialBorrado from '../models/HistorialBorrado.js';
import { registrarBorrado } from './historialBorradoController.js';

/**
 * @desc    Obtener todos los clientes
 * @route   GET /api/clientes
 * @access  Private
 */
export const getClientes = async (req, res, next) => {
  try {
    const { search, cartera, page = 1, limit = 50, archivados, supervision, rf } = req.query;

    const query = {};
    const condiciones = [];

    // Filtro de archivados (SIEMPRE debe aplicarse)
    if (archivados === 'true') {
      condiciones.push({ esArchivado: true });
    } else {
      // No archivados: esArchivado debe ser false, null o no existir
      condiciones.push({
        $or: [
          { esArchivado: false },
          { esArchivado: null },
          { esArchivado: { $exists: false } }
        ]
      });
    }

    // Filtro de supervisión
    if (supervision === 'true') {
      condiciones.push({ enSupervision: true });
    } else if (supervision === 'false') {
      condiciones.push({
        $or: [
          { enSupervision: false },
          { enSupervision: null },
          { enSupervision: { $exists: false } }
        ]
      });
    }

    // Filtro de RF
    if (rf === 'true' || rf === 'RF') {
      condiciones.push({ rf: 'RF' });
    }

    // Solo aplicar filtro de cartera para domiciliarios y supervisores con ciudad
    // Administradores y CEO ven todas las carteras (y supervisores sin ciudad si existieran)
    if (req.user && (req.user.role === 'domiciliario' || req.user.role === 'supervisor')) {
      if (req.user.ciudad === 'Guadalajara de Buga') {
        // Solo ven K3
        condiciones.push({ cartera: 'K3' });
      } else if (req.user.ciudad === 'Tuluá') {
        // Solo ven K1 y K2 (excluir K3)
        condiciones.push({
          $or: [
            { cartera: 'K1' },
            { cartera: 'K2' },
            { cartera: { $exists: false } } // Para clientes sin cartera definida (default K1)
          ]
        });
      }
    } else {
      // Para administradores y CEO, aplicar filtro de cartera solo si se especifica en query
      // Si no se especifica, verán todas las carteras
      if (cartera) {
        condiciones.push({ cartera: cartera });
      }
    }

    // Filtro de búsqueda
    if (search) {
      condiciones.push({
        $or: [
          { nombre: { $regex: search, $options: 'i' } },
          { documento: { $regex: search, $options: 'i' } },
          { telefono: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // Construir query final: si hay múltiples condiciones, usar $and
    if (condiciones.length === 1) {
      Object.assign(query, condiciones[0]);
    } else if (condiciones.length > 1) {
      query.$and = condiciones;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const clientes = await Cliente.find(query)
      .populate('creditos')
      .sort({ fechaCreacion: -1 })
      .skip(skip)
      .limit(parseInt(limit))


    const total = await Cliente.countDocuments(query);

    res.status(200).json({
      success: true,
      count: clientes.length,
      total,
      data: clientes
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener un cliente por ID
 * @route   GET /api/clientes/:id
 * @access  Private
 */
export const getCliente = async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id)
      .populate({
        path: 'creditos',
        populate: {
          path: 'cliente',
          select: 'nombre documento'
        }
      });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      data: cliente
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Crear un nuevo cliente
 * @route   POST /api/clientes
 * @access  Private
 */
export const createCliente = async (req, res, next) => {
  try {
    // Asegurar que esArchivado esté definido (por defecto false)
    const clienteData = {
      ...req.body,
      esArchivado: req.body.esArchivado !== undefined ? req.body.esArchivado : false
    };
    const cliente = await Cliente.create(clienteData);

    res.status(201).json({
      success: true,
      data: cliente
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Actualizar un cliente
 * @route   PUT /api/clientes/:id
 * @access  Private
 */
export const updateCliente = async (req, res, next) => {
  try {
    // Si se está activando RF, actualizar la fecha solo si no se proporciona una específica
    if (req.body.rf === 'RF' && !req.body.fechaRF) {
      req.body.fechaRF = new Date();
    }

    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).populate('creditos');

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    res.status(200).json({
      success: true,
      data: cliente
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Eliminar un cliente
 * @route   DELETE /api/clientes/:id
 * @access  Private
 */
export const deleteCliente = async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id);

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    // Liberar la posición del cliente (se libera automáticamente al eliminar)

    // Eliminar todos los créditos asociados
    await Credito.deleteMany({ cliente: req.params.id });

    // Eliminar el cliente
    await Cliente.findByIdAndDelete(req.params.id);

    // Registrar en historial
    await registrarBorrado({
      tipo: 'cliente',
      idOriginal: req.params.id,
      detalles: cliente, // Snapshot completo del cliente antes de borrar
      usuario: req.user._id,
      usuarioNombre: req.user.nombre,
      metadata: {
        nombreItem: cliente.nombre,
        documento: cliente.documento
      }
    });

    res.status(200).json({
      success: true,
      message: 'Cliente eliminado correctamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Actualizar coordenadas GPS de un cliente
 * @route   PUT /api/clientes/:id/coordenadas
 * @access  Private
 */
export const updateCoordenadas = async (req, res, next) => {
  try {
    const { tipo, coordenadas, entidad = 'cliente' } = req.body;
    const cliente = await Cliente.findById(req.params.id);

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    if (entidad === 'fiador') {
      if (!cliente.fiador) {
        cliente.fiador = {};
      }
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

    res.status(200).json({
      success: true,
      data: cliente
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Archivar un cliente (liberar posición pero mantener información)
 * @route   PUT /api/clientes/:id/archivar
 * @access  Private
 */
export const archivarCliente = async (req, res, next) => {
  try {
    const cliente = await Cliente.findById(req.params.id);

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    // Verificar si el cliente ya está archivado
    if (cliente.esArchivado) {
      return res.status(400).json({
        success: false,
        error: 'El cliente ya está archivado'
      });
    }

    // Liberar la posición del cliente (permitir archivar incluso con créditos pendientes)
    cliente.posicion = null;
    cliente.esArchivado = true;

    await cliente.save();

    res.status(200).json({
      success: true,
      message: 'Cliente archivado correctamente',
      data: cliente
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Desarchivar un cliente (asignar nueva posición)
 * @route   PUT /api/clientes/:id/desarchivar
 * @access  Private
 */
// Helper: Determinar el tipo de pago del cliente basándose en créditos activos
const obtenerTipoPagoCliente = (cliente) => {
  if (!cliente || !cliente.creditos || cliente.creditos.length === 0) {
    return cliente?.tipoPagoEsperado || null;
  }

  // Buscar créditos activos o en mora (con cuotas no pagadas)
  const creditoActivo = cliente.creditos.find(c => {
    if (!c.cuotas || c.cuotas.length === 0) return false;
    const tieneCuotasPendientes = c.cuotas.some(cuota => !cuota.pagado);
    return tieneCuotasPendientes && c.tipo;
  });

  // Si hay crédito activo, usar su tipo de pago
  if (creditoActivo && creditoActivo.tipo) {
    return creditoActivo.tipo;
  }

  // Si no hay créditos activos, usar tipoPagoEsperado como fallback
  return cliente.tipoPagoEsperado || null;
};

export const desarchivarCliente = async (req, res, next) => {
  try {
    const { posicion, cartera: nuevaCartera, tipoPago: nuevoTipoPago } = req.body; // Posición, cartera y tipo de pago opcionales
    const cliente = await Cliente.findById(req.params.id);

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    if (!cliente.esArchivado) {
      return res.status(400).json({
        success: false,
        error: 'El cliente no está archivado'
      });
    }

    // Actualizar cartera y tipo de pago si se proporcionan
    if (nuevaCartera) {
      cliente.cartera = nuevaCartera;
    }
    if (nuevoTipoPago) {
      cliente.tipoPagoEsperado = nuevoTipoPago;
    }

    const cartera = cliente.cartera || 'K1';
    // Determinar el tipo de pago basándose en créditos activos o el nuevo tipoPagoEsperado
    const tipoPagoCliente = obtenerTipoPagoCliente(cliente);

    // Si se proporciona una posición específica, validarla
    if (posicion !== undefined && posicion !== null) {
      const posicionNum = parseInt(posicion);

      // Validar que la posición sea un número válido
      if (isNaN(posicionNum)) {
        return res.status(400).json({
          success: false,
          error: 'La posición debe ser un número válido'
        });
      }

      // Construir query para verificar si la posición está ocupada
      // Primero buscar cualquier cliente en esa posición (sin considerar tipo de pago)
      const queryBase = {
        cartera,
        posicion: posicionNum,
        esArchivado: { $ne: true },
        _id: { $ne: req.params.id }
      };

      let clienteOcupando = await Cliente.findOne(queryBase);

      // Para K1 y K3, si hay un cliente ocupando la posición, verificar si es del mismo tipo de pago
      // Si es del mismo tipo, la posición está ocupada. Si es de otro tipo, está disponible.
      // Para K1 y K3, si hay un cliente ocupando la posición, verificar conflicto de tipos
      // - Semanal ocupa su propia ranura
      // - Quincenal y Mensual comparten ranura (conflictúan entre sí)
      if ((cartera === 'K1' || cartera === 'K3') && tipoPagoCliente && clienteOcupando) {
        const tipoPagoOcupante = obtenerTipoPagoCliente(clienteOcupando);

        // Definir grupos de conflicto
        const esGrupoQuincenalMensual = (t) => t === 'quincenal' || t === 'mensual';
        const sonConflictivos = (t1, t2) => {
          if (t1 === t2) return true; // Mismo tipo siempre conflictúa
          if (esGrupoQuincenalMensual(t1) && esGrupoQuincenalMensual(t2)) return true; // Quincenal y Mensual conflictúan
          return false;
        };

        if (sonConflictivos(tipoPagoCliente, tipoPagoOcupante)) {
          // La posición está ocupada
        } else {
          // La posición está ocupada pero por un cliente de tipo compatible, está disponible para este tipo
          clienteOcupando = null;
        }
      }

      if (clienteOcupando) {
        return res.status(400).json({
          success: false,
          error: `La posición ${posicion} ya está ocupada por otro cliente`
        });
      }

      // Validar rango de posición según cartera
      const capacidadMaxima = (cartera === 'K1' || cartera === 'K3') ? 150 : 225;
      if (posicionNum < 1 || posicionNum > capacidadMaxima) {
        return res.status(400).json({
          success: false,
          error: `La posición debe estar entre 1 y ${capacidadMaxima} para la cartera ${cartera}`
        });
      }

      cliente.posicion = posicionNum;
    } else {
      // Si no se proporciona posición, asignar automáticamente la primera disponible
      // Obtener todos los clientes de la cartera y filtrar en memoria por tipo de pago
      const todosLosClientes = await Cliente.find({
        cartera,
        esArchivado: { $ne: true }
      });

      // Filtrar clientes que tienen el mismo tipo de pago (basándose en créditos activos)
      const clientesMismoTipo = todosLosClientes.filter(c => {
        if (cartera === 'K2') {
          return true; // Para K2, todos los clientes cuentan
        }

        if ((cartera === 'K1' || cartera === 'K3') && tipoPagoCliente) {
          const tipoPagoOtroCliente = obtenerTipoPagoCliente(c);

          const esGrupoQuincenalMensual = (t) => t === 'quincenal' || t === 'mensual';

          // Conflicto si es el mismo tipo o si ambos son del grupo quincenal/mensual
          if (tipoPagoOtroCliente === tipoPagoCliente) return true;
          if (esGrupoQuincenalMensual(tipoPagoOtroCliente) && esGrupoQuincenalMensual(tipoPagoCliente)) return true;

          return false;
        }

        return false;
      });

      const posicionesOcupadas = clientesMismoTipo
        .map(c => c.posicion)
        .filter(Boolean);

      const capacidadMaxima = (cartera === 'K1' || cartera === 'K3') ? 150 : 225;
      let nuevaPosicion = 1;
      while (posicionesOcupadas.includes(nuevaPosicion) && nuevaPosicion <= capacidadMaxima) {
        nuevaPosicion++;
      }

      if (nuevaPosicion > capacidadMaxima) {
        return res.status(400).json({
          success: false,
          error: 'No hay posiciones disponibles en esta cartera'
        });
      }

      cliente.posicion = nuevaPosicion;
    }

    cliente.esArchivado = false;

    await cliente.save();

    res.status(200).json({
      success: true,
      message: 'Cliente desarchivado correctamente',
      data: cliente
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener posiciones disponibles para una cartera y tipo de pago
 * @route   GET /api/clientes/posiciones-disponibles/:cartera
 * @access  Private
 */
export const getPosicionesDisponibles = async (req, res, next) => {
  try {
    const { cartera } = req.params;
    const { tipoPago } = req.query; // Tipo de pago: 'semanal', 'quincenal', 'mensual', 'diario' o null para K2

    let capacidadMaxima;

    if (cartera === 'K1') {
      capacidadMaxima = 150;
    } else if (cartera === 'K2') {
      capacidadMaxima = 225;
    } else if (cartera === 'K3') {
      capacidadMaxima = 150; // K3 se comporta como K1, con 150 espacios por tipo de pago
    } else {
      return res.status(400).json({
        success: false,
        error: 'Cartera inválida'
      });
    }

    // Obtener TODOS los clientes de la cartera (no archivados y con posición)
    const todosLosClientes = await Cliente.find({
      cartera,
      esArchivado: { $ne: true },
      posicion: { $ne: null }
    });

    // Filtrar en memoria según el tipo de pago (similar a la lógica del frontend)
    const clientesOcupando = todosLosClientes.filter(cliente => {
      // Para K2, todos los clientes cuentan
      if (cartera === 'K2') {
        return true;
      }

      // Para K1 y K3, filtrar por tipo de pago
      // Para K1 y K3, filtrar por tipo de pago considerando que Quincenal y Mensual comparten posiciones
      if ((cartera === 'K1' || cartera === 'K3') && tipoPago) {
        // Validación de tipos soportados
        const tiposValidos = ['semanal', 'quincenal', 'mensual'];
        if (!tiposValidos.includes(tipoPago)) {
          // Si es un tipo raro, asumimos que no hay conflicto o manejamos como error?
          // Por ahora, si no es válido, no ocupa
          return false;
        }

        // Obtener tipos de pago activos del cliente
        const tiposActivos = new Set();
        if (cliente.creditos && cliente.creditos.length > 0) {
          cliente.creditos.forEach(credito => {
            const tieneCuotasPendientes = credito.cuotas && credito.cuotas.some(cuota => !cuota.pagado);
            if (tieneCuotasPendientes && credito.tipo) {
              tiposActivos.add(credito.tipo);
            }
          });
        }

        const tiposDelCliente = tiposActivos.size > 0
          ? Array.from(tiposActivos)
          : (cliente.tipoPagoEsperado ? [cliente.tipoPagoEsperado] : []);

        // Lógica de conflicto
        const esGrupoQuincenalMensual = (t) => t === 'quincenal' || t === 'mensual';

        // El cliente ocupa la posición SI alguno de sus tipos entra en conflicto con el tipo solicitado
        return tiposDelCliente.some(tipoCliente => {
          if (tipoCliente === tipoPago) return true; // Mismo tipo
          if (esGrupoQuincenalMensual(tipoCliente) && esGrupoQuincenalMensual(tipoPago)) return true; // Conflicto Q/M
          return false;
        });
      }

      return false;
    });

    const posicionesOcupadas = new Set(
      clientesOcupando.map(c => c.posicion).filter(Boolean)
    );

    // Generar lista de posiciones disponibles
    const posicionesDisponibles = [];
    for (let i = 1; i <= capacidadMaxima; i++) {
      if (!posicionesOcupadas.has(i)) {
        posicionesDisponibles.push(i);
      }
    }

    res.status(200).json({
      success: true,
      data: posicionesDisponibles
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener historial completo de un documento (cédula)
 * @route   GET /api/clientes/historial-documento/:documento
 * @access  Private
 */
export const getHistorialDocumento = async (req, res, next) => {
  try {
    const { documento } = req.params;

    if (!documento || documento.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'El documento debe tener al menos 3 caracteres'
      });
    }

    // 1. Buscar clientes activos y archivados con ese documento
    const clientes = await Cliente.find({
      documento: { $regex: documento, $options: 'i' }
    }).lean();

    // 2. Buscar en historial de borrados (clientes eliminados)
    const historialBorrados = await HistorialBorrado.find({
      tipo: 'cliente',
      $or: [
        { 'detalles.documento': { $regex: documento, $options: 'i' } },
        { 'metadata.documento': { $regex: documento, $options: 'i' } }
      ]
    }).sort({ fechaBorrado: -1 }).lean();

    // 3. Procesar información de clientes
    const clientesInfo = clientes.map(cliente => {
      // Recopilar notas de todos los créditos
      const notasCreditos = [];
      if (cliente.creditos && cliente.creditos.length > 0) {
        cliente.creditos.forEach((credito, idx) => {
          if (credito.notas && credito.notas.length > 0) {
            credito.notas.forEach(nota => {
              notasCreditos.push({
                texto: nota.texto,
                fecha: nota.fecha,
                creditoIndex: idx + 1,
                creditoMonto: credito.monto,
                creditoTipo: credito.tipo
              });
            });
          }
        });
      }

      // Ordenar notas por fecha (más reciente primero)
      notasCreditos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      return {
        _id: cliente._id,
        nombre: cliente.nombre,
        documento: cliente.documento,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        barrio: cliente.barrio,
        cartera: cliente.cartera,
        etiqueta: cliente.etiqueta,
        esArchivado: cliente.esArchivado,
        fechaCreacion: cliente.fechaCreacion,
        totalCreditos: cliente.creditos?.length || 0,
        notasCreditos,
        esVetado: cliente.etiqueta === 'vetado',
        esPerdido: cliente.etiqueta === 'perdido'
      };
    });

    // 4. Procesar historial de borrados
    const borradosInfo = historialBorrados.map(registro => ({
      nombreOriginal: registro.detalles?.nombre || registro.metadata?.nombreItem || 'N/A',
      documentoOriginal: registro.detalles?.documento || registro.metadata?.documento || 'N/A',
      fechaBorrado: registro.fechaBorrado,
      usuarioBorrado: registro.usuarioNombre,
      etiquetaOriginal: registro.detalles?.etiqueta || null
    }));

    // 5. Construir respuesta
    const tieneHistorial = clientes.length > 0 || historialBorrados.length > 0;
    const hayVetados = clientesInfo.some(c => c.esVetado);
    const hayPerdidos = clientesInfo.some(c => c.esPerdido);

    res.status(200).json({
      success: true,
      data: {
        tieneHistorial,
        hayVetados,
        hayPerdidos,
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
