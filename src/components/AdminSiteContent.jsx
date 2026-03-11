import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  createTestimonial,
  deleteContentItem,
  getAdminSiteContent,
  toggleContentVisibility,
  updatePricingPlan,
  updateStats,
} from "../lib/api.js";

const CONTENT_TABS = [
  { id: "stats", label: "Stats", icon: "bar_chart" },
  { id: "testimonials", label: "Testimonials", icon: "reviews" },
  { id: "pricing", label: "Pricing", icon: "sell" },
];

const PLAN_ORDER = ["monthly", "3_month", "annual"];

const EMPTY_TESTIMONIAL = {
  name: "",
  library_name: "",
  city: "",
  rating: 5,
  review: "",
  __table: "testimonials",
};

function sortPlans(plans) {
  const planMap = new Map((plans || []).map((plan) => [plan.name, plan]));
  return PLAN_ORDER.map((name) => planMap.get(name)).filter(Boolean);
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function getMonthlyAmount(total, durationDays) {
  if (!durationDays) return 0;
  return Math.round((Number(total || 0) / Number(durationDays)) * 30);
}

export default function AdminSiteContent() {
  const token = sessionStorage.getItem("lms_admin_token");

  const [activeTab, setActiveTab] = useState("stats");
  const [stats, setStats] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [savingPlan, setSavingPlan] = useState(null);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const data = await getAdminSiteContent(token);
      setStats(data.stats || []);
      setTestimonials(data.testimonials || []);
      setPricingPlans(sortPlans(data.pricing_plans || []));
    } catch (err) {
      toast.error(err.message || "Failed to fetch site content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const handleToggleVisibility = async (table, id, currentValue) => {
    try {
      await toggleContentVisibility(token, table, id, !currentValue);
      toast.success("Visibility updated");
      await fetchContent();
    } catch (err) {
      toast.error(err.message || "Failed to update visibility");
    }
  };

  const handleDeleteTestimonial = async (id) => {
    if (!window.confirm("Delete this testimonial?")) return;

    try {
      await deleteContentItem(token, "testimonials", id);
      toast.success("Testimonial deleted");
      await fetchContent();
    } catch (err) {
      toast.error(err.message || "Failed to delete testimonial");
    }
  };

  const handleSaveContent = async (e) => {
    e.preventDefault();

    try {
      if (editingItem.__table === "site_stats") {
        await updateStats(token, {
          id: editingItem.id,
          label: editingItem.label,
          value: editingItem.value,
          icon: editingItem.icon,
        });
        toast.success("Stat updated");
      }

      if (editingItem.__table === "testimonials") {
        await createTestimonial(token, {
          name: editingItem.name,
          library_name: editingItem.library_name,
          city: editingItem.city,
          rating: editingItem.rating,
          review: editingItem.review,
        });
        toast.success("Testimonial added");
      }

      setEditingItem(null);
      await fetchContent();
    } catch (err) {
      toast.error(err.message || "Failed to save content");
    }
  };

  const handlePricingChange = (planName, field, value) => {
    setPricingPlans((current) =>
      current.map((plan) =>
        plan.name === planName ? { ...plan, [field]: value } : plan,
      ),
    );
  };

  const handleSavePlan = async (plan) => {
    setSavingPlan(plan.name);

    try {
      await updatePricingPlan(token, {
        id: plan.id,
        name: plan.name,
        label: plan.label,
        base_price: Number(plan.base_price),
        cctv_price: Number(plan.cctv_price),
        duration_days: Number(plan.duration_days),
      });
      toast.success("Pricing updated");
      await fetchContent();
    } catch (err) {
      toast.error(err.message || "Failed to update pricing");
    } finally {
      setSavingPlan(null);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex gap-2 mb-6 p-1.5 rounded-xl bg-surface border border-border w-max overflow-x-auto">
        {CONTENT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border-none cursor-pointer flex items-center gap-2 ${
              activeTab === tab.id
                ? "bg-white text-navy shadow-sm"
                : "transparent text-muted hover:bg-slate-50"
            }`}
          >
            <span className="material-symbols-rounded icon-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading content...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-border p-6">
          {activeTab === "stats" && (
            <div>
              <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                <div>
                  <h3 className="text-xl font-bold text-navy">Public stats</h3>
                  <p className="text-sm text-muted">
                    Only the homepage stats cards are managed here.
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                  <div
                    key={stat.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50"
                  >
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <span className="material-symbols-rounded text-3xl text-amber">
                        {stat.icon}
                      </span>
                      <button
                        onClick={() =>
                          handleToggleVisibility(
                            "site_stats",
                            stat.id,
                            stat.is_visible,
                          )
                        }
                        className={`text-xs px-2 py-1 rounded font-bold ${
                          stat.is_visible
                            ? "bg-success-light text-success"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {stat.is_visible ? "Visible" : "Hidden"}
                      </button>
                    </div>
                    <div className="text-2xl font-black text-navy break-words">
                      {stat.value}
                    </div>
                    <div className="text-sm text-slate-500 font-medium mb-4 break-words">
                      {stat.label}
                    </div>
                    <button
                      className="btn w-full btn-outline py-1.5 text-xs"
                      onClick={() =>
                        setEditingItem({ ...stat, __table: "site_stats" })
                      }
                    >
                      <span className="material-symbols-rounded icon-sm">
                        edit
                      </span>
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "testimonials" && (
            <div>
              <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                <div>
                  <h3 className="text-xl font-bold text-navy">Testimonials</h3>
                  <p className="text-sm text-muted">
                    Keep only the testimonials shown on the public site.
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm flex gap-1 items-center"
                  onClick={() => setEditingItem(EMPTY_TESTIMONIAL)}
                >
                  <span className="material-symbols-rounded icon-sm">add</span>
                  Add new
                </button>
              </div>

              <div className="table-container">
                <table className="data-table w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="p-3">Order</th>
                      <th className="p-3">Client</th>
                      <th className="p-3">Library / City</th>
                      <th className="p-3">Review</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {testimonials.map((item) => (
                      <tr key={item.id}>
                        <td className="p-3 font-bold">{item.sort_order}</td>
                        <td className="p-3 font-bold text-navy">{item.name}</td>
                        <td className="p-3 text-slate-600">
                          {item.library_name}, {item.city}
                        </td>
                        <td
                          className="p-3 text-muted truncate max-w-xs"
                          title={item.review}
                        >
                          {item.review?.length > 60
                            ? `${item.review.slice(0, 60)}...`
                            : item.review}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block w-3 h-3 rounded-full ${
                              item.is_visible ? "bg-success" : "bg-slate-300"
                            }`}
                          ></span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              className="text-amber-dark hover:text-amber font-bold flex items-center gap-1 text-xs px-2 py-1 bg-amber-lightest rounded"
                              onClick={() =>
                                handleToggleVisibility(
                                  "testimonials",
                                  item.id,
                                  item.is_visible,
                                )
                              }
                            >
                              {item.is_visible ? "Hide" : "Show"}
                            </button>
                            <button
                              className="text-danger hover:text-danger-dark"
                              onClick={() =>
                                handleDeleteTestimonial(item.id)
                              }
                            >
                              <span className="material-symbols-rounded icon-sm">
                                delete
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "pricing" && (
            <div>
              <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                <div>
                  <h3 className="text-xl font-bold text-navy">Pricing control</h3>
                  <p className="text-sm text-muted">
                    Manage only the three public plans shown on the pricing page.
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pricingPlans.map((plan) => (
                  <article
                    key={plan.name}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          {plan.name.replaceAll("_", " ")}
                        </div>
                        <h4 className="text-lg font-bold text-navy mt-1 break-words">
                          {plan.label}
                        </h4>
                      </div>
                      {plan.name === "annual" ? (
                        <span className="badge badge-amber text-xs">Highlighted</span>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="form-group">
                        <label className="form-label">Plan label</label>
                        <input
                          className="form-input"
                          value={plan.label}
                          onChange={(e) =>
                            handlePricingChange(plan.name, "label", e.target.value)
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Duration days</label>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          value={plan.duration_days}
                          onChange={(e) =>
                            handlePricingChange(
                              plan.name,
                              "duration_days",
                              e.target.value,
                            )
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="form-group">
                          <label className="form-label">Base total</label>
                          <input
                            type="number"
                            min="0"
                            className="form-input"
                            value={plan.base_price}
                            onChange={(e) =>
                              handlePricingChange(
                                plan.name,
                                "base_price",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">CCTV total</label>
                          <input
                            type="number"
                            min="0"
                            className="form-input"
                            value={plan.cctv_price}
                            onChange={(e) =>
                              handlePricingChange(
                                plan.name,
                                "cctv_price",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 p-4 rounded-xl bg-white border border-slate-200">
                      <div className="text-sm text-slate-500">Monthly preview</div>
                      <div className="text-lg font-bold text-navy mt-1 break-words">
                        {formatCurrency(
                          getMonthlyAmount(plan.base_price, plan.duration_days),
                        )}
                        <span className="text-sm text-slate-500"> /month</span>
                      </div>
                      <div className="text-sm text-slate-600 mt-2 break-words">
                        CCTV:{" "}
                        {formatCurrency(
                          getMonthlyAmount(plan.cctv_price, plan.duration_days),
                        )}{" "}
                        /month
                      </div>
                    </div>

                    <button
                      className="btn btn-primary w-full mt-4"
                      disabled={savingPlan === plan.name}
                      onClick={() => handleSavePlan(plan)}
                    >
                      {savingPlan === plan.name ? "Saving..." : "Save pricing"}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editingItem && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6 text-navy">
              {editingItem.__table === "site_stats"
                ? "Edit stat"
                : "Add testimonial"}
            </h3>

            <form onSubmit={handleSaveContent} className="space-y-4">
              {editingItem.__table === "site_stats" && (
                <>
                  <div className="form-group">
                    <label className="form-label">Label</label>
                    <input
                      required
                      className="form-input"
                      value={editingItem.label}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, label: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Value</label>
                    <input
                      required
                      className="form-input"
                      value={editingItem.value}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, value: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Material icon name</label>
                    <input
                      required
                      className="form-input"
                      value={editingItem.icon}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, icon: e.target.value })
                      }
                    />
                  </div>
                </>
              )}

              {editingItem.__table === "testimonials" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="form-label">Client name</label>
                      <input
                        required
                        className="form-input"
                        value={editingItem.name}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Library name</label>
                      <input
                        required
                        className="form-input"
                        value={editingItem.library_name}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            library_name: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input
                        required
                        className="form-input"
                        value={editingItem.city}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, city: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Rating</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        required
                        className="form-input"
                        value={editingItem.rating}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            rating: parseInt(e.target.value, 10) || 5,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Full review</label>
                    <textarea
                      required
                      rows="4"
                      className="form-input"
                      value={editingItem.review}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, review: e.target.value })
                      }
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingItem(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
