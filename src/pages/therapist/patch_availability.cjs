const fs = require('fs');

const filePath = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/pages/therapist/TherapistAvailability.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix toLocale... strings in generateWeeks to use i18n.language
content = content.replace(/'en-US'/g, 'i18n.language');

// 2. Define the new components with time-based positioning and proper i18n
const newComponents = `
// Time Grid Component (matching PsyCMp design)
interface TimeGridProps {
    weekDays: Date[];
    appointments: Appointment[];
    onSlotClick: (slot: Appointment) => void;
    onTimeSlotClick: (date: Date, hour: number) => void;
    t: (key: string, defaultValue?: string) => string;
}

const TimeGrid = ({ weekDays, appointments, onSlotClick, onTimeSlotClick, t }: TimeGridProps) => {
    const { i18n } = useTranslation();
    const hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM to 10 PM
    const gridStartHour = 6;
    const hourHeight = 100; // Increased height for better visual clarity

    const getAppointmentsForDay = (date: Date) => {
        return appointments.filter(appointment => {
            const appointmentDate = appointment.startTimestamp.toDate();
            return appointmentDate.toDateString() === date.toDateString();
        });
    };

    const formatTimeAxis = (hour: number) => {
        const date = new Date();
        date.setHours(hour, 0, 0, 0);
        return date.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <div className="overflow-auto max-h-[800px] border rounded-xl bg-white shadow-sm">
            <div className="min-w-[800px] relative">
                {/* Fixed Header */}
                <div className="flex bg-gray-50/80 backdrop-blur-sm border-b sticky top-0 z-30">
                    <div className="w-24 p-4 text-xs font-bold text-gray-400 text-center border-r uppercase tracking-widest">
                        {t("therapist.availability.time", "Time")}
                    </div>
                    {weekDays.map((date, index) => {
                        const isToday = date.toDateString() === new Date().toDateString();
                        return (
                            <div
                                key={index}
                                className={\`flex-1 p-4 text-center border-r last:border-r-0 \${isToday ? 'bg-[#92C7CF] text-white' : 'text-gray-700'}\`}
                            >
                                <div className="text-xs font-semibold uppercase opacity-80 mb-1">
                                    {date.toLocaleDateString(i18n.language, { weekday: 'short' })}
                                </div>
                                <div className={\`text-xl font-black \${isToday ? 'text-white' : 'text-gray-900'}\`}>
                                    {date.getDate()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex relative">
                    {/* Continuous Time Axis */}
                    <div className="w-24 bg-gray-50/30 border-r">
                        {hours.map((hour) => (
                            <div key={hour} style={{ height: \`\${hourHeight}px\` }} className="relative border-b last:border-b-0 group">
                                <span className="absolute -top-2 left-0 right-0 text-[11px] text-gray-400 font-bold text-center bg-white/50 px-1 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 mx-2">
                                    {formatTimeAxis(hour)}
                                </span>
                                <div className="pt-2 pr-3 text-[10px] text-gray-500 font-bold text-right">
                                    {formatTimeAxis(hour)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    <div className="flex-1 flex relative">
                        {weekDays.map((date, dayIndex) => {
                            const dayAppointments = getAppointmentsForDay(date);
                            const isToday = date.toDateString() === new Date().toDateString();

                            return (
                                <div
                                    key={dayIndex}
                                    className={\`flex-1 relative border-r last:border-r-0 \${isToday ? 'bg-blue-50/10' : ''}\`}
                                    style={{ height: \`\${hours.length * hourHeight}px\` }}
                                >
                                    {/* Slot background lines */}
                                    {hours.map((hour) => {
                                        const isPast = isPastSlot(date, hour);
                                        return (
                                            <div
                                                key={hour}
                                                style={{ height: \`\${hourHeight}px\` }}
                                                className={\`border-b last:border-b-0 transition-all cursor-pointer \${isPast ? 'bg-gray-100/50 cursor-not-allowed' : 'hover:bg-blue-50/40'}\`}
                                                onClick={() => !isPast && onTimeSlotClick(date, hour)}
                                            />
                                        );
                                    })}

                                    {/* Appointments Overlay */}
                                    {dayAppointments.map((appointment) => {
                                        const startDate = appointment.startTimestamp.toDate();
                                        const endDate = appointment.endTimestamp.toDate();
                                        
                                        const startMinutes = (startDate.getHours() - gridStartHour) * 60 + startDate.getMinutes();
                                        const endMinutes = (endDate.getHours() - gridStartHour) * 60 + endDate.getMinutes();
                                        const duration = endMinutes - startMinutes;
                                        
                                        const top = (startMinutes / 60) * hourHeight;
                                        const height = (duration / 60) * hourHeight;

                                        return (
                                            <div 
                                                key={appointment.id}
                                                style={{ 
                                                    position: 'absolute',
                                                    top: \`\${top + 2}px\`, // Small padding
                                                    height: \`\${height - 4}px\`, // Small padding
                                                    left: '4px',
                                                    right: '4px',
                                                    zIndex: 20
                                                }}
                                            >
                                                <TimeSlotBox
                                                    appointment={appointment}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSlotClick(appointment);
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TimeSlotBox = ({ appointment, onClick }: { appointment: Appointment; onClick: (e: React.MouseEvent) => void }) => {
    const { t, i18n } = useTranslation();
    const isBooked = appointment.isBooked;
    const startTime = appointment.startTimestamp.toDate();
    const endTime = appointment.endTimestamp.toDate();

    const timeRange = \`\${startTime.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })} - \${endTime.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })}\`;

    return (
        <div
            onClick={onClick}
            className={\`
                w-full h-full p-2 rounded-xl text-xs cursor-pointer border-2 transition-all flex flex-col justify-center items-center text-center shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                \${isBooked
                    ? 'bg-orange-50 border-orange-200 text-orange-900'
                    : 'bg-white border-emerald-100 text-emerald-800 hover:border-emerald-300'
                }
            \`}
        >
            <div className="flex items-center justify-center gap-1.5 mb-1">
                {isBooked ? (
                    <>
                        <Phone className="w-3 h-3 text-orange-500" />
                        <span className="font-black truncate max-w-[120px]">
                            {appointment.clientName || t("therapist.availability.client", "Client")}
                        </span>
                    </>
                ) : (
                    <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-600">
                        {t("therapist.availability.open", "Available")}
                    </span>
                )}
            </div>
            <div className={\`text-[10px] font-black opacity-80 \${isBooked ? 'text-orange-700/70' : 'text-emerald-700/60'}\`}>
                {timeRange}
            </div>
        </div>
    );
};

const TimeAdjuster = ({ value, onChange, max, step = 1, label }: TimeAdjusterProps) => {
    return (
        <div className="flex flex-col items-center">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onChange((value + step) % (max + 1))}
                className="h-8 w-8 p-0 rounded-full bg-[#E0F7FA] hover:bg-[#B2EBF2] border-none shadow-sm"
            >
                <ChevronUp className="w-4 h-4 text-cyan-700" />
            </Button>
            <div className="py-2 text-2xl font-black min-w-[3ch] text-center text-gray-800">
                {value.toString().padStart(2, '0')}
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={() => onChange(value - step < 0 ? max : value - step)}
                className="h-8 w-8 p-0 rounded-full bg-[#E0F7FA] hover:bg-[#B2EBF2] border-none shadow-sm"
            >
                <ChevronDown className="w-4 h-4 text-cyan-700" />
            </Button>
        </div>
    );
};`;

// Replace from TimeGrid interface onwards
const startMarker = 'interface TimeGridProps {';
const startIndex = content.indexOf(startMarker);
if (startIndex !== -1) {
    content = content.substring(0, startIndex) + newComponents.trim() + '\n\nexport default TherapistAvailability;';
}

fs.writeFileSync(filePath, content);
console.log('Fixed i18n and implemented time-based layout in TherapistAvailability.tsx');
