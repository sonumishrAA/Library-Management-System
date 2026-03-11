import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase.js';
import { getContactSubmissions, updateContactStatus } from '../lib/api.js';

export default function AdminSupportTab() {
  const [activeTab, setActiveTab] = useState('contact'); // contact, articles
  const token = sessionStorage.getItem('lms_admin_token');
  
  // Data States
  const [submissions, setSubmissions] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [editingArticle, setEditingArticle] = useState(null);
  const [viewingContact, setViewingContact] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [contactRes, articlesRes] = await Promise.all([
        getContactSubmissions(token),
        supabase.from('help_articles').select('*').order('category'),
      ]);
      setSubmissions(contactRes.submissions || []);
      setArticles(articlesRes.data || []);
    } catch (err) {
      toast.error('Failed to fetch support data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* ─── Contact Actions ─── */
  const handleUpdateContactStatus = async (id, status) => {
    try {
      await updateContactStatus(token, id, status);
      toast.success(`Marked as ${status}`);
      if (viewingContact && viewingContact.id === id) {
         setViewingContact({ ...viewingContact, status });
      }
      fetchData();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  /* ─── Article Actions ─── */
  const handleToggleArticle = async (id, is_published) => {
    try {
      const { error } = await supabase.from('help_articles').update({ is_published: !is_published }).eq('id', id);
      if (error) throw error;
      toast.success('Visibility updated');
      fetchData();
    } catch (err) {
      toast.error('Failed to update visibility');
    }
  };

  const handleDeleteArticle = async (id) => {
    if(!window.confirm('Are you sure you want to delete this article?')) return;
    try {
      const { error } = await supabase.from('help_articles').delete().eq('id', id);
      if (error) throw error;
      toast.success('Article deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete article');
    }
  };

  const handleSaveArticle = async (e) => {
    e.preventDefault();
    try {
      let error;
      if (editingArticle.id) {
        const { id, ...updateData } = editingArticle;
        const res = await supabase.from('help_articles').update(updateData).eq('id', id);
        error = res.error;
      } else {
        const res = await supabase.from('help_articles').insert([editingArticle]);
        error = res.error;
      }

      if (error) throw error;
      toast.success('Article saved');
      setEditingArticle(null);
      fetchData();
    } catch (err) {
      toast.error('Failed to save article');
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Sub Tabs Navigation */}
      <div className="flex gap-2 mb-6 p-1.5 rounded-xl bg-surface border border-border w-max overflow-x-auto">
        <button
          onClick={() => setActiveTab('contact')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border-none cursor-pointer flex items-center gap-2 ${
            activeTab === 'contact' ? 'bg-white text-navy shadow-sm' : 'transparent text-muted hover:bg-slate-50'
          }`}
        >
          <span className="material-symbols-rounded icon-sm">mail</span> Inquiries
          {submissions.filter(s => s.status === 'Unread').length > 0 && (
             <span className="bg-amber text-navy text-xs px-2 py-0.5 rounded-full ml-1">
               {submissions.filter(s => s.status === 'Unread').length}
             </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('articles')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border-none cursor-pointer flex items-center gap-2 ${
            activeTab === 'articles' ? 'bg-white text-navy shadow-sm' : 'transparent text-muted hover:bg-slate-50'
          }`}
        >
          <span className="material-symbols-rounded icon-sm">article</span> Help Articles
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Loading data...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-border p-6">
          
          {/* CONTACT INQUIRIES */}
          {activeTab === 'contact' && (
            <div>
              <h3 className="text-xl font-bold text-navy mb-6">Enquiries</h3>
              <div className="table-container">
                 <table className="data-table w-full text-sm">
                   <thead className="bg-slate-50 text-left">
                     <tr>
                       <th className="p-3">Date</th>
                       <th className="p-3">Name / Email</th>
                       <th className="p-3">Subject</th>
                       <th className="p-3">Status</th>
                       <th className="p-3 text-right">View</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border">
                     {submissions.length === 0 && (
                        <tr><td colSpan="5" className="p-4 text-center text-muted">No inquiries found.</td></tr>
                     )}
                     {submissions.map(sub => (
                       <tr key={sub.id} className={sub.status === 'Unread' ? 'bg-amber-lightest/30' : ''}>
                         <td className="p-3 text-slate-600 whitespace-nowrap">
                            {new Date(sub.created_at).toLocaleDateString()}
                         </td>
                         <td className="p-3">
                            <div className="font-bold text-navy">{sub.name}</div>
                            <div className="text-xs text-muted">{sub.email}</div>
                         </td>
                         <td className="p-3 font-medium text-slate-700">{sub.subject}</td>
                         <td className="p-3">
                            <span className={`badge text-xs ${sub.status === 'Unread' ? 'badge-pending' : sub.status === 'Replied' ? 'badge-active' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                               {sub.status}
                            </span>
                         </td>
                         <td className="p-3 text-right">
                            <button className="btn btn-sm btn-outline" onClick={() => {
                               setViewingContact(sub);
                               if(sub.status === 'Unread') handleUpdateContactStatus(sub.id, 'Read');
                            }}>
                              Read
                            </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
            </div>
          )}

          {/* HELP ARTICLES */}
          {activeTab === 'articles' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-navy">Help Center Articles</h3>
                 <button className="btn btn-primary btn-sm flex gap-1 items-center" onClick={() => setEditingArticle({ title: '', category: 'General', content: '', is_published: true })}>
                   <span className="material-symbols-rounded icon-sm">add</span> New Article
                 </button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                 {articles.map(article => (
                    <div key={article.id} className={`p-5 rounded-xl border border-slate-200 ${!article.is_published ? 'bg-slate-50 opacity-70' : 'bg-white'}`}>
                       <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-dark bg-amber-lightest px-2 py-0.5 rounded">{article.category}</span>
                          <span className={`w-2 h-2 rounded-full ${article.is_published ? 'bg-success' : 'bg-slate-300'}`}></span>
                       </div>
                       <h4 className="font-bold text-lg text-navy mb-4 truncate text-wrap" title={article.title}>{article.title}</h4>
                       <div className="flex gap-2">
                          <button className="btn btn-sm btn-outline flex-1" onClick={() => setEditingArticle(article)}>
                             Edit
                          </button>
                          <button className="btn btn-sm btn-outline flex-1" onClick={() => handleToggleArticle(article.id, article.is_published)}>
                             Toggle
                          </button>
                          <button className="btn btn-sm btn-outline text-danger border-danger" onClick={() => handleDeleteArticle(article.id)}>
                             <span className="material-symbols-rounded icon-sm">delete</span>
                          </button>
                       </div>
                    </div>
                 ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Viewing Contact Modal (Read Only + Status Update) */}
      {viewingContact && (
         <div className="modal-overlay">
            <div className="modal-content w-full max-w-2xl">
               <div className="flex justify-between items-start mb-6 border-b border-border pb-4">
                  <div>
                     <h3 className="text-2xl font-bold text-navy mb-1">{viewingContact.subject}</h3>
                     <p className="text-sm text-muted">From: {viewingContact.name} ({viewingContact.email})</p>
                     {viewingContact.phone && <p className="text-sm text-muted">Phone: {viewingContact.phone}</p>}
                  </div>
                  <button className="text-muted hover:text-navy" onClick={() => setViewingContact(null)}>
                     <span className="material-symbols-rounded">close</span>
                  </button>
               </div>
               
               <div className="bg-slate-50 p-6 rounded-xl border border-border mb-6 min-h-[150px] whitespace-pre-wrap text-slate-700">
                  {viewingContact.message}
               </div>

               <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                     <span className="text-sm font-bold text-slate-500">Mark as:</span>
                     <select 
                        className="form-input py-1.5 text-sm" 
                        value={viewingContact.status} 
                        onChange={(e) => handleUpdateContactStatus(viewingContact.id, e.target.value)}
                     >
                        <option value="Unread">Unread</option>
                        <option value="Read">Read</option>
                        <option value="Replied">Replied</option>
                     </select>
                  </div>
                  <a href={`mailto:${viewingContact.email}?subject=RE: ${viewingContact.subject}`} className="btn btn-primary flex items-center gap-2">
                     <span className="material-symbols-rounded icon-sm">reply</span> Reply via Email
                  </a>
               </div>
            </div>
         </div>
      )}

      {/* Editing Article Modal */}
      {editingArticle && (
         <div className="modal-overlay">
            <div className="modal-content w-full max-w-3xl max-h-[90vh] overflow-y-auto">
               <h3 className="text-2xl font-bold mb-6 text-navy">
                  {editingArticle.id ? 'Edit Article' : 'New Article'}
               </h3>
               <form onSubmit={handleSaveArticle} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="form-group mb-0">
                        <label className="form-label">Article Title</label>
                        <input required className="form-input" value={editingArticle.title} onChange={e => setEditingArticle({...editingArticle, title: e.target.value})} />
                     </div>
                     <div className="form-group mb-0">
                        <label className="form-label">Category</label>
                        <input required className="form-input" list="categories" value={editingArticle.category} onChange={e => setEditingArticle({...editingArticle, category: e.target.value})} placeholder="e.g. Billing, Setup" />
                        <datalist id="categories">
                           <option value="Getting Started" />
                           <option value="Billing & Pricing" />
                           <option value="Manage Students" />
                           <option value="Hardware Integration" />
                        </datalist>
                     </div>
                  </div>
                  <div className="form-group">
                     <label className="form-label">HTML Content</label>
                     <textarea required rows="12" className="form-input font-mono text-sm leading-relaxed" value={editingArticle.content} onChange={e => setEditingArticle({...editingArticle, content: e.target.value})} placeholder="<p>Article content goes here...</p>" />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                     <button type="button" className="btn btn-secondary" onClick={() => setEditingArticle(null)}>Cancel</button>
                     <button type="submit" className="btn btn-primary">Save Article</button>
                  </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
}
