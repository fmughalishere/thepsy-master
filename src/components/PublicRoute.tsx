import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PublicRouteProps {
    children: React.ReactNode;
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
    const { currentUser, userData, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (currentUser && userData) {
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
                return <Navigate to="/dashboard" replace />;
        }
    }

    return <>{children}</>;
};

export default PublicRoute;
