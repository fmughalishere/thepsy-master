import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { currentUser, userData, loading } = useAuth();
    const location = useLocation();

    useEffect(() => {
        // Prevention of back navigation from dashboard
        const handlePopState = (e: PopStateEvent) => {
            const isDashboard = location.pathname.includes('dashboard');
            if (isDashboard) {
                window.history.pushState(null, '', window.location.href);
            }
        };

        if (location.pathname.includes('dashboard')) {
            window.history.pushState(null, '', window.location.href);
            window.addEventListener('popstate', handlePopState);
        }

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [location.pathname]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
        // Redirect to their specific dashboard based on role
        if (userData.role === 'ADMIN' || userData.role === 'SUPER_ADMIN') {
            return <Navigate to="/admin/dashboard" replace />;
        }
        
        switch (userData.role) {
            case 'THERAPIST':
                return <Navigate to="/therapist/dashboard" replace />;
            case 'PATIENT':
                return <Navigate to="/dashboard" replace />;
            default:
                return <Navigate to="/" replace />;
        }
    }

    return <>{children}</>;
};

export default ProtectedRoute;
