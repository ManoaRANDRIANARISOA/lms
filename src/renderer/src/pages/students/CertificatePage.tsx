import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useStudentStore } from "@/store/useStudentStore"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Printer } from "lucide-react"

export default function CertificatePage() {
    const { studentId } = useParams<{ studentId: string }>()
    const navigate = useNavigate()
    const { currentStudent, getStudent, loading } = useStudentStore()
    const [schoolYear, setSchoolYear] = useState("2025-2026")
    const [schoolName, setSchoolName] = useState("Lycée Manjary Soa")
    const [certType, setCertType] = useState<'scolarite' | 'radiation' | 'assiduite'>('scolarite')

    useEffect(() => {
        if (studentId) {
            getStudent(studentId)
        }
        
        // Fetch settings via IPC
        if (window.electron && window.electron.ipcRenderer) {
            Promise.all([
                window.electron.ipcRenderer.invoke('settings:get', 'school_year'),
                window.electron.ipcRenderer.invoke('settings:get', 'school_name')
            ]).then(([year, name]) => {
                if (year) setSchoolYear(year);
                if (name) setSchoolName(name);
            }).catch(console.error);
        }
    }, [studentId, getStudent])

    if (loading) return <div className="p-10 text-center">Chargement...</div>
    if (!currentStudent) return <div className="p-10 text-center text-red-500">Élève non trouvé</div>

    const handlePrint = () => {
        window.print()
    }

    const getCertificateTitle = () => {
        switch(certType) {
            case 'radiation': return "CERTIFICAT DE RADIATION";
            case 'assiduite': return "CERTIFICAT D'ASSIDUITÉ";
            default: return "CERTIFICAT DE SCOLARITÉ";
        }
    }

    const getCertificateBody = () => {
        switch(certType) {
            case 'radiation':
                return (
                    <p>
                        Je soussigné(e), Directeur de l'établissement <strong>{schoolName}</strong>, certifie que l'élève <strong>{currentStudent.last_name} {currentStudent.first_name}</strong>, né(e) le {new Date(currentStudent.date_of_birth || '').toLocaleDateString('fr-FR')} à {currentStudent.place_of_birth || '-'}, a fréquenté notre établissement en classe de <strong>{currentStudent.class}</strong> durant l'année scolaire <strong>{schoolYear}</strong>.<br/><br/>
                        Il/Elle quitte l'établissement ce jour, <strong>{new Date().toLocaleDateString('fr-FR')}</strong>, libre de tout engagement scolaire et financier.
                    </p>
                );
            case 'assiduite':
                return (
                    <p>
                        Je soussigné(e), Directeur de l'établissement <strong>{schoolName}</strong>, certifie que l'élève <strong>{currentStudent.last_name} {currentStudent.first_name}</strong>, inscrit en classe de <strong>{currentStudent.class}</strong> pour l'année scolaire <strong>{schoolYear}</strong>, fait preuve d'une assiduité et d'une conduite exemplaires.
                    </p>
                );
            default:
                return (
                    <p>
                        Je soussigné(e), Directeur de l'établissement <strong>{schoolName}</strong>, certifie que l'élève <strong>{currentStudent.last_name} {currentStudent.first_name}</strong>, né(e) le {new Date(currentStudent.date_of_birth || '').toLocaleDateString('fr-FR')} à {currentStudent.place_of_birth || '-'}, est régulièrement inscrit(e) en classe de <strong>{currentStudent.class}</strong> au titre de l'année scolaire <strong>{schoolYear}</strong>.
                    </p>
                );
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-white overflow-auto flex flex-col items-center p-8">
            {/* Controls - Hidden when printing */}
            <div className="w-full max-w-[210mm] flex justify-between items-center mb-8 print:hidden">
                <Button variant="outline" onClick={() => navigate(-1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Retour
                </Button>
                
                <div className="flex items-center gap-4">
                    <select 
                        className="p-2 border rounded-md"
                        value={certType}
                        onChange={(e) => setCertType(e.target.value as any)}
                    >
                        <option value="scolarite">Certificat de Scolarité</option>
                        <option value="radiation">Certificat de Radiation</option>
                        <option value="assiduite">Certificat d'Assiduité</option>
                    </select>

                    <Button onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimer
                    </Button>
                </div>
            </div>

            {/* Certificate Content - A4 size */}
            <div className="w-[210mm] min-h-[297mm] bg-white p-12 shadow-lg print:shadow-none print:w-full print:h-auto text-black relative flex flex-col">
                
                {/* Header with Photo */}
                <div className="flex justify-between items-start mb-12 border-b-2 border-gray-800 pb-6">
                    <div className="w-32 h-32 bg-gray-100 border border-gray-300 flex items-center justify-center overflow-hidden">
                        {currentStudent.photo_path ? (
                            <img 
                                src={`local-resource://${currentStudent.photo_path.replace(/\\/g, '/')}`} 
                                alt="Photo élève" 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        ) : (
                            <span className="text-xs text-gray-400 text-center p-2">Photo</span>
                        )}
                    </div>

                    <div className="text-center flex-1 px-8">
                        <h1 className="text-3xl font-bold uppercase mb-2">{schoolName}</h1>
                        <p className="text-sm text-gray-600">Enseignement Général et Technique</p>
                        <p className="text-sm text-gray-600">Antananarivo, Madagascar</p>
                    </div>

                    <div className="w-32">
                        {/* Spacer to balance the photo */}
                    </div>
                </div>

                {/* Title */}
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-serif font-bold underline decoration-double underline-offset-4 uppercase">
                        {getCertificateTitle()}
                    </h2>
                </div>

                {/* Body */}
                <div className="space-y-8 text-lg leading-relaxed px-8 flex-grow">
                    {getCertificateBody()}

                    {certType === 'scolarite' && (
                        <div className="text-center py-4 bg-gray-50 rounded border border-gray-100 print:border-none print:bg-transparent mt-8">
                            <h3 className="text-3xl font-bold uppercase tracking-wide">
                                {currentStudent.last_name} {currentStudent.first_name}
                            </h3>
                            <p className="text-gray-500 mt-2">Matricule : {currentStudent.registration_number}</p>
                        </div>
                    )}
                    
                    <div className="mt-12">
                        <p>En foi de quoi, ce certificat est délivré pour servir et valoir ce que de droit.</p>
                    </div>
                </div>

                {/* Footer / Signature */}
                <div className="mt-16 flex justify-end px-12 pb-12">
                    <div className="text-center">
                        <p className="mb-4">Fait à Antananarivo, le {new Date().toLocaleDateString('fr-FR')}</p>
                        <p className="font-bold mb-16">Le Directeur</p>
                        <div className="border-t border-gray-400 w-48 mx-auto"></div>
                    </div>
                </div>
            </div>
        </div>
    )
}
