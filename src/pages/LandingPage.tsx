import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/ui/Logo";
import Footer from "@/components/Footer";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { fetchAndActivate, getValue } from 'firebase/remote-config';
import { remoteConfig } from '@/lib/firebase';
import { usePayment } from "@/hooks/usePayment";

import { Menu, X } from "lucide-react";
import introIllustration from "../assets/images/intro_illustration.png";

const LandingPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { currentUser, userData, loading } = useAuth();
  const { state: paymentState } = usePayment();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const getPlanPrice = (planId: string) => {
    if (paymentState.packages && paymentState.packages[planId]) {
      return paymentState.packages[planId].display_price;
    }
    const plan = paymentState.plans.find(p => p.id === planId);
    return plan?.display_price || "";
  };

  const basicPrice = getPlanPrice('basic_monthly') || getPlanPrice('basic_plan') || getPlanPrice('basis_plan') || "€9.99/week";
  const fullPrice = getPlanPrice('plus_weekly') || getPlanPrice('full_support_monthly') || getPlanPrice('full_support_plan') || "€64.99/week";
  const singlePrice = getPlanPrice('one_time_session') || "€79.99/session";
  const couplesPrice = getPlanPrice('couples_support_monthly') || "€84.99/week";

  useEffect(() => {

    if (!loading) {
      if (currentUser && userData) {
        const userRole = userData.role;
        switch (userRole) {
          case "ADMIN":
            navigate("/admin/dashboard", { replace: true });
            break;
          case "THERAPIST":
            const therapistStatus = userData.therapistDetails?.profileStatus;
            switch (therapistStatus) {
              case "INCOMPLETE":
                navigate("/therapist/complete-profile", { replace: true });
                break;
              case "APPROVAL_PENDING":
                navigate("/therapist/pending-approval", { replace: true });
                break;
              case "REJECTED":
                navigate("/therapist/application-rejected", { replace: true });
                break;
              case "COOLDOWN":
                navigate("/therapist/cooldown-period", { replace: true });
                break;
              case "APPROVED":
              default:
                navigate("/therapist/dashboard", { replace: true });
                break;
            }
            break;
          case "PATIENT":
          default:
            navigate("/dashboard", { replace: true });
            break;
        }
      }
    }
  }, [currentUser, userData, loading, navigate]);

  return (
    <div className="landing-page-container">
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --primary-hsl: 188 38% 69%;
          --secondary-hsl: 188 30% 45%;
          --teal: hsl(var(--primary-hsl));
          --teal-dark: hsl(var(--secondary-hsl));
          --teal-light: hsl(188 38% 85%);
          --cream: #f7f3ee;
          --cream-dark: #ede8e0;
          --text-dark: #2e3d4f;
          --text-mid: #5a6a7a;
          --text-light: #8a9aaa;
          --blue-illus: #7ba7c4;
          --warm: #e8d5c4;
        }

        .landing-page-container {
          font-family: 'Inter', sans-serif;
          background: #ffffff;
          color: var(--text-dark);
          overflow-x: hidden;
          scroll-behavior: smooth;
        }

        /* NAV */
        nav.lp-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex;
          justify-content: space-between;
          flex-direction: row; /* Logo on the left, links/hamburger on the right */
          align-items: center;
          padding: 18px 48px;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid hsla(188, 38%, 69%, 0.15);
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }

        .nav-logo-text {
          font-family: 'Inter', sans-serif;
          font-weight: 300;
          font-size: 18px;
          color: var(--text-mid);
          letter-spacing: 0.5px;
        }

        .nav-links {
          display: flex;
          gap: 32px;
          list-style: none;
          align-items: center;
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .nav-links a {
          text-decoration: none;
          color: var(--text-mid);
          font-size: 14px;
          font-weight: 400;
          transition: color 0.2s;
        }

        .nav-links a:hover { color: var(--teal-dark); }

        .nav-cta {
          background: var(--teal) !important;
          color: white !important;
          padding: 10px 24px;
          border-radius: 50px;
          font-weight: 500 !important;
          transition: background 0.2s !important;
        }

        .nav-cta:hover { background: var(--teal-dark) !important; }

        .hamburger {
          display: none;
          background: none;
          border: none;
          color: var(--teal-dark);
          cursor: pointer;
          z-index: 110;
        }

        /* TABLET RESPONSIVENESS */
        @media (max-width: 1200px) {
          .nav-links { gap: 12px; }
          nav.lp-nav { padding: 18px 24px; }
          .nav-links a { font-size: 13px; }
          .hero-inner { gap: 30px; }
          .hero-text h1 { font-size: 42px; }
          .hero-visual { transform: scale(0.9); transform-origin: right; }
        }

        @media (max-width: 1024px) {
          .nav-links { display: none; }
          .hamburger { display: block; }
          nav.lp-nav { padding: 14px 24px; }
        }

        @media (max-width: 960px) {
          .hero-inner { grid-template-columns: 1fr; gap: 40px; text-align: center; }
          .hero-text { order: 2; display: flex; flex-direction: column; align-items: center; }
          .hero-text h1 { font-size: 38px; }
          .hero-visual { order: 1; transform: scale(0.85); transform-origin: center; margin-bottom: 20px; }
          .hero-checks { align-items: flex-start; margin: 0 auto; width: fit-content; }
          .hero-btns { display: flex; flex-direction: column; width: 100%; max-width: 320px; margin: 24px auto 0; }
          .lp-btn-secondary { margin-left: 0 !important; margin-top: 12px; width: 100%; text-align: center; }
          .lp-btn-primary { width: 100%; text-align: center; }
        }

        /* MOBILE SIDEBAR */
        .mobile-sidebar {
          position: fixed;
          top: 0; right: -100%;
          width: 280px;
          height: 100vh;
          background: white;
          z-index: 105;
          padding: 80px 32px;
          transition: right 0.3s ease-in-out;
          box-shadow: -10px 0 30px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .mobile-sidebar.open {
          right: 0;
        }

        .mobile-sidebar a {
          text-decoration: none;
          color: var(--text-dark);
          font-size: 18px;
          font-weight: 400;
        }

        .mobile-overlay {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.2);
          backdrop-filter: blur(2px);
          z-index: 102;
          display: none;
        }

        .mobile-overlay.open {
          display: block;
        }

        /* HERO */
        .hero {
          min-height: 100vh;
          background: var(--cream);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 120px 48px 80px;
          position: relative;
          overflow: hidden;
        }

        .hero::before {
          content: '';
          position: absolute;
          top: -100px; right: -100px;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(123,191,197,0.12) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero::after {
          content: '';
          position: absolute;
          bottom: -80px; left: -80px;
          width: 400px; height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,213,196,0.4) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-inner {
          max-width: 1100px;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
          position: relative;
          z-index: 1;
        }

        .hero-text h1 {
          font-family: 'Playfair Display', serif;
          font-size: clamp(38px, 5vw, 58px);
          font-weight: 500;
          color: var(--text-dark);
          line-height: 1.2;
          margin-bottom: 24px;
        }

        .hero-text p {
          font-size: 18px;
          color: var(--text-mid);
          line-height: 1.6;
          margin-bottom: 32px;
          max-width: 540px;
          font-weight: 300;
        }

        .hero-btns {
          display: flex;
          align-items: center;
          margin-top: 40px;
        }

        .hero-checks {
          list-style: none;
          margin-bottom: 40px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .hero-checks li {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          color: var(--text-mid);
          font-weight: 400;
        }

        .hero-checks li::before {
          content: '✓';
          width: 22px; height: 22px;
          background: var(--teal);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .lp-btn-primary {
          display: inline-block;
          text-decoration: none;
          background: var(--teal);
          color: white;
          padding: 16px 40px;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 500;
          transition: transform 0.2s, background 0.2s;
          box-shadow: 0 4px 14px rgba(123, 191, 197, 0.3);
          border: none;
          cursor: pointer;
        }

        .lp-btn-primary:hover {
          background: var(--teal-dark);
          transform: translateY(-2px);
          box-shadow: 0 6px 28px rgba(123,191,197,0.45);
        }

        .lp-btn-secondary {
          display: inline-block;
          text-decoration: none;
          background: transparent;
          color: var(--teal-dark);
          padding: 16px 40px;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 500;
          border: 2px solid var(--teal-light);
          margin-left: 16px;
          transition: transform 0.2s, background 0.2s;
        }

        .lp-btn-secondary:hover {
          background: var(--teal-light);
          color: white;
        }

        /* Hero illustration card */
        .hero-visual {
          display: flex;
          justify-content: center;
        }

        .hero-card {
          background: white;
          border-radius: 32px;
          padding: 48px 40px;
          box-shadow: 0 20px 60px rgba(46,61,79,0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          max-width: 440px;
          width: 100%;
          position: relative;
        }

        .hero-card::before {
          content: '';
          position: absolute;
          top: -12px; right: -12px;
          width: 80px; height: 80px;
          border-radius: 50%;
          background: var(--warm);
          opacity: 0.6;
          z-index: -1;
        }

        .hero-card p {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          color: var(--text-dark);
          text-align: center;
          line-height: 1.4;
        }

        .hero-card span {
          font-size: 13px;
          color: var(--text-light);
          font-style: italic;
        }

        /* STATS STRIP */
        .stats {
          background: white;
          padding: 48px;
          display: flex;
          justify-content: center;
          gap: 0;
          border-top: 1px solid var(--cream-dark);
          border-bottom: 1px solid var(--cream-dark);
        }

        .stat-item {
          text-align: center;
          padding: 0 60px;
          border-right: 1px solid var(--cream-dark);
        }

        .stat-item:last-child { border-right: none; }

        .stat-num {
          font-family: 'Playfair Display', serif;
          font-size: 36px;
          color: var(--teal-dark);
          font-weight: 500;
        }

        .stat-label {
          font-size: 13px;
          color: var(--text-light);
          margin-top: 4px;
        }

        /* HOW IT WORKS */
        .lp-section {
          padding: 100px 48px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .section-label {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--teal-dark);
          margin-bottom: 12px;
        }

        .section-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(28px, 4vw, 42px);
          color: var(--text-dark);
          font-weight: 500;
          line-height: 1.25;
          margin-bottom: 16px;
        }

        .section-sub {
          font-size: 16px;
          color: var(--text-mid);
          line-height: 1.7;
          max-width: 540px;
          font-weight: 300;
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
          margin-top: 60px;
        }

        .step-card {
          background: var(--cream);
          border-radius: 24px;
          padding: 36px 28px;
          position: relative;
        }

        .step-num {
          width: 40px; height: 40px;
          background: var(--teal);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 20px;
        }

        .step-card h3 {
          font-family: 'Playfair Display', serif;
          font-size: 20px;
          color: var(--text-dark);
          margin-bottom: 10px;
        }

        .step-card p {
          font-size: 14px;
          color: var(--text-mid);
          line-height: 1.65;
          font-weight: 300;
        }

        /* SERVICES */
        .services-section {
          background: var(--cream);
          padding: 100px 48px;
        }

        .services-inner {
          max-width: 1100px;
          margin: 0 auto;
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
          margin-top: 60px;
        }

        .service-card {
          background: white;
          border-radius: 24px;
          padding: 36px 32px;
          display: flex;
          gap: 20px;
          align-items: flex-start;
          transition: transform 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }

        .service-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(46,61,79,0.09);
        }

        .service-icon {
          width: 52px; height: 52px;
          background: var(--cream);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .service-icon svg { width: 26px; height: 26px; }

        .service-card h3 {
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          color: var(--text-dark);
          margin-bottom: 8px;
        }

        .service-card p {
          font-size: 13px;
          color: var(--text-mid);
          line-height: 1.6;
          font-weight: 300;
        }

        .service-tag {
          display: inline-block;
          margin-top: 12px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
          background: var(--teal-light);
          color: var(--teal-dark);
        }

        /* TESTIMONIALS */
        .testimonials-section {
          padding: 100px 48px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .testimonials-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin-top: 60px;
        }

        .testimonial-card {
          background: var(--cream);
          border-radius: 24px;
          padding: 32px 28px;
        }

        .stars {
          color: var(--teal);
          font-size: 16px;
          margin-bottom: 16px;
          letter-spacing: 2px;
        }

        .testimonial-card q {
          font-family: 'Playfair Display', serif;
          font-size: 16px;
          color: var(--text-dark);
          line-height: 1.6;
          font-style: italic;
          quotes: "„" """;
        }

        .testimonial-card q::before { content: open-quote; }
        .testimonial-card q::after { content: close-quote; }

        .testimonial-author {
          margin-top: 20px;
          font-size: 13px;
          color: var(--text-light);
          font-weight: 400;
        }

        /* CTA BAND */
        .cta-section {
          background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%);
          padding: 80px 48px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .cta-section::before {
          content: '';
          position: absolute;
          top: -60px; left: -60px;
          width: 300px; height: 300px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
        }

        .cta-section::after {
          content: '';
          position: absolute;
          bottom: -80px; right: -40px;
          width: 400px; height: 400px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
        }

        .cta-section h2 {
          font-family: 'Playfair Display', serif;
          font-size: clamp(28px, 4vw, 42px);
          color: white;
          font-weight: 500;
          margin-bottom: 16px;
          position: relative;
          z-index: 1;
        }

        .cta-section p {
          font-size: 16px;
          color: rgba(255,255,255,0.85);
          margin-bottom: 36px;
          font-weight: 300;
          position: relative;
          z-index: 1;
        }

        .lp-btn-white {
          display: inline-block;
          background: white;
          color: var(--teal-dark);
          padding: 16px 44px;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.25s;
          position: relative;
          z-index: 1;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
        }

        .lp-btn-white:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        }

        /* RESPONSIVE */
        @media (max-width: 768px) {
          nav.lp-nav { 
            padding: 14px 16px; 
            flex-direction: row; /* Logo on left, Hamburger on right for mobile */
          }
          .nav-right { gap: 10px; }
          
          .hero { padding: 100px 24px 60px; }
          .hero-inner { grid-template-columns: 1fr; gap: 40px; }
          .hero-visual { display: block; margin-top: 20px; }
          .stats { flex-direction: column; gap: 24px; padding: 36px 24px; }
          .stat-item { border-right: none; padding: 0; }
          .lp-section { padding: 60px 24px; }
          .steps { grid-template-columns: 1fr; }
          .services-section { padding: 60px 24px; }
          .services-grid { grid-template-columns: 1fr; }
          .testimonials-grid { grid-template-columns: 1fr; }
          .testimonials-section { padding: 60px 24px; }
          .cta-section { padding: 60px 24px; }
          .lp-btn-secondary { margin-left: 0; margin-top: 10px; width: 100%; text-align: center; }
          .lp-btn-primary { width: 100%; text-align: center; }
        }
      `}</style>

      <nav className="lp-nav">
        <a href="#" className="nav-logo" onClick={(e) => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
          <Logo size="sm" showText={true} />
        </a>
        
        <ul className="nav-links">
          <li><a href="#angebote">{t('landing.nav.angebote')}</a></li>
          <li><a href="#wie-es-funktioniert">{t('landing.nav.how_it_works')}</a></li>
          <li><a href="#ueber-uns">{t('landing.nav.about_us')}</a></li>
          <li><a href="#" onClick={() => navigate("/login")}>{t('landing.nav.login')}</a></li>
          <li><a href="#" onClick={() => navigate("/signup")} className="nav-cta">{t('landing.nav.start_now')}</a></li>
        </ul>

        <div className="nav-right">
          <LanguageSwitcher isInline />
          <button className="hamburger" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </nav>

      <div className={`mobile-overlay ${isMobileMenuOpen ? 'open' : ''}`} onClick={() => setIsMobileMenuOpen(false)}></div>
      <div className={`mobile-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <a href="#angebote" onClick={() => setIsMobileMenuOpen(false)}>{t('landing.nav.angebote')}</a>
        <a href="#wie-es-funktioniert" onClick={() => setIsMobileMenuOpen(false)}>{t('landing.nav.how_it_works')}</a>
        <a href="#ueber-uns" onClick={() => setIsMobileMenuOpen(false)}>{t('landing.nav.about_us')}</a>
        <a href="#" onClick={() => { setIsMobileMenuOpen(false); navigate("/login"); }}>{t('landing.nav.login')}</a>
        <a href="#" onClick={() => { setIsMobileMenuOpen(false); navigate("/signup"); }} className="nav-cta" style={{ textAlign: 'center' }}>{t('landing.nav.start_now')}</a>
      </div>

      <section className="hero" id="start">
        <div className="hero-inner">
          <div className="hero-text">
            <p className="section-label">{t('landing.hero.label')}</p>
            <h1>{t('landing.hero.title')}</h1>
            <p>{t('landing.hero.subtitle')}</p>
            <ul className="hero-checks">
              <li>{t('landing.hero.check_1')}</li>
              <li>{t('landing.hero.check_2')}</li>
              <li>{t('landing.hero.check_3')}</li>
              <li>{t('landing.hero.check_4')}</li>
            </ul>
            <div className="hero-btns">
              <a href="#" onClick={() => navigate("/signup")} className="lp-btn-primary">{t('landing.hero.btn_start')}</a>
              <a href="#angebote" className="lp-btn-secondary">{t('landing.hero.btn_offers')}</a>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-card">
              <img 
                src={introIllustration} 
                alt="Psychological Support Illustration" 
                style={{ width: '100%', maxWidth: '300px', height: 'auto', borderRadius: '16px' }} 
              />
              <p>{t('landing.hero.card_text')}</p>
              <span>{t('landing.hero.card_sub')}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="stats">
        <div className="stat-item">
          <div className="stat-num">{t('landing.stats.wait_time_system_num')}</div>
          <div className="stat-label">{t('landing.stats.wait_time_system_label')}</div>
        </div>
        <div className="stat-item">
          <div className="stat-num">{t('landing.stats.wait_time_thepsy_num')}</div>
          <div className="stat-label">{t('landing.stats.wait_time_thepsy_label')}</div>
        </div>
        <div className="stat-item">
          <div className="stat-num">{t('landing.stats.languages_num')}</div>
          <div className="stat-label">{t('landing.stats.languages_label')}</div>
        </div>
        <div className="stat-item">
          <div className="stat-num">{t('landing.stats.chat_num')}</div>
          <div className="stat-label">{t('landing.stats.chat_label')}</div>
        </div>
      </div>

      <section id="wie-es-funktioniert" className="lp-section">
        <p className="section-label">{t('landing.how_it_works.label')}</p>
        <h2 className="section-title">{t('landing.how_it_works.title')}</h2>
        <p className="section-sub">{t('landing.how_it_works.subtitle')}</p>
        <div className="steps">
          <div className="step-card">
            <div className="step-num">1</div>
            <h3>{t('landing.how_it_works.step1_title')}</h3>
            <p>{t('landing.how_it_works.step1_text')}</p>
          </div>
          <div className="step-card">
            <div className="step-num">2</div>
            <h3>{t('landing.how_it_works.step2_title')}</h3>
            <p>{t('landing.how_it_works.step2_text')}</p>
          </div>
          <div className="step-card">
            <div className="step-num">3</div>
            <h3>{t('landing.how_it_works.step3_title')}</h3>
            <p>{t('landing.how_it_works.step3_text')}</p>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="angebote" className="services-section">
        <div className="services-inner">
          <p className="section-label">{t('landing.services.label')}</p>
          <h2 className="section-title">{t('landing.services.title')}</h2>
          <p className="section-sub">{t('landing.services.subtitle')}</p>
          <div className="services-grid">
            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#7bbfc5" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <div>
                <h3>{t('landing.services.async_title')}</h3>
                <p>{t('landing.services.async_text')}</p>
                <span className="service-tag">{t('landing.services.async_tag')} ({basicPrice})</span>
              </div>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#7bbfc5" strokeWidth="2" strokeLinecap="round">
                  <polygon points="23 7 16 12 23 17 23 7"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </div>
              <div>
                <h3>{t('landing.services.video_title')}</h3>
                <p>{t('landing.services.video_text')}</p>
                <span className="service-tag">{t('landing.services.video_tag')} ({fullPrice})</span>
              </div>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#7bbfc5" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <h3>{t('landing.services.sessions_title')}</h3>
                <p>{t('landing.services.sessions_text')}</p>
                <span className="service-tag">{t('landing.services.sessions_tag')} ({singlePrice})</span>
              </div>
            </div>
            <div className="service-card">
              <div className="service-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#7bbfc5" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                  <path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <div>
                <h3>{t('landing.services.couples_title')}</h3>
                <p>{t('landing.services.couples_text')}</p>
                <span className="service-tag">{t('landing.services.couples_tag')} ({couplesPrice})</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="testimonials-section" id="ueber-uns">
        <p className="section-label">{t('landing.testimonials.label')}</p>
        <h2 className="section-title">{t('landing.testimonials.title')}</h2>
        <p className="section-sub">{t('landing.testimonials.subtitle')}</p>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="stars">★★★★★</div>
            <q>{t('landing.testimonials.t1_text')}</q>
            <div className="testimonial-author">– {t('landing.testimonials.t1_author')}</div>
          </div>
          <div className="testimonial-card">
            <div className="stars">★★★★★</div>
            <q>{t('landing.testimonials.t2_text')}</q>
            <div className="testimonial-author">– {t('landing.testimonials.t2_author')}</div>
          </div>
          <div className="testimonial-card">
            <div className="stars">★★★★★</div>
            <q>{t('landing.testimonials.t3_text')}</q>
            <div className="testimonial-author">– {t('landing.testimonials.t3_author')}</div>
          </div>
        </div>
      </section>
      <section className="cta-section">
        <h2>{t('landing.cta.title')}</h2>
        <p>{t('landing.cta.subtitle')}</p>
        <a href="#" onClick={() => navigate("/signup")} className="lp-btn-white">{t('landing.cta.button')}</a>
      </section>

      <Footer />
    </div>
  );
};

export default LandingPage;
