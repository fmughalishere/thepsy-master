import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  isEmergency?: boolean;
}

const FAQScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const faqItems: FAQItem[] = [
    {
      id: 'q1',
      question: t('faq.q1', 'What is ThePsy?'),
      answer: t('faq.a1', 'ThePsy is a secure and GDPR-compliant mental health platform that connects you with licensed therapists and certified coaches through private chat, video, or phone sessions. You get support within 24 hours, can track your emotional well-being, and securely download all your session records.')
    },
    {
      id: 'q2',
      question: t('faq.q2', 'How does the platform work?'),
      answer: t('faq.a2', "After registration and completing a short questionnaire, you'll be matched with a professional. You can then start a conversation via chat, video, or phone.")
    },
    {
      id: 'q3',
      question: t('faq.q3', 'What issues can I get help with?'),
      answer: t('faq.a3', 'Our professionals support you with a variety of topics, including anxiety, depression, relationship problems, identity issues, LGBTQ+ support, life transitions, burnout, and more.')
    },
    {
      id: 'q4',
      question: t('faq.q4', 'What languages are supported?'),
      answer: t('faq.a4', 'Currently, the platform is available in English and German. More language options are coming soon.')
    },
    {
      id: 'q5',
      question: t('faq.q5', 'Is ThePsy suitable for emergencies?'),
      answer: t('faq.a5', 'No. If you are in immediate danger or experiencing a crisis, please contact local emergency services immediately.'),
      isEmergency: true
    },
    {
      id: 'q6',
      question: t('faq.q6', 'How quickly do I get a response?'),
      answer: t('faq.a6', "You'll receive a response from your therapist within 24 hours of sending a message. For live sessions, you can schedule appointments directly based on your therapist's availability.")
    },
    {
      id: 'q7',
      question: t('faq.q7', 'Is my data secure?'),
      answer: t('faq.a7', 'Yes. ThePsy is fully GDPR compliant. All your data and session records are encrypted and stored securely. You control your data and can download or delete your records at any time.')
    },
    {
      id: 'q8',
      question: t('faq.q8', 'Can I cancel my subscription?'),
      answer: t('faq.a8', "It depends on your plan:\n\nBasic Plan (€9.95/week): This plan is chat-only with therapist responses within 24 hours. It requires a minimum term of 3 months. After the initial term, you can cancel monthly.\n\nFull Support Plan (€64.99/week): Includes one live session per week (via video, phone, or live chat), plus chat support, journaling, mood tracking, and affirmations. This plan is cancelable monthly.\n\nOne-time Session (€79.99): A single live session with no subscription or further commitment. No cancellation required.")
    },
    {
      id: 'q9',
      question: t('faq.q9', 'How much does it cost?'),
      answer: t('faq.a9', 'Our prices vary depending on the plan chosen and desired services. Please check our pricing page or contact support for detailed information.')
    },
    {
      id: 'q10',
      question: t('faq.q10', 'How are therapists verified?'),
      answer: t('faq.a10', 'At ThePsy, every professional undergoes a rigorous verification process before joining our platform. This includes credential verification and background checks. We also conduct regular performance reviews to ensure each therapist continues to meet our high standards of care and professionalism.')
    },
    {
      id: 'q11',
      question: t('faq.q11', 'I signed up — how long does it take to be matched with a therapist or coach?'),
      answer: t('faq.a11', 'Matching can take anywhere from a few hours to a few days, depending on therapist availability and your specific needs or preferences. We strive to connect you with the most suitable professional as quickly as possible without compromising quality.')
    },
    {
      id: 'q12',
      question: t('faq.q12', 'How do I contact support?'),
      answer: t('faq.a12', "You can use the in-app contact form or email us directly at info@thepsy.de. For therapists wanting to work with us, there's a separate application form.")
    }
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB] font-sans flex flex-col">
      <div className="flex-grow p-4 md:p-8">
        {/* Header */}
        <div className="max-w-4xl mx-auto flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-kalnia text-[#92C7CF]">
            {t('faq.title', 'Frequently Asked Questions')}
          </h1>
        </div>

        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-6 md:p-8">
          <Accordion type="single" collapsible className="w-full">
            {faqItems.map(faq => (
              <AccordionItem key={faq.id} value={faq.id} className="border-b border-gray-100 last:border-0">
                <AccordionTrigger className="text-left text-gray-900 font-semibold hover:text-[#508C96] py-4">
                  <span className="text-base">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className={`text-gray-600 leading-relaxed whitespace-pre-line pb-4 ${faq.isEmergency ? 'text-red-600 font-medium' : ''}`}>
                    {faq.answer}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default FAQScreen;
