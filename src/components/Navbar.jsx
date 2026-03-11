import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const navLinks = [
    { label: 'Features', href: '/features', isPage: true },
    { label: 'Pricing', href: '/pricing', isPage: true },
    { label: 'Demo', href: '/demo', isPage: true },
    { label: 'Help', href: '/help', isPage: true },
  ];

  const handleNavClick = (e, link) => {
    if (link.isPage) {
      setMobileOpen(false);
      return; 
    }
    
    if (location.pathname !== '/') {
      return; // Let link navigate to / first
    }
    
    e.preventDefault();
    const el = document.querySelector(link.href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <nav
      id="navbar"
      className={`navbar ${scrolled ? 'scrolled' : ''}`}
    >
      <div className="container h-full">
        <div className="nav-container">
          {/* Logo */}
          <Link to="/" className="nav-logo">
            <span className="material-symbols-rounded">local_library</span>
            <span>LibraryOS</span>
          </Link>

          {/* Desktop Nav */}
          <div className="nav-links">
            {navLinks.map((link) => (
              link.isPage ? (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={(e) => handleNavClick(e, link)}
                  className="nav-link"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link)}
                  className="nav-link"
                >
                  {link.label}
                </a>
              )
            ))}
            <Link to="/register" className="btn btn-primary btn-sm">
              Register Your Library
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            id="mobile-menu-btn"
            className={`mobile-menu-btn ${mobileOpen ? 'open' : ''}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`}>
        {navLinks.map((link) => (
          link.isPage ? (
             <Link
              key={link.href}
              to={link.href}
              onClick={(e) => handleNavClick(e, link)}
              className="nav-link text-base"
             >
               {link.label}
             </Link>
          ) : (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link)}
              className="nav-link text-base"
            >
              {link.label}
            </a>
          )
        ))}
        <Link
          to="/register"
          className="btn btn-primary"
        >
          Register Your Library
        </Link>
      </div>
    </nav>
  );
}
