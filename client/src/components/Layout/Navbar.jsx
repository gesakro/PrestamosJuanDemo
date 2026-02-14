import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Users, TrendingUp, BarChart3, Settings, LogOut, User,
  Calendar, ChevronDown, Wallet, Route, ClipboardList,
  UserPlus, Archive, History, Clock, Menu, X, ChevronRight,
  FileText, StickyNote, Search
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { BRANDING } from '../../config/branding';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState({});

  const dropdownRef = useRef(null);
  const profileRef = useRef(null);
  const mobileMenuRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsMobileMenuOpen(false);
    setIsProfileOpen(false);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close menus on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveDropdown(null);
    setIsProfileOpen(false);
  }, [location.pathname]);

  const navCategories = [
    {
      label: 'Clientes',
      icon: Users,
      items: [
        { path: '/', label: 'Ver clientes', icon: Users },
        { path: '/archivados', label: 'Archivados', icon: Archive },
        { path: '/rf', label: 'RF', icon: Clock },
      ]
    },
    {
      label: 'Buscar',
      icon: Search,
      items: [
        { path: '/buscar-documento', label: 'Buscar por Cédula', icon: Search },
      ]
    },
    {
      label: 'Cobro',
      icon: Calendar,
      items: [
        { path: '/dia-de-cobro', label: 'Día de Cobro', icon: Calendar },
        { path: '/rutas', label: 'Rutas', icon: Route },
        { path: '/visitas', label: 'Visitas', icon: ClipboardList },
      ]
    },
    {
      label: 'Supervisión',
      icon: ClipboardList,
      path: '/supervision',
    },
    {
      label: 'Saldo',
      icon: Wallet,
      items: [
        { path: '/caja', label: 'Caja', icon: Wallet },
        { path: '/papeleria', label: 'Papelería', icon: ClipboardList },
        { path: '/creditos-activos', label: 'Créditos Activos', icon: TrendingUp },
        { path: '/total-multas', label: 'Total Multas', icon: FileText },
      ]
    },
    {
      label: 'Notas',
      icon: StickyNote,
      path: '/notas',
    },
    {
      label: 'Ajustes',
      icon: Settings,
      items: [
        { path: '/usuarios', label: 'Gestión de usuarios', icon: UserPlus },
        { path: '/estadisticas', label: 'Estadísticas', icon: BarChart3 },
        { path: '/historial-borrados', label: 'Historial de borrados', icon: History },
        { path: '/configuracion', label: 'Configuración', icon: Settings }
      ]
    }
  ];

  const getFilteredCategories = () => {
    return navCategories.map(category => {
      if (category.path) {
        // Direct links
        if (category.path === '/supervision') {
          const canSee = user?.role === 'ceo' || user?.role === 'supervisor';
          if (!canSee) return null;
        }
        return category;
      }

      const filteredItems = category.items.filter(item => {
        if (user?.role === 'domiciliario') {
          if (['/caja', '/papeleria', '/archivados', '/usuarios', '/historial-borrados', '/rf'].includes(item.path)) {
            return false;
          }
        }
        if (user?.role === 'supervisor') {
          // Supervisors logic: usually only clients and supervision
          // We'll keep it simple for now based on previous logic but adapted
          if (category.label === 'Clientes') {
            if (item.path === '/') return true;
            return false;
          }
          return false;
        }

        if (item.path === '/estadisticas') return hasPermission('verEstadisticas');
        if (item.path === '/configuracion') return hasPermission('verConfiguracion');
        if (item.path === '/usuarios') return user?.role === 'ceo';
        if (item.path === '/historial-borrados') return user?.role === 'ceo' || user?.role === 'administrador';
        if (item.path === '/rf') return user?.role === 'ceo' || user?.role === 'administrador';

        return true;
      });

      if (filteredItems.length === 0) return null;
      return { ...category, items: filteredItems };
    }).filter(Boolean);
  };

  const filteredCategories = getFilteredCategories();

  const toggleMobileExpanded = (label) => {
    setMobileExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <nav className="bg-white shadow-md border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-slate-800 p-1.5 rounded-lg group-hover:bg-slate-700 transition-colors">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">
              {BRANDING.appName}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1" ref={dropdownRef}>
            {filteredCategories.map((category) => {
              const Icon = category.icon;
              if (category.path) {
                const isActive = location.pathname === category.path;
                return (
                  <Link
                    key={category.path}
                    to={category.path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{category.label}</span>
                  </Link>
                );
              }

              const isOpen = activeDropdown === category.label;
              const hasActiveChild = category.items.some(item => location.pathname === item.path);

              return (
                <div key={category.label} className="relative">
                  <button
                    onClick={() => setActiveDropdown(isOpen ? null : category.label)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${isOpen || hasActiveChild
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{category.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      {category.items.map((item) => {
                        const SubIcon = item.icon;
                        const isSubActive = location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${isSubActive
                              ? 'bg-slate-50 text-slate-900 border-l-4 border-slate-800'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                            <SubIcon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* User Profile & Mobile Toggle */}
          <div className="flex items-center gap-2">
            {/* Desktop Logout (Hidden on mobile) */}

            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors border border-transparent hover:border-gray-200"
              >
                <div className="h-8 w-8 bg-sky-100 flex items-center justify-center rounded-full text-sky-700">
                  <User className="h-5 w-5" />
                </div>
                <div className="hidden sm:block text-left mr-1">
                  <p className="text-xs font-bold text-slate-800 leading-none">{user?.nombre}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-medium">{user?.role}</p>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <Link
                    to="/perfil"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <User className="h-4 w-4" />
                    <span>Mi Perfil</span>
                  </Link>
                  <div className="h-px bg-gray-100 my-1 mx-2"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-16 bg-white z-40 overflow-y-auto animate-in slide-in-from-right duration-300">
          <div className="p-4 space-y-2">
            {filteredCategories.map((category) => {
              const Icon = category.icon;
              if (category.path) {
                const isActive = location.pathname === category.path;
                return (
                  <Link
                    key={category.path}
                    to={category.path}
                    className={`flex items-center gap-3 p-3 rounded-xl text-base font-semibold transition-all ${isActive
                      ? 'bg-slate-800 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{category.label}</span>
                  </Link>
                );
              }

              const isExpanded = mobileExpanded[category.label];
              const hasActiveChild = category.items.some(item => location.pathname === item.path);

              return (
                <div key={category.label} className="space-y-1">
                  <button
                    onClick={() => toggleMobileExpanded(category.label)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-base font-semibold transition-all ${isExpanded || hasActiveChild
                      ? 'bg-slate-50 text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      <span>{category.label}</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="pl-4 space-y-1 py-1">
                      {category.items.map((item) => {
                        const SubIcon = item.icon;
                        const isSubActive = location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-all ${isSubActive
                              ? 'bg-slate-100 text-slate-800 font-bold'
                              : 'text-slate-500 hover:bg-slate-50'
                              }`}
                          >
                            <SubIcon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-4 mt-4 border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-4 rounded-xl text-base font-bold text-red-600 hover:bg-red-50 transition-all"
              >
                <LogOut className="h-5 w-5" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
