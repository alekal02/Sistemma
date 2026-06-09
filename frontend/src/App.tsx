import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { BreadcrumbProvider } from './contexts/BreadcrumbContext'
import ToastContainer from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import VisaoGeral from './pages/VisaoGeral'
import Contratos from './pages/Contratos'
import ContratoDetalhe from './pages/ContratoDetalhe'
import ServicoVisao from './pages/ServicoVisao'
import ConfiguracaoServico from './pages/ConfiguracaoServico'
import BibliotecaKpisUniversais from './pages/BibliotecaKpisUniversais'

import './App.css'

/* ─── Componente de redirecionamento para rotas antigas ─── */
function RedirectServico() {
  const { contractId, servicoId } = useParams();
  return <Navigate to={`/contratos/${contractId}/servicos/${servicoId}`} replace />;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <ToastContainer />
          <BreadcrumbProvider>
        <Routes>
      {/* Rota pública — sem sidebar */}
          <Route path="/login" element={<Login />} />

      {/* Rotas protegidas com Layout (sidebar + logout) */}
          <Route
            path="/"
            element={<Navigate to="/visao-geral" replace />}
          />
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
                <Layout>
                  <BibliotecaKpisUniversais />
                </Layout>
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
            path="/contratos/:contractId/servicos/:servicoId/configurar"
            element={
              <ProtectedRoute>
                <Layout>
                  <ConfiguracaoServico />
                </Layout>
              </ProtectedRoute>
            }
          />

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
        </Routes>
          </BreadcrumbProvider>
      </Router>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
