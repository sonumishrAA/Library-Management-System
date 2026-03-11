import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
} from "../components/PublicLayout.jsx";

const nextSteps = [
  "The registration is now available for internal review.",
  "The team can verify branch details and contact information.",
  "Follow-up happens after the submitted library data is checked.",
];

export default function RegistrationSuccess() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Registration submitted"
        title="Your library details have been received."
        description="The branch setup has been submitted successfully. The next step is internal review of the registration details."
        compact
      />

      <section className="public-section">
        <div className="container">
          <div className="success-shell">
            <article className="success-card">
              <div className="success-icon">
                <span className="material-symbols-rounded icon-xl">task_alt</span>
              </div>
              <div>
                <h2 style={{ fontSize: "2rem" }}>What happens next</h2>
                <p style={{ marginTop: "0.8rem", color: "var(--color-text-muted)" }}>
                  The submitted branch information is now ready for the next
                  review step.
                </p>
              </div>

              <ul className="success-steps">
                {nextSteps.map((step) => (
                  <li key={step}>
                    <span className="material-symbols-rounded icon-sm">
                      check_circle
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="After submission"
        title="Return home or register another branch."
        description="Use the actions below if you want to continue browsing the site or submit another library."
        actions={
          <>
            <Link to="/" className="btn btn-primary">
              Back to Home
            </Link>
            <Link to="/register" className="btn btn-white">
              Register Another Library
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
