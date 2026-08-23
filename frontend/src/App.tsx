import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ehGestor, homePath } from './utils/homePath'
import { ToastProvider } from './contexts/ToastContext'
import { BreadcrumbProvider } from './contexts/BreadcrumbContext'
import ToastContainer from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import Acesso from './pages/Acesso'
import VisaoGeral from './pages/VisaoGeral'
import Contratos from './pages/Contratos'
import ContratoDetalhe from './pages/ContratoDetalhe'
import ServicoVisao from './pages/ServicoVisao'
import ServicoDiaDetalhe from './pages/ServicoDiaDetalhe'
import ConfiguracaoServico from './pages/ConfiguracaoServico'
import BibliotecaKpisUniversais from './pages/BibliotecaKpisUniversais'
import DashboardExecutivo from './pages/DashboardExecutivo'
import BibliotecaGraficosPadrao from './pages/BibliotecaGraficosPadrao'
import WhatsappGrupos from './pages/WhatsappGrupos'

import './App.css'

/* ─── Componente de redirecionamento para rotas antigas ─── */
function RedirectServico() {
  const { contractId, servicoId } = useParams();
  return <Navigate to={`/contratos/${contractId}/servicos/${servicoId}`} replace />;
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={homePath(user)} replace />
}

function GestorOnlyRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!ehGestor(user) || user?.contractId) return <Navigate to={homePath(user)} replace />
  return <>{children}</>
}

/** Sem sessão a raiz é a própria escolha de área; com sessão vai para a home. */
function RaizOuAcesso() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to={homePath(user)} replace />
  return <Acesso />
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <ToastContainer />
          <BreadcrumbProvider>
        <Routes>
      {/* Escolha de área (Gestor / Contratos) — sem sidebar */}
          <Route path="/" element={<RaizOuAcesso />} />
          <Route path="/acesso" element={<Navigate to="/" replace />} />
          {/* Link antigo de quando existia tela de login */}
          <Route path="/login" element={<Navigate to="/" replace />} />

      {/* Rotas protegidas com Layout (sidebar + logout) */}
          <Route
            path="/visao-geral"
            element={
              <ProtectedRoute>
                <Layout>
                  <VisaoGeral />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/visao-gestor" element={<Navigate to="/visao-geral" replace />} />

          <Route
            path="/contratos"
            element={
              <ProtectedRoute>
                <Layout>
                  <Contratos />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contratos/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <ContratoDetalhe />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/kpis-universais"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Layout>
                    <BibliotecaKpisUniversais />
                  </Layout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          {/* ═══ NOVA ESTRUTURA: Serviço (visão pura) e Configuração do Serviço ═══ */}
          <Route
            path="/contratos/:contractId/servicos/:servicoId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ServicoVisao />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/dia/:data"
            element={
              <ProtectedRoute>
                <Layout>
                  <ServicoDiaDetalhe />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/configurar"
            element={
              <ProtectedRoute>
                <Layout>
                  <ConfiguracaoServico />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/executivo"
            element={
              <ProtectedRoute>
                <GestorOnlyRoute>
                  <Layout>
                    <DashboardExecutivo />
                  </Layout>
                </GestorOnlyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/graficos-padrao"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Layout>
                    <BibliotecaGraficosPadrao />
                  </Layout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp-grupos"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Layout>
                    <WhatsappGrupos />
                  </Layout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />

          <Route path="/dashboard" element={<Navigate to="/visao-geral" replace />} />
          <Route path="/dashboard/*" element={<Navigate to="/visao-geral" replace />} />

          {/* ═══ ROTAS ANTIGAS — REDIRECIONAM PARA A NOVA ESTRUTURA ═══ */}
          <Route
            path="/contratos/:contractId/servicos/:servicoId/dashboard"
            element={<RedirectServico />}
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/dados"
            element={<RedirectServico />}
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/detalhes"
            element={<RedirectServico />}
          />

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
          </BreadcrumbProvider>
      </Router>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
