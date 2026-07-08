import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatNotificationProvider } from "./contexts/ChatNotificationContext";
import SidebarLayout from "./layouts/SidebarLayout";
import LanguageSwitcher from "./components/LanguageSwitcher";
import FirebaseAnalyticsTracker from "./components/FirebaseAnalyticsTracker";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";

// Lazy Load Pages
const Welcome = lazy(() => import("./pages/Welcome"));
const LandingPage = lazy(() => import("./pages/LandingPage"));

const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Login = lazy(() => import("./pages/Login"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const TherapyType = lazy(() => import("./pages/TherapyType"));
const GetToKnow = lazy(() => import("./pages/GetToKnow"));
const Questionnaire = lazy(() => import("./pages/Questionnaire"));
const Payment = lazy(() => import("./pages/Payment"));
const SubscriptionStatus = lazy(() => import("./pages/SubscriptionStatus"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const Matching = lazy(() => import("./pages/Matching"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MoodTracker = lazy(() => import("./pages/MoodTracker"));
const Journal = lazy(() => import("./pages/Journal"));
const SelfCare = lazy(() => import("./pages/SelfCare"));
const TherapistDetails = lazy(() => import("./pages/TherapistDetails"));
const PHQTest = lazy(() => import("./pages/PHQTest"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Chat = lazy(() => import("./pages/Chat"));
const Notifications = lazy(() => import("./pages/Notifications"));
const TherapyGoals = lazy(() => import("./pages/TherapyGoals"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUserList = lazy(() => import("./pages/admin/AdminUserList"));
const AdminUserDetails = lazy(() => import("./pages/admin/AdminUserDetails"));
const Transactions = lazy(() => import("./pages/admin/Transactions"));
const Affirmations = lazy(() => import("./pages/admin/Affirmations"));
const Statistics = lazy(() => import("./pages/admin/Statistics"));
const TherapistLayout = lazy(() => import("./layouts/TherapistLayout"));
const TherapistDashboard = lazy(() => import("./pages/TherapistDashboard"));
const TherapistSessions = lazy(() => import("./pages/therapist/TherapistSessions"));
const TherapistChats = lazy(() => import("./pages/therapist/TherapistChats"));
const TherapistAvailability = lazy(() => import("./pages/therapist/TherapistAvailability"));
const TherapistNotifications = lazy(() => import("./pages/therapist/TherapistNotifications"));
const TherapistStatistics = lazy(() => import("./pages/therapist/TherapistStatistics"));
const TherapistEarnings = lazy(() => import("./pages/therapist/Earnings"));
const CompleteTherapistProfile = lazy(() => import("./pages/therapist/CompleteTherapistProfile"));
const PendingApproval = lazy(() => import("./pages/therapist/PendingApproval"));
const ApplicationRejected = lazy(() => import("./pages/therapist/ApplicationRejected"));
const TherapistPatientProfile = lazy(() => import("./pages/therapist/TherapistPatientProfile"));
const PHQHistory = lazy(() => import("./pages/therapist/PHQHistory"));
const PHQReport = lazy(() => import("./pages/therapist/PHQReport"));
const CooldownPeriod = lazy(() => import("./pages/therapist/CooldownPeriod"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Contact = lazy(() => import("./pages/Contact"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const Call = lazy(() => import("./pages/Call"));
const AdminPayroll = lazy(() => import("./pages/admin/Payroll"));
const AdminPayrollSettings = lazy(() => import("./pages/admin/PayrollSettings"));
const ConsultationRoom = lazy(() => import("./pages/ConsultationRoom"));
const AdminComplaints = lazy(() => import("./pages/admin/AdminComplaints"));
const FAQ = lazy(() => import("./pages/FAQ"));
const AccountRestricted = lazy(() => import("./pages/AccountRestricted"));
const ContentManagement = lazy(() => import("./pages/admin/ContentManagement"));
const AdminAppointments = lazy(() => import("./pages/admin/AdminAppointments"));
const CouponManagement = lazy(() => import("./pages/admin/CouponManagement"));
const PricingManagement = lazy(() => import("./pages/admin/PricingManagement"));

// Loading fallback
const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ChatNotificationProvider>
            <LanguageSwitcher />
            <FirebaseAnalyticsTracker />
            <Suspense fallback={<PageLoading />}>
              <Routes>
                {/* Public Routes - No Layout or Simple Layout */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/welcome" element={<PublicRoute><Welcome /></PublicRoute>} />

                <Route path="/role" element={<PublicRoute><RoleSelection /></PublicRoute>} />
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
                <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                <Route path="/account-restricted" element={<AccountRestricted />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/faq" element={<FAQ />} />

                {/* Onboarding Routes - Full Screen (No Sidebar) */}
                <Route path="/onboarding" element={<ProtectedRoute allowedRoles={['PATIENT']}><Onboarding /></ProtectedRoute>} />
                <Route path="/therapy-type" element={<ProtectedRoute allowedRoles={['PATIENT']}><TherapyType /></ProtectedRoute>} />
                <Route path="/get-to-know" element={<ProtectedRoute allowedRoles={['PATIENT']}><GetToKnow /></ProtectedRoute>} />
                <Route path="/questionnaire" element={<ProtectedRoute allowedRoles={['PATIENT']}><Questionnaire /></ProtectedRoute>} />
                <Route path="/payment" element={<ProtectedRoute allowedRoles={['PATIENT']}><Payment /></ProtectedRoute>} />
                <Route path="/payment-success" element={<ProtectedRoute allowedRoles={['PATIENT']}><PaymentSuccess /></ProtectedRoute>} />
                <Route path="/matching" element={<ProtectedRoute allowedRoles={['PATIENT']}><Matching /></ProtectedRoute>} />
                <Route path="/call/:appointmentId" element={<ProtectedRoute><Call /></ProtectedRoute>} />

                {/* Protected Routes - With Sidebar */}
                <Route element={<ProtectedRoute allowedRoles={['PATIENT']}><SidebarLayout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/subscription-status" element={<SubscriptionStatus />} />
                  <Route path="/mood-tracker" element={<MoodTracker />} />
                  <Route path="/journal" element={<Journal />} />
                  <Route path="/self-care" element={<SelfCare />} />
                  <Route path="/therapist-profile" element={<TherapistDetails />} />
                  <Route path="/phq-test" element={<PHQTest />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/therapy-goals" element={<TherapyGoals />} />
                </Route>

                {/* Admin Routes */}
                <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}><AdminLayout /></ProtectedRoute>}>
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/users" element={<AdminUserList />} />
                  <Route path="/admin/users/:userId" element={<AdminUserDetails />} />
                  <Route path="/admin/transactions" element={<Transactions />} />
                  <Route path="/admin/affirmations" element={<Affirmations />} />
                  <Route path="/admin/statistics" element={<Statistics />} />
                  <Route path="/admin/payroll" element={<AdminPayroll />} />
                  <Route path="/admin/payroll-settings" element={<AdminPayrollSettings />} />
                  <Route path="/admin/complaints" element={<AdminComplaints />} />
                  <Route path="/admin/content" element={<ContentManagement />} />
                  <Route path="/admin/appointments" element={<AdminAppointments />} />
                  <Route path="/admin/coupons" element={<CouponManagement />} />
                  <Route path="/admin/pricing" element={<PricingManagement />} />
                  <Route path="/admin/notifications" element={<Notifications />} />
                </Route>

                {/* Consultation Room - Full Screen */}
                <Route path="/consultation/:appointmentId" element={<ProtectedRoute><ConsultationRoom /></ProtectedRoute>} />

                {/* Therapist Routes */}
                <Route element={<ProtectedRoute allowedRoles={['THERAPIST']}><TherapistLayout /></ProtectedRoute>}>
                  <Route path="/therapist/dashboard" element={<TherapistDashboard />} />
                  <Route path="/therapist/sessions" element={<TherapistSessions />} />
                  <Route path="/therapist/chats" element={<TherapistChats />} />
                  <Route path="/therapist/chat" element={<Chat />} />
                  <Route path="/therapist/self-care" element={<SelfCare />} />
                  <Route path="/therapist/availability" element={<TherapistAvailability />} />
                  <Route path="/therapist/notifications" element={<TherapistNotifications />} />
                  <Route path="/therapist/statistics" element={<TherapistStatistics />} />
                  <Route path="/therapist/earnings" element={<TherapistEarnings />} />
                  <Route path="/therapist/patient/:userId" element={<TherapistPatientProfile />} />
                  <Route path="/therapist/patient/:userId/phq-history" element={<PHQHistory />} />
                  <Route path="/therapist/patient/:userId/phq-report/:assessmentId" element={<PHQReport />} />
                </Route>

                {/* Therapist Signup Flow (No Sidebar) */}
                <Route path="/therapist/complete-profile" element={<ProtectedRoute allowedRoles={['THERAPIST']}><CompleteTherapistProfile /></ProtectedRoute>} />
                <Route path="/therapist/pending-approval" element={<ProtectedRoute allowedRoles={['THERAPIST']}><PendingApproval /></ProtectedRoute>} />
                <Route path="/therapist/application-rejected" element={<ProtectedRoute allowedRoles={['THERAPIST']}><ApplicationRejected /></ProtectedRoute>} />
                <Route path="/therapist/cooldown-period" element={<ProtectedRoute allowedRoles={['THERAPIST']}><CooldownPeriod /></ProtectedRoute>} />

                {/* Shared Routes - Available for both therapist and patient */}
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/account-settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />

                {/* Catch all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ChatNotificationProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
