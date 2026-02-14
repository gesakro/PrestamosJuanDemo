import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, AlertCircle, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BRANDING } from '../config/branding';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleQuickLogin = (username, password) => {
    setFormData({ username, password });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await login(formData.username, formData.password);

      if (result.success) {
        navigate('/');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative overflow-hidden">
        {/* Banner Demo */}
        {BRANDING.demoMode && (
          <div className="absolute top-0 left-0 w-full bg-amber-100 text-amber-800 text-xs font-bold text-center py-1">
            VERSIÓN DEMO
          </div>
        )}

        {/* Logo y título */}
        <div className="flex flex-col items-center mb-8 mt-4">
          <div className="w-20 h-20 mb-4 flex items-center justify-center bg-slate-100 rounded-2xl">
            <Building2 className="w-10 h-10 text-slate-700" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-slate-900 mb-1 tracking-tight">
              {BRANDING.appName}
            </h1>
            <p className="text-slate-500">
              {BRANDING.subtitle}
            </p>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Usuario */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-colors"
                placeholder="Ingresa tu usuario"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 transition-colors"
                placeholder="Ingresa tu contraseña"
                required
              />
            </div>
          </div>

          {/* Botón de login */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 shadow-lg hover:shadow-xl'
              }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Iniciando sesión...
              </span>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        {/* Demo Quick Login Buttons */}
        {BRANDING.demoMode && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400 uppercase font-bold tracking-wider mb-4">Acceso Rápido (Demo)</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'demo123')}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors text-xs font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center mb-1">
                  <User className="w-4 h-4" />
                </div>
                Admin (CEO)
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('asesor', 'demo123')}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors text-xs font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center mb-1">
                  <User className="w-4 h-4" />
                </div>
                Asesor
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('cobrador', 'demo123')}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors text-xs font-medium"
              >
                <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center mb-1">
                  <User className="w-4 h-4" />
                </div>
                Cobrador
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
