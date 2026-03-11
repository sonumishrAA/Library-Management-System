import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";

const metrics = [
  {
    label: "Seats empty right now",
    value: "18",
    note: "8 morning, 6 evening, 4 full day",
  },
  {
    label: "Pending fee amount",
    value: "₹26,400",
    note: "6 students still unpaid",
  },
  {
    label: "Monthly collections",
    value: "₹1,18,200",
    note: "Current month total received",
  },
  {
    label: "CCTV live feeds",
    value: "4/4",
    note: "All cameras online",
  },
];

const operatorQueue = [
  "Ravi Kumar renewal expires tonight",
  "Morning shift has 8 vacant seats",
  "Priya Singh pending payment for 2 days",
  "Night shift CCTV camera checked online",
];

const registrationFlow = [
  "Start with branch details, seat count, and contact information",
  "Add shifts and monthly pricing before daily usage begins",
  "Include lockers only if the branch actually offers them",
  "Finish with a clean registration summary before submission",
];

export default function DemoPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Demo"
        title="See the exact numbers a library owner and operator care about every day."
        description="The demo view below is built around real operational pressure: seats lying vacant, payments pending, monthly money received, CCTV visibility, and the registration flow that brings a branch into the system."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Register Library
            </Link>
            <Link to="/pricing" className="btn btn-secondary">
              View Plans
            </Link>
          </>
        }
        meta={[
          "Pending payments",
          "Empty seats",
          "Monthly collections",
        ]}
        aside={
          <div className="dashboard-preview">
            <div className="dashboard-preview-header">
              <div className="dashboard-preview-title">
                <strong>Live branch snapshot</strong>
                <span>Owner dashboard preview</span>
              </div>
              <span className="dashboard-preview-status">
                <span className="material-symbols-rounded icon-sm">visibility</span>
                Preview
              </span>
            </div>

            <div className="dashboard-preview-grid dashboard-preview-grid-four">
              <div className="dashboard-preview-stat">
                <strong>18</strong>
                <span>Seats empty</span>
              </div>
              <div className="dashboard-preview-stat">
                <strong>₹26.4k</strong>
                <span>Pending</span>
              </div>
              <div className="dashboard-preview-stat">
                <strong>₹1.18L</strong>
                <span>Collected</span>
              </div>
              <div className="dashboard-preview-stat">
                <strong>4/4</strong>
                <span>CCTV live</span>
              </div>
            </div>

            <div className="dashboard-preview-flow">
              <div className="dashboard-preview-panel">
                <div className="dashboard-preview-panel-header">
                  <span>Queue</span>
                  <strong>Today</strong>
                </div>
                <ul className="dashboard-preview-list">
                  <li>
                    <span>3 renewals due</span>
                    <small>₹4,500 risk</small>
                  </li>
                  <li>
                    <span>6 payments pending</span>
                    <small>Follow up now</small>
                  </li>
                  <li>
                    <span>Morning shift seats open</span>
                    <small>8 available</small>
                  </li>
                </ul>
              </div>

              <div className="dashboard-preview-panel">
                <div className="dashboard-preview-panel-header">
                  <span>Registration</span>
                  <strong>Flow</strong>
                </div>
                <ul className="dashboard-preview-list">
                  <li>
                    <span>Branch details captured</span>
                    <small>Step 1 complete</small>
                  </li>
                  <li>
                    <span>Shift pricing configured</span>
                    <small>Ready to review</small>
                  </li>
                  <li>
                    <span>Registration summary generated</span>
                    <small>Submit next</small>
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
            eyebrow="Daily signals"
            title="A good library dashboard makes money leakage and empty capacity obvious."
            description="These are the kinds of numbers the team should not have to calculate manually."
          />

          <div className="public-grid public-grid-4">
            {metrics.map((item) => (
              <article key={item.label} className="metric-card">
                <div className="metric-icon">
                  <span className="material-symbols-rounded">monitoring</span>
                </div>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-soft">
        <div className="container">
          <SectionHeading
            eyebrow="What each side sees"
            title="The demo covers both branch activity and the registration flow."
            description="The public site should stay focused on what matters before go-live: branch setup, operational visibility, and clean registration."
          />

          <div className="public-grid public-grid-2">
            <article className="surface-card">
              <span className="public-eyebrow">Operator view</span>
              <h3>Daily action queue</h3>
              <ul className="public-list" style={{ marginTop: "1rem" }}>
                {operatorQueue.map((item) => (
                  <li key={item}>
                    <span className="material-symbols-rounded icon-sm">
                      check_circle
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="surface-card">
              <span className="public-eyebrow">Registration view</span>
              <h3>Branch onboarding flow</h3>
              <ul className="public-list" style={{ marginTop: "1rem" }}>
                {registrationFlow.map((item) => (
                  <li key={item}>
                    <span className="material-symbols-rounded icon-sm">
                      check_circle
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Why it matters"
            title="The point is not a pretty dashboard. The point is faster action."
            description="If you can see the pending amount, empty seats, this month's revenue, and CCTV health in seconds, the branch runs with less leakage and less delay."
          />

          <div className="public-grid public-grid-3">
            <article className="surface-card">
              <h3>Recover vacant capacity</h3>
              <p>
                Empty seats stop being invisible and start looking like revenue
                targets by shift.
              </p>
            </article>
            <article className="surface-card">
              <h3>Follow up faster on payments</h3>
              <p>
                The team knows exactly how much is pending and which students need
                attention first.
              </p>
            </article>
            <article className="surface-card">
              <h3>Keep registration structured</h3>
              <p>
                A cleaner registration flow means the branch enters the system
                with seats, shifts, pricing, and contacts already structured.
              </p>
            </article>
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Next step"
        title="If this is the kind of operational view you need, start the registration flow."
        description="The demo is here to show the pressure points clearly. The next action is to register the branch and move toward setup."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Start Registration
            </Link>
            <Link to="/contact" className="btn btn-white">
              Contact Team
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
