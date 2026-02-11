import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Calendar, Users, ChevronLeft, ChevronRight, CheckCircle, Clock, MapPin, ChevronDown, ChevronUp, Phone, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { format, parseISO, startOfDay, addDays, subDays, isBefore, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatearMoneda, calcularTotalMultasCuota, aplicarAbonosAutomaticamente, determinarEstadoCredito, formatearFechaCorta } from '../utils/creditCalculations';
import CreditoDetalle from '../components/Creditos/CreditoDetalle';
import MotivoProrrogaModal from '../components/Creditos/MotivoProrrogaModal';
import api, { prorrogaService, ordenCobroService } from '../services/api';

const Rutas = () => {
  const navigate = useNavigate();
  const { clientes, obtenerCliente, obtenerCredito, agregarNota } = useApp();
  const { user } = useAuth();
  const hoy = startOfDay(new Date());

  // Verificar el tipo de usuario para determinar qué carteras mostrar
  const esDomiciliarioBuga = user && user.role === 'domiciliario' && user.ciudad === 'Guadalajara de Buga';
  const esDomiciliarioTula = user && user.role === 'domiciliario' && user.ciudad === 'Tuluá';
  const esAdminOCeo = user && (user.role === 'administrador' || user.role === 'ceo');

  // Estado para la fecha seleccionada
  const [fechaSeleccionada, setFechaSeleccionada] = useState(hoy);
  const fechaSeleccionadaStr = format(fechaSeleccionada, 'yyyy-MM-dd');

  // Estado para visitas
  const [visitas, setVisitas] = useState([]);

  // Estado para búsqueda
  const [searchTerm, setSearchTerm] = useState('');

  // Estado para orden de cobro por fecha y cliente
  // Estructura: { [fechaStr]: { [clienteId]: numeroOrden } }
  const [ordenCobro, setOrdenCobro] = useState({});

  // Estado para rastrear créditos inválidos (que no existen en el backend)
  // Estructura: Set de strings con formato "clienteId-creditoId"
  const [creditosInvalidos, setCreditosInvalidos] = useState(new Set());

  // Estado para prórrogas de cuotas, sin modificar la fecha original del crédito
  // Estructura: { [`clienteId-creditoId-nroCuota`]: 'YYYY-MM-DD' }
  const [prorrogasCuotas, setProrrogasCuotas] = useState({});

  // Estados para el Modal de Motivo de Prórroga
  const [modalProrrogaOpen, setModalProrrogaOpen] = useState(false);
  const [datosProrrogaPendiente, setDatosProrrogaPendiente] = useState(null);

  // Estado para clientes marcados como no encontrados por fecha
  // Estructura: { [fechaStr]: Set([clienteId, clienteId, ...]) }
  const [clientesNoEncontradosPorFecha, setClientesNoEncontradosPorFecha] = useState({});

  // Cargar visitas y orden de cobro desde localStorage
  useEffect(() => {
    const cargarVisitas = () => {
      const savedVisitas = localStorage.getItem('visitas');
      if (savedVisitas) {
        setVisitas(JSON.parse(savedVisitas));
      }
    };

    cargarVisitas();
    window.addEventListener('storage', cargarVisitas);
    return () => window.removeEventListener('storage', cargarVisitas);
  }, []);

  // Cargar clientes no encontrados desde localStorage
  useEffect(() => {
    const cargarClientesNoEncontrados = () => {
      const savedClientesNoEncontrados = localStorage.getItem('clientesNoEncontradosPorFecha');
      if (savedClientesNoEncontrados) {
        try {
          const parsed = JSON.parse(savedClientesNoEncontrados);
          // Convertir arrays de vuelta a Sets
          const conSets = {};
          Object.keys(parsed).forEach(fecha => {
            conSets[fecha] = new Set(parsed[fecha]);
          });
          setClientesNoEncontradosPorFecha(conSets);
        } catch (error) {
          console.error('Error cargando clientes no encontrados:', error);
        }
      }
    };

    cargarClientesNoEncontrados();
    window.addEventListener('storage', cargarClientesNoEncontrados);
    return () => window.removeEventListener('storage', cargarClientesNoEncontrados);
  }, []);

  // Cargar orden de cobro desde el servidor al cambiar la fecha
  useEffect(() => {
    const cargarOrden = async () => {
      try {
        const response = await ordenCobroService.obtenerPorFecha(fechaSeleccionadaStr);
        if (response.success) {
          setOrdenCobro(prev => ({
            ...prev,
            [fechaSeleccionadaStr]: response.data
          }));
        }
      } catch (error) {
        console.error('Error al cargar órdenes de cobro:', error);
      }
    };

    cargarOrden();
  }, [fechaSeleccionadaStr]);

  // Cargar prórrogas desde el BACKEND al iniciar
  useEffect(() => {
    const cargarProrrogas = async () => {
      try {
        const response = await prorrogaService.obtenerTodas();
        if (response.success && Array.isArray(response.data)) {
          const mapaProrrogas = {};
          response.data.forEach(p => {
            if (p.fechaProrroga) {
              const key = `${p.clienteId}-${p.creditoId}-${p.nroCuota}`;
              // Convertir fecha ISO a YYYY-MM-DD
              const fechaStr = new Date(p.fechaProrroga).toISOString().split('T')[0];
              mapaProrrogas[key] = fechaStr;
            }
          });
          setProrrogasCuotas(mapaProrrogas);
        }
      } catch (error) {
        console.error('Error al cargar prórrogas desde el servidor:', error);
        toast.error('No se pudieron sincronizar las extensiones de fecha con el servidor');

        // Fallback: intentar cargar de localStorage si falla el servidor
        const savedProrrogas = localStorage.getItem('prorrogasCuotas');
        if (savedProrrogas) {
          try {
            setProrrogasCuotas(JSON.parse(savedProrrogas));
          } catch (e) {
            console.error('Error fallback localStorage:', e);
          }
        }
      }
    };

    cargarProrrogas();
  }, []);

  // Filtrar visitas para el día seleccionado
  const visitasDelDia = useMemo(() => {
    return visitas.filter(visita => {
      if (visita.completada) return false;
      const fechaVisita = visita.fechaVisita;
      if (fechaVisita === fechaSeleccionadaStr) return true;
      if (fechaVisita < fechaSeleccionadaStr) return true;
      return false;
    });
  }, [visitas, fechaSeleccionadaStr]);

  const handleCompletarVisita = (id) => {
    if (window.confirm('¿Marcar visita como completada?')) {
      const nuevasVisitas = visitas.map(v =>
        v.id === id ? { ...v, completada: true } : v
      );
      setVisitas(nuevasVisitas);
      localStorage.setItem('visitas', JSON.stringify(nuevasVisitas));
      toast.success('Visita marcada como completada');
    }
  };

  // Manejar cambio de número de orden para un cliente en la fecha seleccionada
  const handleCambioOrdenCliente = async (clienteId, nuevoOrden) => {
    // Permitir estado vacío mientras el usuario borra y escribe
    if (nuevoOrden === '') {
      setOrdenCobro(prev => {
        const fechaKey = fechaSeleccionadaStr;
        const ordenFechaActual = prev[fechaKey] || {};

        const nuevoOrdenFecha = {
          ...ordenFechaActual,
          [clienteId]: '',
        };

        // Eliminar de la base de datos
        ordenCobroService.eliminar(fechaSeleccionadaStr, clienteId).catch(err => {
          console.error('Error al eliminar orden de cobro:', err);
        });

        return {
          ...prev,
          [fechaKey]: nuevoOrdenFecha,
        };
      });
      return;
    }

    const numero = Number(nuevoOrden);
    if (Number.isNaN(numero) || numero <= 0) return;

    setOrdenCobro(prev => {
      const fechaKey = fechaSeleccionadaStr;
      const ordenFechaActual = prev[fechaKey] || {};

      const nuevoOrdenFecha = {
        ...ordenFechaActual,
        [clienteId]: numero,
      };

      // Persistir en la base de datos
      ordenCobroService.guardar(fechaSeleccionadaStr, nuevoOrdenFecha).catch(err => {
        console.error('Error al guardar orden en el servidor:', err);
      });

      return {
        ...prev,
        [fechaKey]: nuevoOrdenFecha,
      };
    });
  };

  // Procesar cobros agrupados por BARRIO
  const datosCobro = useMemo(() => {
    const porBarrio = {}; // { "Nombre Barrio": [items...] }
    const stats = {
      esperado: 0,
      recogido: 0,
      pendiente: 0,
      clientesTotal: 0
    };

    const clientesUnicos = new Set();
    const clientesUnicosHoy = new Set();

    // Helper para agregar item a barrio
    const agregarItem = (barrioRaw, item) => {
      const barrio = barrioRaw || 'Sin Barrio';
      if (!porBarrio[barrio]) porBarrio[barrio] = [];
      porBarrio[barrio].push(item);
      clientesUnicos.add(item.clienteId);
    };

    clientes.forEach(cliente => {
      if (!cliente.creditos || cliente.creditos.length === 0) return;

      cliente.creditos.forEach(credito => {
        // Validar que el crédito tenga un ID válido y estructura completa
        if (!credito || !credito.id) return;
        // Validar que tenga las propiedades esenciales
        if (!credito.cuotas || !Array.isArray(credito.cuotas) || credito.cuotas.length === 0) return;
        if (!credito.monto || !credito.valorCuota || !credito.tipo) return;
        // Excluir créditos que ya fueron renovados de la ruta de cobro
        if (credito.renovado) return;
        // Validar que el ID no sea un formato inválido o corrupto
        // Los IDs válidos suelen ser ObjectIds de MongoDB o IDs generados por el sistema
        // Si el ID parece ser un timestamp sin formato correcto, podría ser inválido
        if (typeof credito.id !== 'string' || credito.id.trim() === '') return;
        // Excluir créditos que han sido marcados como inválidos (no existen en el backend)
        const creditoKey = `${cliente.id}-${credito.id}`;
        if (creditosInvalidos.has(creditoKey)) return;

        const { cuotasActualizadas } = aplicarAbonosAutomaticamente(credito);
        const estadoCredito = determinarEstadoCredito(credito.cuotas, credito);

        // Identificar actividad del día
        let tieneActividadHoy = false;
        let totalACobrarHoy = 0;
        let totalCobradoHoy = 0;
        let totalAbonadoHoy = 0;

        // 1. Cuotas Pendientes (Programadas hoy o Vencidas)
        const cuotasPendientesHoy = cuotasActualizadas.filter((cuota, index) => {
          const cuotaOriginal = credito.cuotas[index];
          if (cuotaOriginal.pagado) return false;

          const keyCuota = `${cliente.id}-${credito.id}-${cuota.nroCuota}`;
          const fechaProrroga = prorrogasCuotas[keyCuota];
          let fechaReferencia = fechaProrroga || cuotaOriginal.fechaProgramada;

          // Normalizar fechaReferencia a formato YYYY-MM-DD
          if (typeof fechaReferencia === 'string') {
            if (fechaReferencia.includes('T')) {
              fechaReferencia = fechaReferencia.split('T')[0];
            } else if (!fechaReferencia.match(/^\d{4}-\d{2}-\d{2}$/)) {
              // Si no está en formato YYYY-MM-DD, intentar parsear
              const fechaObj = parseISO(fechaReferencia);
              if (!isNaN(fechaObj.getTime())) {
                fechaReferencia = format(fechaObj, 'yyyy-MM-dd');
              }
            }
          } else if (fechaReferencia instanceof Date) {
            fechaReferencia = format(fechaReferencia, 'yyyy-MM-dd');
          }

          const abonoAplicado = cuota.abonoAplicado || 0;
          const valorCuotaPendiente = credito.valorCuota - abonoAplicado;
          const totalMultas = calcularTotalMultasCuota(cuota);
          const multasCubiertas = cuota.multasCubiertas || 0;
          const multasPendientes = totalMultas - multasCubiertas;
          const tieneSaldo = valorCuotaPendiente > 0 || multasPendientes > 0;

          // Lógica Dinámica: Mostrar si:
          // 1. Es exactamente la fecha que estamos viendo (fechaProgramada === fechaSeleccionada)
          // 2. Es una fecha pasada (vencida) Y estamos viendo "Hoy" o "Mañana" en tiempo real

          const esDiaProgramado = fechaReferencia === fechaSeleccionadaStr;

          const fechaReferenciaObj = parseISO(fechaReferencia);
          const esVencidaOActual = isBefore(fechaReferenciaObj, hoy) || format(fechaReferenciaObj, 'yyyy-MM-dd') === format(hoy, 'yyyy-MM-dd');

          const diffRespectoHoy = differenceInCalendarDays(
            parseISO(fechaSeleccionadaStr),
            hoy
          );

          const viendoHoyOMañana = diffRespectoHoy === 0 || diffRespectoHoy === 1;

          if (esDiaProgramado || (esVencidaOActual && viendoHoyOMañana)) {
            return tieneSaldo;
          }
        });

        if (cuotasPendientesHoy.length > 0) {
          tieneActividadHoy = true;
          cuotasPendientesHoy.forEach(c => {
            const abono = c.abonoAplicado || 0;
            const multas = calcularTotalMultasCuota(c) - (c.multasCubiertas || 0);
            totalACobrarHoy += (credito.valorCuota - abono) + multas;
          });
        }

        // 2. Cuotas Cobradas Hoy
        const cuotasCobradasHoy = credito.cuotas.filter(cuota => {
          return cuota.pagado && cuota.fechaPago === fechaSeleccionadaStr && !cuota.tieneAbono;
        });
        if (cuotasCobradasHoy.length > 0) {
          tieneActividadHoy = true;
          totalCobradoHoy += (cuotasCobradasHoy.length * credito.valorCuota);
        }

        // 3. Abonos Hoy (Específicos o Generales)
        // a. Específicos
        const cuotasAbonadasHoy = credito.cuotas.filter(cuota =>
          cuota.abonosCuota && cuota.abonosCuota.some(a => a.fecha === fechaSeleccionadaStr)
        );
        // b. Generales
        const abonosGeneralesHoy = (credito.abonos || []).filter(abono => {
          const f = abono.fecha?.split('T')[0] || abono.fecha;
          return f === fechaSeleccionadaStr;
        });

        if (cuotasAbonadasHoy.length > 0 || abonosGeneralesHoy.length > 0) {
          tieneActividadHoy = true;
          cuotasAbonadasHoy.forEach(c => {
            const abonos = c.abonosCuota.filter(a => a.fecha === fechaSeleccionadaStr);
            totalAbonadoHoy += abonos.reduce((s, a) => s + a.valor, 0);
          });
          totalAbonadoHoy += abonosGeneralesHoy.reduce((s, a) => s + a.valor, 0);
        }

        if (!tieneActividadHoy) return;

        // Si no hay nada pendiente (totalACobrarHoy === 0), no mostrar en la sección de pendientes
        // Solo se mostrará en "Pagados" si hay actividad de pago ese día
        if (totalACobrarHoy === 0) return;

        // Determinar estado visual para la tabla
        // Prioridad: Pendiente > Abonado > Cobrado
        let tipoItem = 'cobrado';
        if (totalACobrarHoy > 0) tipoItem = 'pendiente';
        else if (totalAbonadoHoy > 0 && totalACobrarHoy === 0) tipoItem = 'abonado'; // Si abonó y no debe nada pendiente viejo/hoy

        // Si debe pendiente, el valor a mostrar principal es lo que debe.
        // Si no debe, mostramos lo que pagó/abonó.
        let valorMostrar = 0;
        // CAMBIO: Para pendiente, mostrar siempre el valor de la cuota general del crédito,
        // independiente de si debe varias. El usuario solicitó ver la cuota estándar.
        if (tipoItem === 'pendiente') valorMostrar = credito.valorCuota;
        else if (tipoItem === 'cobrado') valorMostrar = totalCobradoHoy;
        else valorMostrar = totalAbonadoHoy;

        // Calcular info de vencimiento (Global del crédito)
        // Similar a Clientes.jsx
        let cuotasVencidasCount = 0;
        let primerCuotaVencidaFecha = null;
        const fechaHoyObj = startOfDay(new Date());

        cuotasActualizadas.forEach(cuota => {
          if (cuota.pagado) return;
          const abono = cuota.abonoAplicado || 0;
          if ((credito.valorCuota - abono) > 0) {
            const fProg = startOfDay(parseISO(cuota.fechaProgramada));
            if (isBefore(fProg, fechaHoyObj)) {
              cuotasVencidasCount++;
              if (!primerCuotaVencidaFecha || isBefore(fProg, startOfDay(parseISO(primerCuotaVencidaFecha)))) {
                primerCuotaVencidaFecha = cuota.fechaProgramada;
              }
            }
          }
        });

        // Calcular saldo total del crédito
        let pagadoTotal = 0;
        credito.cuotas.forEach(c => { if (c.pagado) pagadoTotal += credito.valorCuota; });
        const totalAbonosCredito = (credito.abonos || []).reduce((sum, a) => sum + a.valor, 0);

        const saldoTotalCredito = cuotasActualizadas.reduce((sum, c) => {
          if (c.pagado) return sum;
          const abono = c.abonoAplicado || 0;
          const multas = calcularTotalMultasCuota(c) - (c.multasCubiertas || 0);
          return sum + (credito.valorCuota - abono) + multas;
        }, 0);


        const item = {
          tipo: tipoItem,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          clienteDocumento: cliente.documento,
          clienteTelefono: cliente.telefono,
          clienteDireccion: cliente.direccion,
          clienteBarrio: cliente.barrio,
          clienteCartera: cliente.cartera || 'K1',
          clientePosicion: cliente.posicion,
          creditoId: credito.id,
          creditoMonto: credito.monto,
          creditoTipo: credito.tipo,
          valorMostrar: valorMostrar,
          valorRealACobrar: totalACobrarHoy,
          saldoTotalCredito: saldoTotalCredito,
          estadoCredito: estadoCredito,
          cuotasVencidasCount,
          primerCuotaVencidaFecha,
          nroCuotasPendientes: cuotasActualizadas.filter(c => !c.pagado).map(c => c.nroCuota),
          reportado: cliente.reportado !== false
        };

        agregarItem(cliente.barrio, item);

        // Identificar si tiene cuota programada exactamente para hoy
        // 1. Clientes: Contar solo si está reportado (Sí)
        if (cliente.reportado !== false) {
          clientesUnicosHoy.add(cliente.id);
        }

        // 2. Dinero (Por Cobrar / Recogido): Siempre sumar de todos, sin restricciones
        stats.esperado += totalACobrarHoy + totalCobradoHoy + totalAbonadoHoy;
        stats.pendiente += totalACobrarHoy;
        stats.recogido += (totalCobradoHoy + totalAbonadoHoy);

      });
    });

    // Agregar clientes no encontrados para esta fecha al conteo total
    const clientesNoEncontradosHoy = clientesNoEncontradosPorFecha[fechaSeleccionadaStr] || new Set();
    const clientesNoEncontradosArray = Array.from(clientesNoEncontradosHoy);

    // Agregar cada cliente no encontrado al conjunto de clientes únicos
    clientesNoEncontradosArray.forEach(clienteId => {
      clientesUnicosHoy.add(clienteId);
    });

    stats.clientesTotal = clientesUnicosHoy.size;

    const barriosOrdenados = Object.keys(porBarrio).sort().reduce((obj, key) => {
      obj[key] = porBarrio[key];
      return obj;
    }, {});

    return { porBarrio: barriosOrdenados, stats };
  }, [clientes, fechaSeleccionadaStr, creditosInvalidos, prorrogasCuotas, clientesNoEncontradosPorFecha, hoy]);

  // Construir lista plana de cobros del día (sin agrupar por barrio)
  const listaCobrosDia = useMemo(() => {
    const items = [];
    Object.values(datosCobro.porBarrio).forEach(arr => {
      arr.forEach(item => items.push(item));
    });

    // Filtrar para que solo aparezcan los reportados, igual que en la vista principal de DiaDeCobro
    const itemsReportados = items.filter(item => item.reportado !== false);

    // Si estuviéramos hoy o mañana, DiaDeCobro muestra también una sección de no reportados, 
    // pero Rutas suele enfocarse en la ruta activa. 
    // Por el comentario del usuario "deberían ser 2", esto confirma que debemos filtrar igual.
    const itemsAMostrar = itemsReportados;

    const ordenFecha = ordenCobro[fechaSeleccionadaStr] || {};

    // Ordenar primero por número de orden asignado, luego por nombre de cliente
    itemsAMostrar.sort((a, b) => {
      const rawA = ordenFecha[a.clienteId];
      const rawB = ordenFecha[b.clienteId];

      const ordenA =
        rawA === '' || rawA == null ? Number.MAX_SAFE_INTEGER : Number(rawA);
      const ordenB =
        rawB === '' || rawB == null ? Number.MAX_SAFE_INTEGER : Number(rawB);

      if (ordenA !== ordenB) return ordenA - ordenB;
      return (a.clienteNombre || '').localeCompare(b.clienteNombre || '');
    });

    // Filtrar por término de búsqueda si existe
    if (searchTerm.trim()) {
      const termino = searchTerm.toLowerCase().trim();
      return items.filter(item => {
        // Buscar en ref. crédito (posición del cliente)
        const refCredito = item.clientePosicion ? `#${item.clientePosicion}` : '';
        if (refCredito.toLowerCase().includes(termino)) return true;

        // Buscar en nombre del cliente
        if (item.clienteNombre?.toLowerCase().includes(termino)) return true;

        // Buscar en CC (documento)
        if (item.clienteDocumento?.includes(termino)) return true;

        // Buscar en teléfono
        if (item.clienteTelefono?.includes(termino)) return true;

        // Buscar en barrio
        if (item.clienteBarrio?.toLowerCase().includes(termino)) return true;

        return false;
      });
    }

    return itemsAMostrar;
  }, [datosCobro, ordenCobro, fechaSeleccionadaStr, searchTerm]);

  // Obtener clientes que pagaron ese día, separados por cartera
  const clientesPagados = useMemo(() => {
    const pagadosK1 = [];
    const pagadosK2 = [];
    const pagadosK3 = [];

    // Mapa para rastrear items por cliente-credito-cuota para combinar pagos de cuota y multa
    const itemsMap = new Map();

    clientes.forEach(cliente => {
      if (!cliente.creditos || cliente.creditos.length === 0) return;
      if (!cliente.id) return;

      cliente.creditos.forEach(credito => {
        if (!credito || !credito.id || !credito.cuotas || !Array.isArray(credito.cuotas)) return;
        if (credito.renovado) return;

        // 1. Procesar pagos de cuotas
        credito.cuotas.forEach(cuota => {
          // Normalizar fecha de pago para comparación
          let fechaPagoNormalizada = null;
          if (cuota.fechaPago) {
            try {
              let fechaObj = null;

              if (typeof cuota.fechaPago === 'string') {
                if (cuota.fechaPago.includes('T')) {
                  fechaPagoNormalizada = cuota.fechaPago.split('T')[0];
                } else if (cuota.fechaPago.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  fechaPagoNormalizada = cuota.fechaPago;
                } else {
                  fechaObj = new Date(cuota.fechaPago);
                  if (!isNaN(fechaObj.getTime())) {
                    const year = fechaObj.getFullYear();
                    const month = String(fechaObj.getMonth() + 1).padStart(2, '0');
                    const day = String(fechaObj.getDate()).padStart(2, '0');
                    fechaPagoNormalizada = `${year}-${month}-${day}`;
                  }
                }
              } else if (cuota.fechaPago instanceof Date) {
                const year = cuota.fechaPago.getFullYear();
                const month = String(cuota.fechaPago.getMonth() + 1).padStart(2, '0');
                const day = String(cuota.fechaPago.getDate()).padStart(2, '0');
                fechaPagoNormalizada = `${year}-${month}-${day}`;
              } else if (typeof cuota.fechaPago === 'object') {
                fechaObj = new Date(cuota.fechaPago);
                if (!isNaN(fechaObj.getTime())) {
                  const year = fechaObj.getFullYear();
                  const month = String(fechaObj.getMonth() + 1).padStart(2, '0');
                  const day = String(fechaObj.getDate()).padStart(2, '0');
                  fechaPagoNormalizada = `${year}-${month}-${day}`;
                }
              }
            } catch (error) {
              console.error('Error normalizando fecha de pago:', error, cuota.fechaPago);
            }
          }

          // Buscar abonos en la fecha seleccionada (independientemente de si la cuota está pagada o no)
          const abonosHoy = (cuota.abonosCuota || []).filter(a => {
            const fechaAbono = typeof a.fecha === 'string'
              ? a.fecha.split('T')[0]
              : format(new Date(a.fecha), 'yyyy-MM-dd');
            return fechaAbono === fechaSeleccionadaStr;
          });

          const montoAbonadoHoy = abonosHoy.reduce((sum, a) => sum + (a.valor || 0), 0);

          // Si hay abonos en la fecha seleccionada, mostrarlos
          if (montoAbonadoHoy > 0) {
            // Calcular el saldo pendiente antes del abono de hoy
            // Para esto, necesitamos sumar todos los abonos anteriores a la fecha seleccionada
            const abonosAnteriores = (cuota.abonosCuota || []).filter(a => {
              const fechaAbono = typeof a.fecha === 'string'
                ? a.fecha.split('T')[0]
                : format(new Date(a.fecha), 'yyyy-MM-dd');
              return fechaAbono < fechaSeleccionadaStr;
            });
            const montoAbonadoAnterior = abonosAnteriores.reduce((sum, a) => sum + (a.valor || 0), 0);
            const saldoPendienteAntes = credito.valorCuota - montoAbonadoAnterior;
            const saldoPendienteDespues = saldoPendienteAntes - montoAbonadoHoy;

            // Determinar tipo de pago: "completo" si el saldo pendiente después del abono es 0 o menos
            const tipoPago = saldoPendienteDespues <= 0 ? 'completo' : 'parcial';

            const key = `${cliente.id}-${credito.id}-${cuota.nroCuota}`;
            const item = {
              clienteId: cliente.id,
              clienteNombre: cliente.nombre,
              clienteDocumento: cliente.documento,
              clienteTelefono: cliente.telefono,
              clienteBarrio: cliente.barrio,
              clienteCartera: cliente.cartera || 'K1',
              clientePosicion: cliente.posicion,
              creditoId: credito.id,
              creditoMonto: credito.monto,
              creditoTipo: credito.tipo,
              valorCuota: credito.valorCuota,
              nroCuota: cuota.nroCuota,
              montoPagado: montoAbonadoHoy,
              tipoPago: tipoPago,
              montoPagadoMulta: 0,
              tieneMulta: false
            };
            itemsMap.set(key, item);
            return; // No procesar más para esta cuota en esta fecha
          }

          // Si no hay abonos en la fecha seleccionada pero la cuota está pagada en esta fecha
          // (pago completo directo, sin abonos)
          if (cuota.pagado && fechaPagoNormalizada === fechaSeleccionadaStr && montoAbonadoHoy === 0) {
            const key = `${cliente.id}-${credito.id}-${cuota.nroCuota}`;
            const item = {
              clienteId: cliente.id,
              clienteNombre: cliente.nombre,
              clienteDocumento: cliente.documento,
              clienteTelefono: cliente.telefono,
              clienteBarrio: cliente.barrio,
              clienteCartera: cliente.cartera || 'K1',
              clientePosicion: cliente.posicion,
              creditoId: credito.id,
              creditoMonto: credito.monto,
              creditoTipo: credito.tipo,
              valorCuota: credito.valorCuota,
              nroCuota: cuota.nroCuota,
              montoPagado: credito.valorCuota,
              tipoPago: 'completo',
              montoPagadoMulta: 0,
              tieneMulta: false
            };
            itemsMap.set(key, item);
            return;
          }
        });

        // 2. Procesar pagos de multas
        if (credito.abonosMulta && credito.abonosMulta.length > 0) {
          const abonosMultaHoy = credito.abonosMulta.filter(abonoMulta => {
            // Normalizar fecha de abono de multa para comparación (similar a cuotas)
            let fechaAbonoNormalizada = null;
            if (abonoMulta.fecha) {
              try {
                let fechaObj = null;

                if (typeof abonoMulta.fecha === 'string') {
                  if (abonoMulta.fecha.includes('T')) {
                    fechaAbonoNormalizada = abonoMulta.fecha.split('T')[0];
                  } else if (abonoMulta.fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    fechaAbonoNormalizada = abonoMulta.fecha;
                  } else {
                    fechaObj = new Date(abonoMulta.fecha);
                    if (!isNaN(fechaObj.getTime())) {
                      // Usar UTC para evitar problemas de zona horaria
                      const year = fechaObj.getUTCFullYear();
                      const month = String(fechaObj.getUTCMonth() + 1).padStart(2, '0');
                      const day = String(fechaObj.getUTCDate()).padStart(2, '0');
                      fechaAbonoNormalizada = `${year}-${month}-${day}`;
                    }
                  }
                } else if (abonoMulta.fecha instanceof Date) {
                  // Usar UTC para evitar problemas de zona horaria
                  const year = abonoMulta.fecha.getUTCFullYear();
                  const month = String(abonoMulta.fecha.getUTCMonth() + 1).padStart(2, '0');
                  const day = String(abonoMulta.fecha.getUTCDate()).padStart(2, '0');
                  fechaAbonoNormalizada = `${year}-${month}-${day}`;
                } else if (typeof abonoMulta.fecha === 'object') {
                  fechaObj = new Date(abonoMulta.fecha);
                  if (!isNaN(fechaObj.getTime())) {
                    // Usar UTC para evitar problemas de zona horaria
                    const year = fechaObj.getUTCFullYear();
                    const month = String(fechaObj.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(fechaObj.getUTCDate()).padStart(2, '0');
                    fechaAbonoNormalizada = `${year}-${month}-${day}`;
                  }
                }
              } catch (error) {
                console.error('Error normalizando fecha de abono de multa:', error, abonoMulta.fecha);
              }
            }
            return fechaAbonoNormalizada === fechaSeleccionadaStr;
          });

          if (abonosMultaHoy.length > 0) {
            // Agrupar abonos de multa por multaId para calcular el total pagado por multa
            const multasPagadas = new Map();

            abonosMultaHoy.forEach(abonoMulta => {
              // Buscar la multa, intentando diferentes formas de comparación de ID
              const multa = credito.multas?.find(m =>
                m.id === abonoMulta.multaId ||
                m.id?.toString() === abonoMulta.multaId?.toString() ||
                String(m.id) === String(abonoMulta.multaId)
              );

              if (!multa) {
                // Si no se encuentra la multa, crear un item con información básica del abono
                const key = `${cliente.id}-${credito.id}-multa-${abonoMulta.multaId || 'sin-id'}`;
                // Verificar si ya existe un item para esta multa
                if (!itemsMap.has(key)) {
                  const item = {
                    clienteId: cliente.id,
                    clienteNombre: cliente.nombre,
                    clienteDocumento: cliente.documento,
                    clienteTelefono: cliente.telefono,
                    clienteBarrio: cliente.barrio,
                    clienteCartera: cliente.cartera || 'K1',
                    clientePosicion: cliente.posicion,
                    creditoId: credito.id,
                    creditoMonto: credito.monto,
                    creditoTipo: credito.tipo,
                    valorCuota: credito.valorCuota,
                    nroCuota: null,
                    montoPagado: 0,
                    tipoPago: null,
                    montoPagadoMulta: abonoMulta.valor || 0,
                    tieneMulta: true,
                    multaMotivo: abonoMulta.descripcion || 'Multa (detalle no disponible)'
                  };
                  itemsMap.set(key, item);
                } else {
                  // Si ya existe, sumar el monto
                  const itemExistente = itemsMap.get(key);
                  itemExistente.montoPagadoMulta += abonoMulta.valor || 0;
                }
                return;
              }

              if (!multasPagadas.has(abonoMulta.multaId)) {
                multasPagadas.set(abonoMulta.multaId, {
                  multaId: abonoMulta.multaId,
                  multaMotivo: multa.motivo,
                  multaValor: multa.valor,
                  montoPagado: 0
                });
              }
              const multaInfo = multasPagadas.get(abonoMulta.multaId);
              multaInfo.montoPagado += abonoMulta.valor || 0;
            });

            // Para cada multa pagada, buscar si hay un item de cuota del mismo día o crear uno nuevo
            multasPagadas.forEach((multaInfo, multaId) => {
              // Buscar si hay un item de cuota para este crédito en el mismo día
              let itemExistente = null;
              let keyExistente = null;

              // Buscar el primer item de este crédito que tenga cuota
              for (const [key, item] of itemsMap.entries()) {
                if (item.creditoId === credito.id && item.nroCuota) {
                  itemExistente = item;
                  keyExistente = key;
                  break;
                }
              }

              if (itemExistente) {
                // Combinar con el item existente de cuota
                itemExistente.montoPagadoMulta += multaInfo.montoPagado;
                itemExistente.tieneMulta = true;
                if (!itemExistente.multaMotivo) {
                  itemExistente.multaMotivo = multaInfo.multaMotivo;
                }
              } else {
                // Crear un nuevo item solo para multa (sin cuota)
                const key = `${cliente.id}-${credito.id}-multa-${multaId}`;
                const item = {
                  clienteId: cliente.id,
                  clienteNombre: cliente.nombre,
                  clienteDocumento: cliente.documento,
                  clienteTelefono: cliente.telefono,
                  clienteBarrio: cliente.barrio,
                  clienteCartera: cliente.cartera || 'K1',
                  clientePosicion: cliente.posicion,
                  creditoId: credito.id,
                  creditoMonto: credito.monto,
                  creditoTipo: credito.tipo,
                  valorCuota: credito.valorCuota,
                  nroCuota: null, // Sin cuota, solo multa
                  montoPagado: 0, // No hay pago de cuota
                  tipoPago: null, // No aplica
                  montoPagadoMulta: multaInfo.montoPagado,
                  tieneMulta: true,
                  multaMotivo: multaInfo.multaMotivo
                };
                itemsMap.set(key, item);
              }
            });
          }
        }
      });
    });

    // Convertir el mapa a arrays separados por cartera
    itemsMap.forEach(item => {
      if (item.clienteCartera === 'K2') {
        pagadosK2.push(item);
      } else if (item.clienteCartera === 'K3') {
        pagadosK3.push(item);
      } else {
        pagadosK1.push(item);
      }
    });

    // Calcular totales (incluyendo multas)
    const totalK1 = pagadosK1.reduce((sum, item) => sum + item.montoPagado + (item.montoPagadoMulta || 0), 0);
    const totalK2 = pagadosK2.reduce((sum, item) => sum + item.montoPagado + (item.montoPagadoMulta || 0), 0);
    const totalK3 = pagadosK3.reduce((sum, item) => sum + item.montoPagado + (item.montoPagadoMulta || 0), 0);

    return {
      K1: { items: pagadosK1, total: totalK1 },
      K2: { items: pagadosK2, total: totalK2 },
      K3: { items: pagadosK3, total: totalK3 }
    };
  }, [clientes, fechaSeleccionadaStr]);

  // Funciones de navegación de fecha
  const irAyer = () => setFechaSeleccionada(subDays(fechaSeleccionada, 1));
  const irHoy = () => setFechaSeleccionada(startOfDay(new Date()));
  const irMañana = () => setFechaSeleccionada(addDays(fechaSeleccionada, 1));
  const cambiarFecha = (e) => {
    const nuevaFecha = parseISO(e.target.value);
    setFechaSeleccionada(startOfDay(nuevaFecha));
  };
  const esHoy = format(fechaSeleccionada, 'yyyy-MM-dd') === format(startOfDay(new Date()), 'yyyy-MM-dd');

  const [creditoSeleccionado, setCreditoSeleccionado] = useState(null);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  const aplicarProrrogaCuotasDelDia = async (clienteId, creditoId, nuevaFechaStr) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    const credito = (cliente.creditos || []).find(c => c.id === creditoId);
    if (!credito || !Array.isArray(credito.cuotas)) return;

    // Identificar cuotas afectadas
    const cuotasParaActualizar = [];
    const nuevasProrrogas = { ...prorrogasCuotas };

    credito.cuotas.forEach(cuota => {
      if (cuota.pagado) return;
      const fechaOriginalStr = typeof cuota.fechaProgramada === 'string'
        ? cuota.fechaProgramada.split('T')[0]
        : '';

      // Mover a la nueva fecha todas las cuotas pendientes cuya fecha original
      // sea hoy o anterior al día que estás viendo en Día de Cobro
      if (fechaOriginalStr && fechaOriginalStr <= fechaSeleccionadaStr) {
        const key = `${clienteId}-${creditoId}-${cuota.nroCuota}`;
        nuevasProrrogas[key] = nuevaFechaStr;

        cuotasParaActualizar.push({
          nroCuota: cuota.nroCuota,
          fechaProrroga: nuevaFechaStr
        });
      }
    });

    if (cuotasParaActualizar.length === 0) {
      toast.info('No hay cuotas pendientes para prorrogar en esta fecha');
      return;
    }

    try {
      // Guardar en Backend
      const response = await prorrogaService.guardar(clienteId, creditoId, cuotasParaActualizar);

      if (response.success) {
        // Actualizar estado local solo si hubo éxito
        setProrrogasCuotas(nuevasProrrogas);
        toast.success('Prórroga aplicada y guardada correctamente');
      } else {
        toast.error('Error al guardar la prórroga en el servidor');
      }
    } catch (error) {
      console.error('Error al guardar prórroga:', error);
      toast.error('Error de conexión al guardar la prórroga');
    }
  };

  const handleProrrogaDias = (clienteId, creditoId, dias) => {
    const nuevaFecha = format(addDays(parseISO(fechaSeleccionadaStr), dias), 'yyyy-MM-dd');
    setDatosProrrogaPendiente({ clienteId, creditoId, nuevaFecha });
    setModalProrrogaOpen(true);
  };

  const handleProrrogaFecha = (clienteId, creditoId, nuevaFechaStr) => {
    if (!nuevaFechaStr) return;

    const valor = nuevaFechaStr.trim();
    const regexFecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!regexFecha.test(valor)) {
      toast.error('Formato de fecha no válido. Usa YYYY-MM-DD');
      return;
    }

    setDatosProrrogaPendiente({ clienteId, creditoId, nuevaFecha: valor });
    setModalProrrogaOpen(true);
  };

  const handleConfirmarProrroga = async (motivo) => {
    if (!datosProrrogaPendiente) return;

    const { clienteId, creditoId, nuevaFecha } = datosProrrogaPendiente;

    // 1. Aplicar la prórroga (lógica original)
    await aplicarProrrogaCuotasDelDia(clienteId, creditoId, nuevaFecha);

    // 2. Agregar la nota
    if (agregarNota) {
      try {
        const textoNota = `Fecha de cobro pospuesta - ${motivo}`;
        await agregarNota(clienteId, creditoId, textoNota);
      } catch (error) {
        console.error('Error al guardar la nota de prórroga:', error);
        toast.warning('La prórroga se aplicó pero hubo un error al guardar la nota');
      }
    }

    // 3. Limpiar estado y cerrar modal
    setDatosProrrogaPendiente(null);
    setModalProrrogaOpen(false);
  };

  const abrirDetalle = async (clienteId, creditoId) => {
    const cliente = obtenerCliente(clienteId);
    const credito = obtenerCredito(clienteId, creditoId);
    if (cliente && credito) {
      // Verificar que el crédito existe en el backend antes de abrirlo
      try {
        const response = await api.get(`/creditos/${creditoId}`);
        if (response.success && response.data) {
          setClienteSeleccionado(cliente);
          setCreditoSeleccionado(credito);
        } else {
          // Si no existe, marcarlo como inválido
          const creditoKey = `${clienteId}-${creditoId}`;
          setCreditosInvalidos(prev => new Set([...prev, creditoKey]));
          toast.error('Este crédito ya no existe en el sistema');
        }
      } catch (error) {
        // Si hay un error (especialmente 404), marcar el crédito como inválido
        const errorMessage = error.message || '';
        if (errorMessage.includes('no encontrado') || errorMessage.includes('404') || errorMessage.includes('Crédito no encontrado')) {
          const creditoKey = `${clienteId}-${creditoId}`;
          setCreditosInvalidos(prev => new Set([...prev, creditoKey]));
          toast.error('Este crédito ya no existe en el sistema');
        }
      }
    }
  };

  // Tabla de Cobros del día en lista única con numeración
  const TablaCobrosLista = ({ items, onCambioOrden, ordenFecha, onProrrogaDias, onProrrogaFecha }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-white uppercase bg-slate-800">
          <tr>
            <th scope="col" className="px-2 py-3 w-16 text-center">#</th>
            <th scope="col" className="px-4 py-3 w-24 text-center">Orden</th>
            <th scope="col" className="px-4 py-3 w-20 text-center">Ref. Crédito</th>
            <th scope="col" className="px-4 py-3">Cliente</th>
            <th scope="col" className="px-4 py-3">Crédito</th>
            <th scope="col" className="px-4 py-3 text-green-400">Valor Cuota</th>
            <th scope="col" className="px-4 py-3">Saldo Pendiente (Cuota)</th>
            <th scope="col" className="px-4 py-3">Saldo Pendiente (Total)</th>
            <th scope="col" className="px-4 py-3">Vencido</th>
            <th scope="col" className="px-4 py-3">Modalidad</th>
            <th scope="col" className="px-4 py-3 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const numeroLista = index + 1;
            const rawOrden = ordenFecha[item.clienteId];
            const valorOrden =
              rawOrden === undefined || rawOrden === null ? '' : String(rawOrden);

            // Determinar clase de color según la cartera del cliente
            const carteraRowClass = item.clienteCartera === 'K2'
              ? 'bg-green-100 hover:bg-green-200 border-b'
              : item.clienteCartera === 'K3'
                ? 'bg-orange-100 hover:bg-orange-200 border-b'
                : 'bg-blue-100 hover:bg-blue-200 border-b';

            return (
              <tr key={`${item.clienteId}-${item.creditoId}-${index}`} className={carteraRowClass}>
                <td className="px-2 py-4 font-bold text-gray-900 text-center text-base">
                  {numeroLista}
                </td>
                <td className="px-4 py-4 text-center">
                  <input
                    type="text"
                    className="w-16 text-center border border-gray-300 rounded-md text-sm py-1 px-1"
                    value={valorOrden}
                    onChange={(e) => onCambioOrden(item.clienteId, e.target.value)}
                  />
                </td>
                <td className="px-4 py-4 font-bold text-gray-900 text-center text-lg">
                  {item.clientePosicion ? `#${item.clientePosicion}` : `#${item.creditoId}`}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-900 text-base">{item.clienteNombre}</span>
                    <span className="text-gray-500 text-xs">CC: {item.clienteDocumento || 'N/A'}</span>
                    <div className="flex items-center gap-1 text-gray-600 text-xs mt-1 font-medium">
                      <Phone className="h-3 w-3" />
                      <span className="bg-yellow-100 text-yellow-800 px-1 rounded">{item.clienteTelefono}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                      <MapPin className="h-3 w-3" />
                      {item.clienteBarrio || 'Sin barrio'}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 font-medium text-gray-900">
                  {formatearMoneda(item.creditoMonto)}
                </td>
                <td className="px-4 py-4 font-bold text-green-600 text-base">
                  {item.tipo === 'pendiente'
                    ? formatearMoneda(item.valorMostrar)
                    : item.tipo === 'cobrado'
                      ? <span className="text-green-600">Pagado ({formatearMoneda(item.valorMostrar)})</span>
                      : <span className="text-yellow-600">Abonado ({formatearMoneda(item.valorMostrar)})</span>
                  }
                </td>
                <td className="px-4 py-4 font-medium text-orange-600">
                  {item.tipo === 'cobrado' ? '-' : formatearMoneda(item.valorRealACobrar)}
                </td>
                <td className="px-4 py-4 font-medium text-gray-900">
                  {formatearMoneda(item.saldoTotalCredito)}
                </td>
                <td className="px-4 py-4">
                  {item.cuotasVencidasCount > 0 ? (
                    <div className="text-red-600 font-bold">
                      (SI) - <span className="text-xs">{formatearFechaCorta(item.primerCuotaVencidaFecha)}</span>
                      {item.cuotasVencidasCount > 1 && (
                        <div className="text-xs text-red-500 mt-0.5 font-normal">
                          ({item.cuotasVencidasCount} cuotas)
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-green-600 font-medium">Al día</span>
                  )}
                </td>
                <td className="px-4 py-4 capitalize">
                  {item.creditoTipo}
                </td>
                <td className="px-4 py-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => abrirDetalle(item.clienteId, item.creditoId)}
                      className="text-blue-600 hover:text-blue-800 font-medium hover:underline text-sm"
                    >
                      Ver Detalle
                    </button>
                    <div className="flex items-center gap-1 mt-1">
                      {/* Mostrar botón de prórroga solo si no es domiciliario O si siendo domiciliario tiene permitido verla */}
                      {(user?.role !== 'domiciliario' || user?.ocultarProrroga === false) && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById(`fecha-prorroga-${item.clienteId}-${item.creditoId}-${index}`);
                              if (input) {
                                if (input.showPicker) {
                                  input.showPicker();
                                } else {
                                  input.click();
                                }
                              }
                            }}
                            className="p-1 rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100"
                            title="Prorrogar fecha"
                          >
                            <Calendar className="h-4 w-4 text-slate-700" />
                          </button>
                          <input
                            id={`fecha-prorroga-${item.clienteId}-${item.creditoId}-${index}`}
                            type="date"
                            className="hidden"
                            onChange={(e) => onProrrogaFecha(item.clienteId, item.creditoId, e.target.value)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header y Totales */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl shadow-lg p-6 text-white">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-3 rounded-lg">
              <Calendar className="h-8 w-8 text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Rutas</h1>
              <p className="text-slate-300 text-sm">
                {format(fechaSeleccionada, "EEEE, d 'de' MMMM", { locale: es })}
              </p>
            </div>
          </div>

          {/* Navegación Fecha */}
          <div className="flex bg-slate-700/50 rounded-lg p-1">
            <button onClick={irAyer} className="p-2 hover:bg-white/10 rounded-md transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="relative">
              <input
                type="date"
                value={fechaSeleccionadaStr}
                onChange={cambiarFecha}
                className="bg-transparent text-center font-bold w-32 focus:outline-none cursor-pointer h-full"
              />
            </div>
            <button onClick={irMañana} className="p-2 hover:bg-white/10 rounded-md transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              onClick={irHoy}
              className={`ml-2 px-3 text-sm font-bold rounded-md transition-colors ${esHoy ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-slate-300'}`}
            >
              Hoy
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 md:gap-4 text-center">
          <div className="bg-white/10 rounded-lg p-2 md:p-3 min-w-0 overflow-hidden">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Por Cobrar</p>
            <p className="text-[10px] sm:text-xs md:text-xl lg:text-2xl font-bold text-orange-300 break-words leading-tight">{formatearMoneda(datosCobro.stats.pendiente)}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 md:p-3 min-w-0 overflow-hidden">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Recogido</p>
            <p className="text-[10px] sm:text-xs md:text-xl lg:text-2xl font-bold text-green-300 break-words leading-tight">
              {formatearMoneda(
                // Sumar todos los totales de la sección "Pagados" de todas las carteras
                (clientesPagados.K1?.total || 0) +
                (clientesPagados.K2?.total || 0) +
                (clientesPagados.K3?.total || 0)
              )}
            </p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 md:p-3 min-w-0">
            <p className="text-xs text-slate-400 uppercase font-bold mb-1">Clientes</p>
            <p className="text-sm md:text-xl lg:text-2xl font-bold text-blue-300">
              {(() => {
                // Contar clientes únicos en la lista de cobros del día (ya filtrada)
                const clientesUnicosPendientes = new Set();
                listaCobrosDia.forEach(item => clientesUnicosPendientes.add(item.clienteId));
                return clientesUnicosPendientes.size;
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* Visitas */}
      {visitasDelDia.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 text-purple-800">
            <Clock className="h-5 w-5" />
            <h2 className="font-bold text-lg">Visitas Programadas ({visitasDelDia.length})</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {visitasDelDia.map(visita => (
              <div key={visita.id} className="bg-white p-3 rounded-lg shadow-sm flex justify-between items-center border border-purple-100">
                <div>
                  <p className="font-bold text-gray-800">{visita.solicitante.nombre}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" />
                    {visita.solicitante.barrioCasa}
                  </div>
                </div>
                <button
                  onClick={() => handleCompletarVisita(visita.id)}
                  className="p-2 hover:bg-green-100 text-gray-400 hover:text-green-600 rounded-full transition-colors"
                >
                  <CheckCircle className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de búsqueda */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por ref. crédito, nombre, CC, teléfono o barrio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Lista única de clientes del día con numeración */}
      <div className="space-y-4">
        {listaCobrosDia.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No hay cobros para esta fecha</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
            <TablaCobrosLista
              items={listaCobrosDia}
              onCambioOrden={handleCambioOrdenCliente}
              ordenFecha={ordenCobro[fechaSeleccionadaStr] || {}}
              onProrrogaDias={handleProrrogaDias}
              onProrrogaFecha={handleProrrogaFecha}
            />
          </div>
        )}
      </div>

      {/* Sección Pagados - Siempre visible si hay pagos */}
      {((esAdminOCeo && (clientesPagados.K1.items.length > 0 || clientesPagados.K2.items.length > 0 || clientesPagados.K3.items.length > 0)) ||
        (!esDomiciliarioBuga && !esAdminOCeo && (clientesPagados.K1.items.length > 0 || clientesPagados.K2.items.length > 0)) ||
        (esDomiciliarioBuga && clientesPagados.K3.items.length > 0)) && (
          <div className="space-y-6 mt-8 pt-8 border-t-2 border-gray-300">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-900">Pagados</h2>
            </div>

            {/* Card K1 - Mostrar para administradores, CEO y domiciliarios de Tuluá */}
            {!esDomiciliarioBuga && clientesPagados.K1.items.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Cartera K1</h3>
                      <p className="text-blue-100 text-sm">{clientesPagados.K1.items.length} {clientesPagados.K1.items.length === 1 ? 'pago' : 'pagos'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-blue-100 text-sm">Total Recogido</p>
                    <p className="text-2xl font-bold">{formatearMoneda(clientesPagados.K1.total)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-white uppercase bg-slate-800">
                      <tr>
                        <th scope="col" className="px-4 py-3 w-20 text-center">Ref. Crédito</th>
                        <th scope="col" className="px-4 py-3">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-green-400">Monto Pagado</th>
                        <th scope="col" className="px-4 py-3 text-center">Cuota</th>
                        <th scope="col" className="px-4 py-3 text-center">Tipo de Pago</th>
                        <th scope="col" className="px-4 py-3 text-center">Multa</th>
                        <th scope="col" className="px-4 py-3 text-center">Monto Pagado Multa</th>
                        <th scope="col" className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {clientesPagados.K1.items.map((item, index) => (
                        <tr key={`${item.clienteId}-${item.creditoId}-${item.nroCuota || 'general'}-${index}`} className="bg-blue-50 hover:bg-blue-100">
                          <td className="px-4 py-4 font-bold text-gray-900 text-center text-lg">
                            {item.clientePosicion ? `#${item.clientePosicion}` : '-'}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-900 text-base">{item.clienteNombre}</span>
                              <span className="text-gray-500 text-xs">CC: {item.clienteDocumento || 'N/A'}</span>
                              <div className="flex items-center gap-1 text-gray-600 text-xs mt-1 font-medium">
                                <Phone className="h-3 w-3" />
                                <span className="bg-yellow-100 text-yellow-800 px-1 rounded">{item.clienteTelefono || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                                <MapPin className="h-3 w-3" />
                                {item.clienteBarrio || 'Sin barrio'}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-bold text-green-600 text-base">
                            {item.montoPagado > 0 ? formatearMoneda(item.montoPagado) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.nroCuota ? (
                              <span className="bg-blue-200 text-blue-800 px-2 py-1 rounded font-medium">
                                #{item.nroCuota}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.tipoPago ? (
                              <span className={`px-2 py-1 rounded font-medium ${item.tipoPago === 'completo'
                                ? 'bg-green-200 text-green-800'
                                : 'bg-yellow-200 text-yellow-800'
                                }`}>
                                {item.tipoPago === 'completo' ? 'Completo' : 'Parcial'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.tieneMulta ? (
                              <span className="bg-red-200 text-red-800 px-2 py-1 rounded font-medium text-xs">
                                {item.multaMotivo || 'Multa'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center font-bold">
                            {item.montoPagadoMulta > 0 ? (
                              <span className="text-orange-600">{formatearMoneda(item.montoPagadoMulta)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button
                              onClick={() => abrirDetalle(item.clienteId, item.creditoId)}
                              className="text-blue-600 hover:text-blue-800 font-medium hover:underline text-sm"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Card K2 - Mostrar para administradores, CEO y domiciliarios de Tuluá */}
            {!esDomiciliarioBuga && clientesPagados.K2.items.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div className="bg-green-600 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Cartera K2</h3>
                      <p className="text-green-100 text-sm">{clientesPagados.K2.items.length} {clientesPagados.K2.items.length === 1 ? 'pago' : 'pagos'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-100 text-sm">Total Recogido</p>
                    <p className="text-2xl font-bold">{formatearMoneda(clientesPagados.K2.total)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-white uppercase bg-slate-800">
                      <tr>
                        <th scope="col" className="px-4 py-3 w-20 text-center">Ref. Crédito</th>
                        <th scope="col" className="px-4 py-3">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-green-400">Monto Pagado</th>
                        <th scope="col" className="px-4 py-3 text-center">Cuota</th>
                        <th scope="col" className="px-4 py-3 text-center">Tipo de Pago</th>
                        <th scope="col" className="px-4 py-3 text-center">Multa</th>
                        <th scope="col" className="px-4 py-3 text-center">Monto Pagado Multa</th>
                        <th scope="col" className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {clientesPagados.K2.items.map((item, index) => (
                        <tr key={`${item.clienteId}-${item.creditoId}-${item.nroCuota || 'general'}-${index}`} className="bg-green-50 hover:bg-green-100">
                          <td className="px-4 py-4 font-bold text-gray-900 text-center text-lg">
                            {item.clientePosicion ? `#${item.clientePosicion}` : '-'}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-900 text-base">{item.clienteNombre}</span>
                              <span className="text-gray-500 text-xs">CC: {item.clienteDocumento || 'N/A'}</span>
                              <div className="flex items-center gap-1 text-gray-600 text-xs mt-1 font-medium">
                                <Phone className="h-3 w-3" />
                                <span className="bg-yellow-100 text-yellow-800 px-1 rounded">{item.clienteTelefono || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                                <MapPin className="h-3 w-3" />
                                {item.clienteBarrio || 'Sin barrio'}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-bold text-green-600 text-base">
                            {item.montoPagado > 0 ? formatearMoneda(item.montoPagado) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.nroCuota ? (
                              <span className="bg-green-200 text-green-800 px-2 py-1 rounded font-medium">
                                #{item.nroCuota}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.tipoPago ? (
                              <span className={`px-2 py-1 rounded font-medium ${item.tipoPago === 'completo'
                                ? 'bg-green-200 text-green-800'
                                : 'bg-yellow-200 text-yellow-800'
                                }`}>
                                {item.tipoPago === 'completo' ? 'Completo' : 'Parcial'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.tieneMulta ? (
                              <span className="bg-red-200 text-red-800 px-2 py-1 rounded font-medium text-xs">
                                {item.multaMotivo || 'Multa'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center font-bold">
                            {item.montoPagadoMulta > 0 ? (
                              <span className="text-orange-600">{formatearMoneda(item.montoPagadoMulta)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button
                              onClick={() => abrirDetalle(item.clienteId, item.creditoId)}
                              className="text-blue-600 hover:text-blue-800 font-medium hover:underline text-sm"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Card K3 - Mostrar para administradores, CEO y domiciliarios de Buga */}
            {(esDomiciliarioBuga || esAdminOCeo) && clientesPagados.K3.items.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <div className="bg-orange-600 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Cartera K3</h3>
                      <p className="text-orange-100 text-sm">{clientesPagados.K3.items.length} {clientesPagados.K3.items.length === 1 ? 'pago' : 'pagos'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-orange-100 text-sm">Total Recogido</p>
                    <p className="text-2xl font-bold">{formatearMoneda(clientesPagados.K3.total)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-white uppercase bg-slate-800">
                      <tr>
                        <th scope="col" className="px-4 py-3 w-20 text-center">Ref. Crédito</th>
                        <th scope="col" className="px-4 py-3">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-green-400">Monto Pagado</th>
                        <th scope="col" className="px-4 py-3 text-center">Cuota</th>
                        <th scope="col" className="px-4 py-3 text-center">Tipo de Pago</th>
                        <th scope="col" className="px-4 py-3 text-center">Multa</th>
                        <th scope="col" className="px-4 py-3 text-center">Monto Pagado Multa</th>
                        <th scope="col" className="px-4 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {clientesPagados.K3.items.map((item, index) => (
                        <tr key={`${item.clienteId}-${item.creditoId}-${item.nroCuota || 'general'}-${index}`} className="bg-orange-50 hover:bg-orange-100">
                          <td className="px-4 py-4 font-bold text-gray-900 text-center text-lg">
                            {item.clientePosicion ? `#${item.clientePosicion}` : '-'}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-900 text-base">{item.clienteNombre}</span>
                              <span className="text-gray-500 text-xs">CC: {item.clienteDocumento || 'N/A'}</span>
                              <div className="flex items-center gap-1 text-gray-600 text-xs mt-1 font-medium">
                                <Phone className="h-3 w-3" />
                                <span className="bg-yellow-100 text-yellow-800 px-1 rounded">{item.clienteTelefono || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-1 text-gray-400 text-xs mt-1">
                                <MapPin className="h-3 w-3" />
                                {item.clienteBarrio || 'Sin barrio'}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-bold text-green-600 text-base">
                            {item.montoPagado > 0 ? formatearMoneda(item.montoPagado) : <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.nroCuota ? (
                              <span className="bg-orange-200 text-orange-800 px-2 py-1 rounded font-medium">
                                #{item.nroCuota}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.tipoPago ? (
                              <span className={`px-2 py-1 rounded font-medium ${item.tipoPago === 'completo'
                                ? 'bg-green-200 text-green-800'
                                : 'bg-yellow-200 text-yellow-800'
                                }`}>
                                {item.tipoPago === 'completo' ? 'Completo' : 'Parcial'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {item.tieneMulta ? (
                              <span className="bg-red-200 text-red-800 px-2 py-1 rounded font-medium text-xs">
                                {item.multaMotivo || 'Multa'}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center font-bold">
                            {item.montoPagadoMulta > 0 ? (
                              <span className="text-orange-600">{formatearMoneda(item.montoPagadoMulta)}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button
                              onClick={() => abrirDetalle(item.clienteId, item.creditoId)}
                              className="text-orange-600 hover:text-orange-800 font-medium hover:underline text-sm"
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      {/* Modal Detalle */}
      {creditoSeleccionado && clienteSeleccionado && (
        <CreditoDetalle
          credito={creditoSeleccionado}
          clienteId={clienteSeleccionado.id}
          cliente={clienteSeleccionado}
          onClose={() => {
            setCreditoSeleccionado(null);
            setClienteSeleccionado(null);
          }}
        />
      )}

      {/* Modal para Motivo de Prórroga */}
      <MotivoProrrogaModal
        isOpen={modalProrrogaOpen}
        onClose={() => {
          setModalProrrogaOpen(false);
          setDatosProrrogaPendiente(null);
        }}
        onConfirm={handleConfirmarProrroga}
      />
    </div>
  );
};

export default Rutas;

