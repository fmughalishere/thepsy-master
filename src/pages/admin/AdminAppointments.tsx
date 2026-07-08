import { useEffect, useState } from "react";
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp, orderBy, writeBatch, updateDoc, getDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trash2, BarChart3, CheckCircle2, XCircle, Clock, Search, Filter, UserPlus, Users, Info, User, Mail, ShieldCheck, Edit3, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, isPast, startOfMonth, endOfMonth, isFuture } from "date-fns";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface Appointment {
    id: string;
    therapistId: string;
    therapistName: string;
    clientId?: string;
    clientName?: string;
    status: string;
    startTimestamp: Timestamp;
    endTimestamp: Timestamp;
    isBooked: boolean;
    appointmentType?: string;
    bookedBy?: string;
}

interface Patient {
    uid: string;
    displayName: string;
    email: string;
    remainingSessions: number;
}

const AdminAppointments = () => {
    const { t } = useTranslation();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [therapists, setTherapists] = useState<{ id: string, name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    
    // Filters state
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [therapistFilter, setTherapistFilter] = useState<string>("all");
    
    // Scheduling state
    const [showScheduleDialog, setShowScheduleDialog] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<Appointment | null>(null);
    const [assignedPatients, setAssignedPatients] = useState<Patient[]>([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [isBooking, setIsBooking] = useState(false);

    // Details & Status Edit state
    const [showDetailsDialog, setShowDetailsDialog] = useState(false);
    const [viewingAppointment, setViewingAppointment] = useState<Appointment | null>(null);
    const [viewingPatient, setViewingPatient] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [newStatus, setNewStatus] = useState<string>("");

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const therapistsQuery = query(collection(db, "users"), where("role", "==", "THERAPIST"));
            const therapistsSnap = await getDocs(therapistsQuery);
            const therapistList = therapistsSnap.docs.map(doc => ({
                id: doc.id,
                name: doc.data().displayName || "Unnamed Therapist"
            })).sort((a, b) => a.name.localeCompare(b.name));
            setTherapists(therapistList);

            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            
            const q = query(
                collection(db, "appointments"),
                where("startTimestamp", ">=", Timestamp.fromDate(threeMonthsAgo)),
                orderBy("startTimestamp", "desc")
            );
            
            const querySnapshot = await getDocs(q);
            const docs = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Appointment[];
            
            setAppointments(docs);
        } catch (error) {
            console.error("Error fetching initial data:", error);
            toast({
                title: "Error",
                description: "Failed to fetch data",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchAssignedPatients = async (therapistId: string) => {
        setLoadingPatients(true);
        try {
            const q = query(
                collection(db, "users"),
                where("role", "==", "PATIENT"),
                where("patientDetails.assignedTherapist", "==", therapistId)
            );
            const querySnapshot = await getDocs(q);
            const patients = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const remainingSessions = data.patientDetails?.quotas?.currentUsage?.remainingLiveSessions || 0;
                return {
                    uid: doc.id,
                    displayName: data.displayName || "Unnamed Patient",
                    email: data.email || "",
                    remainingSessions: remainingSessions
                };
            }).filter(p => p.remainingSessions > 0);
            
            setAssignedPatients(patients);
        } catch (error) {
            console.error("Error fetching patients:", error);
        } finally {
            setLoadingPatients(false);
        }
    };

    const handleOpenSchedule = (e: React.MouseEvent, slot: Appointment) => {
        e.stopPropagation();
        setSelectedSlot(slot);
        fetchAssignedPatients(slot.therapistId);
        setShowScheduleDialog(true);
    };

    const handleSchedulePatient = async (patient: Patient) => {
        if (!selectedSlot) return;
        
        setIsBooking(true);
        try {
            await updateDoc(doc(db, "appointments", selectedSlot.id), {
                status: 'BOOKED',
                isBooked: true,
                bookedBy: patient.uid,
                clientName: patient.displayName,
                appointmentType: 'video',
                updatedAt: Timestamp.now()
            });

            const userRef = doc(db, "users", patient.uid);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data();
            const quotas = userData?.patientDetails?.quotas;
            const planName = quotas?.planName || "";

            if (quotas && !planName.toLowerCase().includes('basic')) {
                const currentRemaining = quotas.currentUsage?.remainingLiveSessions || 0;
                if (currentRemaining > 0) {
                    await updateDoc(userRef, {
                        "patientDetails.quotas.currentUsage.remainingLiveSessions": increment(-1)
                    });
                }
            }

            toast({
                title: "Success",
                description: `Patient ${patient.displayName} scheduled successfully.`
            });
            
            setShowScheduleDialog(false);
            fetchInitialData();
        } catch (error) {
            console.error("Error scheduling patient:", error);
            toast({
                title: "Error",
                description: "Failed to schedule patient",
                variant: "destructive"
            });
        } finally {
            setIsBooking(false);
        }
    };

    const handleViewDetails = async (apt: Appointment) => {
        setViewingAppointment(apt);
        setNewStatus(apt.status);
        setShowDetailsDialog(true);
        setViewingPatient(null);
        
        if (apt.bookedBy) {
            setLoadingDetails(true);
            try {
                const patientDoc = await getDoc(doc(db, "users", apt.bookedBy));
                if (patientDoc.exists()) {
                    setViewingPatient(patientDoc.data());
                }
            } catch (error) {
                console.error("Error fetching patient details:", error);
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const handleUpdateStatus = async () => {
        if (!viewingAppointment || newStatus === viewingAppointment.status) return;
        
        setIsUpdatingStatus(true);
        try {
            const updates: any = {
                status: newStatus,
                updatedAt: Timestamp.now()
            };

            // If changing to AVAILABLE, clear booking info
            if (newStatus === 'AVAILABLE') {
                updates.isBooked = false;
                updates.bookedBy = null;
                updates.clientName = null;
                updates.clientId = null;
            }

            await updateDoc(doc(db, "appointments", viewingAppointment.id), updates);
            
            toast({
                title: "Success",
                description: `Appointment status updated to ${newStatus}.`
            });
            
            setViewingAppointment({ ...viewingAppointment, ...updates });
            fetchInitialData();
        } catch (error) {
            console.error("Error updating status:", error);
            toast({
                title: "Error",
                description: "Failed to update status",
                variant: "destructive"
            });
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    // Filter Logic
    const filteredAppointments = appointments.filter(apt => {
        const aptStatus = apt.status?.toUpperCase();
        const filterStatus = statusFilter?.toUpperCase();
        
        const matchesStatus = statusFilter === "all" || aptStatus === filterStatus;
        const matchesTherapist = therapistFilter === "all" || apt.therapistId === therapistFilter;
        return matchesStatus && matchesTherapist;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const paginatedAppointments = filteredAppointments.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, therapistFilter]);

    // Analytics Calculations (Reflect Filters)
    const currentMonth = new Date();
    const currentMonthStart = startOfMonth(currentMonth);
    const currentMonthEnd = endOfMonth(currentMonth);

    const analyticsBase = appointments.filter(apt => {
        const date = apt.startTimestamp.toDate();
        const isInMonth = date >= currentMonthStart && date <= currentMonthEnd;
        const matchesTherapist = therapistFilter === "all" || apt.therapistId === therapistFilter;
        return isInMonth && matchesTherapist;
    });

    const pastUnsoldAppointments = appointments.filter(apt => 
        !apt.isBooked && 
        apt.status === 'AVAILABLE' && 
        isPast(apt.startTimestamp.toDate())
    );

    const totalApts = analyticsBase.length;
    const bookedApts = analyticsBase.filter(a => a.status?.toUpperCase() === 'BOOKED' || a.status?.toUpperCase() === 'IN_PROGRESS').length;
    const availableApts = analyticsBase.filter(a => a.status?.toUpperCase() === 'AVAILABLE').length;
    const completedApts = analyticsBase.filter(a => a.status?.toUpperCase() === 'COMPLETED').length;

    const fulfillmentRatio = totalApts > 0 ? (bookedApts / totalApts) * 100 : 0;

    const handleClearPastUnsold = async () => {
        if (pastUnsoldAppointments.length === 0) return;
        
        setIsDeleting(true);
        try {
            const batch = writeBatch(db);
            const toDelete = pastUnsoldAppointments.slice(0, 500);
            
            toDelete.forEach(apt => {
                batch.delete(doc(db, "appointments", apt.id));
            });
            
            await batch.commit();
            
            toast({
                title: "Success",
                description: `Cleared ${toDelete.length} past unfulfilled appointments.`
            });
            
            fetchInitialData();
            setShowDeleteConfirm(false);
        } catch (error) {
            console.error("Error deleting appointments:", error);
            toast({
                title: "Error",
                description: "Failed to clear appointments",
                variant: "destructive"
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteIndividual = async (e: React.MouseEvent, apt: Appointment) => {
        e.stopPropagation();
        
        const message = apt.isBooked 
            ? `Warning: This appointment is currently BOOKED by ${apt.clientName || 'a patient'}. Deleting it will purge the record. Are you sure?`
            : "Are you sure you want to delete this appointment slot?";

        if (!window.confirm(message)) return;
        
        try {
            await deleteDoc(doc(db, "appointments", apt.id));
            toast({
                title: "Success",
                description: "Appointment slot deleted successfully."
            });
            fetchInitialData();
        } catch (error) {
            console.error("Error deleting appointment:", error);
            toast({
                title: "Error",
                description: "Failed to delete appointment",
                variant: "destructive"
            });
        }
    };

    const getStatusBadge = (status: string, isBooked: boolean, startTimestamp: Timestamp) => {
        const s = status?.toUpperCase();
        if (s === 'COMPLETED') return <Badge className="bg-gray-100 text-gray-700">Completed</Badge>;
        if (s === 'CANCELLED') return <Badge variant="destructive">Cancelled</Badge>;
        if (s === 'IN_PROGRESS') return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress</Badge>;
        if (s === 'AVAILABLE' && !isBooked) {
            if (isPast(startTimestamp.toDate())) {
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Past Unsold</Badge>;
            }
            return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Available</Badge>;
        }
        if (s === 'BOOKED' || isBooked) return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Booked</Badge>;
        return <Badge variant="secondary">{status}</Badge>;
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-kalnia text-[#508C96] mb-2">Appointment Management</h1>
                    <p className="text-gray-500 font-shippori">Monitor fulfillment ratios and manage appointment inventory.</p>
                </div>
                
                <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                    <DialogTrigger asChild>
                        <Button 
                            variant="outline" 
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={pastUnsoldAppointments.length === 0}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Clear Past Unsold ({pastUnsoldAppointments.length})
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Clear Past Appointments?</DialogTitle>
                            <DialogDescription>
                                This will permanently delete {pastUnsoldAppointments.length} AVAILABLE slots from the past. 
                                Booked, cancelled, and completed appointments will be preserved for history.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                            <Button 
                                variant="destructive" 
                                onClick={handleClearPastUnsold}
                                disabled={isDeleting}
                            >
                                {isDeleting ? "Deleting..." : "Confirm Delete"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Analytics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2 bg-[#f0f7f8]/50 p-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                            <BarChart3 className="w-3 h-3 text-[#508C96]" />
                            Fulfillment
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 p-4">
                        <div className="text-xl font-bold text-[#508C96]">{fulfillmentRatio.toFixed(1)}%</div>
                        <p className="text-[9px] text-gray-400 mt-1">Booked vs Total</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2 bg-blue-50/50 p-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3 text-blue-400" />
                            Booked
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 p-4">
                        <div className="text-xl font-bold text-blue-600">{bookedApts}</div>
                        <p className="text-[9px] text-gray-400 mt-1">Active bookings</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2 bg-purple-50/50 p-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                            <ShieldCheck className="w-3 h-3 text-purple-400" />
                            Completed
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 p-4">
                        <div className="text-xl font-bold text-purple-600">{completedApts}</div>
                        <p className="text-[9px] text-gray-400 mt-1">Finished sessions</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2 bg-green-50/50 p-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                            <Clock className="w-3 h-3 text-green-400" />
                            Inventory
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 p-4">
                        <div className="text-xl font-bold text-green-600">{availableApts}</div>
                        <p className="text-[9px] text-gray-400 mt-1">Open slots left</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters Section */}
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="space-y-2 min-w-[200px]">
                            <label className="text-xs font-medium text-gray-500 flex items-center gap-2">
                                <Filter className="w-3 h-3" /> Status
                            </label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="AVAILABLE">Available</SelectItem>
                                    <SelectItem value="BOOKED">Booked</SelectItem>
                                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 min-w-[250px]">
                            <label className="text-xs font-medium text-gray-500 flex items-center gap-2">
                                <Users className="w-3 h-3" /> Therapist
                            </label>
                            <Select value={therapistFilter} onValueChange={setTherapistFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Therapists" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Therapists</SelectItem>
                                    {therapists.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end self-end pb-1">
                            <Button 
                                variant="ghost" 
                                className="text-gray-400 hover:text-[#508C96] text-xs h-9"
                                onClick={() => {
                                    setStatusFilter("all");
                                    setTherapistFilter("all");
                                }}
                            >
                                Reset Filters
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Appointment List */}
            <Card className="border-none shadow-sm bg-white">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-kalnia text-[#508C96]">Recent Appointments</CardTitle>
                    <Badge variant="secondary" className="font-normal">{filteredAppointments.length} Results</Badge>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead>Date & Time</TableHead>
                                            <TableHead>Therapist</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedAppointments.map((apt) => (
                                            <TableRow 
                                                key={apt.id} 
                                                className="group hover:bg-[#f0f7f8]/30 transition-colors cursor-pointer"
                                                onClick={() => handleViewDetails(apt)}
                                            >
                                                <TableCell className="font-medium py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-gray-900">{format(apt.startTimestamp.toDate(), 'PPP')}</span>
                                                        <span className="text-xs text-gray-500">{format(apt.startTimestamp.toDate(), 'p')} - {format(apt.endTimestamp.toDate(), 'p')}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-600">{apt.therapistName}</TableCell>
                                                <TableCell>{getStatusBadge(apt.status, apt.isBooked, apt.startTimestamp)}</TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {apt.status === 'AVAILABLE' && !apt.isBooked && isFuture(apt.startTimestamp.toDate()) && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost" 
                                                                className="text-[#508C96] hover:bg-[#508C96] hover:text-white"
                                                                onClick={(e) => handleOpenSchedule(e, apt)}
                                                            >
                                                                <UserPlus className="w-4 h-4 mr-2" />
                                                                Schedule
                                                            </Button>
                                                        )}
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            className="text-gray-400 hover:text-[#508C96]"
                                                        >
                                                            <span className="sr-only">Details</span>
                                                            <Info className="w-4 h-4" />
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            className="text-red-500 hover:bg-red-50"
                                                            onClick={(e) => handleDeleteIndividual(e, apt)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {paginatedAppointments.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-12 text-gray-400">
                                                    No appointments match your filters.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                                    <p className="text-xs text-gray-500">
                                        Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAppointments.length)}</span> of <span className="font-medium">{filteredAppointments.length}</span> results
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="h-8 w-8 p-0"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <div className="text-xs font-medium text-gray-600 mx-2">
                                            Page {currentPage} of {totalPages}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="h-8 w-8 p-0"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Manual Scheduling Dialog */}
            <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                <DialogContent className="max-w-xl w-[calc(100vw-2rem)] sm:w-full">
                    <DialogHeader>
                        <DialogTitle>Manual Appointment Scheduling</DialogTitle>
                        <DialogDescription>
                            Schedule an assigned patient for this slot on {selectedSlot && format(selectedSlot.startTimestamp.toDate(), 'PPP p')}.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <h4 className="text-sm font-medium text-gray-700">Patients Assigned to {selectedSlot?.therapistName}</h4>
                        {loadingPatients ? (
                            <div className="flex justify-center py-4">
                                <div className="animate-spin h-5 w-5 border-2 border-[#92C7CF] rounded-full border-t-transparent"></div>
                            </div>
                        ) : assignedPatients.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                {assignedPatients.map(patient => (
                                    <div 
                                        key={patient.uid} 
                                        className="flex items-center justify-between gap-4 p-3 border rounded-lg hover:border-[#508C96] hover:bg-[#f0f7f8]/30 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="min-w-0">
                                                <p className="font-medium text-gray-900">{patient.displayName}</p>
                                                <p className="text-xs text-gray-500 truncate">{patient.email}</p>
                                            </div>
                                            <Badge variant="secondary" className="shrink-0 whitespace-nowrap bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
                                                {patient.remainingSessions} {patient.remainingSessions === 1 ? 'Session' : 'Sessions'} Left
                                            </Badge>
                                        </div>
                                        <Button 
                                            size="sm" 
                                            className="bg-[#508C96] hover:bg-[#2C5F69]"
                                            disabled={isBooking}
                                            onClick={() => handleSchedulePatient(patient)}
                                        >
                                            Schedule
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 bg-gray-50 rounded-lg">
                                <p className="text-sm text-gray-500">No patients are currently assigned to this therapist.</p>
                            </div>
                        ) }
                    </div>
                    
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Appointment Details Dialog */}
            <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-kalnia text-[#508C96]">Appointment Details</DialogTitle>
                        <DialogDescription>Full record of the selected appointment slot.</DialogDescription>
                    </DialogHeader>

                    {viewingAppointment && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                        <Calendar className="w-3 h-3" /> Schedule Info
                                    </h4>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-gray-900">{format(viewingAppointment.startTimestamp.toDate(), 'PPPP')}</p>
                                        <p className="text-sm text-gray-500">
                                            {format(viewingAppointment.startTimestamp.toDate(), 'p')} - {format(viewingAppointment.endTimestamp.toDate(), 'p')}
                                        </p>
                                        <div className="pt-1">
                                            {getStatusBadge(viewingAppointment.status, viewingAppointment.isBooked, viewingAppointment.startTimestamp)}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                        <Edit3 className="w-3 h-3" /> Administrative Actions
                                    </h4>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-gray-400 uppercase font-bold">Update Status</label>
                                        <div className="flex gap-2">
                                            <Select value={newStatus} onValueChange={setNewStatus}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="AVAILABLE">Available</SelectItem>
                                                    <SelectItem value="BOOKED">Booked</SelectItem>
                                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                                    <SelectItem value="completed">Completed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button 
                                                size="sm" 
                                                className="bg-[#508C96] hover:bg-[#2C5F69]"
                                                disabled={isUpdatingStatus || newStatus === viewingAppointment.status}
                                                onClick={handleUpdateStatus}
                                            >
                                                {isUpdatingStatus ? "..." : "Save"}
                                            </Button>
                                        </div>
                                        <p className="text-[9px] text-gray-400 italic leading-tight">
                                            Changing to 'Available' will clear all booking information.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                        <User className="w-3 h-3" /> Patient Information
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                        <ShieldCheck className="w-3 h-3" /> {viewingAppointment.therapistName}
                                    </div>
                                </div>
                                
                                {viewingAppointment.isBooked ? (
                                    loadingDetails ? (
                                        <div className="flex justify-center py-4">
                                            <div className="animate-spin h-5 w-5 border-2 border-[#92C7CF] rounded-full border-t-transparent"></div>
                                        </div>
                                    ) : viewingPatient ? (
                                        <div className="bg-[#f0f7f8]/30 rounded-xl p-4 border border-[#508C96]/10 space-y-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-[#508C96] flex items-center justify-center text-white text-lg font-bold">
                                                        {viewingPatient.displayName?.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900">{viewingPatient.displayName}</p>
                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                            <Mail className="w-3 h-3" /> {viewingPatient.email}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[#508C96] border-[#508C96]">
                                                    {viewingPatient.patientDetails?.quotas?.planName || 'No Plan'}
                                                </Badge>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-3 bg-white rounded-lg border border-gray-100">
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Remaining Sessions</p>
                                                    <p className="text-lg font-bold text-[#508C96]">
                                                        {viewingPatient.patientDetails?.quotas?.currentUsage?.remainingLiveSessions || 0}
                                                    </p>
                                                </div>
                                                <div className="p-3 bg-white rounded-lg border border-gray-100">
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Appointment Type</p>
                                                    <p className="text-lg font-bold text-gray-700 capitalize">
                                                        {viewingAppointment.appointmentType || 'Video'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg flex items-center gap-2">
                                            <Info className="w-4 h-4" />
                                            Patient profile not found in database.
                                        </div>
                                    )
                                ) : (
                                    <div className="text-sm text-gray-400 italic py-2">
                                        This is an available slot. No patient has booked it yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminAppointments;
