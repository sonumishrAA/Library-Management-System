import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";
import { getPublicContent } from "../lib/api.js";

const painAreas = [
  {
    icon: "money_off",
    title: "Pending fees become silent losses",
    description:
      "When collections live in notebooks or chats, owners lose track of what is still unpaid and cash flow gets weaker every month.",
  },
  {
    icon: "event_busy",
    title: "Empty seats quietly kill revenue",
    description:
      "A few vacant seats in every shift may look small, but over a month they become real missed income.",
  },
  {
    icon: "notifications_off",
    title: "Renewals are noticed too late",
    description:
      "If expiry tracking is manual, members lapse before the team even realizes follow-up was needed.",
  },
  {
    icon: "videocam_off",
    title: "Operations stay split across tools",
    description:
      "One place for CCTV, another for fees, another for seat records means slower action and more mistakes.",
  },
];

const outcomes = [
  {
    title: "One operating board for the branch",
    description:
      "See empty seats, pending fees, renewals due, and monthly collections without checking separate records.",
  },
  {
    title: "Separate branch app, clean public site",
    description:
      "Library management can stay on its own dedicated product while this public site stays focused on pain, pricing, demo, and registration.",
  },
  {
    title: "Registration stays focused and clean",
    description:
      "The public site should move owners from pain to clarity to registration without distracting them with internal tooling.",
  },
];

export default function LandingPage() {
  const [stats, setStats] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPublicContent() {
      try {
        const [statsResponse, testimonialsResponse] = await Promise.all([
          getPublicContent("stats").catch(() => ({ data: [] })),
          getPublicContent("testimonials").catch(() => ({ data: [] })),
        ]);
        setStats(statsResponse?.data || []);
        setTestimonials(testimonialsResponse?.data || []);
      } catch (error) {
        console.error("Failed to load landing content", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPublicContent();
  }, []);

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Library pain"
        title="Empty seats, pending fees, and silent renewals cost libraries every month."
        description="If the branch still runs on scattered notes, manual follow-up, and separate CCTV or billing checks, revenue leaks before anyone sees the pattern. LibraryOS is built to make that pain visible and actionable."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Register Your Library
            </Link>
            <Link to="/demo" className="btn btn-secondary">
              See Live Demo Flow
            </Link>
          </>
        }
        meta={[
          "Pending fees visible",
          "Empty seats tracked",
          "Renewal risk surfaced",
        ]}
        aside={
          <div className="dashboard-preview">
            <div className="dashboard-preview-header">
              <div className="dashboard-preview-title">
                <strong>Branch revenue board</strong>
                <span>What the owner should see immediately</span>
              </div>
              <span className="dashboard-preview-status">
                <span className="material-symbols-rounded icon-sm">monitoring</span>
                Live
              </span>
            </div>

            <div className="dashboard-preview-grid dashboard-preview-grid-four">
              <div className="dashboard-preview-stat">
                <strong>18</strong>
                <span>Seats empty</span>
              </div>
              <div className="dashboard-preview-stat">
                <strong>₹26.4k</strong>
                <span>Pending fees</span>
              </div>
              <div className="dashboard-preview-stat">
                <strong>₹1.18L</strong>
                <span>This month</span>
              </div>
              <div className="dashboard-preview-stat">
                <strong>4/4</strong>
                <span>CCTV live</span>
              </div>
            </div>

            <div className="dashboard-preview-flow">
              <div className="dashboard-preview-panel">
                <div className="dashboard-preview-panel-header">
                  <span>Today needs attention</span>
                  <strong>7 items</strong>
                </div>
                <ul className="dashboard-preview-list">
                  <li>
                    <span>3 renewals expire tonight</span>
                    <small>₹4,500 at risk</small>
                  </li>
                  <li>
                    <span>6 payments still pending</span>
                    <small>Follow-up due</small>
                  </li>
                  <li>
                    <span>Morning shift has 8 seats open</span>
                    <small>Revenue gap</small>
                  </li>
                </ul>
              </div>

              <div className="dashboard-preview-panel">
                <div className="dashboard-preview-panel-header">
                  <span>Registration path</span>
                  <strong>Next steps</strong>
                </div>
                <ul className="dashboard-preview-list">
                  <li>
                    <span>Branch details ready</span>
                    <small>Start registration</small>
                  </li>
                  <li>
                    <span>Shift pricing prepared</span>
                    <small>Add in form</small>
                  </li>
                  <li>
                    <span>Contact details available</span>
                    <small>Submit cleanly</small>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        }
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Where the pain starts"
            title="Most libraries do not lose money in one big mistake. They lose it in daily blind spots."
            description="The problem is usually a combination of missed collections, hidden vacancies, late renewals, and too many disconnected tools."
          />

          <div className="public-grid public-grid-4">
            {painAreas.map((item) => (
              <article key={item.title} className="surface-card">
                <div className="icon-chip">
                  <span className="material-symbols-rounded">{item.icon}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-soft">
        <div className="container">
          <SectionHeading
            eyebrow="What changes"
            title="The moment operations become visible, owners can act faster."
            description="LibraryOS is meant to expose the daily pressure points clearly enough that the branch can recover seats, collections, and renewals instead of guessing."
          />

          <div className="public-grid public-grid-3">
            {outcomes.map((item, index) => (
              <article key={item.title} className="surface-card">
                <span className="public-eyebrow">Shift 0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Public stats"
            title="Current public numbers from the site content layer."
            description="These figures are editable from the content side and stay visible on the public site without redesign work."
          />

          {loading ? (
            <div className="public-metric-grid">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="metric-card">
                  <div className="metric-icon">
                    <span className="material-symbols-rounded">analytics</span>
                  </div>
                  <strong>...</strong>
                  <span>Loading</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="public-metric-grid">
              {stats.map((item) => (
                <article key={item.id || item.label} className="metric-card">
                  <div className="metric-icon">
                    <span className="material-symbols-rounded">
                      {item.icon || "insights"}
                    </span>
                  </div>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="public-section public-section-soft">
        <div className="container">
          <SectionHeading
            eyebrow="After go-live"
            title="Operators usually care about one thing: fewer blind spots."
            description="When the dashboard makes pending money, renewals, and seat usage obvious, teams stop reacting late."
          />

          <div className="public-grid public-grid-3">
            {(testimonials.length ? testimonials : []).slice(0, 3).map((item) => (
              <article key={item.id || item.name} className="quote-card">
                <header>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.library_name}
                      {item.city ? `, ${item.city}` : ""}
                    </span>
                  </div>
                  <span className="public-meta-pill">
                    {item.rating || 5}/5
                  </span>
                </header>
                <p>{item.review}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Act now"
        title="If those blind spots feel familiar, start the registration flow now."
        description="Use the demo to inspect the operational view, or go straight to registration if you already know the branch needs a cleaner system."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Start Registration
            </Link>
            <Link to="/demo" className="btn btn-white">
              Open Demo
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
