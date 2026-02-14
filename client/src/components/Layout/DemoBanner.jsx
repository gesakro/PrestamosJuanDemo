import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { BRANDING } from '../../config/branding';

const DemoBanner = () => {
    if (!BRANDING.demoMode) return null;

    const handleReset = async () => {
        if (confirm('¿Estás seguro de que deseas reiniciar los datos de demostración? Se perderán todos los cambios realizados durante la sesión.')) {
            try {
                const response = await fetch('http://localhost:5000/api/demo/reset', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json();
                if (data.success) {
                    alert('Datos reiniciados correctamente. La página se recargará.');
                    window.location.reload();
                } else {
                    alert('Error al reiniciar datos');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error de conexión al intentar reiniciar datos');
            }
        }
    };

    return (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p>
                        <strong>Modo Demostración:</strong> Los datos mostrados son ficticios y pueden reiniciarse en cualquier momento.
                    </p>
                </div>
                <button
                    onClick={handleReset}
                    className="flex items-center gap-1 bg-amber-200 hover:bg-amber-300 text-amber-800 px-3 py-1 rounded-md text-xs font-bold transition-colors"
                >
                    <RefreshCcw className="h-3 w-3" />
                    Reiniciar Datos
                </button>
            </div>
        </div>
    );
};

export default DemoBanner;
