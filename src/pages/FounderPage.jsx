import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";

const principles = [
  {
    title: "Built from local operational context",
    description:
      "LibraryOS exists because smaller study libraries often run on manual systems that do not scale cleanly.",
  },
  {
    title: "Focused on execution over hype",
    description:
      "The product direction stays tied to seats, shifts, renewals, billing, and operator visibility.",
  },
  {
    title: "Deliberately narrow scope",
    description:
      "The goal is not to be every kind of SaaS product. The goal is to solve the working patterns of study libraries properly.",
  },
];

const storyPoints = [
  "The product grew out of observing how library operators track seats, fees, and renewals manually.",
  "The build philosophy favors clarity and structured workflows over decorative surface area.",
  "LibraryOS is being shaped so branch setup and daily control stay connected instead of drifting apart.",
];

export default function FounderPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Founder"
        title="Why this product exists and what it is trying to stay focused on."
        description="This page is about the product point of view behind LibraryOS: practical tooling for Indian library operations, without drifting into irrelevant product positioning."
        actions={
          <>
            <Link to="/contact" className="btn btn-primary">
              Contact
            </Link>
            <Link to="/register" className="btn btn-secondary">
              Register Library
            </Link>
          </>
        }
        meta={[
          "Operational focus",
          "Indian library context",
          "Deliberate product scope",
        ]}
        aside={
          <div className="surface-panel founder-hero-card">
            <span className="public-eyebrow">Product point of view</span>
            <p>
              Build the parts libraries need every day, keep the workflows
              structured, and avoid filling the product with unrelated noise.
            </p>
          </div>
        }
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Product story"
            title="The product direction comes from practical library problems."
            description="The core motivation is simple: manual systems break down when branch operations grow."
          />

          <div className="public-grid public-grid-3">
            {storyPoints.map((point, index) => (
              <article key={point} className="founder-card">
                <span className="public-eyebrow">Point 0{index + 1}</span>
                <p>{point}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section public-section-soft">
        <div className="container">
          <SectionHeading
            eyebrow="Guiding principles"
            title="What continues to shape the product."
            description="These principles help keep the public site and the product aligned with real use instead of generic messaging."
          />

          <div className="founder-principles">
            {principles.map((item) => (
              <article key={item.title} className="founder-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Keep going"
        title="If the product direction matches your branch, continue to pricing or registration."
        description="The best next step is to check the active plans and then submit the branch setup."
        actions={
          <>
            <Link to="/pricing" className="btn btn-primary">
              View Pricing
            </Link>
            <Link to="/register" className="btn btn-white">
              Register Now
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
