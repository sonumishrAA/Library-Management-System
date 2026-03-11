import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout, {
  CTASection,
  PageHero,
  SectionHeading,
} from "../components/PublicLayout.jsx";
import { getHelpArticles } from "../lib/api.js";

export default function HelpCenterPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [openArticleId, setOpenArticleId] = useState(null);

  useEffect(() => {
    async function fetchArticles() {
      try {
        const response = await getHelpArticles();
        setArticles(response?.data || []);
      } catch (error) {
        console.error("Error fetching help articles", error);
      } finally {
        setLoading(false);
      }
    }

    fetchArticles();
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(articles.map((article) => article.category).filter(Boolean))],
    [articles],
  );

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const text = `${article.title} ${article.content || ""}`.toLowerCase();
      const matchesSearch = text.includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" || article.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [articles, searchTerm, selectedCategory]);

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Help center"
        title="Find answers fast, then move back into the product."
        description="Search by topic, filter by category, and open only the articles relevant to the question at hand."
        actions={
          <>
            <Link to="/docs" className="btn btn-primary">
              Open Docs
            </Link>
            <Link to="/contact" className="btn btn-secondary">
              Contact Support
            </Link>
          </>
        }
        meta={[
          "Searchable knowledge base",
          "Category filtering",
          "Contact route if needed",
        ]}
      />

      <section className="public-section">
        <div className="container">
          <SectionHeading
            eyebrow="Find a topic"
            title="Search the help content or jump to a related route."
            description="Use the search input first. If the answer is not here, go to docs or contact."
          />

          <div className="help-toolbar" style={{ marginBottom: "1.5rem" }}>
            <div className="help-search">
              <span className="material-symbols-rounded">search</span>
              <input
                type="text"
                value={searchTerm}
                placeholder="Search articles, workflows, or setup steps"
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <div className="help-quick-grid">
              <Link to="/docs" className="help-quick-card">
                <h3>Docs</h3>
                <p>Setup and workflow guides</p>
              </Link>
              <Link to="/pricing" className="help-quick-card">
                <h3>Pricing</h3>
                <p>Plan questions and billing view</p>
              </Link>
              <Link to="/register" className="help-quick-card">
                <h3>Register</h3>
                <p>Start branch setup</p>
              </Link>
              <Link to="/contact" className="help-quick-card">
                <h3>Contact</h3>
                <p>Ask for direct support</p>
              </Link>
            </div>
          </div>

          <div className="help-category-bar" style={{ marginBottom: "1.5rem" }}>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`help-category-button ${selectedCategory === category ? "active" : ""}`}
                onClick={() => {
                  setSelectedCategory(category);
                  setOpenArticleId(null);
                }}
              >
                {category}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="help-accordion">
              {[1, 2, 3].map((item) => (
                <article key={item} className="help-accordion-item surface-card">
                  <button type="button" className="help-accordion-toggle">
                    <div>
                      <strong>Loading article</strong>
                    </div>
                    <span className="material-symbols-rounded">more_horiz</span>
                  </button>
                </article>
              ))}
            </div>
          ) : filteredArticles.length === 0 ? (
            <article className="surface-card">
              <h3>No matching articles</h3>
              <p>
                Try a broader search term or switch back to all categories.
              </p>
            </article>
          ) : (
            <div className="help-accordion">
              {filteredArticles.map((article) => {
                const isOpen = openArticleId === article.id;

                return (
                  <article key={article.id} className="help-accordion-item surface-card">
                    <button
                      type="button"
                      className="help-accordion-toggle"
                      onClick={() => setOpenArticleId(isOpen ? null : article.id)}
                    >
                      <div>
                        <span className="public-eyebrow">
                          {article.category || "General"}
                        </span>
                        <strong style={{ marginTop: "0.8rem" }}>{article.title}</strong>
                      </div>
                      <span className="material-symbols-rounded">
                        {isOpen ? "remove" : "add"}
                      </span>
                    </button>
                    {isOpen ? (
                      <div
                        className="help-accordion-content"
                        dangerouslySetInnerHTML={{ __html: article.content }}
                      />
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <CTASection
        eyebrow="Still blocked"
        title="Use the contact route if the knowledge base is not enough."
        description="For plan questions, onboarding issues, or branch-specific setup concerns, contact the team directly."
        actions={
          <>
            <Link to="/contact" className="btn btn-primary">
              Contact Support
            </Link>
            <Link to="/docs" className="btn btn-white">
              Browse Docs
            </Link>
          </>
        }
      />
    </PublicLayout>
  );
}
