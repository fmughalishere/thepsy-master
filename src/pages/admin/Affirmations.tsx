import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Calendar as CalendarIcon, Copy, Upload, Send, Edit, Download } from "lucide-react";
import { format, addDays } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, de as deLocale, el as elLocale, hr as hrLocale } from "date-fns/locale";
import { Affirmation } from "@/types/affirmation";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

const localeMap: Record<string, Locale> = {
    en: enUS,
    de: deLocale,
    el: elLocale,
    hr: hrLocale,
};

const Affirmations = () => {
    const { t, i18n } = useTranslation();
    const [affirmations, setAffirmations] = useState<Affirmation[]>([]);
    const [newText, setNewText] = useState("");
    const [newTextDe, setNewTextDe] = useState("");
    const [newTextEl, setNewTextEl] = useState("");
    const [newTextHr, setNewTextHr] = useState("");
    const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [isLoading, setIsLoading] = useState(false);
    const [pastedJson, setPastedJson] = useState("");
    const [editingAffirmation, setEditingAffirmation] = useState<Affirmation | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const localeKey = i18n.language?.split("-")[0] || "en";
    const dateLocale = localeMap[localeKey as keyof typeof localeMap] ?? enUS;

    const formatAffirmationDate = (value?: string) => {
        if (!value) {
            return t('admin.affirmations.messages.invalid_date');
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return t('admin.affirmations.messages.invalid_date');
        }
        return format(parsed, "PPP", { locale: dateLocale });
    };

    useEffect(() => {
        const q = query(collection(db, "affirmations"), orderBy("date", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const affirmationsData = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Affirmation[];
            setAffirmations(affirmationsData);
        });

        return () => unsubscribe();
    }, []);

    const handleCopyTemplate = () => {
        const template = [
            {
                text: t('admin.affirmations.bulk.template_example.text'),
                text_de: t('admin.affirmations.bulk.template_example.text_de'),
                text_el: t('admin.affirmations.bulk.template_example.text_el'),
                text_hr: t('admin.affirmations.bulk.template_example.text_hr'),
                date: format(new Date(), "yyyy-MM-dd")
            }
        ];
        navigator.clipboard.writeText(JSON.stringify(template, null, 2));
        toast({
            title: t('admin.affirmations.messages.template_copied_title'),
            description: t('admin.affirmations.messages.template_copied_desc'),
        });
    };

    const handleDownloadJson = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(affirmations, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "affirmations.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleProcessJson = async (json: any) => {
        try {
            if (!Array.isArray(json)) throw new Error("Invalid format: Root must be an array");

            setIsLoading(true);

            // Determine start date
            let currentDate = new Date();
            if (affirmations.length > 0) {
                // affirmations are sorted desc by date, so [0] is the latest
                const latestDate = new Date(affirmations[0].date);
                if (!isNaN(latestDate.getTime())) {
                    currentDate = addDays(latestDate, 1);
                }
            }

            let addedCount = 0;
            for (const item of json) {
                if (!item.text) continue;

                // Use date from JSON if provided and valid, otherwise fallback to currentDate auto-increment
                let dateStr = item.date;
                if (!dateStr || isNaN(new Date(dateStr).getTime())) {
                    dateStr = format(currentDate, "yyyy-MM-dd");
                    currentDate = addDays(currentDate, 1);
                }

                await addDoc(collection(db, "affirmations"), {
                    text: item.text,
                    text_de: item.text_de || item.text,
                    text_el: item.text_el || item.text,
                    text_hr: item.text_hr || item.text,
                    date: dateStr,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    isActive: true,
                });

                addedCount++;
            }

            toast({
                title: t('admin.affirmations.messages.success_title'),
                description: t('admin.affirmations.messages.success_bulk', { count: addedCount }),
            });
            return true;
        } catch (error) {
            console.error("Error processing affirmations:", error);
            toast({
                title: t('admin.affirmations.messages.error_title'),
                description: t('admin.affirmations.messages.error_bulk'),
                variant: "destructive",
            });
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                await handleProcessJson(json);
            } catch (error) {
                toast({
                    title: t('admin.affirmations.messages.invalid_json'),
                    description: t('admin.affirmations.messages.invalid_json_desc'),
                    variant: "destructive",
                });
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handlePublishPastedJson = async () => {
        if (!pastedJson.trim()) {
            toast({
                title: t('admin.affirmations.messages.empty_content'),
                description: t('admin.affirmations.messages.empty_content_desc'),
                variant: "destructive",
            });
            return;
        }

        try {
            const json = JSON.parse(pastedJson);
            const success = await handleProcessJson(json);
            if (success) {
                setPastedJson("");
            }
        } catch (error) {
            toast({
                title: t('admin.affirmations.messages.invalid_json'),
                description: t('admin.affirmations.messages.malformed_json_desc'),
                variant: "destructive",
            });
        }
    };

    const handleUpdateAffirmation = async () => {
        if (!editingAffirmation) return;
        if (!editingAffirmation.text.trim() || !editingAffirmation.text_de?.trim() || !editingAffirmation.text_el?.trim() || !editingAffirmation.text_hr?.trim()) {
            toast({
                title: t('admin.affirmations.messages.error_title'),
                description: t('admin.affirmations.messages.missing_fields'),
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const { id, ...updateData } = editingAffirmation;
            const docRef = doc(db, "affirmations", id);
            await updateDoc(docRef, {
                ...updateData,
                updatedAt: Timestamp.now(),
            });

            toast({
                title: t('admin.affirmations.messages.success_title'),
                description: t('admin.affirmations.messages.success_update'),
            });
            setIsEditDialogOpen(false);
            setEditingAffirmation(null);
        } catch (error) {
            console.error("Error updating affirmation:", error);
            toast({
                title: t('admin.affirmations.messages.error_title'),
                description: t('admin.affirmations.messages.error_update'),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditClick = (affirmation: Affirmation) => {
        setEditingAffirmation({ ...affirmation });
        setIsEditDialogOpen(true);
    };

    const handleAddAffirmation = async () => {
        if (!newText.trim() || !newTextDe.trim() || !newTextEl.trim() || !newTextHr.trim()) {
            toast({
                title: t('admin.affirmations.messages.error_title'),
                description: t('admin.affirmations.messages.missing_fields'),
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const newAffirmation: Omit<Affirmation, "id"> = {
                text: newText,
                text_de: newTextDe,
                text_el: newTextEl,
                text_hr: newTextHr,
                date: newDate,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                isActive: true,
            };

            await addDoc(collection(db, "affirmations"), newAffirmation);
            setNewText("");
            setNewTextDe("");
            setNewTextEl("");
            setNewTextHr("");
            toast({
                title: t('admin.affirmations.messages.success_title'),
                description: t('admin.affirmations.messages.success_add'),
            });
        } catch (error) {
            console.error("Error adding affirmation:", error);
            toast({
                title: t('admin.affirmations.messages.error_title'),
                description: t('admin.affirmations.messages.error_add'),
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAffirmation = async (id: string) => {
        if (window.confirm(t('admin.affirmations.messages.confirm_delete'))) {
            try {
                await deleteDoc(doc(db, "affirmations", id));
                toast({
                    title: t('admin.affirmations.messages.success_title'),
                    description: t('admin.affirmations.messages.success_delete'),
                });
            } catch (error) {
                console.error("Error deleting affirmation:", error);
                toast({
                    title: t('admin.affirmations.messages.error_title'),
                    description: t('admin.affirmations.messages.error_delete'),
                    variant: "destructive",
                });
            }
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-6 lg:px-12 lg:py-10 space-y-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.affirmations.title')}</h1>
                    <p className="text-sm text-gray-500 font-shippori">{t('admin.affirmations.subtitle', 'Manage daily affirmations')}</p>
                </div>
            </div>

            <Tabs defaultValue="list" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8">
                    <TabsTrigger value="list">{t('admin.affirmations.tabs.list')}</TabsTrigger>
                    <TabsTrigger value="upload">{t('admin.affirmations.tabs.upload')}</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-6 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('admin.affirmations.all')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                             <TableHead className="min-w-[220px]">{t('admin.affirmations.table.date')}</TableHead>
                                            <TableHead>{t('admin.affirmations.table.affirmation')}</TableHead>
                                            <TableHead className="w-[100px] text-right">{t('admin.affirmations.table.actions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {affirmations.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                                                    {t('admin.affirmations.empty')}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            affirmations.map((affirmation) => (
                                                <TableRow key={affirmation.id}>
                                                    <TableCell className="font-medium">
                                                        {formatAffirmationDate(affirmation.date)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {(() => {
                                                            const lang = i18n.language || 'en';
                                                            if (lang.startsWith('de')) return affirmation.text_de || affirmation.text;
                                                            if (lang.startsWith('el')) return affirmation.text_el || affirmation.text;
                                                            if (lang.startsWith('hr')) return affirmation.text_hr || affirmation.text;
                                                            return affirmation.text;
                                                        })()}
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleEditClick(affirmation)}
                                                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDeleteAffirmation(affirmation.id)}
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="upload" className="space-y-6 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('admin.affirmations.bulk.title')}</CardTitle>
                            <CardDescription>{t('admin.affirmations.bulk.description')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <Button variant="outline" onClick={handleCopyTemplate} className="w-full sm:w-auto">
                                    <Copy className="w-4 h-4 mr-2" />
                                    {t('admin.affirmations.bulk.copy_template')}
                                </Button>
                                <Button variant="outline" onClick={handleDownloadJson} className="w-full sm:w-auto" disabled={affirmations.length === 0}>
                                    <Download className="w-4 h-4 mr-2" />
                                    {t('admin.affirmations.bulk.download_json')}
                                </Button>
                                <div className="relative w-full sm:w-auto">
                                    <input
                                        type="file"
                                        accept=".json"
                                        onChange={handleFileUpload}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        disabled={isLoading}
                                    />
                                    <Button variant="default" className="w-full bg-[#92C7CF] hover:bg-[#1f454d]" disabled={isLoading}>
                                        <Upload className="w-4 h-4 mr-2" />
                                        {isLoading ? t('admin.affirmations.bulk.uploading') : t('admin.affirmations.bulk.upload_file')}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.bulk.paste_label')}</label>
                                <Textarea
                                    placeholder={t('admin.affirmations.bulk.json_placeholder')}
                                    value={pastedJson}
                                    onChange={(e) => setPastedJson(e.target.value)}
                                    rows={6}
                                    className="font-mono text-sm"
                                    disabled={isLoading}
                                />
                                <Button
                                    onClick={handlePublishPastedJson}
                                    disabled={isLoading || !pastedJson.trim()}
                                    className="w-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    {isLoading ? t('admin.affirmations.bulk.publishing') : t('admin.affirmations.bulk.publish')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('admin.affirmations.add_new')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col md:flex-row gap-6 items-start">
                                <div className="w-full md:w-1/3 xl:w-1/4 space-y-2">
                                    <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.date')}</label>
                                    <div className="relative">
                                        <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <Input
                                            type="date"
                                            value={newDate}
                                            onChange={(e) => setNewDate(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>
                                <div className="w-full md:flex-1 grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.english')}</label>
                                        <Textarea
                                            placeholder={t('admin.affirmations.placeholders.text')}
                                            value={newText}
                                            onChange={(e) => setNewText(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.german')}</label>
                                        <Textarea
                                            placeholder={t('admin.affirmations.placeholders.text_de')}
                                            value={newTextDe}
                                            onChange={(e) => setNewTextDe(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.greek')}</label>
                                        <Textarea
                                            placeholder={t('admin.affirmations.placeholders.text_el')}
                                            value={newTextEl}
                                            onChange={(e) => setNewTextEl(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.croatian')}</label>
                                        <Textarea
                                            placeholder={t('admin.affirmations.placeholders.text_hr')}
                                            value={newTextHr}
                                            onChange={(e) => setNewTextHr(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                </div>
                                <Button
                                    onClick={handleAddAffirmation}
                                    disabled={isLoading}
                                    className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white self-center md:self-end mb-1"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('admin.affirmations.actions.add')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Edit Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{t('admin.affirmations.edit_dialog.title')}</DialogTitle>
                    </DialogHeader>
                    {editingAffirmation && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.date')}</label>
                                <Input
                                    type="date"
                                    value={editingAffirmation.date}
                                    onChange={(e) => setEditingAffirmation({ ...editingAffirmation, date: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.english')}</label>
                                <Textarea
                                    value={editingAffirmation.text}
                                    onChange={(e) => setEditingAffirmation({ ...editingAffirmation, text: e.target.value })}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.german')}</label>
                                <Textarea
                                    value={editingAffirmation.text_de}
                                    onChange={(e) => setEditingAffirmation({ ...editingAffirmation, text_de: e.target.value })}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.greek')}</label>
                                <Textarea
                                    value={editingAffirmation.text_el}
                                    onChange={(e) => setEditingAffirmation({ ...editingAffirmation, text_el: e.target.value })}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">{t('admin.affirmations.form.croatian')}</label>
                                <Textarea
                                    value={editingAffirmation.text_hr}
                                    onChange={(e) => setEditingAffirmation({ ...editingAffirmation, text_hr: e.target.value })}
                                    rows={3}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isLoading}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleUpdateAffirmation} disabled={isLoading} className="bg-[#92C7CF] hover:bg-[#7FB0B8]">
                            {isLoading ? t('common.processing', 'Processing...') : t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Affirmations;
