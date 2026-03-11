import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";

const modules = [
  {
    title: "Admissions and seats",
    description:
      "Set branch capacity, assign seats by shift, and keep availability visible without duplicate booking mistakes.",
    bullets: [
      "Seat status stays tied to actual shifts",
      "Capacity is visible before assigning new students",
      "Libraries can define their own shift structures",
    ],
  },
  {
    title: "Pricing and fee collection",
    description:
      "Configure monthly fees per shift and keep collections visible in one billing workflow.",
    bullets: [
      "Shift pricing can differ by time slot",
      "Combined shift pricing can be configured where needed",
      "Payment visibility stays tied to student records",
    ],
  },
  {
    title: "Renewals and alerts",
    description:
      "Keep expiring memberships visible so the team can act before revenue slips away.",
    bullets: [
      "Expiring memberships surface in the dashboard",
      "Renewal work is easier to prioritize daily",
      "Operators do not need separate reminder sheets",
    ],
  },
  {
    title: "Locker policies",
    description:
      "Support locker rules and fees only where the branch actually offers them.",
    bullets: [
      "Locker fees stay separate from seat pricing",
      "Eligibility can be defined by shift type",
      "Rules remain attached to library setup",
    ],
  },
  {
    title: "CCTV access",
    description:
      "Where branches need it, CCTV pricing and visibility can be included in the same operating layer.",
    bullets: [
      "Optional pricing can be enabled per plan",
      "The product keeps CCTV in the same workflow",
      "No need to explain it as a separate service page",
    ],
  },
  {
    title: "Registration visibility",
    description:
      "The registration flow keeps branch details structured so the onboarding side can review them without confusion.",
    bullets: [
      "Registered libraries arrive with structured branch data",
      "Support and public content can stay separate from registration",
      "Branch details remain readable at review time",
    ],
  },
];

const principles = [
  "Built around shift-based libraries in India",
  "Focused on real operational tasks, not generic dashboards",
  "Supports clean branch setup and registration",
];

const manualVsProduct = {
  manual: [
    "Seat tracking depends on notebooks or scattered spreadsheets",
    "Renewal follow-up is easy to miss during busy days",
    "Pricing rules and locker policies are hard to keep consistent",
    "Operators switch between records, messages, and CCTV separately",
  ],
  product: [
    "Seat usage stays tied to shifts and visible in one view",
    "Expiring memberships stay surfaced for action",
    "Shift pricing, combos, and lockers remain structured",
    "Daily control stays inside one product workflow",
  ],
};

export default function FeaturesPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Product modules"
        title="A feature set shaped around library operations, not filler."
        description="Every module in LibraryOS exists to support setup, occupancy, billing, renewals, operator control, and branch oversight. The focus stays on tasks a study library actually performs."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Register Library
            </Link>
            <Link to="/demo" className="btn btn-secondary">
              View Demo Flow
            </Link>
          </>
        }
        meta={principles}
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Module overview"
            title="Core modules across branch setup, daily execution, and registration."
            description="These modules cover the product surface without padding the page with unrelated claims."
          />

          <div className="public-grid public-grid-3">
            {modules.map((module) => (
              <article key={module.title} className="surface-card">
                <h3>{module.title}</h3>
                <p>{module.description}</p>
                <ul className="feature-bullet-list">
                  {module.bullets.map((bullet) => (
                    <li key={bullet}>
                      <span className="material-symbols-rounded icon-sm">
                        check_circle
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-soft">
        <div className="container">
          <SectionHeading
            eyebrow="How it fits together"
            title="The product workflow follows the order libraries usually need."
            description="Configuration comes first, then daily handling, then clean registration and rollout."
          />

          <div className="public-grid public-grid-3">
            <article className="surface-card">
              <span className="public-eyebrow">1. Setup</span>
              <h3>Library configuration</h3>
              <p>
                Capture seats, lockers, shifts, and pricing rules once so the
                branch can operate on structured data.
              </p>
            </article>
            <article className="surface-card">
              <span className="public-eyebrow">2. Daily use</span>
              <h3>Student operations</h3>
              <p>
                Use the configured structure for admissions, seat assignment,
                payment status, and renewal work.
              </p>
            </article>
            <article className="surface-card">
              <span className="public-eyebrow">3. Oversight</span>
              <h3>Registration and branch review</h3>
              <p>
                Keep the branch setup readable so registration and follow-up stay
                clean.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Comparison"
            title="Why the product is easier to run than a manual process."
            description="The difference is not decoration. It is the reduction of scattered operational work."
          />

          <div className="comparison-grid">
            <article className="comparison-card manual">
              <span className="public-eyebrow">Manual setup</span>
              <h3>More checking, more drift.</h3>
              <ul className="public-list">
                {manualVsProduct.manual.map((item) => (
                  <li key={item}>
                    <span className="material-symbols-rounded icon-sm">
                      close
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="comparison-card libraryos">
              <span className="public-eyebrow">LibraryOS</span>
              <h3>One structured operating layer.</h3>
              <ul className="public-list">
                {manualVsProduct.product.map((item) => (
                  <li key={item}>
                    <span className="material-symbols-rounded icon-sm">
                      done
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Continue"
        title="Check plans or move straight into library registration."
        description="The feature set is already structured around the registration model and the operational needs of the branch."
        actions={
          <>
            <Link to="/pricing" className="btn btn-primary">
              See Pricing
            </Link>
            <Link to="/register" className="btn btn-white">
              Start Registration
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
