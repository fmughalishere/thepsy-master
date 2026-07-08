import {
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    updateDoc,
    Timestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface PayrollSettings {
    sessionPricePerHour: number;
    lateArrivalPenalty: number;
    cancellationPenalty: number;
    lateArrivalThresholdMinutes: number;
    baseDailyMessageLimit: number;
    messageWordLimit: number;
    updatedAt?: Timestamp;
    updatedBy?: string;
}

export interface Appointment {
    id: string;
    therapistId: string;
    bookedBy?: string;
    startTimestamp: Timestamp;
    endTimestamp: Timestamp;
    status: string;
    sessionDurationSeconds: number;
    patientJoinedAt?: Timestamp;
    patientWasLate: boolean;
    lateArrivalMinutes: number;
    sessionEndedAt?: Timestamp;
    paymentStatus: 'unpaid' | 'paid' | 'pending';
    paymentAmount: number;
    baseAmount: number;
    penaltyAmount: number;
    paidAt?: Timestamp;
    paidBy?: string;
}

export interface User {
    uid: string;
    displayName?: string;
    profilePicture?: string;
    email?: string;
}

export interface PayrollSession {
    appointment: Appointment;
    therapist: User;
    patient?: User;
}

/**
 * Get payroll settings from Firestore
 */
export async function getPayrollSettings(): Promise<PayrollSettings> {
    try {
        const docRef = doc(db, 'adminSettings', 'payroll');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data() as PayrollSettings;
        }

        // Return default settings if not found
        return {
            sessionPricePerHour: 100,
            lateArrivalPenalty: 20,
            cancellationPenalty: 30,
            lateArrivalThresholdMinutes: 5,
            baseDailyMessageLimit: 3,
            messageWordLimit: 500
        };
    } catch (error) {
        console.error('Error fetching payroll settings:', error);
        throw error;
    }
}

/**
 * Save payroll settings to Firestore
 */
export async function savePayrollSettings(settings: PayrollSettings): Promise<void> {
    try {
        const currentUser = auth.currentUser;
        const updatedSettings: PayrollSettings = {
            ...settings,
            updatedAt: Timestamp.now(),
            updatedBy: currentUser?.uid || ''
        };

        const docRef = doc(db, 'adminSettings', 'payroll');
        await setDoc(docRef, updatedSettings);
    } catch (error) {
        console.error('Error saving payroll settings:', error);
        throw error;
    }
}

/**
 * Get all completed sessions for payroll with therapist and patient details
 */
export async function getPayrollSessions(): Promise<PayrollSession[]> {
    try {
        // Get completed or cancelled appointments
        const appointmentsRef = collection(db, 'appointments');
        const q = query(
            appointmentsRef,
            where('status', '==', 'COMPLETED'),
            where('paymentStatus', '==', 'unpaid'),
            orderBy('startTimestamp', 'desc'),
            limit(100)
        );

        const querySnapshot = await getDocs(q);
        const sessions: PayrollSession[] = [];

        for (const docSnap of querySnapshot.docs) {
            const appointment = { id: docSnap.id, ...docSnap.data() } as Appointment;

            // Get therapist details
            const therapistDoc = await getDoc(doc(db, 'users', appointment.therapistId));
            const therapist = therapistDoc.exists()
                ? { uid: therapistDoc.id, ...therapistDoc.data() } as User
                : { uid: appointment.therapistId, displayName: 'Unknown' };

            // Get patient details if available
            let patient: User | undefined;
            if (appointment.bookedBy) {
                try {
                    const patientDoc = await getDoc(doc(db, 'users', appointment.bookedBy));
                    if (patientDoc.exists()) {
                        patient = { uid: patientDoc.id, ...patientDoc.data() } as User;
                    }
                } catch (error) {
                    console.error('Error fetching patient:', error);
                }
            }

            sessions.push({
                appointment,
                therapist,
                patient
            });
        }

        return sessions;
    } catch (error) {
        console.error('Error fetching payroll sessions:', error);
        throw error;
    }
}

