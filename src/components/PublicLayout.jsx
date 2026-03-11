import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";

export default function PublicLayout({ children, pageClassName = "" }) {
  return (
    <div className={`public-page ${pageClassName}`.trim()}>
      <Navbar />
      <main className="public-main">{children}</main>
      <Footer />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions = null,
  meta = [],
  aside = null,
  compact = false,
}) {
  return (
    <section className={`public-section public-hero ${compact ? "compact" : ""}`}>
      <div className="container">
        <div className={`public-hero-grid ${aside ? "with-aside" : ""}`}>
          <div className="public-hero-copy">
            {eyebrow ? <span className="public-eyebrow">{eyebrow}</span> : null}
            <h1>{title}</h1>
            <p>{description}</p>
            {actions ? <div className="public-actions">{actions}</div> : null}
            {meta.length ? (
              <div className="public-meta-list">
                {meta.map((item) => (
                  <span key={item} className="public-meta-pill">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {aside ? <div className="public-hero-aside">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}) {
  return (
    <div className={`section-heading-block ${align === "center" ? "center" : ""}`}>
      {eyebrow ? <span className="public-eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function CTASection({
  eyebrow,
  title,
  description,
  actions,
}) {
  return (
    <section className="public-section">
      <div className="container">
        <div className="cta-band">
          <div className="cta-band-copy">
            {eyebrow ? <span className="public-eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {actions ? <div className="cta-band-actions">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
