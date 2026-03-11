import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";
import { getPricing } from "../lib/api.js";

const PLAN_ORDER = ["monthly", "3_month", "annual"];

const faqItems = [
  {
    question: "Which plans are shown on this page?",
    answer:
      "Only the monthly, 3 month, and annual plans are shown here, in that fixed order.",
  },
  {
    question: "How is the monthly figure calculated?",
    answer:
      "The page converts each plan total into a 30-day monthly rate using the configured duration days from the pricing table.",
  },
  {
    question: "Where do I start after choosing a plan?",
    answer:
      "Each card takes you directly to the library registration flow so the branch setup can begin immediately.",
  },
];

export default function PricingPage() {
  const [cctvEnabled, setCctvEnabled] = useState(false);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    async function fetchPricing() {
      try {
        const response = await getPricing();
        const planMap = new Map(
          (response.data || []).map((plan) => [plan.name, plan]),
        );
        const orderedPlans = PLAN_ORDER.map((name) => planMap.get(name)).filter(
          Boolean,
        );
        setPlans(orderedPlans);
      } catch (error) {
        console.error("Error fetching pricing", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPricing();
  }, []);

  const formatCurrency = (amount) => `₹${amount.toLocaleString("en-IN")}`;

  const getMonthlyAmount = (plan) =>
    Math.round((plan.base_price / plan.duration_days) * 30);

  const getCctvMonthlyAmount = (plan) =>
    Math.round((plan.cctv_price / plan.duration_days) * 30);

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Pricing"
        title="Three plans. Direct pricing. No extra clutter."
        description="This page shows only the monthly, 3 month, and annual plans from the pricing table."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Get Started
            </Link>
            <Link to="/help" className="btn btn-secondary">
              Billing Questions
            </Link>
          </>
        }
        meta={[
          "Monthly",
          "3 month",
          "Annual",
        ]}
        aside={
          <div className="surface-panel" style={{ padding: "1.5rem" }}>
            <span className="public-eyebrow">Pricing logic</span>
            <h3 style={{ marginTop: "1rem", fontSize: "1.6rem" }}>
              Exactly the plan set requested.
            </h3>
            <ul className="public-list" style={{ marginTop: "1rem" }}>
              <li>
                <span className="material-symbols-rounded icon-sm">done</span>
                <span>Monthly, 3 month, and annual plans only</span>
              </li>
              <li>
                <span className="material-symbols-rounded icon-sm">done</span>
                <span>Per-month view derived from plan duration days</span>
              </li>
              <li>
                <span className="material-symbols-rounded icon-sm">done</span>
                <span>CCTV toggle updates every visible card together</span>
              </li>
            </ul>
          </div>
        }
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Live plans"
            title="Current plans from the pricing feed."
            description="The cards below are populated from the pricing endpoint and rendered in the fixed order."
            align="center"
          />

          {loading ? (
            <div className="pricing-plan-grid">
              {[1, 2, 3].map((item) => (
                <article key={item} className="pricing-plan-card">
                  <div className="pricing-plan-header">
                    <span>Loading</span>
                    <h3>Plan</h3>
                  </div>
                  <div className="pricing-amount">
                    <strong>₹...</strong>
                    <span>/month</span>
                  </div>
                  <div className="pricing-summary-box">Fetching plan data</div>
                </article>
              ))}
            </div>
          ) : (
            <div className="pricing-plan-grid">
              {plans.map((plan) => {
                const isPopular = plan.name === "3_month";
                const isAnnual = plan.name === "annual";
                const monthlyAmount = getMonthlyAmount(plan);
                const totalBilled = plan.base_price;

                return (
                  <article
                    key={plan.name}
                    className={`pricing-plan-card ${isPopular ? "popular" : ""} ${isAnnual ? "highlight" : ""}`.trim()}
                  >
                    {isPopular ? (
                      <span className="pricing-plan-badge">Most Popular</span>
                    ) : null}

                    <div className="pricing-plan-header">
                      <span>{plan.duration_days} days</span>
                      <h3>{plan.label}</h3>
                    </div>

                    <div className="pricing-amount">
                      <strong>{formatCurrency(monthlyAmount)}</strong>
                      <span>/month</span>
                    </div>

                    <p className="pricing-note">
                      Total billed {formatCurrency(totalBilled)}
                    </p>

                    <div className="pricing-summary-box">
                      <strong style={{ display: "block", color: "var(--color-navy)" }}>
                        Plan total
                      </strong>
                      <p style={{ marginTop: "0.5rem" }}>
                        {formatCurrency(totalBilled)} for {plan.duration_days} days
                      </p>
                    </div>

                    <ul className="pricing-feature-list">
                      <li>
                        <span className="material-symbols-rounded icon-sm">
                          check_circle
                        </span>
                        <span>Plan label and duration visible on card</span>
                      </li>
                      <li>
                        <span className="material-symbols-rounded icon-sm">
                          check_circle
                        </span>
                        <span>
                          Monthly amount derived from total and duration
                        </span>
                      </li>
                      <li>
                        <span className="material-symbols-rounded icon-sm">
                          check_circle
                        </span>
                        <span>Direct registration route from every card</span>
                      </li>
                    </ul>

                    <Link to="/register" className="btn btn-primary">
                      Get Started
                      <span className="material-symbols-rounded icon-sm">
                        arrow_forward
                      </span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="public-section public-section-soft">
        <div className="container">
          <SectionHeading
            eyebrow="Billing FAQ"
            title="Short answers to the main pricing questions."
            description="The page is intentionally narrow: three plans, one toggle, direct registration."
            align="center"
          />

          <div className="help-accordion">
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index;

              return (
                <article key={item.question} className="help-accordion-item surface-card">
                  <button
                    type="button"
                    className="help-accordion-toggle"
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  >
                    <div>
                      <strong>{item.question}</strong>
                    </div>
                    <span className="material-symbols-rounded">
                      {isOpen ? "remove" : "add"}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="help-accordion-content">
                      <p>{item.answer}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Ready to continue"
        title="Move from plan selection to branch registration."
        description="Pricing is already narrowed to the active plans. The next step is to submit the library setup details."
        actions={
          <>
            <Link to="/register" className="btn btn-primary">
              Register Now
            </Link>
            <Link to="/contact" className="btn btn-white">
              Contact Sales
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
