import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Spinner } from './components/ui';
import { useToast } from './components/Toast';
import { Protected } from './auth/Protected';
import Home from './pages/public/Home';
import { About, ForCompanies, ForProfessionals, Faq, NotFound } from './pages/public/Institutional';
import { Privacy, Terms } from './pages/public/Legal';
import Contact from './pages/public/Contact';
import { Jobs, JobDetail } from './pages/public/Jobs';
import { Courses, CourseDetail } from './pages/public/Courses';
import { Login, SignupChoice, SignupCompany, SignupProfessional, ForgotPassword, UpdatePassword } from './pages/auth/Auth';

// Painéis carregados sob demanda: o site institucional fica leve.
const ProfessionalDashboard = lazy(() => import('./pages/pro/ProfessionalDashboard'));
const CompanyDashboard = lazy(() => import('./pages/company/CompanyDashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const StudentArea = lazy(() => import('./pages/student/Student').then((m) => ({ default: m.StudentArea })));
const CoursePlayer = lazy(() => import('./pages/student/Student').then((m) => ({ default: m.CoursePlayer })));

// Captura o retorno dos links de e-mail (confirmação/recuperação) antes que o cliente Supabase limpe a URL.
const authReturn = new URLSearchParams(window.location.hash.replace(/^#/, ''));
let authNoticeShown = false;

/** Explica ao usuário o resultado do link de e-mail — inclusive o caso comum de link aberto duas vezes. */
function AuthLinkNotice() {
  const toast = useToast();
  useEffect(() => {
    if (authNoticeShown) return;
    authNoticeShown = true;
    const code = authReturn.get('error_code');
    if (code) {
      toast('info', code === 'otp_expired'
        ? 'Este link de e-mail já foi usado ou expirou. Se você já confirmou sua conta, é só entrar com e-mail e senha.'
        : 'Não foi possível validar o link do e-mail. Tente entrar ou peça um novo link.');
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else if (authReturn.get('type') === 'signup' && authReturn.get('access_token')) {
      toast('ok', 'E-mail confirmado! Bem-vindo à DRAGON APEX TALENT.');
    }
  }, [toast]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <AuthLinkNotice />
      <Header />
      <main>
        <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/sobre" element={<About />} />
            <Route path="/profissionais" element={<ForProfessionals />} />
            <Route path="/empresas" element={<ForCompanies />} />
            <Route path="/vagas" element={<Jobs />} />
            <Route path="/vagas/:id" element={<JobDetail />} />
            <Route path="/cursos" element={<Courses />} />
            <Route path="/cursos/:slug" element={<CourseDetail />} />
            <Route path="/contato" element={<Contact />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/termos" element={<Terms />} />

            <Route path="/entrar" element={<Login />} />
            <Route path="/cadastro" element={<SignupChoice />} />
            <Route path="/cadastro/profissional" element={<SignupProfessional />} />
            <Route path="/cadastro/empresa" element={<SignupCompany />} />
            <Route path="/recuperar-senha" element={<ForgotPassword />} />
            <Route path="/nova-senha" element={<UpdatePassword />} />

            <Route path="/painel/profissional" element={<Protected role="professional"><ProfessionalDashboard /></Protected>} />
            <Route path="/painel/empresa" element={<Protected role="company"><CompanyDashboard /></Protected>} />
            <Route path="/aluno" element={<Protected role={['professional', 'company', 'admin']}><StudentArea /></Protected>} />
            <Route path="/aluno/:courseId" element={<Protected role={['professional', 'company', 'admin']}><CoursePlayer /></Protected>} />
            <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
            <Route path="/banco-de-talentos" element={<Protected role="admin"><AdminDashboard /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
