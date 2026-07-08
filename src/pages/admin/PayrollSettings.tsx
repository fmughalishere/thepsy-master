import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPayrollSettings, savePayrollSettings } from '../../services/payrollService';

interface PayrollSettings {
    sessionPricePerHour: number;
    lateArrivalPenalty: number;
    cancellationPenalty: number;
    lateArrivalThresholdMinutes: number;
    baseDailyMessageLimit: number;
    messageWordLimit: number;
    updatedAt?: any;
    updatedBy?: string;
}

const AdminPayrollSettings: React.FC = () => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<PayrollSettings>({
        sessionPricePerHour: 100,
        lateArrivalPenalty: 20,
        cancellationPenalty: 30,
        lateArrivalThresholdMinutes: 5,
        baseDailyMessageLimit: 3,
        messageWordLimit: 500
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await getPayrollSettings();
            setSettings(data);
        } catch (err) {
            setError(t('admin.payroll_settings.error_load'));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveSuccess(false);
        setError(null);

        try {
            await savePayrollSettings(settings);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            setError(t('admin.payroll_settings.error_save'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="px-6 py-8">
                <div className="max-w-4xl mx-auto flex items-center gap-4">
                    <button
                        onClick={() => window.history.back()}
                        className="p-2 hover:bg-white rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div>
                        <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">
                            {t('admin.payroll_settings.title')}
                        </h1>
                        <p className="text-sm text-gray-500 font-shippori">
                            {t('admin.payroll_settings.subtitle', 'Configure system-wide payroll parameters')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto p-6">
                <div className="space-y-6">
                    {/* Session Price Card */}
                    <SettingCard
                        title={t('admin.payroll_settings.session_price_per_hour')}
                        value={settings.sessionPricePerHour}
                        onChange={(val) => setSettings({ ...settings, sessionPricePerHour: val })}
                        prefix="€"
                        suffix={`/${t('admin.payroll_settings.labels.hour')}`}
                    />

                    {/* Late Arrival Penalty Card */}
                    <SettingCard
                        title={t('admin.payroll_settings.late_penalty')}
                        value={settings.lateArrivalPenalty}
                        onChange={(val) => setSettings({ ...settings, lateArrivalPenalty: val })}
                        prefix="€"
                    />

                    {/* Cancellation Penalty Card */}
                    <SettingCard
                        title={t('admin.payroll_settings.cancellation_penalty')}
                        value={settings.cancellationPenalty}
                        onChange={(val) => setSettings({ ...settings, cancellationPenalty: val })}
                        prefix="€"
                    />

                    {/* Late Threshold Card */}
                    <SettingCard
                        title={t('admin.payroll_settings.late_threshold')}
                        value={settings.lateArrivalThresholdMinutes}
                        onChange={(val) => setSettings({ ...settings, lateArrivalThresholdMinutes: val })}
                        suffix={t('admin.payroll_settings.labels.minutes')}
                        isInteger
                    />

                    {/* Daily Message Limit Card */}
                    <SettingCard
                        title={t('admin.payroll_settings.daily_message_limit', 'Daily Message Limit (Basic Plan)')}
                        value={settings.baseDailyMessageLimit || 3}
                        onChange={(val) => setSettings({ ...settings, baseDailyMessageLimit: val })}
                        suffix={t('admin.payroll_settings.labels.messages', 'messages')}
                        isInteger
                    />

                    {/* Words Per Message Limit Card */}
                    <SettingCard
                        title={t('admin.payroll_settings.message_word_limit', 'Words Per Message Limit')}
                        value={settings.messageWordLimit || 500}
                        onChange={(val) => setSettings({ ...settings, messageWordLimit: val })}
                        suffix={t('admin.payroll_settings.labels.words', 'words')}
                        isInteger
                    />

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full h-14 bg-[#92C7CF] hover:bg-[#7FB0B8] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSaving ? (
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                {t('admin.payroll_settings.save')}
                            </>
                        )}
                    </button>

                    {/* Success Message */}
                    {saveSuccess && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <p className="text-green-800 font-medium">
                                {t('admin.payroll_settings.saved')}
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-red-800 font-medium">{error}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

interface SettingCardProps {
    title: string;
    value: number;
    onChange: (value: number) => void;
    prefix?: string;
    suffix?: string;
    isInteger?: boolean;
}

const SettingCard: React.FC<SettingCardProps> = ({
    title,
    value,
    onChange,
    prefix = '',
    suffix = '',
    isInteger = false
}) => {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>
            <div className="flex items-center gap-3">
                {prefix && (
                    <span className="text-2xl font-bold text-gray-900">{prefix}</span>
                )}
                <input
                    type="number"
                    value={value}
                    onChange={(e) => {
                        const val = isInteger
                            ? parseInt(e.target.value) || 0
                            : parseFloat(e.target.value) || 0;
                        onChange(val);
                    }}
                    step={isInteger ? 1 : 0.01}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#92C7CF] focus:border-transparent"
                />
                {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
            </div>
        </div>
    );
};

export default AdminPayrollSettings;
