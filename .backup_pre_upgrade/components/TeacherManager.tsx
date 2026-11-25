
import React, { useState, useRef } from 'react';
import { Teacher, CourseYear, SUBJECTS_BY_YEAR, TeacherAttendance, LicenseRecord, SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';
import { 
  importTeachersFromExcel, 
  exportTeacherReportToExcel, 
  exportExTeachersToExcel,
  exportTeachersListPDF,
  generateTeacherPDFReport 
} from '../services/utils';
import { 
  Upload, 
  Download, 
  Plus, 
  Search, 
  UserCheck, 
  Trash2, 
  FileText, 
  Briefcase, 
  GraduationCap, 
  X, 
  Edit3, 
  Save, 
  Filter, 
  ChevronDown, 
  RotateCcw, 
  AlertTriangle,
  FileDown,
  Check 
} from 'lucide-react';

interface TeacherManagerProps {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  exTeachers: Teacher[];
  setExTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  schoolInfo?: SchoolInfo;
}

export const TeacherManager: React.FC<TeacherManagerProps> = ({ 
  teachers, 
  setTeachers, 
  exTeachers, 
  setExTeachers,
  schoolInfo = DEFAULT_SCHOOL_INFO,
}) => {
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState<CourseYear | 'all'>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [tempTeacher, setTempTeacher] = useState<Teacher | null>(null);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);
  
  // Estado para confirmación de eliminación
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Novedades/Licencias Modal
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseCode, setLicenseCode] = useState('');
  const [attendanceType, setAttendanceType] = useState<TeacherAttendance['type']>('licencia');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [presentationDate, setPresentationDate] = useState('');

  // Asignación de Materias
  const [assignCourse, setAssignCourse] = useState<CourseYear>('1');
  const [assignSubject, setAssignSubject] = useState('');

  const filteredTeachers = teachers.filter(t => {
    const matchesSearch = String(t.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         String(t.dni || '').includes(searchTerm);
    const matchesCourse = courseFilter === 'all' || t.assignedCourses.some(c => c.course === courseFilter);
    return matchesSearch && matchesCourse;
  });

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const newTeachers = await importTeachersFromExcel(e.target.files[0]);
        setTeachers(prev => [...prev, ...newTeachers]);
        alert(`${newTeachers.length} docentes importados correctamente.`);
      } catch (err) {
        alert('Error al importar docentes. Verifique que las columnas coincidan con el formato solicitado.');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEditToggle = () => {
    if (isEditing && tempTeacher) {
        setTeachers(prev => prev.map(t => t.id === tempTeacher.id ? tempTeacher : t));
        setSelectedTeacher(tempTeacher);
        setIsEditing(false);
    } else {
        setTempTeacher({ ...selectedTeacher! });
        setIsEditing(true);
    }
  };

  const saveAttendance = () => {
    if (!selectedTeacher) return;
    
    const licenseDetails: LicenseRecord | undefined = attendanceType === 'licencia' ? {
      type: licenseCode,
      from: dateFrom,
      to: dateTo,
      presentationDate: presentationDate,
      licenseCode: licenseCode
    } : undefined;

    const newRecord: TeacherAttendance = {
      date: new Date().toISOString().split('T')[0],
      type: attendanceType,
      licenseCode: attendanceType === 'licencia' ? licenseCode : undefined,
      licenseDetails
    };
    
    const updated = { ...selectedTeacher, attendance: [...selectedTeacher.attendance, newRecord] };
    setTeachers(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTeacher(updated);
    
    // Reset campos
    setLicenseCode('');
    setDateFrom('');
    setDateTo('');
    setPresentationDate('');
    setShowLicenseModal(false);
  };

  const assignWork = () => {
    if (!selectedTeacher || !assignSubject) return;
    const exists = selectedTeacher.assignedCourses.some(c => c.course === assignCourse && c.subject === assignSubject);
    if (exists) {
      alert('Esta materia ya está asignada a este docente.');
      return;
    }
    const updated = { 
      ...selectedTeacher, 
      assignedCourses: [...selectedTeacher.assignedCourses, { course: assignCourse, subject: assignSubject }] 
    };
    setTeachers(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTeacher(updated);
  };

  const initiateDelete = (teacher: Teacher) => {
    setTeacherToDelete(teacher);
    setShowDeleteModal(true);
  };

  const confirmDeleteTeacher = () => {
    if (!teacherToDelete) return;
    const removedTeacher = { ...teacherToDelete, exitDate: new Date().toISOString().split('T')[0] };
    setExTeachers(prev => [...prev, removedTeacher]);
    setTeachers(prev => prev.filter(t => t.id !== teacherToDelete.id));
    if (selectedTeacher?.id === teacherToDelete.id) {
        setSelectedTeacher(null);
    }
    setShowDeleteModal(false);
    setTeacherToDelete(null);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCourseFilter('all');
  };

  const handleExportTeachersPDF = () => {
    exportTeachersListPDF(filteredTeachers, schoolInfo, courseFilter);
    const filterDesc = courseFilter === 'all' ? 'general' : `de ${courseFilter}° Año`;
    setPdfSuccessMessage(`Nómina docente ${filterDesc} exportada en PDF exitosamente.`);
    setTimeout(() => setPdfSuccessMessage(null), 3500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Toast de confirmación de descarga de PDF */}
      {pdfSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check size={18} />
          </div>
          <p className="text-xs font-semibold">{pdfSuccessMessage}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-blue-900 tracking-tight">Planta Personal Docente</h2>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.2em]">Escuela Secundaria Los Bulacios</p>
        </div>
        <div className="flex flex-wrap gap-2.5 sm:gap-3">
            <button 
                onClick={handleExportTeachersPDF} 
                className="flex items-center gap-2 px-5 py-3 bg-rose-700 text-white rounded-2xl hover:bg-rose-800 shadow-lg transition-all active:scale-95 text-xs font-black uppercase tracking-widest"
                title="Exportar nómina de personal docente en formato institucional PDF"
            >
                <FileDown size={18} /> Exportar Nómina (PDF)
            </button>
            <input type="file" className="hidden" ref={fileInputRef} accept=".xlsx" onChange={handleImport} />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-2xl hover:bg-green-700 shadow-lg transition-all active:scale-95 text-xs font-black uppercase tracking-widest">
                <Upload size={18} /> Importar Planta (.xlsx)
            </button>
            <button onClick={() => exportExTeachersToExcel(exTeachers)} className="flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-2xl hover:bg-black shadow-lg transition-all active:scale-95 text-xs font-black uppercase tracking-widest">
                <Download size={18} /> BBDD Ex-Docentes
            </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
         <div className="lg:col-span-4 bg-white rounded-3xl shadow-md border border-gray-50 flex flex-col h-[750px] overflow-hidden">
            <div className="p-6 border-b-2 border-gray-50 bg-gray-50/50 space-y-3">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-900" size={20} />
                    <input 
                      className="w-full border-2 border-transparent bg-white rounded-2xl pl-12 pr-4 py-4 text-sm font-bold shadow-sm focus:border-blue-500 transition-all outline-none" 
                      placeholder="Buscar por Nombre o DNI..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="relative group">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-900" size={18} />
                    <select 
                      value={courseFilter}
                      onChange={(e) => setCourseFilter(e.target.value as any)}
                      className="w-full border-2 border-transparent bg-white rounded-2xl pl-12 pr-10 py-3 text-sm font-bold shadow-sm focus:border-blue-500 transition-all outline-none appearance-none cursor-pointer"
                    >
                      <option value="all">TODOS LOS CURSOS</option>
                      {['1', '2', '3', '4', '5', '6'].map(y => (
                        <option key={y} value={y}>{y}° AÑO</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                </div>
                {(searchTerm || courseFilter !== 'all') && (
                  <button 
                    onClick={resetFilters}
                    className="flex items-center justify-center gap-2 w-full py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <RotateCcw size={12} /> Restablecer filtros
                  </button>
                )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredTeachers.map(teacher => {
                    const assignedYears = Array.from(new Set(teacher.assignedCourses.map(c => c.course))).sort();
                    return (
                    <div 
                      key={teacher.id}
                      onClick={() => { setSelectedTeacher(teacher); setIsEditing(false); }}
                      className={`group p-5 rounded-2xl cursor-pointer transition-all flex items-center justify-between border-2 ${selectedTeacher?.id === teacher.id ? 'bg-blue-600 border-blue-600 text-white shadow-xl translate-x-1' : 'bg-white border-transparent hover:border-blue-100 text-gray-700 hover:bg-blue-50'}`}
                    >
                        <div className="flex-1 min-w-0 pr-2">
                          <p className={`font-black text-lg leading-tight truncate ${selectedTeacher?.id === teacher.id ? 'text-white' : 'text-blue-900'}`}>{teacher.fullName}</p>
                          <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${selectedTeacher?.id === teacher.id ? 'text-blue-200' : 'text-gray-400'}`}>
                            Legajo: {teacher.legajo} • {teacher.hours}H
                          </p>
                          {assignedYears.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {assignedYears.map(y => (
                                <span key={y} className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${selectedTeacher?.id === teacher.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                  {y}°
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); initiateDelete(teacher); }}
                          className="w-10 h-10 shrink-0 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg hover:bg-red-700 transition-all active:scale-90"
                          title="Eliminar Docente"
                        >
                          <Trash2 size={18} />
                        </button>
                    </div>
                )})}
                {filteredTeachers.length === 0 && (
                  <div className="p-10 text-center space-y-4">
                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <Search className="text-gray-300" size={24} />
                    </div>
                    <p className="text-gray-400 italic text-sm font-medium">
                      No se encontraron docentes con estos criterios.
                    </p>
                  </div>
                )}
            </div>
         </div>

         <div className="lg:col-span-8">
            {selectedTeacher ? (
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-5 sm:p-8 md:p-10 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                   <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-gray-50 pb-6">
                     <div>
                       <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-blue-900 tracking-tight leading-tight">{isEditing ? tempTeacher?.fullName : selectedTeacher.fullName}</h3>
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded-full uppercase tracking-widest">Activo</span>
                       </div>
                       <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">Legajo Institucional: {selectedTeacher.legajo}</p>
                     </div>
                     <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button 
                            onClick={handleEditToggle}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                        >
                            {isEditing ? <><Save size={16}/> Guardar</> : <><Edit3 size={16}/> Editar</>}
                        </button>
                        <button 
                           onClick={() => {
                             generateTeacherPDFReport(selectedTeacher, schoolInfo);
                             setPdfSuccessMessage(`Legajo institucional en PDF de ${selectedTeacher.fullName} generado.`);
                             setTimeout(() => setPdfSuccessMessage(null), 3500);
                           }}
                           className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-rose-700 text-white rounded-2xl hover:bg-rose-800 shadow-md transition-all font-black text-xs uppercase tracking-widest active:scale-95"
                           title="Descargar legajo institucional del docente en PDF"
                        >
                           <FileDown size={16} /> <span className="hidden sm:inline">Legajo</span> PDF
                        </button>
                        <button 
                           onClick={() => exportTeacherReportToExcel(selectedTeacher, schoolInfo)}
                           className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-[#6B46C1] text-white rounded-2xl hover:bg-[#553C9A] shadow-md transition-all font-black text-xs uppercase tracking-widest"
                        >
                           <FileText size={16} /> <span className="hidden sm:inline">Generar</span> Informe
                        </button>
                     </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="space-y-1 p-5 bg-gray-50 rounded-2xl border-2 border-gray-50">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">DNI / Documento</p>
                        {isEditing ? <input className="w-full bg-white border-b-2 border-blue-500 p-1 font-bold" value={tempTeacher?.dni} onChange={e => setTempTeacher({...tempTeacher!, dni: e.target.value})} /> : <p className="font-black text-blue-900 text-xl">{selectedTeacher.dni}</p>}
                      </div>
                      <div className="space-y-1 p-5 bg-gray-50 rounded-2xl border-2 border-gray-50">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contacto Directo</p>
                        {isEditing ? <input className="w-full bg-white border-b-2 border-blue-500 p-1 font-bold" value={tempTeacher?.phone} onChange={e => setTempTeacher({...tempTeacher!, phone: e.target.value})} /> : <p className="font-bold text-gray-800">{selectedTeacher.phone || 'No registrado'}</p>}
                        <p className="text-[10px] text-blue-500 font-bold truncate">{selectedTeacher.email}</p>
                      </div>
                      <div className="space-y-1 p-5 bg-gray-50 rounded-2xl border-2 border-gray-50">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha Ingreso</p>
                        <p className="font-black text-blue-900 text-xl">{selectedTeacher.entryDate}</p>
                      </div>
                   </div>

                   <div className="bg-blue-900/5 p-8 rounded-3xl border-2 border-blue-900/10">
                      <h4 className="font-black text-blue-900 mb-6 flex items-center gap-3 uppercase text-lg tracking-tight"><GraduationCap size={24}/> Asignación de Espacios Curriculares</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-6">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase block mb-2 ml-2">Seleccionar Año</label>
                          <select className="w-full border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold bg-white outline-none focus:border-blue-500 transition-all" value={assignCourse} onChange={e => setAssignCourse(e.target.value as any)}>
                            {['1','2','3','4','5','6'].map(y => <option key={y} value={y}>{y}° Año</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase block mb-2 ml-2">Espacio Curricular</label>
                          <select className="w-full border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold bg-white outline-none focus:border-blue-500 transition-all" value={assignSubject} onChange={e => setAssignSubject(e.target.value)}>
                            <option value="">Seleccionar Materia...</option>
                            {SUBJECTS_BY_YEAR[assignCourse].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <button onClick={assignWork} className="bg-blue-900 text-white p-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95">Asignar Espacio</button>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {selectedTeacher.assignedCourses.map((c, i) => (
                          <div key={i} className="flex items-center gap-3 bg-white border-2 border-blue-100 px-5 py-3 rounded-2xl text-blue-900 text-sm font-black shadow-sm group">
                            <span>{c.course}° AÑO - {c.subject}</span>
                            <button onClick={() => { if(confirm('¿Desasignar materia?')) { const updated = {...selectedTeacher, assignedCourses: selectedTeacher.assignedCourses.filter((_, idx) => idx !== i)}; setTeachers(prev => prev.map(t => t.id === updated.id ? updated : t)); setSelectedTeacher(updated); } }} className="text-gray-300 hover:text-red-600 transition-colors"><X size={18}/></button>
                          </div>
                        ))}
                        {selectedTeacher.assignedCourses.length === 0 && <p className="text-sm text-gray-400 italic font-medium p-4 border-2 border-dashed border-gray-200 rounded-2xl w-full text-center uppercase tracking-widest">Sin espacios curriculares asignados</p>}
                      </div>
                   </div>

                   <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <h4 className="font-black text-blue-900 flex items-center gap-3 uppercase text-lg tracking-tight"><Briefcase size={24}/> Registro de Novedades y Licencias</h4>
                        <button 
                          onClick={() => setShowLicenseModal(true)}
                          className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl transition-all active:scale-95"
                        >
                          + Registrar Novedad
                        </button>
                      </div>
                      
                      <div className="max-h-72 overflow-y-auto rounded-3xl border-2 border-gray-50 bg-white shadow-inner">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-900 text-white sticky top-0 font-black text-[10px] uppercase tracking-[0.2em]">
                               <tr><th className="p-5">Fecha</th><th className="p-5">Motivo Novedad</th><th className="p-5">Cód. Licencia</th><th className="p-5">Periodo</th></tr>
                           </thead>
                           <tbody className="divide-y divide-gray-50 text-black">
                               {[...selectedTeacher.attendance].reverse().map((att, i) => (
                                   <tr key={i} className="hover:bg-gray-50 transition-colors">
                                       <td className="p-5 font-bold text-blue-900">{att.date}</td>
                                       <td className="p-5">
                                         <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${att.type === 'licencia' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                                           {att.type.replace('_', ' ')}
                                         </span>
                                       </td>
                                       <td className="p-5 font-black text-lg">{att.licenseCode || '-'}</td>
                                       <td className="p-5 text-gray-500 font-bold text-xs italic">
                                         {att.licenseDetails ? `${att.licenseDetails.from} al ${att.licenseDetails.to}` : 'Novedad Puntual'}
                                       </td>
                                   </tr>
                               ))}
                               {selectedTeacher.attendance.length === 0 && (
                                 <tr><td colSpan={4} className="p-20 text-center text-gray-300 font-black uppercase tracking-widest italic">Sin novedades asentadas</td></tr>
                               )}
                           </tbody>
                        </table>
                      </div>
                   </div>
                </div>
            ) : (
                <div className="bg-white rounded-[40px] border-4 border-dashed border-gray-100 h-full flex flex-col items-center justify-center text-gray-200 min-h-[550px] space-y-6">
                    <div className="bg-gray-50 p-10 rounded-full">
                      <UserCheck size={100} className="opacity-10 text-blue-900"/>
                    </div>
                    <div className="text-center">
                      <p className="font-black text-2xl text-gray-400 uppercase tracking-tighter">Gestión de Personal Docente</p>
                      <p className="text-sm text-gray-300 font-bold uppercase tracking-widest mt-2">Seleccione un integrante del listado lateral</p>
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-6">
           <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-10 animate-in zoom-in duration-200 text-center">
              <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
                 <AlertTriangle size={48} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">¿Confirmar Eliminación?</h3>
              <p className="text-gray-500 font-medium leading-relaxed mb-8">
                El registro de <span className="text-blue-900 font-black">{teacherToDelete?.fullName}</span> será trasladado a la base de datos de <span className="font-bold">EX-DOCENTES</span>. <br/>Esta acción marcará su egreso de la planta activa.
              </p>
              <div className="flex flex-col gap-3">
                 <button 
                   onClick={confirmDeleteTeacher}
                   className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg active:scale-95"
                 >
                   SÍ, CONFIRMAR EGRESO
                 </button>
                 <button 
                   onClick={() => setShowDeleteModal(false)}
                   className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                 >
                   CANCELAR
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Modal de Licencias con Estética de Formulario */}
      {showLicenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-xl w-full overflow-hidden animate-in zoom-in duration-300 border-t-[12px] border-blue-600">
             <div className="p-10 space-y-8">
                <div className="flex justify-between items-center border-b pb-6">
                   <div>
                      <h3 className="text-3xl font-black text-blue-900 tracking-tighter uppercase">Asentar Novedad</h3>
                      <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">Personal: {selectedTeacher?.fullName}</p>
                   </div>
                   <button onClick={() => setShowLicenseModal(false)} className="bg-gray-100 p-3 rounded-2xl text-gray-400 hover:text-red-600 transition-all"><X size={28}/></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Motivo / Tipo</label>
                      <select className="w-full border-2 border-gray-100 rounded-2xl p-4 font-bold text-gray-800 focus:border-blue-500 outline-none transition-all bg-gray-50" value={attendanceType} onChange={e => setAttendanceType(e.target.value as any)}>
                         <option value="licencia">Licencia Médica/Art.</option>
                         <option value="ausente_injustificado">Ausente Injustificado</option>
                         <option value="permiso">Permiso Especial</option>
                         <option value="compensatorio">Compensatorio</option>
                      </select>
                   </div>
                   {attendanceType === 'licencia' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Código de Licencia</label>
                        <input className="w-full border-2 border-gray-100 rounded-2xl p-4 font-black text-lg text-blue-900 focus:border-blue-500 outline-none transition-all bg-gray-50" placeholder="Ej: ART 15" value={licenseCode} onChange={e => setLicenseCode(e.target.value)} />
                      </div>
                   )}
                </div>

                {attendanceType === 'licencia' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Desde Fecha</label>
                        <input type="date" className="w-full border-2 border-gray-100 rounded-2xl p-4 font-bold focus:border-blue-500 outline-none transition-all bg-gray-50" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Hasta Fecha</label>
                        <input type="date" className="w-full border-2 border-gray-100 rounded-2xl p-4 font-bold focus:border-blue-500 outline-none transition-all bg-gray-50" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Fecha de Presentación</label>
                      <input type="date" className="w-full border-2 border-gray-100 rounded-2xl p-4 font-bold focus:border-blue-500 outline-none transition-all bg-gray-50" value={presentationDate} onChange={e => setPresentationDate(e.target.value)} />
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={saveAttendance}
                  className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black text-sm uppercase tracking-[0.3em] hover:bg-blue-700 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3"
                >
                  <Save size={20}/> GUARDAR
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
