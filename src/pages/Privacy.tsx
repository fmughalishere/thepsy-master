import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const Privacy = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchContent = async () => {
            setLoading(true);
            try {
                const docSnap = await getDoc(doc(db, "content", "privacy_policy"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const lang = i18n.language;
                    // Prefer specific language content, fallback to English/default
                    const localizedContent = data[`content_${lang}`] || data.content || "";
                    setContent(localizedContent);
                }
            } catch (error) {
                console.error("Error fetching privacy policy:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchContent();
    }, [i18n.language]);

    // Fallback static structure helper (optional, if we wanted to keep the old one, but we are replacing it for dynamic)
    // If content is null, we could render the old way. But let's assume the Admin will populate it.

    return (
        <div className="min-h-screen bg-[#F9FAFB] p-4">
            {/* Header */}
            <div className="flex justify-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">{t('privacy.title', 'Privacy Policy')}</h1>
            </div>

            <div className="max-w-4xl mx-auto">
                <Card className="p-8 bg-white rounded-2xl shadow-sm">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-pulse text-gray-400">{t('privacy.loading', 'Loading privacy policy...')}</div>
                        </div>
                    ) : content ? (
                        <div className="prose max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
                    ) : (
                        <div className="text-center py-10 text-gray-500">
                            <p>{t('privacy.update_notice', 'Privacy Policy content is currently being updated. Please check back later.')}</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default Privacy;
