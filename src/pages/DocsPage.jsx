import { useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";

const sections = {
  getting_started: {
    nav: "Getting Started",
    eyebrow: "Setup",
    title: "Start with branch structure, not random data entry.",
    intro:
      "The best onboarding path is to configure the library correctly before operators begin daily work.",
    bullets: [
      "Create the branch with seat count, lockers, and contact details",
      "Add shifts and their monthly pricing",
      "Review combined pricing only if the library actually needs it",
    ],
    note:
      "If you are still choosing a plan, check the pricing page first and then return here.",
  },
  operations: {
    nav: "Operations",
    eyebrow: "Daily use",
    title: "Use the configured structure to manage students and renewals.",
    intro:
      "Once the branch is set up, daily activity should follow the same structure instead of separate manual records.",
    bullets: [
      "Assign seats based on available shift capacity",
      "Track fee status against the student record",
      "Watch expiring memberships and act before they lapse",
    ],
    note:
      "Operational clarity is the main reason to keep setup disciplined from the start.",
  },
  pricing_and_lockers: {
    nav: "Pricing & Lockers",
    eyebrow: "Configuration",
    title: "Keep pricing rules and locker policies consistent.",
    intro:
      "Shift pricing, combined pricing, and locker rules should stay attached to branch setup instead of being maintained separately.",
    bullets: [
      "Define monthly fees per shift",
      "Add combined pricing only for real combo packages",
      "Set locker eligibility and monthly locker fee where required",
    ],
    note:
      "Do not overload the branch with unnecessary pricing combinations during the first setup.",
  },
  support_and_updates: {
    nav: "Support & Updates",
    eyebrow: "Public flow",
    title: "Keep the public site centered on support, pricing, and registration.",
    intro:
      "The public side should help libraries understand the product, choose a plan, and complete registration cleanly.",
    bullets: [
      "Use help articles for common questions",
      "Use pricing for plan comparison before registration",
      "Use the registration flow when branch details are ready",
    ],
    note:
      "The public site works best when it stays focused on onboarding and registration.",
  },
};

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("getting_started");
  const section = sections[activeSection];

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Documentation"
        title="Short operational docs for setup, usage, and registration flow."
        description="This page keeps the documentation narrow and relevant: how to set up a branch, use the product daily, and move through registration."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Start Registration
            </Link>
            <Link to="/help" className="btn btn-secondary">
              Open Help Center
            </Link>
          </>
        }
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Docs navigation"
            title="Pick the part of the system you need."
            description="The content is grouped by actual responsibilities rather than a large generic manual."
          />

          <div className="docs-shell">
            <aside className="docs-sidebar">
              <span className="public-eyebrow">Sections</span>
              <nav>
                {Object.entries(sections).map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    className={`docs-nav-button ${activeSection === key ? "active" : ""}`}
                    onClick={() => setActiveSection(key)}
                  >
                    {value.nav}
                  </button>
                ))}
              </nav>
            </aside>

            <article className="docs-content-card">
              <span className="public-eyebrow">{section.eyebrow}</span>
              <h2 style={{ marginTop: "1rem", fontSize: "2rem" }}>{section.title}</h2>
              <p>{section.intro}</p>

              <h3>What to do</h3>
              <ul className="docs-section-list">
                {section.bullets.map((item) => (
                  <li key={item}>
                    <span className="material-symbols-rounded icon-sm">
                      check_circle
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="docs-note">{section.note}</div>
            </article>
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Next route"
        title="Go to help for article search or registration for branch setup."
        description="The docs page stays concise on purpose. Use the next route depending on whether you need instructions or action."
        actions={
          <>
            <Link to="/help" className="btn btn-primary">
              Search Help Articles
            </Link>
            <Link to="/register" className="btn btn-white">
              Register Library
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
