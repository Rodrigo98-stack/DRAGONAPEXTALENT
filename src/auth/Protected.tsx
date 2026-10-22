import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, dashboardPath } from './AuthProvider';
import { isConfigured } from '../lib/supabase';
import type { Role } from '../lib/types';
import { ConfigNotice } from '../components/ConfigNotice';
import { Spinner } from '../components/ui';

/** Proteção de rota no frontend. A proteção real está no banco (RLS + RPCs com checagem de papel). */
export function Protected({ role, children }: { role: Role | Role[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  const roles = Array.isArray(role) ? role : [role];

  if (!isConfigured) return <div className="container-x py-32"><ConfigNotice /></div>;
  if (loading || (session && !profile)) return <div className="grid min-h-[60vh] place-items-center"><Spinner /></div>;
  if (!session) return <Navigate to={`/entrar?voltar=${encodeURIComponent(loc.pathname)}`} replace />;
  if (profile && !roles.includes(profile.role)) return <Navigate to={dashboardPath(profile.role)} replace />;
  return <>{children}</>;
}
