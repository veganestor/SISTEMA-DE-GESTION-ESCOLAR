
import React, { useState, useRef } from 'react';
import { Student, CourseYear, SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';
import { 
  calculateAge, 
  importStudentsFromExcel, 
  exportStudentsToExcel, 
  exportAllStudentsToExcel, 
  generateStudentPDFReport,
  exportStudentsListPDF 
} from '../services/utils';
import { Upload, Download, Plus, Search, ChevronDown, User, Filter, FileDown, Trash2, FileSpreadsheet, Check } from 'lucide-react';
import { StudentDetail } from './StudentDetail';

interface StudentManagerProps {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  initialCourse?: CourseYear;
  initialStudentId?: string;
  onClearInitialStudentId?: () => void;
  schoolInfo?: SchoolInfo;
}

export const StudentManager: React.FC<StudentManagerProps> = ({ 
  students, 
  setStudents, 
  initialCourse = '1',
  initialStudentId,
  onClearInitialStudentId,
  schoolInfo = DEFAULT_SCHOOL_INFO,
}) => {
  const [selectedCourse, setSelectedCourse] = useState<CourseYear>(initialCourse);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialCourse) {
      setSelectedCourse(initialCourse);
    }
  }, [initialCourse]);

  React.useEffect(() => {
    if (initialStudentId) {
      const found = students.find((s) => s.id === initialStudentId);
      if (found) {
        setSelectedCourse(found.course);
        setSelectedStudent(found);
      }
    }
  }, [initialStudentId, students]);

  const handleDeleteStudent = (studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    if (selectedStudent?.id === studentId) {
      setSelectedStudent(null);
    }
    setStudentToDelete(null);
  };
  
  // Filtros independientes
  const [nameFilter, setNameFilter] = useState('');
  const [dniFilter, setDniFilter] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStudents = students.filter(
    (s) => {
        const matchesCourse = s.course === selectedCourse;
        const matchesName = String(s.fullName || '').toLowerCase().includes(nameFilter.toLowerCase());
        const matchesDni = String(s.dni || '').includes(dniFilter);
        return matchesCourse && matchesName && matchesDni;
    }
  );

  const showPdfSuccessToast = (msg: string) => {
    setPdfSuccessMessage(msg);
    setTimeout(() => setPdfSuccessMessage(null), 3500);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const newStudents = await importStudentsFromExcel(e.target.files[0], selectedCourse);
        setStudents((prev) => [...prev, ...newStudents]);
        alert(`${newStudents.length} alumnos importados correctamente.`);
      } catch (error) {
        console.error(error);
        alert('Error al importar el archivo. Verifique el formato de las columnas.');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = () => {
    const toExport = students.filter((s) => s.course === selectedCourse);
    exportStudentsToExcel(toExport, `Alumnos_Curso_${selectedCourse}`);
  };

  const handleExportAll = () => {
    exportAllStudentsToExcel(students, schoolInfo);
  };

  const handleExportPDFCourse = () => {
    const filterDesc = nameFilter || dniFilter 
      ? `Filtrado por ${[nameFilter && `nombre: "${nameFilter}"`, dniFilter && `DNI: "${dniFilter}"`].filter(Boolean).join(', ')}` 
      : undefined;
    exportStudentsListPDF(filteredStudents, selectedCourse, schoolInfo, filterDesc);
    showPdfSuccessToast(`Planilla PDF de ${selectedCourse}° Año generada exitosamente.`);
  };

  const handleExportPDFAll = () => {
    exportStudentsListPDF(students, 'all', schoolInfo);
    showPdfSuccessToast(`Nómina General de Alumnos generada en PDF exitosamente.`);
  };

  const handleAddStudent = () => {
    const newStudent: Student = {
      id: Math.random().toString(36).substr(2, 9),
      fullName: 'Nuevo Alumno',
      birthDate: new Date().toISOString().split('T')[0],
      dni: '',
      address: '',
      course: selectedCourse,
      grades: {},
      attendance: [],
      medical: { treatments: '', medications: '', notes: '' },
      disciplinary: []
    };
    setStudents([...students, newStudent]);
    setSelectedStudent(newStudent);
  };

  const updateStudent = (updated: Student) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedStudent(updated);
  };

  if (selectedStudent) {
    return (
      <StudentDetail 
        student={selectedStudent} 
        onBack={() => {
          setSelectedStudent(null);
          onClearInitialStudentId?.();
        }} 
        onUpdate={updateStudent}
        onDelete={handleDeleteStudent}
        schoolInfo={schoolInfo}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast de confirmación de descarga de PDF */}
      {pdfSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check size={18} />
          </div>
          <p className="text-xs font-semibold">{pdfSuccessMessage}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-blue-900">Listado de Alumnos</h2>
          <p className="text-gray-500 font-medium text-xs sm:text-sm">Seleccione el curso y utilice los filtros para buscar alumnos o exportar listas oficiales.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".xlsx" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-sm transition-all text-xs font-bold active:scale-95"
            title="Importar alumnos desde archivo Excel"
          >
            <Upload size={16} /> Importar Excel
          </button>

          {/* Botones de Exportación a PDF con Formato Institucional */}
          <button 
            onClick={handleExportPDFCourse}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-all active:scale-95 text-xs font-bold"
            title={`Exportar planilla oficial en PDF para ${selectedCourse}° Año`}
          >
            <FileDown size={16} />
            <span>Lista PDF ({selectedCourse}°)</span>
          </button>

          <button 
            onClick={handleExportPDFAll}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-800 hover:bg-rose-900 text-white rounded-xl shadow-md transition-all active:scale-95 text-xs font-bold"
            title="Exportar nómina institucional de todos los cursos en PDF"
          >
            <FileDown size={16} />
            <span className="hidden sm:inline">Nómina General</span> (PDF)
          </button>

          {/* Botones de Exportación a Excel */}
          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm transition-all text-xs font-bold active:scale-95"
            title={`Exportar alumnos de ${selectedCourse}° Año en Excel`}
          >
            <Download size={16} /> Excel ({selectedCourse}°)
          </button>
          <button 
            onClick={handleExportAll}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-md transition-all active:scale-95 text-xs"
            title="Exportar el listado completo de todos los estudiantes (1° a 6° año) con datos básicos y curso"
          >
            <FileSpreadsheet size={16} /> <span className="hidden sm:inline">Todos</span> (.xlsx)
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-64">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Año/Curso</label>
            <div className="relative">
                <select 
                    value={selectedCourse} 
                    onChange={(e) => setSelectedCourse(e.target.value as CourseYear)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-900"
                >
                    {['1', '2', '3', '4', '5', '6'].map(year => <option key={year} value={year}>{year}° Año</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-900 pointer-events-none" size={20} />
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar por Apellido y Nombre..." 
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                />
            </div>
            <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar por DNI..." 
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={dniFilter}
                    onChange={(e) => setDniFilter(e.target.value)}
                />
            </div>
          </div>

          <button 
            onClick={handleAddStudent}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 text-white rounded-xl hover:bg-blue-800 font-bold shadow-lg transition-all"
          >
            <Plus size={18} /> AGREGAR ALUMNO
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        {/* Vista en Tarjetas para Teléfonos Móviles y Pantallas Pequeñas */}
        <div className="block md:hidden divide-y divide-gray-100">
          {filteredStudents.length > 0 ? (
            filteredStudents.map((student) => (
              <div 
                key={student.id}
                onClick={() => setSelectedStudent(student)}
                className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {student.photo ? (
                      <img 
                        src={student.photo} 
                        alt={student.fullName} 
                        className="w-12 h-12 rounded-full object-cover border-2 border-blue-400 shadow-sm shrink-0" 
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-900 font-black text-base flex items-center justify-center shrink-0">
                        {student.fullName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-black text-gray-900 text-base leading-tight">{student.fullName}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        DNI: <strong className="text-gray-700">{student.dni || 'Sin DNI'}</strong> • {calculateAge(student.birthDate)} años
                      </p>
                    </div>
                  </div>
                  <span className="bg-blue-100 text-blue-900 font-black text-[10px] px-2.5 py-1 rounded-full shrink-0">
                    {student.course}° Año
                  </span>
                </div>

                {student.address && (
                  <p className="text-xs text-gray-500 italic pl-1 truncate">
                    📍 {student.address}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-2">
                  <span className="text-xs font-bold text-blue-700">
                    Toque para ver legajo &rarr;
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        generateStudentPDFReport(student, schoolInfo);
                      }}
                      className="p-2 bg-rose-50 text-rose-700 rounded-xl hover:bg-rose-100 transition-colors"
                      title="Descargar Reporte PDF"
                    >
                      <FileDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStudentToDelete(student);
                      }}
                      className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                      title="Eliminar Alumno"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-10 text-center text-gray-400 font-medium italic">
              No se encontraron alumnos con los criterios seleccionados.
            </div>
          )}
        </div>

        {/* Vista en Tabla Clásica para Computadoras y Tablets */}
        <table className="w-full text-left hidden md:table">
          <thead className="bg-blue-900 text-white text-xs uppercase tracking-widest">
            <tr>
              <th className="p-4 font-black">Apellido y Nombre</th>
              <th className="p-4 font-black">DNI</th>
              <th className="p-4 font-black">Edad Actual</th>
              <th className="p-4 font-black">Domicilio</th>
              <th className="p-4 font-black text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => (
                <tr 
                  key={student.id} 
                  onClick={() => setSelectedStudent(student)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors group"
                >
                  <td className="p-4 flex items-center gap-3">
                    {student.photo ? (
                      <img 
                        src={student.photo} 
                        alt={student.fullName} 
                        className="w-10 h-10 rounded-full object-cover border border-blue-300 shadow-sm shrink-0" 
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                        {student.fullName.charAt(0)}
                      </div>
                    )}
                    <span className="font-bold text-gray-800">{student.fullName}</span>
                  </td>
                  <td className="p-4 text-gray-700 font-medium">{student.dni}</td>
                  <td className="p-4 text-blue-700 font-bold">
                    {calculateAge(student.birthDate)} años
                  </td>
                  <td className="p-4 text-gray-600 truncate max-w-[250px] italic">{student.address}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateStudentPDFReport(student, schoolInfo);
                        }}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Descargar Reporte PDF del estudiante"
                      >
                        <FileDown size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStudentToDelete(student);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95"
                        title="Eliminar Alumno"
                      >
                        <Trash2 size={14} />
                        <span>Eliminar Alumno</span>
                      </button>
                      <span className="text-blue-600 text-xs font-black uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">Ver Ficha &rarr;</span>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-16 text-center text-gray-400 font-medium italic">
                  No se encontraron alumnos con los criterios seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmación para Eliminar Alumno */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-7 space-y-6 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 size={32} />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">¿Eliminar Alumno?</h3>
              <p className="text-sm text-gray-600 font-medium">
                ¿Está seguro que desea eliminar a <strong className="text-gray-900">{studentToDelete.fullName}</strong> (DNI: {studentToDelete.dni || 'Sin DNI'}) de {studentToDelete.course}° Año?
              </p>
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl font-semibold">
                ⚠️ Esta acción borrará permanentemente sus calificaciones, asistencias y ficha médica.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStudent(studentToDelete.id)}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-600/30 transition-all active:scale-95"
              >
                Eliminar Alumno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
