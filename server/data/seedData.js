/**
 * Datos de seed para modo demo
 * Todos los datos son ficticios y genéricos.
 * Las contraseñas se hashean al inicializar el store.
 */

// ============================================================
// USUARIOS DEMO (Personas)
// ============================================================
export const demoPersonas = [
    {
        _id: 'demo-persona-001',
        username: 'admin',
        password: 'demo123', // Se hasheará con bcrypt al cargar
        nombre: 'Carlos Administrador',
        email: 'admin@finandemo.com',
        role: 'ceo',
        activo: true,
        ciudad: null,
        ultimoAcceso: null,
        fechaCreacion: new Date('2024-01-15'),
        ocultarProrroga: false,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15')
    },
    {
        _id: 'demo-persona-002',
        username: 'asesor',
        password: 'demo123',
        nombre: 'Laura Asesora',
        email: 'asesor@finandemo.com',
        role: 'administrador',
        activo: true,
        ciudad: 'Ciudad Demo',
        ultimoAcceso: null,
        fechaCreacion: new Date('2024-02-01'),
        ocultarProrroga: true,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-01')
    },
    {
        _id: 'demo-persona-003',
        username: 'cobrador',
        password: 'demo123',
        nombre: 'Pedro Cobrador',
        email: 'cobrador@finandemo.com',
        role: 'domiciliario',
        activo: true,
        ciudad: 'Ciudad Demo',
        ultimoAcceso: null,
        fechaCreacion: new Date('2024-03-01'),
        ocultarProrroga: true,
        createdAt: new Date('2024-03-01'),
        updatedAt: new Date('2024-03-01')
    }
];

// ============================================================
// CLIENTES DEMO
// ============================================================

// Helper para generar IDs
const cId = (n) => `demo-cliente-${String(n).padStart(3, '0')}`;
const crId = (n) => `demo-credito-${String(n).padStart(3, '0')}`;

// Helper para generar cuotas
function generarCuotas(numCuotas, valorCuota, fechaInicio, tipo, cuotasPagadas = 0) {
    const cuotas = [];
    const inicio = new Date(fechaInicio);

    for (let i = 1; i <= numCuotas; i++) {
        const fecha = new Date(inicio);
        if (tipo === 'semanal') fecha.setDate(fecha.getDate() + (i * 7));
        else if (tipo === 'quincenal') fecha.setDate(fecha.getDate() + (i * 15));
        else if (tipo === 'mensual') fecha.setMonth(fecha.getMonth() + i);
        else if (tipo === 'diario') fecha.setDate(fecha.getDate() + i);

        const pagado = i <= cuotasPagadas;
        cuotas.push({
            nroCuota: i,
            fechaProgramada: fecha,
            pagado,
            fechaPago: pagado ? new Date(fecha.getTime() + 86400000) : null,
            abonosCuota: pagado ? [{
                id: `abono-cuota-${i}`,
                valor: valorCuota,
                fecha: new Date(fecha.getTime() + 86400000),
                fechaCreacion: new Date(fecha.getTime() + 86400000)
            }] : [],
            saldoPendiente: pagado ? 0 : valorCuota,
            tieneAbono: pagado
        });
    }
    return cuotas;
}

// Definir créditos demo
const creditosData = [
    {
        _id: crId(1), clienteIdx: 1, monto: 500000, tipo: 'semanal', numCuotas: 12,
        totalAPagar: 600000, valorCuota: 50000, cuotasPagadas: 4, papeleria: 10000
    },
    {
        _id: crId(2), clienteIdx: 2, monto: 1000000, tipo: 'quincenal', numCuotas: 8,
        totalAPagar: 1200000, valorCuota: 150000, cuotasPagadas: 2, papeleria: 20000,
        tipoQuincenal: '1-16'
    },
    {
        _id: crId(3), clienteIdx: 3, monto: 300000, tipo: 'semanal', numCuotas: 6,
        totalAPagar: 360000, valorCuota: 60000, cuotasPagadas: 6, papeleria: 5000
    },
    {
        _id: crId(4), clienteIdx: 4, monto: 2000000, tipo: 'mensual', numCuotas: 12,
        totalAPagar: 2640000, valorCuota: 220000, cuotasPagadas: 1, papeleria: 50000
    },
    {
        _id: crId(5), clienteIdx: 5, monto: 150000, tipo: 'diario', numCuotas: 20,
        totalAPagar: 180000, valorCuota: 9000, cuotasPagadas: 10, papeleria: 3000
    },
    {
        _id: crId(6), clienteIdx: 6, monto: 800000, tipo: 'semanal', numCuotas: 10,
        totalAPagar: 960000, valorCuota: 96000, cuotasPagadas: 0, papeleria: 15000
    },
    {
        _id: crId(7), clienteIdx: 7, monto: 450000, tipo: 'quincenal', numCuotas: 6,
        totalAPagar: 540000, valorCuota: 90000, cuotasPagadas: 3, papeleria: 8000,
        tipoQuincenal: '5-20'
    },
    {
        _id: crId(8), clienteIdx: 3, monto: 500000, tipo: 'semanal', numCuotas: 10,
        totalAPagar: 600000, valorCuota: 60000, cuotasPagadas: 2, papeleria: 10000,
        esRenovacion: true, creditoAnteriorId: crId(3)
    },
    {
        _id: crId(9), clienteIdx: 1, monto: 700000, tipo: 'quincenal', numCuotas: 8,
        totalAPagar: 840000, valorCuota: 105000, cuotasPagadas: 0, papeleria: 12000,
        tipoQuincenal: '1-16'
    },
    {
        _id: crId(10), clienteIdx: 8, monto: 250000, tipo: 'semanal', numCuotas: 8,
        totalAPagar: 300000, valorCuota: 37500, cuotasPagadas: 5, papeleria: 5000
    }
];

