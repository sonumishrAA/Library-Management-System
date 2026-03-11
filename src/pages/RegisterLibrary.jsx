import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import StepIndicator from '../components/StepIndicator.jsx';
import { registerLibrary, getPricing } from '../lib/api.js';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const initialForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  male_seats: '', // Replaces total_seats
  female_seats: '', // Replaces total_girls_seats
  male_lockers: '', // Replaces total_lockers
  female_lockers: '',
  shifts: [], // Base shifts only
  combinedPricing: [], // Toggled ON combos
  maleLockerPolicy: {
    eligible_shift_type: 'any',
    monthly_fee: '',
    description: '',
  },
  femaleLockerPolicy: {
    eligible_shift_type: 'any',
    monthly_fee: '',
    description: '',
  },
  contact_phone: '',
  contact_email: '',
  imported_students: [],
  selectedPlan: null,
};

export default function RegisterLibrary() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [libraries, setLibraries] = useState([initialForm]);
  const [activeLibIndex, setActiveLibIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Admin account details form no longer needed in phase 1, but keep it for contact step temporarily if needed
  // Will be removed completely in Step 7 refactor
  const [form, setForm] = useState({
    adminPassword: '',
    adminPasswordConfirm: '',
  });

  // Pricing & Subscription state
  const [pricingPlans, setPricingPlans] = useState([]);
  const [isFetchingPlans, setIsFetchingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  // Fetch Pricing Plans
  useEffect(() => {
    async function fetchPlans() {
      setIsFetchingPlans(true);
      try {
        const result = await getPricing();
        const data = result?.data || result;
        if (data && data.length > 0) {
          setPricingPlans(data);
          // Auto-select the 3_month plan if available, else first plan
          const defaultPlan = data.find(p => p.name === '3_month') || data[0];
          setSelectedPlan(defaultPlan);
        }
      } catch (err) {
        toast.error('Failed to load subscription plans');
      } finally {
        setIsFetchingPlans(false);
      }
    }
    fetchPlans();
  }, []);

  // Pincode lookup status
  const [pincodeStatus, setPincodeStatus] = useState('');

  // Shift & Combo local states mapped by libIdx
  const [shiftForms, setShiftForms] = useState({});
  const [showShiftForms, setShowShiftForms] = useState({});
  const [comboForms, setComboForms] = useState({});
  const [showComboForms, setShowComboForms] = useState({});

  const getShiftForm = (libIdx) => shiftForms[libIdx] || { label: '', start_time: '', end_time: '', fee_plans: {} };
  const updateShiftForm = (libIdx, updater) => setShiftForms(prev => ({ ...prev, [libIdx]: typeof updater === 'function' ? updater(getShiftForm(libIdx)) : updater }));

  const getComboForm = (libIdx) => comboForms[libIdx] || { selectedShifts: [], combined_fee: '' };
  const updateComboForm = (libIdx, updater) => setComboForms(prev => ({ ...prev, [libIdx]: typeof updater === 'function' ? updater(getComboForm(libIdx)) : updater }));

  const hasLockersAnywhere = libraries.some(lib => {
    const maleL = parseInt(lib.male_lockers) || 0;
    const femaleL = parseInt(lib.female_lockers) || 0;
    return (maleL + femaleL) > 0;
  });
  const totalSteps = 8; // Fixed total steps for now: Basic, Cap, Shifts, Lockers, Contact, Students, Account, Review
  const stepLabels = ['Basic Info', 'Capacity', 'Shifts', 'Locker', 'Contact', 'Students', 'Account', 'Review'];

  // Determine actual step mapping
  const getActualStep = () => {
    // If there are no lockers, skip the locker step (step 4)
    if (!hasLockersAnywhere && step >= 4) {
      return step + 1;
    }
    return step;
  };

  const actualStep = getActualStep();

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const updateLibField = (libIdx, field, value) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx] = { ...copy[libIdx], [field]: value };
      return copy;
    });
    if (errors[`${libIdx}_${field}`]) setErrors((prev) => ({ ...prev, [`${libIdx}_${field}`]: '' }));
  };

  /* ─── Validation (checks ALL libraries) ─── */
  const validateStep1 = () => {
    const e = {};
    let valid = true;
    libraries.forEach((lib, i) => {
      if (!lib.name.trim()) { e[`${i}_name`] = 'Required'; valid = false; }
      if (!lib.address.trim()) { e[`${i}_address`] = 'Required'; valid = false; }
      if (!lib.city.trim()) { e[`${i}_city`] = 'Required'; valid = false; }
      if (!lib.state.trim()) { e[`${i}_state`] = 'Required'; valid = false; }
      if (!lib.pincode.trim()) { e[`${i}_pincode`] = 'Required'; valid = false; }
      else if (!/^\d{6}$/.test(lib.pincode)) { e[`${i}_pincode`] = '6 digits'; valid = false; }
    });
    setErrors(e);
    if (!valid) toast.error('Fill all fields for every library');
    return valid;
  };

  const validateStep2 = () => {
    const e = {};
    let valid = true;
    libraries.forEach((lib, i) => {
      const maleS = parseInt(lib.male_seats) || 0;
      const femaleS = parseInt(lib.female_seats) || 0;
      if (lib.male_seats === '' && lib.female_seats === '') {
        e[`${i}_male_seats`] = 'Required';
        e[`${i}_female_seats`] = 'Required';
        valid = false;
      } else if (maleS + femaleS < 1) {
        e[`${i}_male_seats`] = 'Total ≥ 1';
        valid = false;
      }
      
      const maleL = parseInt(lib.male_lockers) || 0;
      const femaleL = parseInt(lib.female_lockers) || 0;
      if (lib.male_lockers === '') { e[`${i}_male_lockers`] = 'Required'; valid = false; }
      else if (maleL < 0) { e[`${i}_male_lockers`] = '≥0'; valid = false; }
      
      if (lib.female_lockers === '') { e[`${i}_female_lockers`] = 'Required'; valid = false; }
      else if (femaleL < 0) { e[`${i}_female_lockers`] = '≥0'; valid = false; }
    });
    setErrors(e);
    if (!valid) toast.error('Check capacity fields');
    return valid;
  };

  const validateStep3 = () => {
    for (let i = 0; i < libraries.length; i++) {
      if (libraries[i].shifts.length === 0) {
        toast.error(`Add at least one shift for ${libraries[i].name || `Library ${i + 1}`}`);
        setActiveLibIndex(i);
        return false;
      }
    }
    return true;
  };

  const validateStep4 = () => {
    const e = {};
    let valid = true;
    for (let i = 0; i < libraries.length; i++) {
      const lib = libraries[i];
      const ml = parseInt(lib.male_lockers) || 0;
      const fl = parseInt(lib.female_lockers) || 0;
      
      if (ml > 0) {
        if (lib.maleLockerPolicy.monthly_fee === '' || parseFloat(lib.maleLockerPolicy.monthly_fee) < 0) {
          e[`${i}_male_locker_fee`] = 'Required';
          valid = false;
        }
      }
      if (fl > 0) {
        if (lib.femaleLockerPolicy.monthly_fee === '' || parseFloat(lib.femaleLockerPolicy.monthly_fee) < 0) {
          e[`${i}_female_locker_fee`] = 'Required';
          valid = false;
        }
      }
    }
    setErrors(e);
    if (!valid) toast.error('Enter a valid monthly fee for locker policies');
    return valid;
  };

  const validateStep5 = () => {
    const e = {};
    let valid = true;
    const lib = libraries[0];
    
    if (!lib.contact_phone.trim()) { e['0_contact_phone'] = 'Required'; valid = false; }
    else if (!/^\d{10}$/.test(lib.contact_phone.trim())) { e['0_contact_phone'] = '10 digits'; valid = false; }
    
    if (!lib.contact_email.trim()) { e['0_contact_email'] = 'Required'; valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lib.contact_email.trim())) { e['0_contact_email'] = 'Invalid'; valid = false; }
    
    setErrors(e);
    if (!valid) toast.error('Please fill in valid contact details');
    return valid;
  };

  const validateStep6 = () => {
    // Logic for Student Imports step validation goes here later
    return true;
  };

  const validateStep7 = () => {
    const e = {};
    let valid = true;
    
    // The email used is contact_email from Step 5
    if (!libraries[0].contact_email.trim()) {
      toast.error('Admin Email is missing. Please go back to the Contact step and provide it.');
      return false;
    }

    if (!form.adminPassword || form.adminPassword.length < 6) {
      e.adminPassword = 'Minimum 6 characters';
      valid = false;
    }
    if (form.adminPassword !== form.adminPasswordConfirm) {
      e.adminPasswordConfirm = 'Passwords must match';
      valid = false;
    }

    setErrors(e);
    if (!valid) toast.error('Please fix the password errors');
    return valid;
  };

  const nextStep = () => {
    let valid = true;
    if (actualStep === 1) valid = validateStep1();
    else if (actualStep === 2) valid = validateStep2();
    else if (actualStep === 3) valid = validateStep3();
    else if (actualStep === 4) valid = validateStep4(); // Locker
    else if (actualStep === 5) valid = validateStep5(); // Contact
    else if (actualStep === 6) valid = validateStep6(); // Students
    else if (actualStep === 7) valid = validateStep7(); // Account
    
    // Auto-generate combos for all libraries before moving past Step 3
    if (valid && actualStep === 3) {
      libraries.forEach((_, i) => updateAutoCombos(i));
    }
    
    if (valid) setStep((s) => s + 1);
  };

  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  /* ─── Shift helpers ─── */
  const calcDuration = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return Math.round((diff / 60) * 10) / 10;
  };

  const addShift = (libIdx) => {
    const sForm = getShiftForm(libIdx);
    if (!sForm.label.trim()) {
      toast.error('Please enter a shift label');
      return;
    }
    if (!sForm.start_time || !sForm.end_time) {
      toast.error('Please select start and end times');
      return;
    }
    if (!sForm.monthly_fee || parseFloat(sForm.monthly_fee) < 0) {
      toast.error('Enter a valid monthly fee');
      return;
    }

    // Check overlap
    const newStart = parseInt(sForm.start_time.split(':')[0]) * 60 + parseInt(sForm.start_time.split(':')[1]);
    let newEnd = parseInt(sForm.end_time.split(':')[0]) * 60 + parseInt(sForm.end_time.split(':')[1]);
    if (newEnd <= newStart) newEnd += 24 * 60; // Crosses midnight

    const existing = libraries[libIdx].shifts;
    for (const es of existing) {
      const eStart = parseInt(es.start_time.split(':')[0]) * 60 + parseInt(es.start_time.split(':')[1]);
      let eEnd = parseInt(es.end_time.split(':')[0]) * 60 + parseInt(es.end_time.split(':')[1]);
      if (eEnd <= eStart) eEnd += 24 * 60;

      // Overlap logic: standard check + handles cases where one shift wraps midnight
      if (Math.max(newStart, eStart) < Math.min(newEnd, eEnd)) {
        toast.error(`Time overlaps with existing shift: ${es.label}`);
        return;
      }
    }

    const duration = calcDuration(sForm.start_time, sForm.end_time);
    const newShift = {
      id: Date.now().toString(),
      label: sForm.label.trim(),
      start_time: sForm.start_time,
      end_time: sForm.end_time,
      duration_hours: duration,
      monthly_fee: parseFloat(sForm.monthly_fee),
      is_base: true
    };
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx] = { ...copy[libIdx], shifts: [...copy[libIdx].shifts, newShift] };
      return copy;
    });
    updateShiftForm(libIdx, { label: '', start_time: '', end_time: '', monthly_fee: '' });
    setShowShiftForms((prev) => ({ ...prev, [libIdx]: false }));
    // updateAutoCombos is triggered on Continue, or we can call it directly
    setTimeout(() => updateAutoCombos(libIdx), 50);
  };

  const deleteShift = (libIdx, id) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx] = {
        ...copy[libIdx],
        shifts: copy[libIdx].shifts.filter((s) => s.id !== id),
        combinedPricing: copy[libIdx].combinedPricing.filter((c) => !c.shift_ids.includes(id)),
      };
      return copy;
    });
    setTimeout(() => updateAutoCombos(libIdx), 50);
  };

  /* ─── Combined pricing helpers ─── */
  const updateAutoCombos = (libIdx) => {
    setLibraries((prev) => {
      const copy = [...prev];
      const lib = copy[libIdx];
      const shifts = [...lib.shifts].sort((a, b) => {
        const at = parseInt(a.start_time.split(':')[0]) * 60 + parseInt(a.start_time.split(':')[1]);
        const bt = parseInt(b.start_time.split(':')[0]) * 60 + parseInt(b.start_time.split(':')[1]);
        return at - bt;
      });

      const newCombos = [];
      const existingCombos = lib.combinedPricing || [];

      // Generate all consecutive subgroups of length >= 2
      for (let len = 2; len <= shifts.length; len++) {
        for (let i = 0; i <= shifts.length - len; i++) {
          const slice = shifts.slice(i, i + len);
          
          let consecutive = true;
          for (let k = 1; k < slice.length; k++) {
            if (slice[k-1].end_time !== slice[k].start_time) {
              consecutive = false;
              break;
            }
          }

          if (consecutive) {
            const shiftIds = slice.map(s => s.id);
            const defaultFee = slice.reduce((sum, s) => sum + s.monthly_fee, 0);
            const label = slice.map(s => s.label).join(' + ');

            const existing = existingCombos.find(c => c.shift_ids.length === shiftIds.length && c.shift_ids.every((id, idx) => id === shiftIds[idx]));
            
            newCombos.push({
              id: existing ? existing.id : `combo-${Date.now()}-${Math.random().toString(36).substring(2,9)}`,
              shift_ids: shiftIds,
              label: label,
              default_fee: defaultFee,
              custom_fee: existing ? existing.custom_fee : '',
              is_offered: existing ? existing.is_offered : false,
              start_time: slice[0].start_time,
              end_time: slice[slice.length - 1].end_time,
              duration_hours: slice.reduce((sum, s) => sum + s.duration_hours, 0)
            });
          }
        }
      }

      copy[libIdx] = { ...lib, combinedPricing: newCombos };
      return copy;
    });
  };

  const toggleComboOffered = (libIdx, comboId) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx].combinedPricing = copy[libIdx].combinedPricing.map(c => 
        c.id === comboId ? { ...c, is_offered: !c.is_offered } : c
      );
      return copy;
    });
  };

  const updateComboCustomFee = (libIdx, comboId, fee) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx].combinedPricing = copy[libIdx].combinedPricing.map(c => 
        c.id === comboId ? { ...c, custom_fee: fee } : c
      );
      return copy;
    });
  };

  /* ─── Student Import helpers ─── */
  const addStudent = (libIdx) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx].imported_students = [
        ...copy[libIdx].imported_students,
        {
          id: Date.now().toString(),
          name: '',
          father_name: '',
          phone: '',
          address: '',
          gender: 'male',
          shift_id: '',
          seat_number: '',
          has_locker: false,
          locker_no: '',
          plan_duration: '1',
          amount_paid: '',
          payment_status: 'paid'
        }
      ];
      return copy;
    });
  };

  const removeStudent = (libIdx, sIdx) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx].imported_students = copy[libIdx].imported_students.filter((_, i) => i !== sIdx);
      return copy;
    });
  };

  const updateStudent = (libIdx, sIdx, field, value) => {
    setLibraries((prev) => {
      const copy = [...prev];
      copy[libIdx].imported_students = copy[libIdx].imported_students.map((s, i) => 
        i === sIdx ? { ...s, [field]: value } : s
      );
      return copy;
    });
  };

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    if (!validateStep5()) return;
    if (!validateStep7()) return; // Validate admin password before submission
    if (!confirmed) {
      toast.error('Please confirm the details');
      return;
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      let successCount = 0;
      for (const lib of libraries) {
        const payload = {
          name: lib.name.trim(),
          address: lib.address.trim(),
          city: lib.city.trim(),
          state: lib.state.trim(),
          pincode: lib.pincode.trim(),
          total_seats: parseInt(lib.total_seats),
          total_girls_seats: parseInt(lib.total_girls_seats) || 0,
          total_lockers: parseInt(lib.total_lockers) || 0,
          contact_phone: libraries[0].contact_phone.trim(),
          contact_email: libraries[0].contact_email.trim(),
          admin_password: form.adminPassword, // To be handled carefully by Edge function
          shifts: lib.shifts.map(({ id, ...s }) => s),
          combined_pricing: lib.hasCombinedPricing
            ? lib.combinedPricing.map(({ id, selectedShifts, ...c }) => c)
            : [],
          locker_policy:
            parseInt(lib.total_lockers) > 0
              ? {
                  eligible_shift_type: lib.lockerPolicy.eligible_shift_type,
                  monthly_fee: parseFloat(lib.lockerPolicy.monthly_fee) || 0,
                  description: lib.lockerPolicy.description.trim(),
                }
              : null,
        };
        await registerLibrary(payload);
        successCount++;
      }
      toast.success(`${successCount} ${successCount === 1 ? 'library' : 'libraries'} registered successfully!`);
      navigate('/register/success');
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong');
      toast.error(err.message || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Library tab helpers ─── */
  const addNewLibrary = () => {
    setLibraries((prev) => [...prev, { ...initialForm }]);
    setActiveLibIndex(libraries.length);
    setPincodeStatus('');
    setStep(1); // Force back to step 1 to fill basic info
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeLibrary = (index) => {
    if (libraries.length <= 1) return;
    setLibraries((prev) => prev.filter((_, i) => i !== index));
    if (activeLibIndex >= index && activeLibIndex > 0) {
      setActiveLibIndex((prev) => prev - 1);
    }
  };

  const switchLibrary = (index) => {
    setActiveLibIndex(index);
    setPincodeStatus(libraries[index]?.city ? 'success' : '');
  };

  /* ─── Render helpers ─── */
  const renderLibInput = (libIdx, label, field, type = 'text', placeholder = '', extra = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type={type}
        className={`form-input ${errors[`${libIdx}_${field}`] ? 'error' : ''}`}
        value={libraries[libIdx][field]}
        onChange={(e) => updateLibField(libIdx, field, e.target.value)}
        placeholder={placeholder}
        {...extra}
      />
      {errors[`${libIdx}_${field}`] && <div className="form-error">{errors[`${libIdx}_${field}`]}</div>}
    </div>
  );

  return (
    <div className="register-page">
      <div className="register-topbar">
        <div className="container">
          <div className="register-topbar-inner">
            <Link to="/" className="nav-logo no-underline">
              <span className="material-symbols-rounded">local_library</span>
              <span>LibraryOS</span>
            </Link>
            <span className="text-sm font-medium text-muted">
              Step {step} of {totalSteps}
            </span>
          </div>
        </div>
      </div>

      <div className="container register-shell">
        <aside className="register-sidebar">
          <div className="register-sidebar-card">
            <span className="public-eyebrow">Register library</span>
            <h1>Set up the branch exactly how it operates.</h1>
            <p>
              This form captures library basics, capacity, shift pricing, locker
              rules, and the final contact details needed for review.
            </p>

            <ul className="public-list" style={{ marginTop: '1rem' }}>
              <li>
                <span className="material-symbols-rounded icon-sm">check_circle</span>
                <span>Seats, shifts, and pricing stay in one submission</span>
              </li>
              <li>
                <span className="material-symbols-rounded icon-sm">check_circle</span>
                <span>Locker policy is included only if the branch has lockers</span>
              </li>
              <li>
                <span className="material-symbols-rounded icon-sm">check_circle</span>
                <span>Final review step summarizes the full branch setup</span>
              </li>
            </ul>
          </div>

          {/* Library Tabs in Sidebar */}
          {libraries.length > 1 && (
            <div className="register-sidebar-card">
              <span className="public-eyebrow">Your Libraries</span>
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {libraries.map((lib, i) => (
                  <div
                    key={i}
                    className={`registered-lib-card ${i === activeLibIndex ? 'active' : ''}`}
                    onClick={() => switchLibrary(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="material-symbols-rounded" style={{ color: i === activeLibIndex ? 'var(--color-amber)' : 'var(--color-text-muted)', fontSize: '1.1rem', flexShrink: 0 }}>
                      {lib.name ? 'business' : 'add_business'}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '0.8rem', color: i === activeLibIndex ? 'var(--color-amber-dark)' : 'var(--color-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lib.name || `Library ${i + 1}`}
                      </strong>
                      {lib.city && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{lib.city}, {lib.state}</span>}
                    </div>
                    {libraries.length > 1 && (
                      <button
                        type="button"
                        className="shift-remove-btn"
                        style={{ padding: '0.15rem', minWidth: 'auto' }}
                        onClick={(e) => { e.stopPropagation(); removeLibrary(i); }}
                        title="Remove library"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '0.9rem' }}>close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="register-stage">
          <StepIndicator currentStep={step} totalSteps={totalSteps} labels={stepLabels} />

          <div className="card reveal visible register-card">
          {/* ─── Step 1: Basic Info ─── */}
          {actualStep === 1 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Library Basic Info
              </h2>
              <p className="text-sm mb-6 text-muted">
                Tell us about your library
              </p>
              
              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => (
                  <div key={libIdx} className="p-5 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-light)', position: 'relative' }}>
                    {libraries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLibrary(libIdx)}
                        className="btn-icon text-danger"
                        style={{ position: 'absolute', top: '1rem', right: '1rem' }}
                        title="Remove library"
                      >
                        <span className="material-symbols-rounded">delete</span>
                      </button>
                    )}
                    <h3 className="font-bold text-lg mb-4 text-navy pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                      {lib.name || `Library ${libIdx + 1}`}
                    </h3>

                    {renderLibInput(libIdx, 'Library Name', 'name', 'text', 'e.g. Sunrise Study Library')}
                    <div className="form-group">
                      <label className="form-label">Full Address</label>
                      <textarea
                        className={`form-textarea ${errors[`${libIdx}_address`] ? 'error' : ''}`}
                        value={lib.address}
                        onChange={(e) => updateLibField(libIdx, 'address', e.target.value)}
                        placeholder="Street address, area, landmark"
                      />
                      {errors[`${libIdx}_address`] && <div className="form-error">{errors[`${libIdx}_address`]}</div>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* State Dropdown */}
                      <div className="form-group">
                        <label className="form-label">State</label>
                        <select
                          className={`form-input ${errors[`${libIdx}_state`] ? 'error' : ''}`}
                          value={lib.state}
                          onChange={(e) => updateLibField(libIdx, 'state', e.target.value)}
                        >
                          <option value="">Select State</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      {/* PIN Code */}
                      <div className="form-group">
                        <label className="form-label">PIN Code</label>
                        <input
                          type="text"
                          className={`form-input ${errors[`${libIdx}_pincode`] ? 'error' : ''}`}
                          value={lib.pincode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                            updateLibField(libIdx, 'pincode', val);
                          }}
                          placeholder="6 digit PIN code"
                          maxLength={6}
                          inputMode="numeric"
                        />
                        {errors[`${libIdx}_pincode`] && (
                          <div className="form-error">{errors[`${libIdx}_pincode`]}</div>
                        )}
                      </div>

                      {/* City */}
                      <div className="form-group">
                        <label className="form-label">City</label>
                        <input
                          type="text"
                          className={`form-input ${errors[`${libIdx}_city`] ? 'error' : ''}`}
                          value={lib.city}
                          onChange={(e) => updateLibField(libIdx, 'city', e.target.value)}
                          placeholder="e.g. Mumbai"
                        />
                        {errors[`${libIdx}_city`] && <div className="form-error">{errors[`${libIdx}_city`]}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Step 2: Capacity ─── */}
          {actualStep === 2 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Capacity
              </h2>
              <p className="text-sm mb-6 text-muted">
                How big is your library?
              </p>
              
              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => (
                  <div key={libIdx} className="p-5 rounded-xl" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-light)' }}>
                    <h3 className="font-bold text-lg mb-4 text-navy pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                      {lib.name || `Library ${libIdx + 1}`}
                    </h3>
                    
                    <div className="grid sm:grid-cols-2 gap-8">
                      {/* Seats Section */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                          <h4 className="font-bold text-navy flex items-center gap-2">
                            <span className="material-symbols-rounded icon-sm text-amber">chair</span>
                            Seating Capacity
                          </h4>
                          <span className="text-sm font-bold text-main bg-main-lightest px-2 py-0.5 rounded-md">
                            Total: {(parseInt(lib.male_seats) || 0) + (parseInt(lib.female_seats) || 0)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {renderLibInput(libIdx, 'Male Seats', 'male_seats', 'number', 'e.g. 50', { min: 0 })}
                          {renderLibInput(libIdx, 'Female Seats', 'female_seats', 'number', 'e.g. 50', { min: 0 })}
                        </div>
                        <p className="text-xs text-muted mt-3 leading-relaxed">
                          <strong className="text-navy">No gender separation?</strong> Enter all seats under Male Seats and 0 under Female Seats. All seats will be available to any student.
                        </p>
                      </div>

                      {/* Lockers Section */}
                      <div className="p-4 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                          <h4 className="font-bold text-navy flex items-center gap-2">
                            <span className="material-symbols-rounded icon-sm text-amber">lock</span>
                            Locker Capacity
                          </h4>
                          <span className="text-sm font-bold text-main bg-main-lightest px-2 py-0.5 rounded-md">
                            Total: {(parseInt(lib.male_lockers) || 0) + (parseInt(lib.female_lockers) || 0)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {renderLibInput(libIdx, 'Male Lockers', 'male_lockers', 'number', 'Enter 0 if none', { min: 0 })}
                          {renderLibInput(libIdx, 'Female Lockers', 'female_lockers', 'number', 'Enter 0 if none', { min: 0 })}
                        </div>
                        {((parseInt(lib.male_lockers) || 0) + (parseInt(lib.female_lockers) || 0)) === 0 && (
                          <p className="text-xs text-amber-dark bg-amber-lightest p-2 rounded flex items-start gap-1 mt-3">
                            <span className="material-symbols-rounded icon-sm" style={{ marginTop: '0.1rem' }}>info</span>
                            Locker configuration step will be skipped since you have 0 total lockers.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {actualStep === 3 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Shifts
              </h2>
              <p className="text-sm mb-6 text-muted">
                Configure the shifts your library offers
              </p>

              <div className="flex flex-col gap-8">
                {libraries.map((lib, libIdx) => {
                  const shiftForm = getShiftForm(libIdx);
                  const comboForm = getComboForm(libIdx);
                  const showSF = showShiftForms[libIdx];
                  const showCF = showComboForms[libIdx];

                  return (
                    <div key={libIdx} className="p-5 rounded-xl shadow-sm" style={{ border: '1px solid var(--color-border)', background: '#fff' }}>
                      <h3 className="font-bold text-lg mb-4 text-navy pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                        {lib.name || `Library ${libIdx + 1}`}
                      </h3>

                      {/* Added shifts cards */}
                      {lib.shifts.length > 0 && (
                        <div className="shift-cards-grid mb-6">
                          {lib.shifts.map((s) => (
                            <div key={s.id} className="shift-card-item">
                              <div className="shift-card-header">
                                <div className="shift-card-title-row">
                                  <span className="material-symbols-rounded" style={{ color: 'var(--color-amber)', fontSize: '1.3rem' }}>light_mode</span>
                                  <h4 className="font-bold text-navy">{s.label}</h4>
                                </div>
                                <button className="btn-icon text-danger" onClick={() => deleteShift(libIdx, s.id)} title="Remove shift">
                                  <span className="material-symbols-rounded icon-sm">close</span>
                                </button>
                              </div>
                              <div className="shift-card-time">
                                <span className="material-symbols-rounded icon-sm" style={{ color: 'var(--color-text-muted)' }}>schedule</span>
                                <span>{formatTime12(s.start_time)} – {formatTime12(s.end_time)}</span>
                                <span className="shift-duration-badge">{s.duration_hours}h</span>
                              </div>
                              <div className="shift-card-plans flex gap-2">
                                <span className="shift-plan-tag bg-green-50 text-green-700 font-medium px-3 py-1 rounded-full text-sm">
                                  ₹{s.monthly_fee} / month
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add shift form */}
                      {showSF ? (
                        <div className="shift-form-container">
                          {/* Section 1: Shift Label */}
                          <div className="form-group mb-0">
                            <label className="form-label flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm" style={{ color: 'var(--color-amber)' }}>label</span>
                              Shift Label
                            </label>
                            <input
                              className="form-input bg-white"
                              value={shiftForm.label}
                              onChange={(e) => updateShiftForm(libIdx, (p) => ({ ...p, label: e.target.value }))}
                              placeholder='e.g. "Morning", "Evening", "Night"'
                            />
                          </div>

                          {/* Section 2: Time Picker */}
                          <div className="shift-time-section">
                            <div className="shift-time-header">
                              <span className="material-symbols-rounded" style={{ color: 'var(--color-amber)', fontSize: '1.4rem' }}>schedule</span>
                              <span className="font-semibold text-navy">Shift Timing</span>
                              {shiftForm.start_time && shiftForm.end_time && (
                                <span className="shift-duration-pill">
                                  <span className="material-symbols-rounded" style={{ fontSize: '0.9rem' }}>timelapse</span>
                                  {calcDuration(shiftForm.start_time, shiftForm.end_time)}h duration
                                </span>
                              )}
                            </div>
                            <div className="shift-time-pickers">
                              <div className="shift-time-box">
                                <span className="shift-time-label">Start Time</span>
                                <div className="shift-time-input-wrapper">
                                  <div className="shift-time-selects">
                                    <select
                                      className="shift-hour-select"
                                      value={shiftForm.start_time ? String((parseInt(shiftForm.start_time.split(':')[0]) % 12) || 12) : ''}
                                      onChange={(e) => {
                                        const h = parseInt(e.target.value);
                                        const currentPeriod = shiftForm.start_time && parseInt(shiftForm.start_time.split(':')[0]) >= 12 ? 'PM' : 'AM';
                                        const h24 = currentPeriod === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                                        updateShiftForm(libIdx, (p) => ({ ...p, start_time: `${String(h24).padStart(2, '0')}:00` }));
                                      }}
                                    >
                                      <option value="">Hr</option>
                                      {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                    <div className="shift-ampm-toggle">
                                      {['AM', 'PM'].map(p => (
                                        <button
                                          key={p}
                                          type="button"
                                          className={`shift-ampm-btn ${shiftForm.start_time && ((p === 'PM' && parseInt(shiftForm.start_time.split(':')[0]) >= 12) || (p === 'AM' && parseInt(shiftForm.start_time.split(':')[0]) < 12)) ? 'active' : ''}`}
                                          onClick={() => {
                                            if (!shiftForm.start_time) return;
                                            const curH = parseInt(shiftForm.start_time.split(':')[0]);
                                            const h12 = curH % 12 || 12;
                                            const h24 = p === 'PM' ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
                                            updateShiftForm(libIdx, (prev) => ({ ...prev, start_time: `${String(h24).padStart(2, '0')}:00` }));
                                          }}
                                        >{p}</button>
                                      ))}
                                    </div>
                                  </div>
                                  {shiftForm.start_time && (
                                    <span className="shift-time-display">{formatTime12(shiftForm.start_time)}</span>
                                  )}
                                </div>
                              </div>
                              <div className="shift-time-divider">
                                <span className="material-symbols-rounded" style={{ color: 'var(--color-amber)' }}>arrow_forward</span>
                              </div>
                              <div className="shift-time-box">
                                <span className="shift-time-label">End Time</span>
                                <div className="shift-time-input-wrapper">
                                  <div className="shift-time-selects">
                                    <select
                                      className="shift-hour-select"
                                      value={shiftForm.end_time ? String((parseInt(shiftForm.end_time.split(':')[0]) % 12) || 12) : ''}
                                      onChange={(e) => {
                                        const h = parseInt(e.target.value);
                                        const currentPeriod = shiftForm.end_time && parseInt(shiftForm.end_time.split(':')[0]) >= 12 ? 'PM' : 'AM';
                                        const h24 = currentPeriod === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
                                        updateShiftForm(libIdx, (p) => ({ ...p, end_time: `${String(h24).padStart(2, '0')}:00` }));
                                      }}
                                    >
                                      <option value="">Hr</option>
                                      {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => (
                                        <option key={h} value={h}>{h}</option>
                                      ))}
                                    </select>
                                    <div className="shift-ampm-toggle">
                                      {['AM', 'PM'].map(p => (
                                        <button
                                          key={p}
                                          type="button"
                                          className={`shift-ampm-btn ${shiftForm.end_time && ((p === 'PM' && parseInt(shiftForm.end_time.split(':')[0]) >= 12) || (p === 'AM' && parseInt(shiftForm.end_time.split(':')[0]) < 12)) ? 'active' : ''}`}
                                          onClick={() => {
                                            if (!shiftForm.end_time) return;
                                            const curH = parseInt(shiftForm.end_time.split(':')[0]);
                                            const h12 = curH % 12 || 12;
                                            const h24 = p === 'PM' ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
                                            updateShiftForm(libIdx, (prev) => ({ ...prev, end_time: `${String(h24).padStart(2, '0')}:00` }));
                                          }}
                                        >{p}</button>
                                      ))}
                                    </div>
                                  </div>
                                  {shiftForm.end_time && (
                                    <span className="shift-time-display">{formatTime12(shiftForm.end_time)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Section 3: Monthly Fee */}
                          <div className="form-group mb-6">
                            <label className="form-label flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm text-green-600">payments</span>
                              Monthly Fee (₹)
                            </label>
                            <input
                              type="number"
                              className="form-input bg-white w-full max-w-xs"
                              min="0"
                              placeholder="e.g. 500"
                              value={shiftForm.monthly_fee}
                              onChange={(e) => updateShiftForm(libIdx, (p) => ({ ...p, monthly_fee: e.target.value }))}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3" style={{ paddingTop: '0.5rem' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => addShift(libIdx)}>
                              <span className="material-symbols-rounded icon-sm">add_circle</span> Add Shift
                            </button>
                            <button className="btn btn-sm" style={{ color: 'var(--color-text-muted)' }} onClick={() => setShowShiftForms(prev => ({...prev, [libIdx]: false}))}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-secondary btn-sm mb-8" onClick={() => setShowShiftForms(prev => ({...prev, [libIdx]: true}))}>
                          <span className="material-symbols-rounded icon-sm">add</span> Add Base Shift
                        </button>
                      )}

                      {/* Section B: Combination Shifts */}
                      {lib.shifts.length >= 2 && (
                        <div className="mt-8 pt-6 rounded-xl bg-surface-dark" style={{ border: '1px solid var(--color-border)' }}>
                          <div className="px-6 mb-4">
                            <h4 className="font-bold text-navy flex items-center gap-2 text-lg">
                              <span className="material-symbols-rounded text-purple-600">auto_awesome</span>
                              Auto-Generated Combinations
                            </h4>
                            <p className="text-sm text-muted mt-1">
                              We've generated these consecutive shift combinations automatically. Toggle them on if you offer them.
                            </p>
                          </div>

                          {lib.combinedPricing && lib.combinedPricing.length > 0 ? (
                            <div className="grid gap-4 sm:grid-cols-2 px-6 pb-6">
                              {lib.combinedPricing.map((combo) => (
                                <div key={combo.id} className={`p-4 rounded-xl transition-all ${combo.is_offered ? 'bg-amber-50 shadow-sm' : 'bg-white opacity-70'}`} style={{ border: `1px solid ${combo.is_offered ? 'var(--color-amber)' : 'var(--color-border)'}` }}>
                                  <div className="flex items-start justify-between mb-3">
                                    <div>
                                      <h5 className="font-bold text-navy text-base">{combo.label}</h5>
                                      <div className="text-sm text-muted flex items-center gap-1 mt-1">
                                        <span className="material-symbols-rounded icon-sm">schedule</span>
                                        {formatTime12(combo.start_time)} – {formatTime12(combo.end_time)}
                                        <span className="ml-2 font-medium bg-slate-100 px-2 py-0.5 rounded text-xs">{combo.duration_hours}h</span>
                                      </div>
                                    </div>
                                    <label className="switch">
                                      <input 
                                        type="checkbox" 
                                        checked={combo.is_offered}
                                        onChange={() => toggleComboOffered(libIdx, combo.id)}
                                      />
                                      <span className="slider round"></span>
                                    </label>
                                  </div>

                                  {combo.is_offered && (
                                    <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
                                      <div className="text-sm">
                                        <span className="text-muted block text-xs mb-1">Default (Sum)</span>
                                        <span className="line-through text-slate-400">₹{combo.default_fee}</span>
                                      </div>
                                      <div className="text-right flex items-center gap-2">
                                        <label className="text-sm font-bold text-navy">Offer Price:</label>
                                        <div className="relative">
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₹</span>
                                          <input
                                            type="number"
                                            className="form-input py-1.5 pl-7 pr-3 w-28 text-right font-bold text-green-700 bg-white"
                                            style={{ borderColor: 'var(--color-amber)', outlineColor: 'var(--color-amber)' }}
                                            placeholder={combo.default_fee}
                                            value={combo.custom_fee}
                                            onChange={(e) => updateComboCustomFee(libIdx, combo.id, e.target.value)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 m-6 bg-slate-50 rounded-xl text-center" style={{ border: '1px solid var(--color-border)' }}>
                              <span className="material-symbols-rounded text-slate-300 mb-2" style={{ fontSize: '2rem' }}>info</span>
                              <p className="text-muted text-sm border-0 m-0">No consecutive shifts available to combine.</p>
                              <p className="text-xs text-slate-400 mt-1">Add consecutive base shifts to see options here.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 4: Locker Policy ─── */}
          {actualStep === 4 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Locker Policy
              </h2>
              <p className="text-sm mb-6 text-muted">
                Configure locker access and rules
              </p>

              <div className="flex flex-col gap-6">
                {libraries.map((lib, libIdx) => {
                  const mLockers = parseInt(lib.male_lockers) || 0;
                  const fLockers = parseInt(lib.female_lockers) || 0;
                  
                  if (mLockers === 0 && fLockers === 0) return null;

                  return (
                    <div key={libIdx} className="flex flex-col gap-6">
                      <div className="p-5 rounded-xl text-navy bg-white shadow-sm" style={{ border: '1px solid var(--color-border)' }}>
                        <h3 className="font-bold text-lg pb-3 mb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <span className="material-symbols-rounded align-middle mr-2" style={{ color: 'var(--color-amber)' }}>business</span>
                          {lib.name || `Library ${libIdx + 1}`}
                        </h3>

                        {/* Male Lockers Policy */}
                        {mLockers > 0 && (
                          <div className={fLockers > 0 ? "mb-8 pb-8 border-b border-slate-100" : ""}>
                            <h4 className="font-bold text-md mb-3 flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm text-blue-600">male</span>
                              Male Lockers ({mLockers})
                            </h4>
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                              <div className="mb-4">
                                <label className="form-label text-sm text-navy font-bold">Who can take a male locker?</label>
                                <div className="flex flex-col gap-2 mt-2">
                                  {[
                                    { value: 'any', label: 'Any member (any shift)' },
                                    { value: '12h_plus', label: 'Only Full Day (12h+) members' },
                                    { value: '24h_only', label: 'Only 24-hour members' },
                                  ].map((opt) => (
                                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${lib.maleLockerPolicy.eligible_shift_type === opt.value ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'} border`}>
                                      <input
                                        type="radio"
                                        name={`mLockerEligibility_${libIdx}`}
                                        value={opt.value}
                                        checked={lib.maleLockerPolicy.eligible_shift_type === opt.value}
                                        onChange={(e) => updateLibField(libIdx, 'maleLockerPolicy', { ...lib.maleLockerPolicy, eligible_shift_type: e.target.value })}
                                        className="h-4 w-4 text-amber-500 focus:ring-amber-500"
                                      />
                                      <span className="text-sm font-medium text-navy">{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Monthly Fee (₹) <span className="text-danger">*</span></label>
                                  <input
                                    type="number"
                                    className={`form-input bg-white ${errors[`${libIdx}_male_locker_fee`] ? 'border-red-500' : ''}`}
                                    value={lib.maleLockerPolicy.monthly_fee}
                                    onChange={(e) => updateLibField(libIdx, 'maleLockerPolicy', { ...lib.maleLockerPolicy, monthly_fee: e.target.value })}
                                    placeholder="e.g. 300"
                                  />
                                  {errors[`${libIdx}_male_locker_fee`] && <span className="text-xs text-red-500 mt-1 block">{errors[`${libIdx}_male_locker_fee`]}</span>}
                                </div>
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Description (optional)</label>
                                  <input
                                    type="text"
                                    className="form-input bg-white"
                                    value={lib.maleLockerPolicy.description}
                                    onChange={(e) => updateLibField(libIdx, 'maleLockerPolicy', { ...lib.maleLockerPolicy, description: e.target.value })}
                                    placeholder="Any locker rules"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Female Lockers Policy */}
                        {fLockers > 0 && (
                          <div>
                            <h4 className="font-bold text-md mb-3 flex items-center gap-2">
                              <span className="material-symbols-rounded icon-sm text-pink-600">female</span>
                              Female Lockers ({fLockers})
                            </h4>
                            <div className="p-4 rounded-xl bg-pink-50 border border-pink-100">
                              <div className="mb-4">
                                <label className="form-label text-sm text-navy font-bold">Who can take a female locker?</label>
                                <div className="flex flex-col gap-2 mt-2">
                                  {[
                                    { value: 'any', label: 'Any member (any shift)' },
                                    { value: '12h_plus', label: 'Only Full Day (12h+) members' },
                                    { value: '24h_only', label: 'Only 24-hour members' },
                                  ].map((opt) => (
                                    <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${lib.femaleLockerPolicy.eligible_shift_type === opt.value ? 'bg-pink-100 border-pink-300' : 'bg-white border-pink-200'} border`}>
                                      <input
                                        type="radio"
                                        name={`fLockerEligibility_${libIdx}`}
                                        value={opt.value}
                                        checked={lib.femaleLockerPolicy.eligible_shift_type === opt.value}
                                        onChange={(e) => updateLibField(libIdx, 'femaleLockerPolicy', { ...lib.femaleLockerPolicy, eligible_shift_type: e.target.value })}
                                        className="h-4 w-4 text-pink-500 focus:ring-pink-500"
                                      />
                                      <span className="text-sm font-medium text-navy">{opt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Monthly Fee (₹) <span className="text-danger">*</span></label>
                                  <input
                                    type="number"
                                    className={`form-input bg-white ${errors[`${libIdx}_female_locker_fee`] ? 'border-red-500' : ''}`}
                                    value={lib.femaleLockerPolicy.monthly_fee}
                                    onChange={(e) => updateLibField(libIdx, 'femaleLockerPolicy', { ...lib.femaleLockerPolicy, monthly_fee: e.target.value })}
                                    placeholder="e.g. 300"
                                  />
                                  {errors[`${libIdx}_female_locker_fee`] && <span className="text-xs text-red-500 mt-1 block">{errors[`${libIdx}_female_locker_fee`]}</span>}
                                </div>
                                <div className="form-group mb-0">
                                  <label className="form-label text-sm font-bold text-navy">Description (optional)</label>
                                  <input
                                    type="text"
                                    className="form-input bg-white"
                                    value={lib.femaleLockerPolicy.description}
                                    onChange={(e) => updateLibField(libIdx, 'femaleLockerPolicy', { ...lib.femaleLockerPolicy, description: e.target.value })}
                                    placeholder="Any locker rules"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 5: Contact ─── */}
          {actualStep === 5 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Owner Contact Details
              </h2>
              <p className="text-sm mb-6 text-muted">
                How should we reach you regarding your overarching account?
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 p-5 rounded-xl" style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}>
                {renderLibInput(0, 'Contact Phone', 'contact_phone', 'tel', '10 digit number')}
                {renderLibInput(0, 'Contact Email', 'contact_email', 'email', 'you@example.com')}
              </div>
            </div>
          )}

          {/* ─── Step 6: Student Import ─── */}
          {actualStep === 6 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Import Existing Students
              </h2>
              <p className="text-sm mb-6 text-muted">
                Add your current members here so their attendance, seats, and payments are tracked immediately.
              </p>

              {libraries.map((lib, libIdx) => (
                <div key={libIdx} className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-navy text-lg">{lib.name || `Library ${libIdx + 1}`} Students</h3>
                    <button
                      className="btn btn-secondary"
                      onClick={() => addStudent(libIdx)}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                    >
                      <span className="material-symbols-rounded icon-sm">person_add</span> Add Student
                    </button>
                  </div>

                  {lib.imported_students.length === 0 ? (
                    <div className="text-center p-8 rounded-xl" style={{ border: '1px dashed var(--color-border)', background: 'var(--color-surface-light)' }}>
                      <span className="material-symbols-rounded icon-lg" style={{ color: 'var(--color-border-hover)' }}>group_off</span>
                      <p className="mt-2 text-sm text-muted">No students added yet.</p>
                      <p className="text-xs text-muted">Click the button above to import a student.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-navy font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">#</th>
                            <th className="p-3 min-w-[150px]">Student Info</th>
                            <th className="p-3 min-w-[200px]">Address</th>
                            <th className="p-3 min-w-[150px]">Shift & Seat</th>
                            <th className="p-3 min-w-[150px]">Locker</th>
                            <th className="p-3 min-w-[150px]">Payment</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {lib.imported_students.map((student, sIdx) => {
                            // Find shift price
                            let shiftPrice = 0;
                            if (student.shift_id) {
                              const baseOption = lib.shifts.find(s => s.id === student.shift_id);
                              const comboOption = lib.combinedPricing?.find(c => c.id === student.shift_id);
                              if (baseOption) shiftPrice = Number(baseOption.monthly_fee) || 0;
                              if (comboOption) shiftPrice = Number(comboOption.custom_fee) || Number(comboOption.default_fee) || 0;
                            }
                            
                            const autoAmount = shiftPrice * Number(student.plan_duration);

                            return (
                              <tr key={`student-${libIdx}-${sIdx}`} className="hover:bg-slate-50 align-top">
                                <td className="p-3 text-slate-400 text-xs font-mono">{sIdx + 1}</td>
                                
                                <td className="p-3 space-y-2">
                                  <input type="text" className="form-input text-xs py-1 px-2 w-full" value={student.name} onChange={(e) => updateStudent(libIdx, sIdx, 'name', e.target.value)} placeholder="Full Name *" />
                                  <input type="text" className="form-input text-xs py-1 px-2 w-full" value={student.father_name} onChange={(e) => updateStudent(libIdx, sIdx, 'father_name', e.target.value)} placeholder="Father's Name *" />
                                  <input type="tel" className="form-input text-xs py-1 px-2 w-full" value={student.phone} onChange={(e) => updateStudent(libIdx, sIdx, 'phone', e.target.value)} placeholder="Phone (10 digits) *" />
                                  <select className="form-select text-xs py-1 px-2 w-full" value={student.gender} onChange={(e) => updateStudent(libIdx, sIdx, 'gender', e.target.value)}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                  </select>
                                </td>
                                
                                <td className="p-3">
                                  <textarea className="form-input text-xs py-2 px-2 w-full h-full min-h-[120px] resize-none" value={student.address} onChange={(e) => updateStudent(libIdx, sIdx, 'address', e.target.value)} placeholder="Full Address * (House, Street, Area, City, Pincode)" />
                                </td>
                                
                                <td className="p-3 space-y-2">
                                  <select className="form-select text-xs py-1 px-2 w-full" value={student.shift_id} onChange={(e) => updateStudent(libIdx, sIdx, 'shift_id', e.target.value)}>
                                    <option value="">-- Select Shift --</option>
                                    {lib.shifts.map(sh => <option key={sh.id} value={sh.id}>[Base] {sh.label}</option>)}
                                    {lib.combinedPricing?.filter(c => c.is_offered).map(c => <option key={c.id} value={c.id}>[Combo] {c.label}</option>)}
                                  </select>
                                  <div className="relative">
                                    <input type="text" className="form-input text-xs py-1 px-2 pr-12 w-full" value={student.seat_number} onChange={(e) => updateStudent(libIdx, sIdx, 'seat_number', e.target.value)} placeholder="Seat No." />
                                    <button className="absolute right-1 top-1/2 -translate-y-1/2 text-amber-600 text-[10px] font-bold" type="button" onClick={() => {/* Fetch available seats modal later */}}>CHECK</button>
                                  </div>
                                </td>
                                
                                <td className="p-3 space-y-2">
                                  <label className="flex items-center gap-2 cursor-pointer mb-1">
                                    <input type="checkbox" className="form-checkbox h-3 w-3" checked={student.has_locker} onChange={(e) => updateStudent(libIdx, sIdx, 'has_locker', e.target.checked)} />
                                    <span className="text-xs font-semibold">Assign Locker?</span>
                                  </label>
                                  {student.has_locker && (
                                    <input type="text" className="form-input text-xs py-1 px-2 w-full" value={student.locker_no} onChange={(e) => updateStudent(libIdx, sIdx, 'locker_no', e.target.value)} placeholder="Locker No." />
                                  )}
                                </td>
                                
                                <td className="p-3 space-y-2">
                                  <select className="form-select text-xs py-1 px-2 w-full" value={student.plan_duration} onChange={(e) => {
                                    const newDuration = e.target.value;
                                    updateStudent(libIdx, sIdx, 'plan_duration', newDuration);
                                    updateStudent(libIdx, sIdx, 'amount_paid', shiftPrice * Number(newDuration));
                                  }}>
                                    <option value="1">1 Month</option>
                                    <option value="3">3 Months</option>
                                    <option value="6">6 Months</option>
                                    <option value="12">1 Year</option>
                                  </select>
                                  <div className="relative mt-2">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                                    <input type="number" className="form-input text-xs py-1 pl-5 pr-2 w-full" value={student.amount_paid} onChange={(e) => updateStudent(libIdx, sIdx, 'amount_paid', e.target.value)} placeholder={autoAmount} />
                                  </div>
                                  <select className="form-select text-xs py-1 px-2 w-full mt-2" value={student.payment_status} onChange={(e) => updateStudent(libIdx, sIdx, 'payment_status', e.target.value)}>
                                    <option value="paid">Paid</option>
                                    <option value="pending">Pending</option>
                                  </select>
                                </td>
                                
                                <td className="p-3 text-center">
                                  <button type="button" className="text-danger hover:text-danger-dark p-1 rounded hover:bg-red-50" onClick={() => removeStudent(libIdx, sIdx)} title="Remove Student">
                                    <span className="material-symbols-rounded icon-sm">delete</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ─── Step 7: Account Setup ─── */}
          {actualStep === 7 && (
             <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                 Create Admin Account
              </h2>
             <p className="text-sm mb-6 text-muted">
                Set a password to securely manage your libraries at admin.libraryos.in. Your login email will be the Contact Email provided earlier.
              </p>

              <div className="max-w-md bg-white p-6 rounded-xl" style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="form-group mb-4">
                  <label className="form-label">Login Email</label>
                  <input type="email" className="form-input bg-surface-light text-muted cursor-not-allowed" value={libraries[0].contact_email} disabled />
                  <p className="text-xs text-muted mt-1">This email was set in the Contact Step.</p>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className={`form-input ${errors.adminPassword ? 'error' : ''}`}
                    value={form.adminPassword}
                    onChange={(e) => updateField('adminPassword', e.target.value)}
                    placeholder="Min 6 characters"
                  />
                  {errors.adminPassword && <div className="form-error">{errors.adminPassword}</div>}
                </div>

                <div className="form-group mb-2">
                  <label className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    className={`form-input ${errors.adminPasswordConfirm ? 'error' : ''}`}
                    value={form.adminPasswordConfirm}
                    onChange={(e) => updateField('adminPasswordConfirm', e.target.value)}
                    placeholder="Re-enter password"
                  />
                  {errors.adminPasswordConfirm && <div className="form-error">{errors.adminPasswordConfirm}</div>}
                </div>
              </div>
             </div>
          )}

          {/* ─── Step 8: Review & Payment ─── */}
          {actualStep === 8 && (
            <div className="animate-fadeIn">
              <h2 className="text-3xl font-bold mb-1 text-navy">
                Choose Subscription & Checkout
              </h2>
              <p className="text-sm mb-6 text-muted">
                Review your libraries and select an operating plan.
              </p>

              <div className="mb-8 p-6 rounded-xl" style={{ background: 'var(--color-surface-light)', border: '1px solid var(--color-border)' }}>
                <h3 className="font-bold text-navy mb-4">You are registering {libraries.length} {libraries.length === 1 ? 'Library' : 'Libraries'}:</h3>
                <ul className="list-disc pl-5 text-sm text-navy font-medium">
                  {libraries.map((lib, i) => (
                    <li key={i}>{lib.name || `Library ${i+1}`} ({lib.total_seats} seats)</li>
                  ))}
                </ul>
              </div>

              <h3 className="font-bold text-navy mb-4 mt-8">Select Software Plan</h3>
              {isFetchingPlans ? (
                 <div className="p-8 text-center text-muted"><span className="loading-spinner"></span> Loading plans...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  {pricingPlans.map((plan) => {
                    const isSelected = selectedPlan?.id === plan.id;
                    const isPopular = plan.name === "3_month";
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan)}
                        className={`p-5 rounded-xl transition-all cursor-pointer relative ${isSelected ? 'ring-2 ring-amber bg-amber-lightest' : 'bg-white hover:bg-surface-light'}`}
                        style={{ border: `1px solid ${isSelected ? 'var(--color-amber)' : 'var(--color-border)'}` }}
                      >
                         {isPopular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-main text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Most Popular
                            </span>
                          )}
                        <h4 className="font-bold text-navy mb-1">{plan.label}</h4>
                        <p className="text-xs text-muted mb-3">{plan.duration_days} Days / Library</p>
                        <div className="text-2xl font-black text-main flex items-baseline gap-1">
                          ₹{plan.base_price} <span className="text-xs font-normal text-muted">/ lib</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedPlan && (
                <div className="mb-8 p-6 rounded-xl text-center" style={{ background: '#F8FAFC', border: '2px dashed var(--color-border)' }}>
                   <p className="text-muted mb-2 font-medium">Checkout Total</p>
                   <div className="text-4xl font-black text-navy mb-2">₹{selectedPlan.base_price * libraries.length}</div>
                   <p className="text-sm text-muted">({libraries.length} {libraries.length === 1 ? 'Library' : 'Libraries'} × ₹{selectedPlan.base_price}) for {selectedPlan.duration_days} Days Access</p>
                </div>
              )}

              <label className="checkbox-label mb-6 p-4 rounded-xl items-start" style={{ background: 'var(--color-amber-lightest)', border: '1px solid var(--color-amber-light)' }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="form-checkbox mt-1"
                />
                <span className="text-sm font-medium" style={{ color: '#92400E' }}>
                  I confirm all details above are correct and I want to submit my registration.
                </span>
              </label>

              {submitError && (
                <div className="p-4 rounded-xl mb-6 text-sm flex items-start gap-2" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                  <span className="material-symbols-rounded icon-sm">error</span>
                  <span className="font-medium pt-0.5">{submitError}</span>
                </div>
              )}
            </div>
          )}

          {/* ─── Navigation buttons ─── */}
          <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-3">
              {step > 1 && (
                <button className="btn btn-secondary" onClick={prevStep}>
                  <span className="material-symbols-rounded icon-sm">arrow_back</span> Back
                </button>
              )}
              {actualStep === 1 && (
                <button
                  className="btn btn-secondary"
                  onClick={addNewLibrary}
                  style={{ color: 'var(--color-amber-dark)', borderColor: 'var(--color-amber-light)', background: 'var(--color-amber-lightest)' }}
                >
                  <span className="material-symbols-rounded icon-sm">add_business</span> Add Another Library
                </button>
              )}
            </div>
            {actualStep < 8 ? (
              <button className="btn btn-primary" onClick={nextStep}>
                Continue <span className="material-symbols-rounded icon-sm">arrow_forward</span>
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                {isSubmitting ? (
                  <>
                    <span className="loading-spinner" /> Submitting...
                  </>
                ) : (
                  <>
                    Submit Registration <span className="material-symbols-rounded icon-sm">check_circle</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}
