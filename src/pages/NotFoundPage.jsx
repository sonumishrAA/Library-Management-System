import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function NotFoundPage() {
  return (
    <div className="page-wrapper flex-col min-h-screen">
      <Navbar />
      
      <main className="flex-1 flex items-center justify-center py-20 bg-slate-50 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
           <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-amber-100/40 blur-3xl opacity-60 mix-blend-multiply"></div>
           <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-blue-100/40 blur-3xl opacity-60 mix-blend-multiply"></div>
        </div>

        <div className="container relative z-10 text-center px-4 max-w-3xl">
          <div className="mb-8 relative inline-block">
             <div className="text-[12rem] font-black leading-none text-navy opacity-5 select-none">
               404
             </div>
             <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-rounded text-6xl text-amber" style={{ fontSize: '5rem' }}>
                  explore_off
                </span>
             </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-navy mb-4 tracking-tight">
            Page Not Found
          </h1>
          
          <p className="text-lg text-slate-600 mb-10 max-w-xl mx-auto">
            Oops! The page you are looking for doesn't exist or has been moved. 
            Let's get you back on track.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/" 
              className="btn btn-primary inline-flex items-center gap-2 w-full sm:w-auto px-6 py-3"
            >
              <span className="material-symbols-rounded icon-sm">home</span>
              Back to Home
            </Link>
            <Link 
              to="/contact" 
              className="btn btn-outline inline-flex items-center gap-2 w-full sm:w-auto px-6 py-3"
            >
              <span className="material-symbols-rounded icon-sm">support_agent</span>
              Contact Support
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
