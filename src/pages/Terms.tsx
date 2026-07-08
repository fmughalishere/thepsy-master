import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const Terms = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchContent = async () => {
            setLoading(true);
            try {
                const docSnap = await getDoc(doc(db, "content", "terms_conditions"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const lang = i18n.language;
                    // Prefer specific language content, fallback to English/default
                    const localizedContent = data[`content_${lang}`] || data.content || "";
                    setContent(localizedContent);
                }
            } catch (error) {
                console.error("Error fetching terms:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchContent();
    }, [i18n.language]);

    return (
        <div className="min-h-screen bg-[#F9FAFB] p-4">
            {/* Header */}
            <div className="flex justify-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">{t('terms.title', 'Terms and Conditions')}</h1>
            </div>

            <div className="max-w-4xl mx-auto">
                <Card className="p-8 bg-white rounded-2xl shadow-sm">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-pulse text-gray-400">{t('terms.loading', 'Loading terms and conditions...')}</div>
                        </div>
                    ) : content ? (
                        <div className="prose max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
                    ) : (
                        <div className="text-center py-10 text-gray-500">
                            <p>{t('terms.update_notice', 'Terms and Conditions content is currently being updated. Please check back later.')}</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default Terms;
