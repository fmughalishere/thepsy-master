import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, query, where, orderBy, limit, getDocs, deleteDoc, doc, updateDoc, Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, MoreVertical, Trash2, Edit2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface JournalEntry {
    id: string;
    title: string;
    description: string;
    timestamp: any;
    isTherapistNote?: boolean;
    therapistName?: string;
}

const Journal = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [journals, setJournals] = useState<JournalEntry[]>([]);

    // Edit Dialog State
    const [editingJournal, setEditingJournal] = useState<JournalEntry | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    useEffect(() => {
        fetchJournals();
    }, []);

    const fetchJournals = async () => {
        if (!auth.currentUser) return;
        try {
            const q = query(
                collection(db, "journals"),
                where("userId", "==", auth.currentUser.uid),
                limit(50) // Increased limit slightly since we filter client-side
            );
            const querySnapshot = await getDocs(q);
            const loadedJournals = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry))
                .filter(j => !j.isTherapistNote); // Filter out professional notes

            // Client-side sort
            loadedJournals.sort((a, b) => {
                const timeA = a.timestamp?.seconds ?? 0;
                const timeB = b.timestamp?.seconds ?? 0;
                return timeB - timeA;
            });
            setJournals(loadedJournals);
        } catch (error) {
            console.error("Error fetching journals:", error);
        }
    };

    const handleSave = async () => {
        if (!title.trim() || !description.trim()) {
            toast({ title: t('journal.fill_fields', "Please fill in all fields"), variant: "destructive" });
            return;
        }
        if (!auth.currentUser) return;

        setIsSaving(true);
        try {
            await addDoc(collection(db, "journals"), {
                userId: auth.currentUser.uid,
                title,
                description,
                timestamp: Timestamp.now()
            });
            toast({ title: t('journal.saved', 'Journal saved!') });
            setTitle("");
            setDescription("");
            fetchJournals();
        } catch (error) {
            console.error("Error saving journal:", error);
            toast({ title: t('journal.error_save', "Error saving journal"), variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!auth.currentUser) return;
        try {
            await deleteDoc(doc(db, "journals", id));
            toast({ title: t('journal.deleted', 'Journal deleted') });
            setJournals(prev => prev.filter(j => j.id !== id));
        } catch (error) {
            console.error("Error deleting journal:", error);
            toast({ title: t('journal.error_delete', "Error deleting journal"), variant: "destructive" });
        }
    };

    const openEditDialog = (journal: JournalEntry) => {
        setEditingJournal(journal);
        setEditTitle(journal.title);
        setEditDescription(journal.description);
        setIsEditDialogOpen(true);
    };

    const handleUpdate = async () => {
        if (!editingJournal || !auth.currentUser) return;
        try {
            await updateDoc(doc(db, "journals", editingJournal.id), {
                title: editTitle,
                description: editDescription
            });
            toast({ title: t('journal.updated', 'Journal updated!') });
            setIsEditDialogOpen(false);
            fetchJournals();
        } catch (error) {
            console.error("Error updating journal:", error);
            toast({ title: t('journal.error_update', "Error updating journal"), variant: "destructive" });
        }
    };

    return (
        <div className="min-h-screen bg-white p-6">
            {/* Header */}
            <div className="flex items-center mb-6">
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="-ml-3">
                    <ArrowLeft className="w-6 h-6 text-gray-400" />
                </Button>
            </div>

            <Tabs defaultValue="today" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 bg-gray-100 rounded-full p-1 h-12">
                    <TabsTrigger
                        value="today"
                        className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm text-gray-500 data-[state=active]:text-[#92C7CF]"
                    >
                        {t('journal.tab_today', 'Write Today')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="weekly"
                        className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm text-gray-500 data-[state=active]:text-[#92C7CF]"
                    >
                        {t('journal.tab_weekly', 'All Entries')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="today" className="space-y-6">
                    <div>
                        <h2 className="text-xl font-medium text-gray-700 mb-2 font-sans">
                            {t('journal.daily_title', 'Daily Reflection')}
                        </h2>
                        <p className="text-gray-400 text-sm">
                            {t('journal.daily_subtitle', 'Take a moment to write down your thoughts.')}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Input
                            placeholder={t('journal.placeholder_title', 'Title')}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-[60px] rounded-2xl border-gray-200 focus:border-[#92C7CF] text-lg bg-gray-50/50"
                        />
                        <Textarea
                            placeholder={t('journal.placeholder_desc', 'Write your thoughts here...')}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="min-h-[200px] rounded-2xl border-gray-200 focus:border-[#92C7CF] text-base bg-gray-50/50 p-4 resize-none"
                        />
                    </div>

                    <div className="flex justify-center pt-4">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-40 h-12 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white font-semibold shadow-md"
                        >
                            {isSaving ? t('common.saving', "Saving...") : t('journal.save', 'Save Entry')}
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="weekly" className="space-y-4">
                    {journals.length > 0 ? (
                        journals.map(journal => (
                            <Card key={journal.id} className="p-5 rounded-2xl shadow-md border-none relative group transition-all bg-[#92C7CF]">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold text-lg text-white">{journal.title}</h3>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="hover:bg-white/10 text-white rounded-full h-8 w-8 -mr-2 -mt-2">
                                                <MoreVertical className="w-5 h-5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-32">
                                            <DropdownMenuItem onClick={() => openEditDialog(journal)}>
                                                <Edit2 className="w-4 h-4 mr-2" />
                                                {t('journal.edit', 'Edit')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDelete(journal.id)} className="text-red-600 focus:text-red-600">
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                {t('journal.delete', 'Delete')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <p className="text-white/80 text-sm leading-relaxed mb-3 line-clamp-3">
                                    {journal.description}
                                </p>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-white/50 font-medium">
                                        {journal.timestamp?.toDate().toLocaleDateString(i18n.language, {
                                            weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                        })}
                                    </p>
                                    {journal.isTherapistNote && (
                                        <p className="text-[10px] text-white/40 italic font-medium">
                                            {journal.therapistName}
                                        </p>
                                    )}
                                </div>
                            </Card>
                        ))
                    ) : (
                        <div className="text-center py-10 text-gray-400">
                            <p>{t('journal.no_entries', 'No journal entries yet.')}</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('journal.edit_title', 'Edit Entry')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder={t('journal.placeholder_title', 'Title')}
                        />
                        <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder={t('journal.placeholder_desc', 'Write your thoughts here...')}
                            className="min-h-[150px]"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>{t('journal.cancel', 'Cancel')}</Button>
                        <Button onClick={handleUpdate} className="bg-[#92C7CF] hover:bg-[#7FB0B8]">{t('journal.update', 'Update')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default Journal;