const fechaBase = new Date();
fechaBase.setMonth(fechaBase.getMonth() - 2);

function construirCredito(cd) {
    const fechaInicio = new Date(fechaBase);
    fechaInicio.setDate(fechaInicio.getDate() + (cd.clienteIdx * 3));
    const cuotas = generarCuotas(cd.numCuotas, cd.valorCuota, fechaInicio, cd.tipo, cd.cuotasPagadas);
    const montoEntregado = cd.monto - (cd.papeleria || 0);

    return {
        _id: cd._id,
        id: cd._id,
        cliente: cId(cd.clienteIdx),
        monto: cd.monto,
        papeleria: cd.papeleria || 0,
        montoEntregado,
        tipo: cd.tipo,
        tipoQuincenal: cd.tipoQuincenal || null,
        fechaInicio,
        totalAPagar: cd.totalAPagar,
        valorCuota: cd.valorCuota,
        numCuotas: cd.numCuotas,
        cuotas,
        abonos: cuotas.filter(c => c.pagado).map((c, idx) => ({
            id: `abono-${cd._id}-${idx + 1}`,
            valor: cd.valorCuota,
            descripcion: `Pago cuota ${c.nroCuota}`,
            fecha: c.fechaPago,
            nroCuota: c.nroCuota
        })),
        abonosMulta: [],
        multas: [],
        descuentos: [],
        notas: [],
        etiqueta: cd.cuotasPagadas >= cd.numCuotas ? 'finalizado' : null,
        fechaEtiqueta: null,
        renovado: cd._id === crId(3),
        fechaRenovacion: cd._id === crId(3) ? new Date() : null,
        creditoRenovacionId: cd._id === crId(3) ? crId(8) : null,
        esRenovacion: cd.esRenovacion || false,
        creditoAnteriorId: cd.creditoAnteriorId || null,
        fechaCreacion: fechaInicio,
        createdAt: fechaInicio,
        updatedAt: new Date()
    };
}

// Construir todos los créditos
export const demoCreditos = creditosData.map(construirCredito);

// Obtener etiqueta según estado de pago
function getEtiquetaCliente(clienteId) {
    const creditos = demoCreditos.filter(c => c.cliente === clienteId);
    if (creditos.length === 0) return 'sin-etiqueta';
    const activo = creditos.find(c => !c.renovado && c.cuotas.some(cu => !cu.pagado));
    if (!activo) return 'excelente';

    const cuotasPagadas = activo.cuotas.filter(c => c.pagado).length;
    const ratio = cuotasPagadas / activo.numCuotas;
    if (ratio > 0.5) return 'bueno';
    if (ratio > 0.2) return 'atrasado';
    return 'sin-etiqueta';
}

