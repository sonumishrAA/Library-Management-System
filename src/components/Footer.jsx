import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer section">
      {/* Decorative Glows */}
      <div className="footer-glow glow-1"></div>
      <div className="footer-glow glow-2"></div>

      <div className="container relative z-10">
        <div className="footer-grid">
          <div className="footer-brand-col">
            <div className="footer-brand">
              <div className="footer-logo-icon">
                 <span className="material-symbols-rounded text-white">local_library</span>
              </div>
              <span className="footer-logo-text">LibraryOS</span>
            </div>
            <div className="footer-badge">
              <span className="footer-badge-dot"></span>
              Built for Indian Libraries
            </div>
            <p className="footer-desc">
              Seats, shifts, fees, renewals, lockers, and CCTV workflows in one focused operating system for Indian libraries.
            </p>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Product</h4>
            <ul className="footer-link-list">
              <li><Link to="/features" className="footer-link-item">Features</Link></li>
              <li><Link to="/pricing" className="footer-link-item">Pricing</Link></li>
              <li><Link to="/demo" className="footer-link-item">Demo</Link></li>
              <li><Link to="/docs" className="footer-link-item">Docs</Link></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Company</h4>
            <ul className="footer-link-list">
              <li><Link to="/founder" className="footer-link-item">Founder</Link></li>
              <li><Link to="/register" className="footer-link-item">Register Library</Link></li>
              <li><Link to="/contact" className="footer-link-item">Contact</Link></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Support</h4>
            <ul className="footer-link-list">
              <li><Link to="/help" className="footer-link-item">Help Center</Link></li>
              <li><Link to="/docs" className="footer-link-item">Docs</Link></li>
              <li><Link to="/pricing" className="footer-link-item">Billing</Link></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Legal</h4>
            <ul className="footer-link-list">
              <li><Link to="/privacy-policy" className="footer-link-item">Privacy Policy</Link></li>
              <li><Link to="/terms-of-service" className="footer-link-item">Terms of Service</Link></li>
              <li><Link to="/refund-policy" className="footer-link-item">Refund Policy</Link></li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} LibraryOS. All rights reserved.</div>
          <div className="footer-bottom-flex">
            Built for focused library operations in India
          </div>
        </div>
      </div>
    </footer>
  );
}
