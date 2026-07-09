import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBreadcrumbs } from '../contexts/BreadcrumbContext'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2'
import {
  FiDatabase,
  FiChevronRight as FiChevronRightSmall,
  FiBarChart2,
  FiActivity,
  FiUsers,
  FiPieChart,
  FiLogOut,
} from 'react-icons/fi'
import './Layout.css'
import { useAppVersion } from '../hooks/useAppVersion'

interface LayoutProps {
  children: ReactNode
}

const MAPA_TITULOS: Record<string, string> = {
  '/visao-geral': 'Visão geral',
  '/contratos': 'Contratos',
  '/kpis-universais': 'Biblioteca de KPIs',
  '/graficos-padrao': 'Gráficos padrão',
  '/usuarios': 'Usuários',
  '/dashboard/executivo': 'Relatórios executivos',
}

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function Layout({ children }: LayoutProps) {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const [sidebarAberta, setSidebarAberta] = useState(true)
  const { breadcrumbs } = useBreadcrumbs()
  const versaoLabel = useAppVersion()

  const toggleSidebar = () => setSidebarAberta(prev => !prev)

  const temBreadcrumbsCustomizados = breadcrumbs.length > 0
  let titulo: string
  let breadcrumbElements: { label: string; href?: string }[]

  if (temBreadcrumbsCustomizados) {
    titulo = breadcrumbs[breadcrumbs.length - 1]?.label || 'Sistemma'
    breadcrumbElements = breadcrumbs
  } else {
    const path = location.pathname
    if (MAPA_TITULOS[path]) {
      titulo = MAPA_TITULOS[path]
      breadcrumbElements = [{ label: titulo }]
    } else if (path.startsWith('/contratos/')) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 2) {
        titulo = 'Detalhe do contrato'
        breadcrumbElements = [
          { label: 'Visão geral', href: '/visao-geral' },
          { label: 'Contratos', href: '/contratos' },
          { label: titulo },
        ]
      } else if (parts.length >= 4) {
        const isConfig = parts.includes('configurar')
        titulo = isConfig ? 'Configuração do serviço' : 'Relatório do serviço'
        breadcrumbElements = [
          { label: 'Visão geral', href: '/visao-geral' },
          { label: 'Contratos', href: '/contratos' },
          { label: titulo },
        ]
      } else {
        titulo = 'Sistemma'
        breadcrumbElements = [{ label: 'Sistemma' }]
      }
    } else {
      titulo = 'Sistemma'
      breadcrumbElements = [{ label: 'Sistemma' }]
    }
  }

  const fecharSidebarMobile = () => {
    if (window.innerWidth <= 768) setSidebarAberta(false)
  }

  return (
    <div className="layout">
      <div
        className={`sidebar-overlay ${sidebarAberta ? '' : 'hidden'}`}
        onClick={() => setSidebarAberta(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${sidebarAberta ? '' : 'collapsed'}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon" aria-hidden="true">
            <FiBarChart2 size={22} />
          </div>
          <div className={`sidebar-brand-text ${sidebarAberta ? '' : 'hidden-text'}`}>
            <span className="sidebar-brand-name">Sistemma</span>
            <span className="sidebar-brand-tag">Analytics</span>
          </div>
          <button
            type="button"
            className="btn-toggle"
            onClick={toggleSidebar}
            title="Recolher menu"
            aria-label="Recolher menu"
          >
            {sidebarAberta ? <HiChevronLeft size={18} /> : <HiChevronRight size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação principal">
          <div className={`sidebar-section-label ${sidebarAberta ? '' : 'hidden-text'}`}>
            Relatórios
          </div>

          <Link
            to="/visao-geral"
            className={`sidebar-link ${location.pathname === '/visao-geral' ? 'active' : ''}`}
            onClick={fecharSidebarMobile}
          >
            <span className="sidebar-icon"><FiActivity size={20} /></span>
            <span className={sidebarAberta ? '' : 'hidden-text'}>Visão geral</span>
          </Link>

          <Link
            to="/dashboard/executivo"
            className={`sidebar-link ${location.pathname === '/dashboard/executivo' ? 'active' : ''}`}
            onClick={fecharSidebarMobile}
          >
            <span className="sidebar-icon"><FiPieChart size={20} /></span>
            <span className={sidebarAberta ? '' : 'hidden-text'}>Executivo</span>
          </Link>

          <div className={`sidebar-section-label ${sidebarAberta ? '' : 'hidden-text'}`}>
            Dados
          </div>

          <Link
            to="/contratos"
            className={`sidebar-link ${location.pathname.startsWith('/contratos') ? 'active' : ''}`}
            onClick={fecharSidebarMobile}
          >
            <span className="sidebar-icon"><FiDatabase size={20} /></span>
            <span className={sidebarAberta ? '' : 'hidden-text'}>Contratos</span>
          </Link>

          {isAdmin && (
            <>
              <div className={`sidebar-section-label ${sidebarAberta ? '' : 'hidden-text'}`}>
                Administração
              </div>

              <Link
                to="/kpis-universais"
                className={`sidebar-link ${location.pathname === '/kpis-universais' ? 'active' : ''}`}
                onClick={fecharSidebarMobile}
              >
                <span className="sidebar-icon"><FiBarChart2 size={18} /></span>
                <span className={sidebarAberta ? '' : 'hidden-text'}>KPIs universais</span>
              </Link>

              <Link
                to="/graficos-padrao"
                className={`sidebar-link ${location.pathname === '/graficos-padrao' ? 'active' : ''}`}
                onClick={fecharSidebarMobile}
              >
                <span className="sidebar-icon"><FiBarChart2 size={18} /></span>
                <span className={sidebarAberta ? '' : 'hidden-text'}>Gráficos padrão</span>
              </Link>

              <Link
                to="/usuarios"
                className={`sidebar-link ${location.pathname === '/usuarios' ? 'active' : ''}`}
                onClick={fecharSidebarMobile}
              >
                <span className="sidebar-icon"><FiUsers size={18} /></span>
                <span className={sidebarAberta ? '' : 'hidden-text'}>Usuários</span>
              </Link>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <span className={`sidebar-version ${sidebarAberta ? '' : 'hidden-text'}`}>
            {versaoLabel}
          </span>
        </div>
      </aside>

      <div className="layout-main">
        <header className="header">
          <div className="header-left">
            <button
              type="button"
              className="btn-toggle-mobile"
              onClick={toggleSidebar}
              title="Abrir menu"
              aria-label="Abrir menu"
            >
              <HiChevronRight size={20} />
            </button>
            <div className="header-titles">
              {breadcrumbElements.length > 1 && (
                <nav className="breadcrumb-nav" aria-label="Breadcrumb">
                  {breadcrumbElements.map((item, idx) => (
                    <span key={idx} className="breadcrumb-item">
                      {idx > 0 && <FiChevronRightSmall size={12} className="breadcrumb-sep" />}
                      {item.href ? (
                        <Link to={item.href}>{item.label}</Link>
                      ) : (
                        <span className="breadcrumb-current">{item.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              <h1 title={titulo}>{titulo}</h1>
            </div>
          </div>

          <div className="header-user">
            <div className="header-user-chip">
              <div className="header-user-avatar" title={user?.nome || 'Usuário'}>
                {getInitials(user?.nome || 'U')}
              </div>
              <span className="header-user-name">{user?.nome || 'Usuário'}</span>
            </div>
            <button type="button" className="btn-logout-header" onClick={logout} title="Sair">
              <FiLogOut size={16} />
              <span>Sair</span>
            </button>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
