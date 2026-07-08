import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Mail, Facebook, Instagram, Linkedin, Twitter, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SUPPORTED_LANGUAGES = [
    { code: 'en', labelKey: 'languages.en' },
    { code: 'de', labelKey: 'languages.de' },
    { code: 'el', labelKey: 'languages.el' },
    { code: 'hr', labelKey: 'languages.hr' }
];

const ContentManagement = () => {
    const { toast } = useToast();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("privacy_policy");
    const [selectedLang, setSelectedLang] = useState("en");

    // We store all content in a structured object
    const [contentData, setContentData] = useState<Record<string, Record<string, string>>>({
        privacy_policy: { en: "", de: "", el: "", hr: "" },
        terms_conditions: { en: "", de: "", el: "", hr: "" }
    });

    // Social & Contact Settings
    const [socialSettings, setSocialSettings] = useState({
        contactEmail: "",
        facebook: "",
        instagram: "",
        twitter: "",
        linkedin: "",
        tiktok: ""
    });

    // Preview Mode
    const [showPreview, setShowPreview] = useState(true);

    const getTabLabel = (tab: string) => {
        const labels: Record<string, string> = {
            privacy_policy: t('admin.content.tabs.privacy_policy'),
            terms_conditions: t('admin.content.tabs.terms_conditions'),
            social_contact: t('admin.content.tabs.social_contact'),
        };
        return labels[tab] ?? "";
    };

    useEffect(() => {
        const fetchContent = async () => {
            try {
                // Fetch Privacy & Terms
                const privacyDoc = await getDoc(doc(db, "content", "privacy_policy"));
                const termsDoc = await getDoc(doc(db, "content", "terms_conditions"));

                // Fetch Settings
                const settingsDoc = await getDoc(doc(db, "content", "settings"));

                const newData = { ...contentData };

                if (privacyDoc.exists()) {
                    const data = privacyDoc.data();
                    SUPPORTED_LANGUAGES.forEach(lang => {
                        newData.privacy_policy[lang.code] = data[`content_${lang.code}`] || (lang.code === 'en' ? data.content : "") || "";
                    });
                }

                if (termsDoc.exists()) {
                    const data = termsDoc.data();
                    SUPPORTED_LANGUAGES.forEach(lang => {
                        newData.terms_conditions[lang.code] = data[`content_${lang.code}`] || (lang.code === 'en' ? data.content : "") || "";
                    });
                }

                setContentData(newData);

                if (settingsDoc.exists()) {
                    const data = settingsDoc.data();
                    setSocialSettings({
                        contactEmail: data.contactEmail || "",
                        facebook: data.socialLinks?.facebook || "",
                        instagram: data.socialLinks?.instagram || "",
                        twitter: data.socialLinks?.twitter || "",
                        linkedin: data.socialLinks?.linkedin || "",
                        tiktok: data.socialLinks?.tiktok || ""
                    });
                }
            } catch (error) {
                console.error("Error fetching content:", error);
            }
        };
        fetchContent();
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            if (activeTab === "social_contact") {
                const docRef = doc(db, "content", "settings");
                await setDoc(docRef, {
                    contactEmail: socialSettings.contactEmail,
                    socialLinks: {
                        facebook: socialSettings.facebook,
                        instagram: socialSettings.instagram,
                        twitter: socialSettings.twitter,
                        linkedin: socialSettings.linkedin,
                        tiktok: socialSettings.tiktok
                    },
                    updatedAt: new Date(),
                    lastUpdatedBy: "ADMIN"
                }, { merge: true });

                toast({ title: t('admin.content.messages.success_title'), description: t('admin.content.messages.settings_saved') });

            } else {
                const docRef = doc(db, "content", activeTab);

                // Construct update object
                const updates: Record<string, any> = {
                    updatedAt: new Date(),
                    lastUpdatedBy: "ADMIN",
                    lastUpdatedLang: selectedLang
                };

                // Add all language fields
                SUPPORTED_LANGUAGES.forEach(lang => {
                    updates[`content_${lang.code}`] = contentData[activeTab][lang.code];
                });

                // Also keep 'content' as fallback (English)
                if (contentData[activeTab]['en']) {
                    updates['content'] = contentData[activeTab]['en'];
                }

                await setDoc(docRef, updates, { merge: true });

                toast({
                    title: t('admin.content.messages.success_title'),
                    description: t('admin.content.messages.success_desc', { tab: getTabLabel(activeTab) })
                });
            }
        } catch (error) {
            console.error("Error saving content:", error);
            toast({ title: t('admin.content.messages.error_title'), description: t('admin.content.messages.error_desc'), variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const currentContent = contentData[activeTab]?.[selectedLang] || "";

    const handleContentChange = (val: string) => {
        setContentData(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [selectedLang]: val
            }
        }));
    };

    const handleSocialChange = (field: string, value: string) => {
        setSocialSettings(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 font-sans">
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.content.title')}</h1>
                    <p className="text-sm text-gray-500 font-shippori">{t('admin.content.subtitle')}</p>
                </div>
                <div className="flex gap-2">
                    {activeTab !== 'social_contact' && (
                        <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                            {showPreview ? t('admin.content.actions.hide_preview') : t('admin.content.actions.show_preview')}
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={loading} className="bg-[#92C7CF] hover:bg-[#234c54]">
                        {loading ? t('admin.content.actions.saving') : t('admin.content.actions.publish')}
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 mb-6">
                {/* Language Selector (Only for Content Tabs) */}
                {activeTab !== 'social_contact' && (
                    <div className="w-full md:w-64">
                        <label className="text-sm font-medium text-gray-500 mb-2 block">{t('admin.content.labels.select_language')}</label>
                        <Select value={selectedLang} onValueChange={setSelectedLang}>
                            <SelectTrigger className="w-full bg-white">
                                <Globe className="w-4 h-4 mr-2 text-gray-400" />
                                <SelectValue placeholder={t('admin.content.placeholders.language')} />
                            </SelectTrigger>
                            <SelectContent>
                                {SUPPORTED_LANGUAGES.map(lang => (
                                    <SelectItem key={lang.code} value={lang.code}>{t(lang.labelKey)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Doc Type Selector (Tabs) */}
                <div className="flex-1">
                    <label className="text-sm font-medium text-gray-500 mb-2 block">{t('admin.content.labels.document_type')}</label>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="w-full md:w-auto flex flex-wrap h-auto">
                            <TabsTrigger value="privacy_policy" className="flex-1 md:flex-none px-6 py-2">{t('admin.content.tabs.privacy_policy')}</TabsTrigger>
                            <TabsTrigger value="terms_conditions" className="flex-1 md:flex-none px-6 py-2">{t('admin.content.tabs.terms_conditions')}</TabsTrigger>
                            <TabsTrigger value="social_contact" className="flex-1 md:flex-none px-6 py-2">{t('admin.content.tabs.social_contact')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {activeTab === 'social_contact' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl text-[#508C96]">{t('admin.content.social.contact_info')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="contactEmail">{t('admin.content.social.email_label')}</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="contactEmail"
                                        placeholder={t('admin.content.social.email_placeholder')}
                                        className="pl-9"
                                        value={socialSettings.contactEmail}
                                        onChange={(e) => handleSocialChange('contactEmail', e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl text-[#508C96]">{t('admin.content.social.social_links')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="facebook">{t('admin.content.social.facebook_label')}</Label>
                                <div className="relative">
                                    <Facebook className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="facebook"
                                        placeholder={t('admin.content.social.facebook_placeholder')}
                                        className="pl-9"
                                        value={socialSettings.facebook}
                                        onChange={(e) => handleSocialChange('facebook', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="instagram">{t('admin.content.social.instagram_label')}</Label>
                                <div className="relative">
                                    <Instagram className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="instagram"
                                        placeholder={t('admin.content.social.instagram_placeholder')}
                                        className="pl-9"
                                        value={socialSettings.instagram}
                                        onChange={(e) => handleSocialChange('instagram', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="twitter">{t('admin.content.social.twitter_label')}</Label>
                                <div className="relative">
                                    <Twitter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="twitter"
                                        placeholder={t('admin.content.social.twitter_placeholder')}
                                        className="pl-9"
                                        value={socialSettings.twitter}
                                        onChange={(e) => handleSocialChange('twitter', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="linkedin">{t('admin.content.social.linkedin_label')}</Label>
                                <div className="relative">
                                    <Linkedin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="linkedin"
                                        placeholder={t('admin.content.social.linkedin_placeholder')}
                                        className="pl-9"
                                        value={socialSettings.linkedin}
                                        onChange={(e) => handleSocialChange('linkedin', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="tiktok">{t('admin.content.social.tiktok_label')}</Label>
                                <div className="relative">
                                    <Video className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        id="tiktok"
                                        placeholder={t('admin.content.social.tiktok_placeholder')}
                                        className="pl-9"
                                        value={socialSettings.tiktok}
                                        onChange={(e) => handleSocialChange('tiktok', e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className={`grid grid-cols-1 ${showPreview ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-8`}>
                    {/* Editor */}
                    <Card className="h-[600px] flex flex-col border shadow-sm">
                        <CardHeader className="bg-gray-50 border-b py-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-sm font-medium text-gray-500">
                                    {t('admin.content.labels.html_editor')} ({activeTab === "privacy_policy" ? t('admin.content.tabs.privacy_policy') : t('admin.content.tabs.terms_conditions')} - <span className="uppercase text-[#508C96]">{selectedLang}</span>)
                                </CardTitle>
                                <span className="text-xs text-gray-400">{t('admin.content.labels.supports_html')}</span>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0">
                            <textarea
                                className="w-full h-full p-4 font-mono text-sm resize-none border-0 focus:ring-0 outline-none bg-white text-gray-800"
                                value={currentContent}
                                onChange={(e) => handleContentChange(e.target.value)}
                                placeholder={`<h3>${t('admin.content.placeholders.enter_content', { lang: selectedLang.toUpperCase() })}</h3><p>...</p>`}
                            />
                        </CardContent>
                    </Card>

                    {/* Preview */}
                    {showPreview && (
                        <Card className="h-[600px] flex flex-col overflow-hidden border shadow-sm">
                            <CardHeader className="bg-gray-50 border-b py-3">
                                <CardTitle className="text-sm font-medium text-gray-500">{t('admin.content.labels.live_preview')} ({selectedLang.toUpperCase()})</CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 p-6 overflow-y-auto bg-white prose max-w-none">
                                {currentContent ? (
                                    <div dangerouslySetInnerHTML={{ __html: currentContent }} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400 italic">
                                        {t('admin.content.placeholders.preview_empty')}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
};
export default ContentManagement;
