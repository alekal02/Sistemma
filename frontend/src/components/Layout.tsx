import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useBreadcrumbs } from '../contexts/BreadcrumbContext'
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2'
import { FiDatabase, FiChevronRight as FiChevronRightSmall, FiBarChart2 } from 'react-icons/fi'
import { LuLayoutDashboard } from 'react-icons/lu'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

const MAPA_TITULOS: Record<string, string> = {
  '/visao-geral': 'Visão Geral',
  '/contratos': 'Contratos',
  '/kpis-universais': 'Biblioteca de KPIs',
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
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarAberta, setSidebarAberta] = useState(true)
  const { breadcrumbs } = useBreadcrumbs()

  const toggleSidebar = () => {
    setSidebarAberta(prev => !prev)
  }

  // Determinar o título e breadcrumbs
  const temBreadcrumbsCustomizados = breadcrumbs.length > 0

  let titulo: string
  let breadcrumbElements: { label: string; href?: string }[]

  if (temBreadcrumbsCustomizados) {
    // Usar breadcrumbs definidos pela página
    titulo = breadcrumbs[breadcrumbs.length - 1]?.label || 'Sistemma'
    breadcrumbElements = breadcrumbs
  } else {
    // Breadcrumbs automáticos baseados na URL
    const path = location.pathname
    if (MAPA_TITULOS[path]) {
      titulo = MAPA_TITULOS[path]
      breadcrumbElements = [{ label: titulo }]
    } else if (path.startsWith('/contratos/')) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 2) {
        // /contratos/:id
        titulo = 'Detalhe do Contrato'
        breadcrumbElements = [
          { label: 'Visão Geral', href: '/visao-geral' },
          { label: 'Contratos', href: '/contratos' },
          { label: titulo },
        ]
      } else if (parts.length >= 4) {
        const isConfig = parts.includes('configurar');
        titulo = isConfig ? 'Configuração do Serviço' : 'Serviço';
        breadcrumbElements = [
          { label: 'Visão Geral', href: '/visao-geral' },
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

  return (
    <div className="layout">
      {/* Overlay do sidebar em mobile */}
      <div
        className={`sidebar-overlay ${sidebarAberta ? '' : 'hidden'}`}
        onClick={() => setSidebarAberta(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarAberta ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-content">
            <h2 className={sidebarAberta ? '' : 'hidden-text'}>Sistemma</h2>
            <button className={`btn-toggle ${sidebarAberta ? '' : 'collapsed'}`} onClick={toggleSidebar} title="Alternar menu">
              {sidebarAberta ? <HiChevronLeft size={16} /> : <HiChevronRight size={16} />}
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className={`sidebar-section-label ${sidebarAberta ? '' : 'hidden-text'}`}>Principal</div>

          <Link
            to="/visao-geral"
            className={`sidebar-link ${location.pathname === '/visao-geral' ? 'active' : ''}`}
            onClick={() => { if (window.innerWidth <= 768) setSidebarAberta(false); }}
          >
            <span className="sidebar-icon"><LuLayoutDashboard size={20} /></span>
            <span className={sidebarAberta ? '' : 'hidden-text'}>Dashboard</span>
          </Link>

          <Link
            to="/contratos"
            className={`sidebar-link ${location.pathname.startsWith('/contratos') ? 'active' : ''}`}
            onClick={() => { if (window.innerWidth <= 768) setSidebarAberta(false); }}
          >
            <span className="sidebar-icon"><FiDatabase size={20} /></span>
            <span className={sidebarAberta ? '' : 'hidden-text'}>Contratos</span>
          </Link>

          <div className={`sidebar-section-label ${sidebarAberta ? '' : 'hidden-text'}`}>Bibliotecas</div>

          <Link
            to="/kpis-universais"
            className={`sidebar-link ${location.pathname === '/kpis-universais' ? 'active' : ''}`}
            onClick={() => { if (window.innerWidth <= 768) setSidebarAberta(false); }}
          >
            <span className="sidebar-icon"><FiBarChart2 size={18} /></span>
            <span className={sidebarAberta ? '' : 'hidden-text'}>KPIs Universais</span>
          </Link>

        </nav>

        <div className="sidebar-footer">
          <span className={`sidebar-version ${sidebarAberta ? '' : 'hidden-text'}`}>v1.0.0</span>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="layout-main">
        <header className="header">
          <div className="header-left">
            <button className="btn-toggle-mobile" onClick={toggleSidebar} title="Alternar menu">
              <HiChevronRight size={20} />
            </button>
            <div>
              {/* Breadcrumbs */}
              {breadcrumbElements.length > 1 && (
                <nav className="breadcrumb-nav">
                  {breadcrumbElements.map((item, idx) => (
                    <span key={idx}>
                      {idx > 0 && <FiChevronRightSmall size={10} style={{ color: '#cbd5e1' }} />}
                      {item.href ? (
                        <Link to={item.href}>{item.label}</Link>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              <h1 title={titulo}>{titulo}</h1>
            </div>
          </div>
          <div className="header-user">
            <div className="header-user-avatar" title={user?.nome || 'Usuário'}>
              {getInitials(user?.nome || 'U')}
            </div>
            <span className="header-user-name">{user?.nome || 'Usuário'}</span>
            <button className="btn-logout-header" onClick={logout}>
              Sair
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
