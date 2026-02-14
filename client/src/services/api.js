/**
 * Servicio de API para comunicación con el backend
 */

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? 'http://localhost:5000/api' : '/api');

/**
 * Obtener el token de autenticación desde localStorage
 */
const getToken = () => {
  return localStorage.getItem('auth_token');
};

/**
 * Realizar una petición HTTP
 */
const request = async (endpoint, options = {}) => {
  const token = getToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    },
    ...options
  };

  // Si hay body, convertirlo a JSON
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);

    let data;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Si no es JSON, intentar leer texto o usar un objeto por defecto
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { error: text || response.statusText };
      }
    }

    if (!response.ok) {
      // Si es error 401, limpiar token y redirigir
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        // No redirigir aquí, dejar que el componente maneje la redirección
      }
      throw new Error(data.error || data.message || `Error en la petición (${response.status})`);
    }

    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Métodos HTTP
 */
export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' })
};

/**
 * Servicio de autenticación
 */
export const authService = {
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    if (response.success && response.token) {
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('auth_user', JSON.stringify(response.data));
    }
    return response;
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  },

  getMe: async () => {
    return await api.get('/auth/me');
  },

  changePassword: async (currentPassword, newPassword) => {
    return await api.put('/auth/change-password', { currentPassword, newPassword });
  }
};

export default api;

/**
 * Servicio de prórrogas de cuotas
 */
export const prorrogaService = {
  // Obtener todas las prórrogas
  obtenerTodas: async () => {
    return await api.get('/prorrogas');
  },

  // Obtener prórrogas de un crédito
  obtenerPorCredito: async (clienteId, creditoId) => {
    return await api.get(`/prorrogas/creditos/${clienteId}/${creditoId}/prorrogas`);
  },

  // Guardar prórrogas para un crédito (bulk upsert)
  guardar: async (clienteId, creditoId, prorrogas) => {
    return await api.post(`/prorrogas/creditos/${clienteId}/${creditoId}/prorrogas`, { clienteId, creditoId, prorrogas });
  },

  // Eliminar una prórroga específica
  eliminar: async (clienteId, creditoId, nroCuota) => {
    return await api.delete(`/prorrogas/creditos/${clienteId}/${creditoId}/prorrogas/${nroCuota}`);
  }
};

/**
 * Servicio de órdenes de cobro
 */
export const ordenCobroService = {
  // Obtener órdenes para una fecha específica
  obtenerPorFecha: async (fecha) => {
    return await api.get(`/ordenes-cobro/${fecha}`);
  },

  // Guardar órdenes para una fecha (bulk upsert)
  guardar: async (fecha, ordenes) => {
    return await api.post('/ordenes-cobro', { fecha, ordenes });
  },

  // Eliminar una orden específica
  eliminar: async (fecha, clienteId) => {
    return await api.delete(`/ordenes-cobro/${fecha}/${clienteId}`);
  }
};

/**
 * Servicio de multas totales
 */
export const totalMultasService = {
  // Obtener todas las multas
  obtenerTodas: async (params) => {
    const query = new URLSearchParams(params).toString();
    return await api.get(`/total-multas${query ? `?${query}` : ''}`);
  },

  // Obtener una multa por ID
  obtenerPorId: async (id) => {
    return await api.get(`/total-multas/${id}`);
  },

  // Crear una nueva multa
  crear: async (multa) => {
    return await api.post('/total-multas', multa);
  },

  // Actualizar una multa
  actualizar: async (id, multa) => {
    return await api.put(`/total-multas/${id}`, multa);
  },

  // Eliminar una multa
  eliminar: async (id) => {
    return await api.delete(`/total-multas/${id}`);
  }
};
/**
 * Servicio de notas y tareas
 */
export const notaService = {
  // Obtener notas por fecha (incluye nota general)
  obtenerTodas: async (fecha) => {
    return await api.get(`/notas/${fecha}`);
  },

  // Guardar todas las secciones del día
  guardarNotaDiaria: async (datos) => {
    return await api.post('/notas/diaria', datos);
  },
};

/**
 * Servicio de visitas
 */
export const visitaService = {
  // Obtener todas las visitas
  obtenerTodas: async (params) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    return await api.get(`/visitas${query}`);
  },

  // Obtener una visita por ID
  obtenerPorId: async (id) => {
    return await api.get(`/visitas/${id}`);
  },

  // Crear una nueva visita
  crear: async (visita) => {
    return await api.post('/visitas', visita);
  },

  // Actualizar una visita
  actualizar: async (id, visita) => {
    return await api.put(`/visitas/${id}`, visita);
  },

  // Eliminar una visita
  eliminar: async (id) => {
    return await api.delete(`/visitas/${id}`);
  },

  // Completar una visita
  completar: async (id) => {
    return await api.put(`/visitas/${id}/completar`);
  }
};
