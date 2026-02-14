import React from 'react';
import { X, Download, CreditCard } from 'lucide-react';
import { BRANDING } from '../../config/branding';

const CreditoDetalleHeader = ({ onClose, onPrint }) => {
  return (
    <div className="bg-white px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 rounded-t-xl border-b-2 border-blue-500 print:hidden">
      {/* Logo y Nombre - Ocupa toda la fila en móvil, centrado en desktop */}
      <div className="flex-1 flex justify-center md:justify-start w-full md:w-auto">
        <div className="flex items-center space-x-2 md:space-x-4">
          <div className="bg-blue-100 p-2 rounded-full">
            <CreditCard className="w-8 h-8 md:w-10 md:h-10 text-blue-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 uppercase tracking-wide">
            {BRANDING.appName}
          </h1>
        </div>
      </div>
      {/* Botones - Nueva fila en móvil, alineados a la derecha */}
      <div className="flex items-center gap-2 self-end md:self-auto">
        <button
          onClick={onPrint}
          className="px-3 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center text-sm md:text-base"
          title="Imprimir / Guardar como PDF"
        >
          <Download className="h-4 w-4 mr-1" />
          PDF
        </button>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5 md:h-6 md:w-6" />
        </button>
      </div>
    </div>
  );
};

export default CreditoDetalleHeader;

