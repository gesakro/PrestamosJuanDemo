import React, { useEffect, useState } from 'react';
import Navbar from './Navbar';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { AlertTriangle } from 'lucide-react';
import DemoBanner from './DemoBanner';


const Layout = ({ children }) => {
  const { user } = useAuth();
  const [rfChecked, setRfChecked] = useState(false);

  useEffect(() => {
    const checkRFClients = async () => {
      // Verificar para roles que pueden ver RF (CEO y Administrador)
      if (user && (user.role === 'ceo' || user.role === 'administrador')) {
        try {
          if (rfChecked) return;

          const response = await api.get('/clientes?rf=RF&limit=1');
          if (response.success && response.data.length > 0) {
            toast.info(
              <div className="flex flex-col gap-1">
                <span className="font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Atención: Clientes RF
                </span>
                <span className="text-sm">Existen clientes marcados para refinanciación.</span>
              </div>,
              {
                position: "top-right",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                toastId: 'rf-warning-toast'
              }
            );
          }
        } catch (error) {
          console.error('Error verificando RF:', error);
        }
      }
    };

    if (user && !rfChecked) {
      checkRFClients();
      setRfChecked(true);
    }
  }, [user, rfChecked]);

  return (
    <div className="min-h-screen bg-gray-50">
      <DemoBanner />
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