/**
 * Calculate payment amount for an appointment based on settings
 */
export async function calculatePaymentAmount(appointment: Appointment): Promise<number> {
    const settings = await getPayrollSettings();

    if (appointment.status === 'CANCELLED_BY_PATIENT') {
        return settings.cancellationPenalty;
    } else if (appointment.status === 'COMPLETED') {
        const baseAmount = (appointment.sessionDurationSeconds / 3600) * settings.sessionPricePerHour;
        const latePenalty = appointment.patientWasLate ? settings.lateArrivalPenalty : 0;
        return baseAmount + latePenalty;
    }

    return 0;
}

/**
 * Update appointment with payment calculation
 */
export async function updateAppointmentPayment(appointmentId: string): Promise<void> {
    try {
        const docRef = doc(db, 'appointments', appointmentId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Appointment not found');
        }

        const appointment = { id: docSnap.id, ...docSnap.data() } as Appointment;
        const settings = await getPayrollSettings();

        let baseAmount = 0;
        let penaltyAmount = 0;
        let totalAmount = 0;

        if (appointment.status === 'CANCELLED_BY_PATIENT') {
            penaltyAmount = settings.cancellationPenalty;
            totalAmount = penaltyAmount;
        } else if (appointment.status === 'COMPLETED') {
            baseAmount = (appointment.sessionDurationSeconds / 3600) * settings.sessionPricePerHour;
            penaltyAmount = appointment.patientWasLate ? settings.lateArrivalPenalty : 0;
            totalAmount = baseAmount + penaltyAmount;
        }

        await updateDoc(docRef, {
            baseAmount,
            penaltyAmount,
            paymentAmount: totalAmount,
            paymentStatus: 'unpaid'
        });
    } catch (error) {
        console.error('Error updating appointment payment:', error);
        throw error;
    }
}

/**
 * Mark payment as paid
 */
export async function markPaymentAsPaid(appointmentId: string): Promise<void> {
    try {
        const currentUser = auth.currentUser;
        const docRef = doc(db, 'appointments', appointmentId);

        await updateDoc(docRef, {
            paymentStatus: 'paid',
            paidAt: Timestamp.now(),
            paidBy: currentUser?.uid || ''
        });

        // Log to earnings collection for therapist tracking
        const appointmentSnap = await getDoc(docRef);
        const appointment = { id: appointmentSnap.id, ...appointmentSnap.data() } as Appointment;
        const earningsRef = collection(db, 'earnings');
        const paidAt = Timestamp.now();
        const paidDate = paidAt.toDate();
        const monthKey = `${paidDate.getFullYear()}-${(paidDate.getMonth() + 1).toString().padStart(2, '0')}`;

        await setDoc(doc(earningsRef), {
            therapistId: appointment.therapistId,
            appointmentId: appointmentId,
            amount: appointment.paymentAmount || 0,
            sessionsCount: 1,
            timestamp: paidAt,
            month: monthKey,
            type: 'SESSIONS'
        });
    } catch (error) {
        console.error('Error marking payment as paid:', error);
        throw error;
    }
}

/**
 * Get earnings statistics for a therapist
 */