export const demoClientes = [
    {
        _id: cId(1), nombre: 'María García López', documento: '1001234567',
        telefono: '3001234567', direccion: 'Calle 10 #25-30, Centro',
        barrio: 'Centro', direccionTrabajo: 'Av. Principal #45-12',
        correo: 'maria.demo@ejemplo.com', cartera: 'K1', posicion: 1,
        tipoPago: 'semanal', tipoPagoEsperado: 'semanal'
    },
    {
        _id: cId(2), nombre: 'Juan Pérez Rodríguez', documento: '1009876543',
        telefono: '3109876543', direccion: 'Carrera 5 #18-22, Norte',
        barrio: 'Norte', direccionTrabajo: 'Centro Comercial Demo Local 15',
        correo: 'juan.demo@ejemplo.com', cartera: 'K1', posicion: 2,
        tipoPago: 'quincenal', tipoPagoEsperado: 'quincenal'
    },
    {
        _id: cId(3), nombre: 'Ana Martínez Sánchez', documento: '1005551234',
        telefono: '3205551234', direccion: 'Calle 30 #10-05, Sur',
        barrio: 'Sur', direccionTrabajo: 'Plaza Demo Local 8',
        correo: 'ana.demo@ejemplo.com', cartera: 'K1', posicion: 3,
        tipoPago: 'semanal', tipoPagoEsperado: 'semanal'
    },
    {
        _id: cId(4), nombre: 'Roberto Díaz Gómez', documento: '1007778899',
        telefono: '3157778899', direccion: 'Av. 15 #42-10, Occidente',
        barrio: 'Occidente', direccionTrabajo: 'Oficina Demo Piso 3',
        correo: 'roberto.demo@ejemplo.com', cartera: 'K2', posicion: 1,
        tipoPago: 'mensual', tipoPagoEsperado: 'mensual'
    },
    {
        _id: cId(5), nombre: 'Lucía Fernández Castro', documento: '1003334455',
        telefono: '3003334455', direccion: 'Carrera 22 #8-15, Oriente',
        barrio: 'Oriente', direccionTrabajo: 'Mercado Demo Puesto 42',
        correo: 'lucia.demo@ejemplo.com', cartera: 'K2', posicion: 2,
        tipoPago: 'diario', tipoPagoEsperado: 'diario'
    },
    {
        _id: cId(6), nombre: 'Carlos Rojas Herrera', documento: '1006667788',
        telefono: '3116667788', direccion: 'Calle 50 #15-20, Centro',
        barrio: 'Centro', direccionTrabajo: 'Tienda Demo #3',
        correo: 'carlos.demo@ejemplo.com', cartera: 'K1', posicion: 4,
        tipoPago: 'semanal', tipoPagoEsperado: 'semanal'
    },
    {
        _id: cId(7), nombre: 'Sandra López Vargas', documento: '1002223344',
        telefono: '3202223344', direccion: 'Av. 8 #30-45, Norte',
        barrio: 'Norte', direccionTrabajo: 'Consultorio Demo 201',
        correo: 'sandra.demo@ejemplo.com', cartera: 'K3', posicion: 1,
        tipoPago: 'quincenal', tipoPagoEsperado: 'quincenal'
    },
    {
        _id: cId(8), nombre: 'Diego Morales Ruiz', documento: '1008889900',
        telefono: '3158889900', direccion: 'Carrera 12 #55-30, Sur',
        barrio: 'Sur', direccionTrabajo: 'Taller Demo',
        correo: 'diego.demo@ejemplo.com', cartera: 'K3', posicion: 2,
        tipoPago: 'semanal', tipoPagoEsperado: 'semanal'
    }
].map(c => {
    // Enriquecer con campos como en el modelo Mongoose
    const creditosCliente = demoCreditos.filter(cr => cr.cliente === c._id);
    const creditosEmbebidos = creditosCliente.map(cr => ({
        ...cr,
        id: cr._id
    }));

    return {
        ...c,
        fiador: null,
        coordenadasResidencia: null,
        coordenadasTrabajo: null,
        coordenadasResidenciaActualizada: null,
        coordenadasTrabajoActualizada: null,
        creditos: creditosEmbebidos,
        esArchivado: false,
        reportado: true,
        etiqueta: getEtiquetaCliente(c._id),
        rf: '',
        fechaRF: null,
        fechaCreacion: new Date('2024-01-20'),
        enSupervision: false,
        createdAt: new Date('2024-01-20'),
        updatedAt: new Date()
    };
});

// ============================================================
// OTRAS COLECCIONES (inicialmente vacías o con datos mínimos)
// ============================================================
export const demoAlertas = [
    {
        _id: 'demo-alerta-001',
        titulo: 'Recordatorio de cobro',
        mensaje: 'Cobro semanal programado para hoy',
        tipo: 'info',
        activa: true,
        notificada: false,
        fechaCreacion: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
    }
];

export const demoMovimientosCaja = [
    {
        _id: 'demo-mov-001',
        tipo: 'ingreso',
        monto: 500000,
        descripcion: 'Cobro de cuotas del día',
        categoria: 'cobros',
        fecha: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        _id: 'demo-mov-002',
        tipo: 'egreso',
        monto: 300000,
        descripcion: 'Desembolso de crédito nuevo',
        categoria: 'desembolsos',
        fecha: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
    }
];

export const demoVisitas = [];
export const demoProrrogas = [];
export const demoOrdenesCobro = [];
export const demoHistorialBorrados = [];
export const demoTotalMultas = [];
export const demoNotas = [];
export const demoPapeleria = [];
