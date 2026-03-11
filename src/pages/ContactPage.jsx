import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";
import { submitContact } from "../lib/api.js";

const contactChecklist = [
  "Library name and city",
  "What you need help with",
  "Whether the question is about pricing, setup, or rollout",
  "A callback number if you want follow-up by phone",
];

const contactCards = [
  {
    title: "Email",
    description: "Use email for pricing questions, onboarding, or branch setup help.",
    value: "hello@libraryos.in",
    href: "mailto:hello@libraryos.in",
    icon: "mail",
  },
  {
    title: "Response window",
    description: "Contact submissions are intended to be reviewed within one working day.",
    value: "Within 24 hours",
    href: null,
    icon: "schedule",
  },
  {
    title: "Primary location",
    description: "The product is being built for Indian library operations.",
    value: "Patna, Bihar",
    href: null,
    icon: "location_on",
  },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await submitContact(formData);
      setSuccess(true);
      setErrorMessage("");
      setFormData({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
      });
      toast.success("Message sent successfully");
    } catch (error) {
      setErrorMessage(error.message || "Failed to submit contact form");
      toast.error("Failed to submit message");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Contact"
        title="Use one route for pricing, onboarding, and support questions."
        description="The contact page stays focused on real inquiries: branch setup, pricing clarification, rollout questions, and operational support."
        meta={[
          "Pricing",
          "Onboarding",
          "Operational support",
        ]}
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Reach the team"
            title="Choose the clearest path and include enough detail to help us respond properly."
            description="Short messages slow the process down. Add branch context and the exact question so the reply can be useful."
          />

          <div className="contact-layout">
            <div className="register-sidebar">
              <div className="register-sidebar-card">
                <span className="public-eyebrow">Best results</span>
                <h3 style={{ marginTop: "1rem", fontSize: "1.5rem" }}>
                  What to include in your message
                </h3>
                <ul className="contact-checklist" style={{ marginTop: "1rem" }}>
                  {contactChecklist.map((item) => (
                    <li key={item}>
                      <span className="material-symbols-rounded icon-sm">
                        check_circle
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="contact-info-grid">
                {contactCards.map((card) => (
                  <article key={card.title} className="contact-info-card">
                    <div className="contact-icon">
                      <span className="material-symbols-rounded">{card.icon}</span>
                    </div>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                    {card.href ? (
                      <a
                        href={card.href}
                        style={{
                          marginTop: "0.85rem",
                          display: "inline-flex",
                          fontWeight: 700,
                          color: "var(--color-amber-dark)",
                        }}
                      >
                        {card.value}
                      </a>
                    ) : (
                      <strong style={{ marginTop: "0.85rem", display: "inline-flex" }}>
                        {card.value}
                      </strong>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <div className="contact-form-card">
              {success ? (
                <div className="success-card">
                  <div className="success-icon">
                    <span className="material-symbols-rounded icon-xl">check</span>
                  </div>
                  <div>
                    <h3>Message received</h3>
                    <p>
                      Your inquiry has been submitted. The team can now review the
                      details and follow up.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSuccess(false)}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <h3>Send a message</h3>
                  <p>
                    Use the form when you need pricing help, onboarding clarity,
                    or product-specific support.
                  </p>

                  {errorMessage ? (
                    <div
                      style={{
                        padding: "0.9rem 1rem",
                        borderRadius: "1rem",
                        background: "var(--color-danger-light)",
                        color: "var(--color-danger)",
                        fontWeight: 600,
                      }}
                    >
                      {errorMessage}
                    </div>
                  ) : null}

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="form-group mb-0">
                      <label className="form-label">Name</label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="form-input"
                        placeholder="Your name"
                      />
                    </div>
                    <div className="form-group mb-0">
                      <label className="form-label">Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="form-input"
                        placeholder="Optional callback number"
                      />
                    </div>
                  </div>

                  <div className="form-group mb-0">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="form-group mb-0">
                    <label className="form-label">Subject</label>
                    <input
                      type="text"
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="What do you need help with?"
                    />
                  </div>

                  <div className="form-group mb-0">
                    <label className="form-label">Message</label>
                    <textarea
                      name="message"
                      required
                      rows="5"
                      value={formData.message}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="Explain your branch setup, question, or issue clearly."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                  >
                    {submitting ? "Sending..." : "Send Message"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Need another route"
        title="Docs and help stay available if you want self-serve answers first."
        description="If your question does not require a direct reply, the docs and help pages may already cover it."
        actions={
          <>
            <a href="mailto:hello@libraryos.in" className="btn btn-primary">
              Email Directly
            </a>
            <Link to="/help" className="btn btn-white">
              Open Help Center
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
