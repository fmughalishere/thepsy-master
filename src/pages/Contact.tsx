import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Paperclip } from "lucide-react";

const Contact = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [formData, setFormData] = useState({
        fullName: auth.currentUser?.displayName || "",
        subject: "",
        message: ""
    });

    const subjects = [
        t('contact.subjects.general', "General Inquiry"),
        t('contact.subjects.support', "Technical Support"),
        t('contact.subjects.account', "Account Issues"),
        t('contact.subjects.billing', "Billing & Payments"),
        t('contact.subjects.therapist', "Therapist Application"),
        t('contact.subjects.problem', "Report a Problem"),
        t('contact.subjects.feature', "Feature Request"),
        t('contact.subjects.other', "Other")
    ];

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setAttachment(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.fullName || !formData.subject || !formData.message) {
            alert(t('contact.error_all_fields', "Please fill in all required fields"));
            return;
        }

        if (!agreedToTerms) {
            alert(t('contact.error_terms', "Please agree to the terms & conditions"));
            return;
        }

        // Construct email body with regards
        const emailBody = `${formData.message}

${t('contact.regards', "Regards")},
${formData.fullName}`;

        // Create mailto link
        const mailtoLink = `mailto:info@thepsy.de?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(emailBody)}`;

        // Open email client
        window.location.href = mailtoLink;

        // Note: File attachments cannot be added via mailto links due to security restrictions
        // The user will need to manually attach the file in their email client
        if (attachment) {
            alert(t('contact.manual_attachment', { name: attachment.name }));
        }
    };

    return (
        <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8 relative">


                {/* Header */}
                <div className="text-center mb-8 mt-4">
                    <h1 className="text-xl font-semibold text-gray-800">
                        {t('contact.title', 'Contact Us')}
                    </h1>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Full Name */}
                    <div>
                        <Label htmlFor="fullName" className="text-sm text-gray-700 mb-2 block">
                            {t('contact.full_name', 'Full Name')}
                        </Label>
                        <Input
                            id="fullName"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            placeholder={t('contact.full_name_placeholder', 'e.g. Emma Smith')}
                            className="h-12 bg-[#F8F9FA] border-gray-200 rounded-lg"
                        />
                    </div>



                    {/* Subject */}
                    <div>
                        <Label htmlFor="subject" className="text-sm text-gray-700 mb-2 block">
                            {t('contact.subject', 'Subject')}
                        </Label>
                        <Select
                            value={formData.subject}
                            onValueChange={(value) => setFormData({ ...formData, subject: value })}
                        >
                            <SelectTrigger className="h-12 bg-[#F8F9FA] border-gray-200 rounded-lg">
                                <SelectValue placeholder={t('contact.subject_placeholder', 'Select subject')} />
                            </SelectTrigger>
                            <SelectContent>
                                {subjects.map((subject) => (
                                    <SelectItem key={subject} value={subject}>
                                        {subject}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Attachment */}
                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            className="hidden"
                            accept="image/*,.pdf,.doc,.docx"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-12 bg-[#F8F9FA] border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600"
                        >
                            <Paperclip className="w-4 h-4 mr-2" />
                            {attachment ? attachment.name : t('contact.attachment', 'Attachment')}
                        </Button>
                    </div>

                    {/* Message */}
                    <div>
                        <Label htmlFor="message" className="text-sm text-gray-700 mb-2 block">
                            {t('contact.message_label', 'Write your message')}
                        </Label>
                        <Textarea
                            id="message"
                            value={formData.message}
                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                            placeholder={t('contact.message_placeholder', 'Type your message here...')}
                            rows={6}
                            className="bg-[#F8F9FA] border-gray-200 rounded-lg resize-none"
                        />
                    </div>

                    {/* Terms Checkbox */}
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id="terms"
                            checked={agreedToTerms}
                            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                            className="mt-1"
                        />
                        <label htmlFor="terms" className="text-sm text-gray-600 leading-tight">
                            {t('contact.terms_agree', 'Agree to the ')}{" "}
                            <span
                                className="text-[#92C7CF] cursor-pointer hover:underline"
                                onClick={() => window.open("/terms", "_blank")}
                            >
                                {t('contact.terms_link', 'terms & conditions')}
                            </span>
                        </label>
                    </div>

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        disabled={!agreedToTerms}
                        className="w-full h-12 bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('contact.send_button', 'Send Message')}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default Contact;
