import { useLocation, Link } from "react-router-dom";
import { useState } from "react";
import PublicLayout, { CTASection, PageHero } from "../components/PublicLayout.jsx";

export default function RegistrationSuccess() {
  const { state } = useLocation();
  const [copied, setCopied] = useState(false);

  // If someone navigates here directly without state from the register form
  if (!state || !state.credentials) {
    return (
      <PublicLayout>
        <PageHero
          eyebrow="Registration Complete"
          title="Welcome to LibraryOS!"
          description="Your library registration was successful. Check your email for login details."
          compact
        />
        <CTASection
          title="Ready to manage your library?"
          actions={
            <a href="https://admin.libraryos.in" target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Go to Admin Dashboard
            </a>
          }
        />
      </PublicLayout>
    );
  }

  const { credentials } = state;

  const handleCopyAll = () => {
    const textToCopy = credentials.map(cred => 
      `Library: ${cred.name}\nLogin ID: ${cred.login_id}\nPassword: ${cred.plain_password}\nLogin URL: https://admin.libraryos.in`
    ).join('\n\n');
    
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Payment Successful"
        title="Welcome to LibraryOS!"
        description="Your registration is complete. IMPORTANT: Save the credentials below immediately. You will not see this password again."
        compact
      />

      <section className="public-section !pt-4">
        <div className="container max-w-3xl">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <span className="material-symbols-rounded text-red-500 mt-0.5">warning</span>
              <div>
                <h3 className="text-red-800 font-bold mb-1">Screenshot This Page Now!</h3>
                <p className="text-red-700 text-sm">
                  For security reasons, these automatically generated passwords are only shown once. 
                  Please take a screenshot or copy them down before leaving this page.
                </p>
              </div>
            </div>
            <button 
              onClick={handleCopyAll}
              className="flex items-center gap-1 bg-white border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors whitespace-nowrap shadow-sm sm:w-auto w-full justify-center"
            >
              <span className="material-symbols-rounded icon-sm">{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Copied!' : 'Copy All'}
            </button>
          </div>

          <div className="space-y-6">
            {credentials.map((cred, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-100 p-4">
                  <h3 className="font-bold text-navy text-lg flex items-center gap-2">
                    <span className="material-symbols-rounded text-main">business</span>
                    {cred.name}
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Login ID / Username</p>
                      <div className="font-mono text-lg text-navy bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center group">
                        {cred.login_id}
                        <button 
                          onClick={() => { navigator.clipboard.writeText(cred.login_id); }}
                          className="sm:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-main transition-opacity"
                          title="Copy ID"
                        >
                          <span className="material-symbols-rounded icon-sm">content_copy</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Password</p>
                      <div className="font-mono text-lg text-navy bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center group">
                        {cred.plain_password}
                        <button 
                          onClick={() => { navigator.clipboard.writeText(cred.plain_password); }}
                          className="sm:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-main transition-opacity"
                          title="Copy Password"
                        >
                          <span className="material-symbols-rounded icon-sm">content_copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-4 text-center">
                    Login at: <a href="https://admin.libraryos.in" target="_blank" rel="noopener noreferrer" className="text-main hover:underline font-medium">admin.libraryos.in</a>
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <a 
              href="https://admin.libraryos.in" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-primary shadow-md hover:shadow-lg transition-shadow"
              style={{ fontSize: '1.1rem', padding: '0.8rem 2rem' }}
            >
              Go to Admin Dashboard <span className="material-symbols-rounded ml-1">open_in_new</span>
            </a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
