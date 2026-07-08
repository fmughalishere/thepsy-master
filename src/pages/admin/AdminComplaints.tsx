import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent
} from "@/components/ui/card";
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertCircle,
    CheckCircle,
    MoreVertical,
    Flag,
    UserX,
    UserCheck,
    Loader2
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { reportService, Report } from "@/services/reportService";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import { enUS, de as deLocale, el as elLocale, hr as hrLocale } from "date-fns/locale";
import type { Locale } from "date-fns";
import { useTranslation } from "react-i18next";

const localeMap: Record<string, Locale> = {
    en: enUS,
    de: deLocale,
    el: elLocale,
    hr: hrLocale
};

const AdminComplaints = () => {
    const navigate = useNavigate();
    const { currentUser: user } = useAuth();
    const { toast } = useToast();
    const { t, i18n } = useTranslation();

    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [hasMore, setHasMore] = useState(false);

    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const localeKey = i18n.language?.split("-")[0] || "en";
    const dateLocale = localeMap[localeKey as keyof typeof localeMap] ?? enUS;

    const formatTimestamp = (timestamp?: { toDate?: () => Date }) => {
        if (!timestamp?.toDate) {
            return t('admin.complaints.fallback.unknown_time');
        }
        return formatDistanceToNow(timestamp.toDate(), { addSuffix: true, locale: dateLocale });
    };

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        try {
            setLoading(true);
            const data = await reportService.getReports();
            setReports(data.reports);
            setLastDoc(data.lastDoc);
            setHasMore(data.hasMore);
        } catch (error) {
            console.error(error);
            toast({
                title: t('admin.complaints.messages.error_title'),
                description: t('admin.complaints.messages.error_load'),
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const loadMore = async () => {
        if (!hasMore || loadingMore) return;

        try {
            setLoadingMore(true);
            const data = await reportService.getReports(lastDoc);
            setReports(prev => [...prev, ...data.reports]);
            setLastDoc(data.lastDoc);
            setHasMore(data.hasMore);
        } catch (error) {
            console.error(error);
            toast({
                title: t('admin.complaints.messages.error_title'),
                description: t('admin.complaints.messages.error_load_more'),
                variant: "destructive"
            });
        } finally {
            setLoadingMore(false);
        }
    };

    const handleResolve = async (reportId: string) => {
        if (!user) return;
        try {
            setActionLoading(true);
            await reportService.resolveReport(reportId, user.uid);

            // Update UI locally
            setReports(prev => prev.map(r =>
                r.id === reportId ? { ...r, status: "RESOLVED", resolvedBy: user.uid } : r
            ));

            if (selectedReport?.id === reportId) {
                setSelectedReport(prev => prev ? { ...prev, status: "RESOLVED", resolvedBy: user.uid } : null);
            }

            toast({
                title: t('admin.complaints.messages.success_title'),
                description: t('admin.complaints.messages.success_resolve'),
            });
        } catch (error) {
            toast({
                title: t('admin.complaints.messages.error_title'),
                description: t('admin.complaints.messages.error_resolve'),
                variant: "destructive"
            });
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleBlock = async (userId: string, currentStatus: boolean, userType: 'reporter' | 'reported') => {
        if (!user) return;
        try {
            setActionLoading(true);
            const newStatus = await reportService.toggleUserBlockStatus(userId, currentStatus, user.uid);

            // Update UI locally (update all reports involving this user)
            setReports(prev => prev.map(r => {
                let updated = { ...r };
                if (r.reporter?.uid === userId) {
                    updated.reporter = { ...r.reporter!, isBlocked: newStatus };
                }
                if (r.reportedUser?.uid === userId) {
                    updated.reportedUser = { ...r.reportedUser!, isBlocked: newStatus };
                }
                return updated;
            }));

            if (selectedReport) {
                const updatedSelected = { ...selectedReport };
                if (selectedReport.reporter?.uid === userId) {
                    updatedSelected.reporter = { ...selectedReport.reporter!, isBlocked: newStatus };
                }
                if (selectedReport.reportedUser?.uid === userId) {
                    updatedSelected.reportedUser = { ...selectedReport.reportedUser!, isBlocked: newStatus };
                }
                setSelectedReport(updatedSelected);
            }

            toast({
                title: newStatus ? t('admin.complaints.messages.success_block') : t('admin.complaints.messages.success_unblock'),
                description: newStatus ? t('admin.complaints.messages.success_block_desc') : t('admin.complaints.messages.success_unblock_desc'),
            });
        } catch (error) {
            toast({
                title: t('admin.complaints.messages.error_title'),
                description: t('admin.complaints.messages.error_block'),
                variant: "destructive"
            });
        } finally {
            setActionLoading(false);
        }
    };

    const openDetails = (report: Report) => {
        setSelectedReport(report);
        setIsDetailsOpen(true);
    };

    const getCategoryColor = (category?: string) => {
        switch (category) {
            case "INAPPROPRIATE_BEHAVIOR": return "bg-orange-100 text-orange-800";
            case "HARASSMENT": return "bg-red-100 text-red-800";
            case "SPAM": return "bg-yellow-100 text-yellow-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    const formatEnumLabel = (value?: string, fallbackKey?: string) => {
        if (!value) {
            return fallbackKey ? t(fallbackKey) : "";
        }
        return value.replace(/_/g, " ");
    };

    const getCategoryLabel = (category?: string) => {
        const fallback = formatEnumLabel(category, 'admin.complaints.fallback.unknown_category');
        if (!category) return fallback;
        return t(`report.categories.${category.toLowerCase()}`, fallback);
    };

    const getSubcategoryLabel = (subcategory?: string) => {
        const fallback = formatEnumLabel(subcategory, 'admin.complaints.fallback.unknown_subcategory');
        if (!subcategory) return fallback;
        return t(`report.subcategories.${subcategory.toLowerCase()}`, fallback);
    };

    return (
        <div className="max-w-6xl mx-auto p-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.complaints.title')}</h1>
                    <p className="text-sm text-gray-500 font-shippori">{t('admin.complaints.subtitle')}</p>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('admin.complaints.table.status')}</TableHead>
                                <TableHead>{t('admin.complaints.table.category')}</TableHead>
                                <TableHead>{t('admin.complaints.table.reported_user')}</TableHead>
                                <TableHead>{t('admin.complaints.table.reporter')}</TableHead>
                                <TableHead>{t('admin.complaints.table.date')}</TableHead>
                                <TableHead className="text-right">{t('admin.complaints.table.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        <p className="mt-2 text-gray-500">{t('admin.complaints.loading')}</p>
                                    </TableCell>
                                </TableRow>
                            ) : reports.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                        {t('admin.complaints.empty')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                reports.map((report) => (
                                    <TableRow key={report.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openDetails(report)}>
                                        <TableCell>
                                            {report.status === "RESOLVED" ? (
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                                                    <CheckCircle className="h-3 w-3" /> {t('admin.complaints.status.resolved')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                                                    <AlertCircle className="h-3 w-3" /> {t('admin.complaints.status.pending')}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className={getCategoryColor(report.category)}>
                                                {getCategoryLabel(report.category)}
                                            </Badge>
                                            <div className="text-xs text-gray-500 mt-1">{getSubcategoryLabel(report.subcategory)}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={report.reportedUser?.photoUrl} />
                                                    <AvatarFallback>{report.reportedUser?.displayName?.charAt(0) || t('admin.complaints.fallback.initial')}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium text-sm">{report.reportedUser?.displayName || t('admin.complaints.fallback.unknown_user')}</div>
                                                    {report.reportedUser?.isBlocked && (
                                                        <span className="text-xs text-red-600 font-bold bg-red-100 px-1 rounded">{t('admin.complaints.labels.blocked')}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">{report.reporter?.displayName || t('admin.complaints.fallback.unknown_user')}</div>
                                            <div className="text-xs text-gray-500">{report.reporter?.email || t('admin.complaints.fallback.unknown_email')}</div>
                                        </TableCell>
                                        <TableCell className="text-gray-500 text-sm">
                                            {formatTimestamp(report.timestamp)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDetails(report); }}>
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {
                hasMore && (
                    <div className="flex justify-center mt-6">
                        <Button
                            variant="outline"
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="w-full max-w-xs"
                        >
                            {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('admin.complaints.actions.load_more')}
                        </Button>
                    </div>
                )
            }

            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            <Flag className="h-5 w-5 text-red-500" />
                            {t('admin.complaints.details.title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.complaints.details.submitted')} {selectedReport ? formatTimestamp(selectedReport.timestamp) : t('admin.complaints.fallback.unknown_time')}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedReport && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500 mb-1">{t('admin.complaints.table.category')}</h4>
                                    <div className="flex flex-col gap-1">
                                        <Badge variant="secondary" className={`w-fit ${getCategoryColor(selectedReport.category)}`}>
                                            {getCategoryLabel(selectedReport.category)}
                                        </Badge>
                                        <span className="text-sm text-gray-700">{getSubcategoryLabel(selectedReport.subcategory)}</span>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-500 mb-1">{t('admin.complaints.table.status')}</h4>
                                    {selectedReport.status === "RESOLVED" ? (
                                        <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1 rounded-full w-fit">
                                            <CheckCircle className="h-4 w-4" />
                                            <span className="font-medium">{t('admin.complaints.status.resolved')}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-1 rounded-full w-fit">
                                            <AlertCircle className="h-4 w-4" />
                                            <span className="font-medium">{t('admin.complaints.status.pending_review')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">{t('admin.complaints.details.message')}</h4>
                                <p className="text-gray-800 whitespace-pre-wrap">{selectedReport.message}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Reported User Card */}
                                <Card className="border-red-100 bg-red-50/30">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-red-800">{t('admin.complaints.details.offender')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-3 mb-4">
                                            <Avatar className="h-12 w-12">
                                                <AvatarImage src={selectedReport.reportedUser?.photoUrl} />
                                                <AvatarFallback>{selectedReport.reportedUser?.displayName?.charAt(0) || t('admin.complaints.fallback.initial')}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-bold text-gray-900">{selectedReport.reportedUser?.displayName || t('admin.complaints.fallback.unknown_user')}</p>
                                                <p className="text-xs text-gray-500">{selectedReport.reportedUser?.email || t('admin.complaints.fallback.unknown_email')}</p>
                                            </div>
                                        </div>

                                        {selectedReport.reportedUser ? (
                                            <Button
                                                variant={selectedReport.reportedUser.isBlocked ? "outline" : "destructive"}
                                                className="w-full"
                                                onClick={() => handleToggleBlock(selectedReport.reportedUser!.uid, !!selectedReport.reportedUser!.isBlocked, 'reported')}
                                                disabled={actionLoading}
                                            >
                                                {selectedReport.reportedUser.isBlocked ? (
                                                    <><UserCheck className="mr-2 h-4 w-4" /> {t('admin.complaints.actions.unblock')}</>
                                                ) : (
                                                    <><UserX className="mr-2 h-4 w-4" /> {t('admin.complaints.actions.block')}</>
                                                )}
                                            </Button>
                                        ) : (
                                            <Button disabled variant="outline" className="w-full">{t('admin.complaints.actions.user_not_found')}</Button>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Reporter Card */}
                                <Card className="border-gray-100">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-gray-500">{t('admin.complaints.details.victim')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-3 mb-4">
                                            <Avatar className="h-12 w-12">
                                                <AvatarImage src={selectedReport.reporter?.photoUrl} />
                                                <AvatarFallback>{selectedReport.reporter?.displayName?.charAt(0) || t('admin.complaints.fallback.initial')}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-bold text-gray-900">{selectedReport.reporter?.displayName || t('admin.complaints.fallback.unknown_user')}</p>
                                                <p className="text-xs text-gray-500">{selectedReport.reporter?.email || t('admin.complaints.fallback.unknown_email')}</p>
                                            </div>
                                        </div>

                                        {/* Optional: Block reporter if needed, usually not major action here */}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>{t('admin.complaints.actions.close')}</Button>
                        {selectedReport && selectedReport.status !== "RESOLVED" && (
                            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleResolve(selectedReport.id)} disabled={actionLoading}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                {t('admin.complaints.actions.mark_resolved')}
                            </Button>
                        )}
                        {selectedReport && selectedReport.status === "RESOLVED" && (
                            <Button disabled variant="ghost" className="text-green-700">
                                <CheckCircle className="mr-2 h-4 w-4" />
                                {t('admin.complaints.status.resolved')}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default AdminComplaints;
