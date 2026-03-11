const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const edgeFunctionUrl = (fnName) => `${SUPABASE_URL}/functions/v1/${fnName}`;

const headers = (token) => {
  const h = { "Content-Type": "application/json" };
  if (SUPABASE_ANON_KEY) {
    h.apikey = SUPABASE_ANON_KEY;
  }
  if (token) {
    h.Authorization = `Bearer ${token}`;
  } else if (SUPABASE_ANON_KEY) {
    h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return h;
};

const adminHeaders = (token) => {
  const h = headers();
  if (token) {
    h["x-admin-authorization"] = `Bearer ${token}`;
  }
  return h;
};

// Fallback data in case Edge Functions fail due to CORS or deployment issues
const fallbackContent = {
  stats: [
    {
      id: 1,
      label: "Active Libraries",
      value: "500+",
      icon: "library_books",
      sort_order: 1,
    },
    {
      id: 2,
      label: "Students Managed",
      value: "50k+",
      icon: "groups",
      sort_order: 2,
    },
    {
      id: 3,
      label: "Cities Covered",
      value: "120+",
      icon: "map",
      sort_order: 3,
    },
  ],
  testimonials: [
    {
      id: 1,
      name: "Rahul Sharma",
      library_name: "Vidya Library",
      city: "Patna",
      rating: 5,
      review:
        "LibraryOS completely automated our shift management. The expiry alerts save us hours every week.",
      sort_order: 1,
    },
    {
      id: 2,
      name: "Priya Singh",
      library_name: "Success Point Library",
      city: "Delhi",
      rating: 5,
      review:
        "Our students love the automated SMS receipts. It brings a lot of transparency to the fee collection.",
      sort_order: 2,
    },
    {
      id: 3,
      name: "Amit Kumar",
      library_name: "Target Library",
      city: "Jaipur",
      rating: 5,
      review:
        "The CCTV integration is flawless. I can monitor my library from anywhere directly through the dashboard.",
      sort_order: 3,
    },
  ],
  roadmap: [
    {
      id: 1,
      title: "WhatsApp Automation",
      description:
        "Automated fee reminders and expiry alerts shipped directly via WhatsApp API.",
      status: "live",
      quarter: "Q1 2024",
      sort_order: 1,
    },
    {
      id: 2,
      title: "Biometric Integration",
      description:
        "Sync student attendance directly with external biometric fingerprint scanners.",
      status: "coming_soon",
      quarter: "Q2 2024",
      sort_order: 2,
    },
    {
      id: 3,
      title: "Student App",
      description:
        "Dedicated mobile app for students to check seat availability and pay fees online.",
      status: "planned",
      quarter: "Q3 2024",
      sort_order: 3,
    },
  ],
  pricing: [
    {
      id: 1,
      name: "monthly",
      label: "1 Month",
      base_price: 500,
      cctv_price: 1000,
      duration_days: 30,
      sort_order: 1,
      is_active: true,
    },
    {
      id: 2,
      name: "3_month",
      label: "3 Months",
      base_price: 1200,
      cctv_price: 2500,
      duration_days: 90,
      sort_order: 2,
      is_active: true,
    },
    {
      id: 3,
      name: "annual",
      label: "1 Year",
      base_price: 4000,
      cctv_price: 8000,
      duration_days: 365,
      sort_order: 3,
      is_active: true,
    },
  ],
};

export async function loginAdmin(username, password) {
  const res = await fetch(edgeFunctionUrl("auth-admin"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Invalid credentials");
  }
  return res.json();
}

export async function registerLibrary(data) {
  const res = await fetch(edgeFunctionUrl("register-library"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Registration failed");
  }
  return res.json();
}

export async function getLibraries(token, status = "all") {
  const url = `${edgeFunctionUrl("get-libraries")}?status=${status}`;
  const res = await fetch(url, {
    method: "GET",
    headers: adminHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch libraries");
  }
  return res.json();
}

export async function generateCredentials(token, libraryId) {
  const res = await fetch(edgeFunctionUrl("generate-credentials"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ library_id: libraryId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate credentials");
  }
  return res.json();
}

export async function suspendLibrary(token, libraryId) {
  const res = await fetch(edgeFunctionUrl("suspend-library"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ library_id: libraryId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to suspend library");
  }
  return res.json();
}

export async function resetCredentials(token, libraryId) {
  const res = await fetch(edgeFunctionUrl("reset-credentials"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ library_id: libraryId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to reset credentials");
  }
  return res.json();
}

// --- NEW EDGE FUNCTIONS ---

export async function getPublicContent(type) {
  const url = `${edgeFunctionUrl("get-public-content")}?type=${type}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(url, {
      method: "GET",
      headers: headers(),
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Silently return fallback data
      return { data: fallbackContent[type] || [] };
    }
    return await res.json();
  } catch (error) {
    // Silently return fallback data for CORS, network, or timeout errors
    return { data: fallbackContent[type] || [] };
  }
}

export async function getPricing() {
  const url = edgeFunctionUrl("get-pricing");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(url, {
      method: "GET",
      headers: headers(),
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Silently return fallback pricing
      return { data: fallbackContent.pricing || [] };
    }
    return await res.json();
  } catch (error) {
    // Silently return fallback pricing for CORS, network, or timeout errors
    return { data: fallbackContent.pricing || [] };
  }
}

export async function getAdminSiteContent(token) {
  const url = `${edgeFunctionUrl("get-public-content")}?type=admin_content`;
  const res = await fetch(url, {
    method: "GET",
    headers: adminHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch site content");
  return res.json();
}

export async function getPage(slug) {
  const url = `${edgeFunctionUrl("get-page")}?slug=${slug}`;
  const res = await fetch(url, { method: "GET", headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch page");
  return res.json();
}

export async function updatePage(token, data) {
  const res = await fetch(edgeFunctionUrl("update-page"), {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update page");
  return res.json();
}

export async function submitContact(data) {
  const res = await fetch(edgeFunctionUrl("submit-contact"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit contact form");
  return res.json();
}

export async function getContactSubmissions(token) {
  const res = await fetch(edgeFunctionUrl("get-contact-submissions"), {
    method: "GET",
    headers: adminHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch submissions");
  return res.json();
}

export async function updateContactStatus(token, id, status) {
  const res = await fetch(edgeFunctionUrl("update-contact-status"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

export async function createTestimonial(token, data) {
  const res = await fetch(edgeFunctionUrl("toggle-content-visibility"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ table: "testimonials", action: "create", ...data }),
  });
  if (!res.ok) throw new Error("Failed to create testimonial");
  return res.json();
}

export async function toggleContentVisibility(token, table, id, is_visible) {
  const res = await fetch(edgeFunctionUrl("toggle-content-visibility"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ table, id, is_visible }),
  });
  if (!res.ok) throw new Error("Failed to toggle visibility");
  return res.json();
}

export async function updatePricingPlan(token, data) {
  const res = await fetch(edgeFunctionUrl("toggle-content-visibility"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ ...data, table: "pricing_plans" }),
  });
  if (!res.ok) throw new Error("Failed to update pricing plan");
  return res.json();
}

export async function updateSortOrder(token, table, items) {
  const res = await fetch(edgeFunctionUrl("update-sort-order"), {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ table, items }),
  });
  if (!res.ok) throw new Error("Failed to update sort order");
  return res.json();
}

export async function createHelpArticle(token, data) {
  const res = await fetch(edgeFunctionUrl("create-help-article"), {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create article");
  return res.json();
}

export async function getHelpArticles() {
  const res = await fetch(edgeFunctionUrl("get-help-articles"), {
    method: "GET",
    headers: headers(),
  });
  if (!res.ok) throw new Error("Failed to fetch articles");
  return res.json();
}

export async function createRoadmapItem(token, data) {
  const res = await fetch(edgeFunctionUrl("create-roadmap-item"), {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create roadmap item");
  return res.json();
}

export async function updateStats(token, data) {
  const res = await fetch(edgeFunctionUrl("toggle-content-visibility"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ table: "site_stats", action: "update", ...data }),
  });
  if (!res.ok) throw new Error("Failed to update stats");
  return res.json();
}

export async function deleteContentItem(token, table, id) {
  const res = await fetch(edgeFunctionUrl("toggle-content-visibility"), {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify({ table, id, action: "delete" }),
  });
  if (!res.ok) throw new Error("Failed to delete item");
  return res.json();
}
