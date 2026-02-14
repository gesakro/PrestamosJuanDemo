import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Definición de permisos por rol
export const PERMISSIONS = {
  domiciliario: {
    verClientes: true,
    verCreditosActivos: true,
    verCreditosFinalizados: true,
    registrarPagos: true,
    agregarNotas: true,
    agregarMultas: true,
    crearClientes: false,
    editarClientes: false,
    eliminarClientes: false,
    crearCreditos: false,
    editarCreditos: false,
    eliminarCreditos: false,
    verEstadisticas: false,
    verConfiguracion: false,
    exportarDatos: false,
    importarDatos: false,
    limpiarDatos: false,
    verCaja: false,
    gestionarCaja: false
  },
  administrador: {
    verClientes: true,
    verCreditosActivos: true,
    verCreditosFinalizados: true,
    registrarPagos: true,
    agregarNotas: true,
    agregarMultas: true,
    crearClientes: true,
    editarClientes: true,
    eliminarClientes: true,
    crearCreditos: true,
    editarCreditos: true,
    eliminarCreditos: false,
    verEstadisticas: true,
    verConfiguracion: false,
    exportarDatos: true,
    importarDatos: false,
    limpiarDatos: false,
    verCaja: true,
    gestionarCaja: true
  },
  ceo: {
    verClientes: true,
    verCreditosActivos: true,
    verCreditosFinalizados: true,
    registrarPagos: true,
    agregarNotas: true,
    agregarMultas: true,
    crearClientes: true,
    editarClientes: true,
    eliminarClientes: true,
    crearCreditos: true,
    editarCreditos: true,
    eliminarCreditos: true,
    verEstadisticas: true,
    verConfiguracion: true,
    exportarDatos: true,
    importarDatos: true,
    limpiarDatos: true,
    verCaja: true,
    gestionarCaja: true
  },
  supervisor: {
    verClientes: true,
    verCreditosActivos: true,
    verCreditosFinalizados: true,
    registrarPagos: false,
    agregarNotas: true,
    agregarMultas: false,
    crearClientes: false,
    editarClientes: true,
    eliminarClientes: false,
    crearCreditos: false,
    editarCreditos: false,
    eliminarCreditos: false,
    verEstadisticas: false,
    verConfiguracion: false,
    exportarDatos: false,
    importarDatos: false,
    limpiarDatos: false,
    verCaja: false,
    gestionarCaja: false
  }
};

const personaSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'El nombre de usuario es requerido'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'El nombre de usuario debe tener al menos 3 caracteres']
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
    select: false // No incluir password por defecto en las consultas
  },
  nombre: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'El correo electrónico es requerido'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Por favor ingresa un correo electrónico válido']
  },
  role: {
    type: String,
    enum: ['domiciliario', 'supervisor', 'administrador', 'ceo'],
    required: [true, 'El rol es requerido'],
    default: 'domiciliario'
  },
  activo: {
    type: Boolean,
    default: true
  },
  ciudad: {
    type: String,
    enum: ['Tuluá', 'Guadalajara de Buga', 'Ciudad Demo 1', 'Ciudad Demo 2'],
    required: function () {
      return this.role === 'domiciliario' || this.role === 'supervisor';
    },
    trim: true
  },
  ultimoAcceso: {
    type: Date,
    default: null
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  },
  ocultarProrroga: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices
personaSchema.index({ role: 1 });
personaSchema.index({ activo: 1 });

// Hash de contraseña antes de guardar
personaSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Método para comparar contraseñas
personaSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Método para obtener permisos
personaSchema.methods.getPermissions = function () {
  return PERMISSIONS[this.role] || {};
};

// Método para verificar permiso
personaSchema.methods.hasPermission = function (permission) {
  const permissions = this.getPermissions();
  return permissions[permission] || false;
};

// Método para verificar jerarquía de roles
personaSchema.methods.canAccess = function (requiredRole) {
  const roleHierarchy = {
    domiciliario: 1,
    supervisor: 2,
    administrador: 3,
    ceo: 4
  };

  return roleHierarchy[this.role] >= roleHierarchy[requiredRole];
};

const Persona = mongoose.model('Persona', personaSchema);

export default Persona;

