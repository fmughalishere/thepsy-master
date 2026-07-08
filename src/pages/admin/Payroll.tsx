import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getPayrollSessions, markPaymentAsPaid, PayrollSession } from '../../services/payrollService';

const AdminPayroll: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'unpaid' | 'paid'>('unpaid');
    const [unpaidSessions, setUnpaidSessions] = useState<PayrollSession[]>([]);
    const [paidSessions, setPaidSessions] = useState<PayrollSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        setIsLoading(true);
        try {
            const sessions = await getPayrollSessions();
            const unpaid = sessions.filter(s => s.appointment.paymentStatus === 'unpaid');
            const paid = sessions.filter(s => s.appointment.paymentStatus === 'paid');
            setUnpaidSessions(unpaid);
            setPaidSessions(paid);
        } catch (error) {
            console.error('Failed to load sessions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMarkPaid = async (appointmentId: string) => {
        try {
            await markPaymentAsPaid(appointmentId);
            await loadSessions();
        } catch (error) {
            console.error('Failed to mark as paid:', error);
        }
    };

    const sessions = activeTab === 'unpaid' ? unpaidSessions : paidSessions;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="px-6 py-8">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">
                            {t('admin.payroll.title')}
                        </h1>
                        <p className="text-sm text-gray-500 font-shippori">
                            {t('admin.payroll.subtitle', 'Manage therapist payments and payroll history')}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/admin/payroll-settings')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Settings className="w-5 h-5 text-gray-600" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-gray-50 p-4">
                <div className="flex gap-3 max-w-xl mx-auto">
                    <button
                        onClick={() => setActiveTab('unpaid')}
                        className={`flex-1 px-6 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'unpaid'
                            ? 'bg-white text-[#508C96] shadow-md'
                            : 'bg-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('admin.payroll.tabs.unpaid')}
                    </button>
                    <button
                        onClick={() => setActiveTab('paid')}
                        className={`flex-1 px-6 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'paid'
                            ? 'bg-white text-[#508C96] shadow-sm'
                            : 'bg-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('admin.payroll.tabs.paid')}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto p-6">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="w-8 h-8 border-4 border-[#92C7CF] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-gray-500 text-lg">
                            {t('admin.payroll.no_sessions')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sessions.map((session) => (
                            <SessionCard
                                key={session.appointment.id}
                                session={session}
                                onMarkPaid={handleMarkPaid}
                                showMarkPaid={activeTab === 'unpaid'}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

interface SessionCardProps {
    session: PayrollSession;
    onMarkPaid: (id: string) => void;
    showMarkPaid: boolean;
}

const SessionCard: React.FC<SessionCardProps> = ({ session, onMarkPaid, showMarkPaid }) => {
    const { t } = useTranslation();
    const { appointment, therapist, patient } = session;

    const hours = Math.floor(appointment.sessionDurationSeconds / 3600);
    const minutes = Math.floor((appointment.sessionDurationSeconds % 3600) / 60);

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            {/* Header Section */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                    <img
                        src={therapist.profilePicture || 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=80&h=80&fit=crop'}
                        alt={therapist.displayName || t('admin.payroll.labels.therapist')}
                        className="w-14 h-14 rounded-full object-cover"
                    />
                    <div>
                        <h3 className="text-gray-900 font-semibold text-lg">
                            {therapist.displayName || t('admin.payroll.labels.unknown_therapist')}
                        </h3>
                        <p className="text-gray-500 text-sm">
                            {t('admin.payroll.labels.patient')}: {patient?.displayName || t('admin.payroll.labels.unknown')}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-gray-600 text-sm mb-1">
                        {t('admin.payroll.total_amount')}
                    </p>
                    <p className="text-green-500 font-bold text-xl">
                        € {appointment.paymentAmount.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Stats Section */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Duration */}
                <div>
                    <h4 className="text-gray-700 font-medium mb-2">
                        {t('admin.payroll.duration')}
                    </h4>
                    <p className="text-gray-600">{hours} {t('admin.payroll.labels.hours')}</p>
                    <p className="text-gray-500">{minutes} {t('admin.payroll.labels.minutes')}</p>
                </div>

                {/* Base Amount */}
                <div>
                    <h4 className="text-gray-700 font-medium mb-2">
                        {t('admin.payroll.base_amount')}
                    </h4>
                    <p className="text-gray-600 font-semibold">
                        € {appointment.baseAmount.toFixed(2)}
                    </p>
                </div>

                {/* Penalties */}
                <div>
                    <h4 className="text-gray-700 font-medium mb-2">
                        {t('admin.payroll.penalties')}
                    </h4>
                    <div className="flex gap-2 flex-wrap">
                        {appointment.patientWasLate && (
                            <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                                {t('admin.payroll.late_arrival')}
                            </span>
                        )}
                        {appointment.status === 'CANCELLED_BY_PATIENT' && (
                            <span className="border-2 border-red-500 text-red-500 px-3 py-1 rounded-full text-sm font-medium">
                                {t('admin.payroll.cancellation')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Button */}
            {showMarkPaid ? (
                <button
                    onClick={() => onMarkPaid(appointment.id)}
                    className="w-full h-12 bg-[#92C7CF] hover:bg-[#7FB0B8] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                    <Check className="w-5 h-5" />
                    {t('admin.payroll.mark_paid')}
                </button>
            ) : (
                appointment.paidAt && (
                    <p className="text-gray-600 text-sm font-medium">
                        {t('admin.payroll.payment_date')}: {new Date(appointment.paidAt.seconds * 1000).toLocaleDateString()}
                    </p>
                )
            )}
        </div>
    );
};

export default AdminPayroll;
