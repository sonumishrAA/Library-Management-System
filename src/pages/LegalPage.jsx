import { useEffect, useMemo, useState } from "react";
import PublicLayout, {
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";
import { getPage } from "../lib/api.js";

const fallbackContent = {
  "privacy-policy": `
    <h3>Information collected</h3>
    <p>LibraryOS may collect library registration details, branch contact information, support messages, and service usage records required to operate the product.</p>
    <h3>How the information is used</h3>
    <p>Collected data is used to operate the product, review registrations, support libraries, and maintain public site content where applicable.</p>
    <h3>Access and protection</h3>
    <p>Reasonable steps are taken to restrict internal access and protect service data inside the application and backend workflows.</p>
    <h3>Questions</h3>
    <p>Questions about privacy can be sent through the contact route or by email to hello@libraryos.in.</p>
  `,
  "terms-of-service": `
    <h3>Service scope</h3>
    <p>LibraryOS is provided for library operations such as seats, shifts, pricing, renewals, lockers, and related workflows.</p>
    <h3>Account responsibility</h3>
    <p>Libraries are responsible for the accuracy of the information they submit during registration and for keeping access credentials secure.</p>
    <h3>Acceptable use</h3>
    <p>The service must be used lawfully and in connection with legitimate library operations. Abuse of protected routes or service access may result in suspension.</p>
    <h3>Support and changes</h3>
    <p>Features, pricing, and service policies may evolve over time. Material questions can be raised through the contact route.</p>
  `,
  "refund-policy": `
    <h3>Refund eligibility</h3>
    <p>Refund requests should be raised promptly after purchase and will be reviewed based on the active subscription context and onboarding stage.</p>
    <h3>Review process</h3>
    <p>To request a refund, contact the team with the library name, payment details, and the reason for the request so it can be evaluated properly.</p>
    <h3>Non-refundable situations</h3>
    <p>Partial usage periods, custom setup effort, or delayed requests may affect refund eligibility depending on the circumstances.</p>
    <h3>Contact</h3>
    <p>Use the contact route or hello@libraryos.in for refund-related questions.</p>
  `,
};

const pageMeta = {
  "privacy-policy": {
    eyebrow: "Privacy",
    title: "How LibraryOS handles registration, support, and service data.",
    description:
      "This document covers the handling of information used to operate the product and support libraries.",
  },
  "terms-of-service": {
    eyebrow: "Terms",
    title: "The operating terms for using LibraryOS.",
    description:
      "This document outlines the basic service scope, usage expectations, and account responsibilities.",
  },
  "refund-policy": {
    eyebrow: "Refunds",
    title: "How refund requests are reviewed for LibraryOS.",
    description:
      "This document explains the route and context for raising refund-related questions.",
  },
};

export default function LegalPage({ slug }) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const meta = useMemo(() => {
    return (
      pageMeta[slug] || {
        eyebrow: "Legal",
        title: slug,
        description: "Legal information for this route.",
      }
    );
  }, [slug]);

  useEffect(() => {
    async function fetchPage() {
      setLoading(true);

      try {
        const response = await getPage(slug);

        if (!response?.data || !response.data.is_published) {
          setTitle(meta.title);
          setContent(fallbackContent[slug] || "<p>Document unavailable.</p>");
          return;
        }

        setTitle(response.data.title);
        setContent(response.data.content);
      } catch (error) {
        console.error("Error fetching legal page", error);
        setTitle(meta.title);
        setContent(fallbackContent[slug] || "<p>Document unavailable.</p>");
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [meta.title, slug]);

  return (
    <PublicLayout>
      <PageHero
        eyebrow={meta.eyebrow}
        title={title || meta.title}
        description={meta.description}
        compact
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Legal details"
            title="Readable legal information without extra clutter."
            description="If a managed page exists in the content layer it is shown here, otherwise the fallback copy is used."
          />

          <div className="legal-shell">
            <article className="legal-card">
              {loading ? (
                <p>Loading document...</p>
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: content }}
                  className="legal-document"
                />
              )}
            </article>

            <aside className="legal-side-card">
              <span className="public-eyebrow">Need clarification</span>
              <div className="legal-meta-list">
                <div className="legal-meta-item">
                  <strong>Last viewed</strong>
                  <span>{new Date().toLocaleDateString("en-IN")}</span>
                </div>
                <div className="legal-meta-item">
                  <strong>Support route</strong>
                  <span>Use the contact page for legal or billing questions.</span>
                </div>
                <div className="legal-meta-item">
                  <strong>Email</strong>
                  <span>hello@libraryos.in</span>
                </div>
              </div>

              <div className="legal-note">
                These documents should be reviewed along with your actual use of
                the product and any direct communication from the team.
              </div>
            </aside>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
