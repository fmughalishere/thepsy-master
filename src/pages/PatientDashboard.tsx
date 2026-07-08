import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Patient {
  id: string;
  name: string;
  email: string;
  // Add other patient fields here
}

const fetchPatientData = async (uid: string): Promise<Patient> => {
  const patientDocRef = doc(db, 'patients', uid);
  const patientDocSnap = await getDoc(patientDocRef);

  if (!patientDocSnap.exists()) {
    throw new Error('Patient data not found');
  }

  return { id: patientDocSnap.id, ...patientDocSnap.data() } as Patient;
};

const PatientDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();

  const { data: patient, isLoading, isError, error } = useQuery({
    queryKey: ['patient', currentUser?.uid],
    queryFn: () => fetchPatientData(currentUser!.uid),
    enabled: !!currentUser,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <p className="text-red-500">{t('common.error', 'Error')}: {error.message}</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return null;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">{t('patient.dashboard.title', 'Patient Dashboard')}</h1>
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">{t('patient.dashboard.information', 'Patient Information')}</h2>
        <p><strong>{t('patient.dashboard.name', 'Name')}:</strong> {patient.name}</p>
        <p><strong>{t('patient.dashboard.email', 'Email')}:</strong> {patient.email}</p>
        {/* Display other patient information here */}
      </div>
    </div>
  );
};

export default PatientDashboard;
