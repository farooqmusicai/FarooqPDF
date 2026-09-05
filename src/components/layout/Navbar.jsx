import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FileText, Github, Star, Zap } from 'lucide-react'
import { useT, LangSwitcher } from '../../i18n/index.jsx'
import styles from './Navbar.module.css'

export default function Navbar({ variant = 'app' }) {
  const location = useLocation()
  const { t } = useT()

  return (
    <nav className={`${styles.nav} ${variant === 'landing' ? styles.landing : ''}`}>
      <div className={styles.left}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoMark}>
            <FileText size={14} />
          </div>
          <span className={styles.logoName}>FarooqPDF</span>
          <span className={styles.logoBeta}>beta</span>
        </Link>

        {variant === 'app' && (
          <div className={styles.tabs}>
            <Link to="/editor" className={`${styles.tab} ${location.pathname === '/editor' ? styles.active : ''}`}>
              {t('nav_editor')}
            </Link>
            <Link to="/tools" className={`${styles.tab} ${location.pathname.startsWith('/tools') ? styles.active : ''}`}>
              {t('nav_tools')}
            </Link>
          </div>
        )}
      </div>

      <div className={styles.right}>
        <LangSwitcher className={styles.langSwitch} />
        <div className={styles.privacyBadge}>
          <div className={styles.dot} />
          <span>{t('nav_local')}</span>
        </div>

        <a
          href="https://github.com/farooqmusicai/FarooqPDF"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubBtn}
        >
          <Github size={14} />
          <span>{t('nav_github')}</span>
          <span className={styles.starCount}>
            <Star size={11} />
            {t('nav_star')}
          </span>
        </a>

        {variant === 'landing' && (
          <Link to="/editor" className={styles.ctaBtn}>
            <Zap size={14} />
            {t('nav_start')}
          </Link>
        )}
      </div>
    </nav>
  )
}