export async function getTherapistEarningsStats(therapistId: string) {
    try {
        const earningsRef = collection(db, 'earnings');
        // Get all earnings for this therapist
        const q = query(
            earningsRef,
            where('therapistId', '==', therapistId),
            orderBy('timestamp', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const earnings = querySnapshot.docs.map(doc => doc.data());

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonth = `${lastMonthDate.getFullYear()}-${(lastMonthDate.getMonth() + 1).toString().padStart(2, '0')}`;

        // Filter by current month
        const currentMonthEarnings = earnings.filter(e => e.month === currentMonth);
        const lastMonthEarnings = earnings.filter(e => e.month === lastMonth);

        // Overview Stats
        const monthlyRevenue = currentMonthEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const totalSessions = currentMonthEarnings.reduce((sum, e) => sum + (e.sessionsCount || 0), 0);

        const lastMonthRevenue = lastMonthEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const lastMonthSessions = lastMonthEarnings.reduce((sum, e) => sum + (e.sessionsCount || 0), 0);

        // Calculate % change
        const revenueChangePercentage = lastMonthRevenue > 0 ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
        const sessionsChange = totalSessions - lastMonthSessions;

        // Monthly Comparison (Group by month)
        const monthlyGroups: Record<string, { month: string, revenue: number, sessions: number }> = {};
        earnings.forEach(e => {
            if (!monthlyGroups[e.month]) {
                monthlyGroups[e.month] = { month: e.month, revenue: 0, sessions: 0 };
            }
            monthlyGroups[e.month].revenue += (e.amount || 0);
            monthlyGroups[e.month].sessions += (e.sessionsCount || 0);
        });

        const comparison = Object.values(monthlyGroups)
            .sort((a, b) => b.month.localeCompare(a.month))
            .slice(0, 6)
            .map(m => {
                const [year, month] = m.month.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                // Get current language from i18next
                const currentLang = typeof window !== 'undefined' ? (window as any).localStorage.getItem('i18nextLng') || 'en' : 'en';
                const monthName = date.toLocaleString(currentLang, { month: 'long' });
                const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();

                return {
                    name: `${monthName}, ${year}`,
                    revenue: m.revenue,
                    sessions: m.sessions,
                    avgPerDay: Math.round(m.revenue / daysInMonth)
                };
            });

        // Weekly stats for chart (Current month)
        const weeklyData = [
            { name: 'Week 1', value: 0 },
            { name: 'Week 2', value: 0 },
            { name: 'Week 3', value: 0 },
            { name: 'Week 4', value: 0 },
            { name: 'Week 5', value: 0 },
        ];

        currentMonthEarnings.forEach(e => {
            const date = e.timestamp.toDate();
            const week = Math.floor((date.getDate() - 1) / 7);
            if (week < 5) {
                weeklyData[week].value += (e.amount || 0);
            }
        });

        return {
            monthlyRevenue,
            totalSessions,
            revenueChangeRate: revenueChangePercentage.toFixed(1),
            sessionsChange,
            comparison,
            weeklyData
        };

    } catch (error) {
        console.error('Error getting therapist earnings stats:', error);
        throw error;
    }
}

/**
 * Update session timing and late arrival detection
 */
export async function updateSessionTiming(
    appointmentId: string,
    patientJoinedAt: Timestamp,
    sessionEndedAt?: Timestamp
): Promise<void> {
    try {
        const docRef = doc(db, 'appointments', appointmentId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error('Appointment not found');
        }

        const appointment = { id: docSnap.id, ...docSnap.data() } as Appointment;
        const settings = await getPayrollSettings();

        // Calculate if patient was late
        const scheduledStart = appointment.startTimestamp;
        const lateSeconds = patientJoinedAt.seconds - scheduledStart.seconds;
        const lateMinutes = Math.floor(lateSeconds / 60);
        const wasLate = lateMinutes > settings.lateArrivalThresholdMinutes;

        const updates: any = {
            patientJoinedAt,
            patientWasLate: wasLate,
            lateArrivalMinutes: wasLate ? lateMinutes : 0
        };

        // If session ended, calculate duration
        if (sessionEndedAt) {
            // We use the accumulated duration from the frontend if available, so we don't overwrite it here
            // unless it's missing. The frontend sets sessionDurationSeconds before calling this.
            // So we only set sessionEndedAt here to just update timestamps generally.
            updates.sessionEndedAt = sessionEndedAt;

            // If we absolutely must check duration here (fallback), only do it if not set? 
            // The user complaint is "duplication of seconds" and different values.
            // Let's NOT overwrite sessionDurationSeconds here.
        }

        await updateDoc(docRef, updates);
    } catch (error) {
        console.error('Error updating session timing:', error);
        throw error;
    }
}
