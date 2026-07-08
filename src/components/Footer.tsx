import React from 'react';
import { Facebook, Instagram, Linkedin, Twitter } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Custom icons or Lucide icons
import { Link } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

// Custom icons or Lucide icons
const XIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const TikTokIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

export default function Footer() {
    const { t } = useTranslation();
    const [socialUrls, setSocialUrls] = useState({
        facebook: 'https://www.facebook.com/profile.php?id=61586988643019',
        instagram: 'https://www.instagram.com/thepsy.de?igsh=MXN2dWNycjh3NGRxNg==',
        twitter: '#',
        linkedin: 'https://www.linkedin.com/in/thepsy-thepsy-520b4037b',
        tiktok: 'https://www.tiktok.com/@thepsy25?_r=1&_t=ZG-93CHhVF5dgm'
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, "content", "settings"));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.socialLinks) {
                        setSocialUrls(prev => ({
                            facebook: data.socialLinks.facebook || prev.facebook,
                            instagram: data.socialLinks.instagram || prev.instagram,
                            twitter: data.socialLinks.twitter || prev.twitter,
                            linkedin: data.socialLinks.linkedin || prev.linkedin,
                            tiktok: data.socialLinks.tiktok || prev.tiktok
                        }));
                    }
                }
            } catch (error) {
                console.error("Error fetching footer settings:", error);
            }
        };
        fetchSettings();
    }, []);

    const socialLinks = [
        { icon: Facebook, label: 'Facebook', href: socialUrls.facebook },
        { icon: Instagram, label: 'Instagram', href: socialUrls.instagram },
        { icon: XIcon, label: 'X (Twitter)', href: socialUrls.twitter },
        { icon: Linkedin, label: 'LinkedIn', href: socialUrls.linkedin },
        { icon: TikTokIcon, label: 'TikTok', href: socialUrls.tiktok }
    ];

    const footerLinks = [
        { label: t('footer.links.terms'), path: '/terms' },
        { label: t('footer.links.privacy'), path: '/privacy' },
        { label: t('footer.links.contact'), path: '/contact' },
        { label: t('footer.links.faq'), path: '/faq' }
    ];

    return (
        <footer className="bg-gradient-to-b from-white to-gray-50 py-16 px-6 border-t border-gray-100 font-sans mt-auto">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">

                {/* Left: Social Media Icons */}
                <div className="flex justify-center md:justify-start gap-4">
                    {socialLinks.map((social, index) => {
                        const Icon = social.icon;
                        return (
                            <a
                                key={index}
                                href={social.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-12 h-12 rounded-full bg-[#eef7f8] hover:bg-[#d5eced] flex items-center justify-center text-[#92C7CF] hover:text-[#1a3b42] transition-all duration-300 hover:scale-110"
                                aria-label={social.label}
                            >
                                <Icon className="w-5 h-5" />
                            </a>
                        );
                    })}
                </div>

                {/* Right: Navigation Links */}
                <nav className="flex flex-wrap justify-center md:justify-end gap-x-8 gap-y-4">
                    {footerLinks.map((link, index) => (
                        <Link
                            key={index}
                            to={link.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#508C96] hover:text-[#92C7CF] text-sm font-medium transition-colors duration-200"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>
            </div>
        </footer>
    );
}
