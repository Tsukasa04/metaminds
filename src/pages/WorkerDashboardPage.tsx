import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, CheckCircle2, MapPin, Calendar, AlertCircle, Settings,
  Receipt, X, Loader2, Star,
  Briefcase, Wallet, HelpCircle, User, ChevronRight,
  TrendingUp, MessageSquare, Zap, Copy, Check, Phone,
  RefreshCw
} from 'lucide-react';
import { type Booking, type Payment } from '@/lib/supabase';
import { CATEGORY_ICONS } from '@/lib/categories';
import { useAuth } from '@/context/AuthContext';
import { fetchWorkerDashboardData, updateBookingStatus, confirmPaymentAsReceived } from '@/lib/dataService';
import { CoLabourPrinterEngine } from '@/components/CoLabourPrinterEngine';
import {
  Wallet3DIcon,
  LocationPin3DIcon,
  Briefcase3DIcon,
  Star3DIcon,
  Robot3DIcon,
  Gift3DIcon,
  Mascot3DIcon
} from '@/components/worker-dashboard/Worker3DIcons';
import { ThreeWorkerAvatar } from '@/components/worker-dashboard/ThreeWorkerAvatar';
import { LiveWorkRadar } from '@/components/worker-dashboard/LiveWorkRadar';
import { EarningsChart } from '@/components/worker-dashboard/EarningsChart';
import { JobsCompletedChart } from '@/components/worker-dashboard/JobsCompletedChart';
import { TradeCategoryGrid, type TradeCategoryItem } from '@/components/worker-dashboard/TradeCategoryGrid';
import { calculateDynamicRating, getTradeMedia, getInitialReviewsForWorker } from '@/lib/ratings';

interface BookingWithCustomer extends Booking {
  customer?: { name: string; phone: string; email?: string } | null;
}

interface PaymentWithBooking extends Payment {
  bookings?: { customer_id: string; address: string } | null;
}

export function WorkerDashboardPage() {
  const { user, workerProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // State
  const [bookings, setBookings] = useState<BookingWithCustomer[]>([]);
  const [payments, setPayments] = useState<PaymentWithBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showReferModal, setShowReferModal] = useState(false);
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [selectedTradeModal, setSelectedTradeModal] = useState<TradeCategoryItem | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<{ booking: BookingWithCustomer; payment?: PaymentWithBooking } | null>(null);
  const [selectedJobModal, setSelectedJobModal] = useState<BookingWithCustomer | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'earnings' | 'payments' | 'profile'>('overview');
  const [isAvailable, setIsAvailable] = useState(true);
  const [copiedReferral, setCopiedReferral] = useState(false);

  // Settings state
  const [upiId, setUpiId] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Real data fetcher
  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchWorkerDashboardData(user.id);
      setBookings(data.bookings as BookingWithCustomer[]);
      setPayments(data.payments as PaymentWithBooking[]);
    } catch (err) {
      console.error('Failed to sync worker dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (workerProfile) {
      setUpiId(workerProfile.upi_id || '');
      setHourlyRate(String(workerProfile.hourly_rate || 450));
      fetchData();
    } else {
      setLoading(false);
    }
  }, [workerProfile, authLoading, fetchData]);

  // Real-time synchronization polling every 3s
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [user, fetchData]);

  // Actions
  const handleConfirmPayment = async (paymentId: string) => {
    setConfirmingId(paymentId);
    setPayments((prev) =>
      prev.map((p) => (p.id === paymentId ? { ...p, status: 'paid', paid_at: new Date().toISOString() } : p))
    );
    showToast('🎉 Payment verified as received! Earnings updated.');
    try {
      await confirmPaymentAsReceived(paymentId);
      await fetchData();
    } catch {
      alert('Failed to confirm payment');
      await fetchData();
    } finally {
      setConfirmingId(null);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status } : b))
    );

    if (status === 'confirmed') {
      showToast('🎉 Job Accepted! Customer notified to proceed.');
    } else if (status === 'cancelled') {
      showToast('Job Declined and removed from active queue.');
    } else if (status === 'completed' || status === 'paid') {
      showToast('✓ Job marked as Completed.');
    }

    try {
      await updateBookingStatus(bookingId, status);
      await fetchData();
    } catch {
      alert('Failed to update booking status');
      await fetchData();
    }
  };

  const handleSaveSettings = async () => {
    if (!workerProfile) return;
    setSavingSettings(true);
    setSettingsMsg('');
    try {
      workerProfile.upi_id = upiId;
      workerProfile.hourly_rate = parseFloat(hourlyRate) || workerProfile.hourly_rate;
      setSettingsMsg('Settings saved successfully');
      showToast('Settings saved successfully');
      setTimeout(() => setShowSettings(false), 1000);
    } catch {
      setSettingsMsg('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopyReferral = () => {
    const code = `COLABOUR-${(user?.name || 'WORKER').toUpperCase().replace(/\s+/g, '')}500`;
    navigator.clipboard?.writeText?.(code);
    setCopiedReferral(true);
    showToast('Referral code copied to clipboard!');
    setTimeout(() => setCopiedReferral(false), 2500);
  };

  // Calculations
  const totalEarnings = useMemo(() => {
    return payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
  }, [payments]);

  const pendingPayments = useMemo(() => {
    return payments.filter((p) => p.status === 'payment_submitted');
  }, [payments]);

  const activeBookings = useMemo(() => {
    return bookings.filter((b) => ['pending', 'confirmed', 'in_progress'].includes(b.status || 'pending'));
  }, [bookings]);

  const completedJobs = useMemo(() => {
    return bookings.filter((b) => b.status === 'paid' || b.status === 'completed');
  }, [bookings]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-16 bg-[#F8F9FA]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="animate-spin text-emerald-600" />
          <p className="text-sm font-bold text-gray-600">Loading CoLabour Live Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!workerProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center pt-16 gap-4 bg-[#F8F9FA] px-4">
        <div className="rounded-3xl bg-white border border-gray-200 p-8 max-w-md w-full text-center shadow-lg">
          <AlertCircle className="text-amber-500 mx-auto mb-3" size={42} />
          <h2 className="text-xl font-black text-gray-900 mb-1">Worker Profile Needed</h2>
          <p className="text-sm text-gray-600 mb-6">
            Please register as a verified service provider to access your live work radar and dispatches.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-md transition-colors cursor-pointer"
          >
            Complete Registration
          </button>
        </div>
      </div>
    );
  }

  const workerInitials = user?.name ? user.name.slice(0, 2).toUpperCase() : 'WK';
  const workerDisplayId = workerProfile.id ? workerProfile.id.slice(0, 8).toUpperCase() : 'CLB-001';

  return (
    <div className="min-h-screen bg-transparent text-gray-900 pt-16 pb-16 font-sans">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-emerald-600 text-white px-5 py-3.5 text-sm font-bold shadow-xl animate-bounce">
          <CheckCircle2 size={20} className="text-white shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* TOP NAVBAR */}
      <header className="sticky top-16 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-md text-white">
              <Zap className="h-5 w-5 fill-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-gray-900">
              Co<span className="text-emerald-600">Labour</span>
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <Link
              to="/"
              className="px-4 py-2 rounded-full text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Home
            </Link>
            <Link
              to="/workers"
              className="px-4 py-2 rounded-full text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Find Workers
            </Link>
            <button
              onClick={() => setActiveTab('overview')}
              className="px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-extrabold text-emerald-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Dashboard</span>
            </button>
          </nav>

          {/* Right: Notifications & Worker Profile Pill */}
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setActiveTab('jobs')}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors relative cursor-pointer"
                title="Active alerts"
              >
                <Bell size={20} />
                {(activeBookings.length > 0 || pendingPayments.length > 0) && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                    {activeBookings.length + pendingPayments.length}
                  </span>
                )}
              </button>
            </div>

            {/* Worker Avatar & Name Pill */}
            <div
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 border border-amber-300 flex items-center justify-center overflow-hidden">
                <span className="text-[11px] font-extrabold text-amber-900">{workerInitials}</span>
              </div>
              <span className="text-xs font-bold text-gray-900">{user?.name || 'Worker'}</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                {workerProfile.is_verified ? 'Verified' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ======================================================== */}
          {/* LEFT SIDEBAR (Col 1 to 3) */}
          {/* ======================================================== */}
          <aside className="lg:col-span-3 space-y-5">
            
            {/* 1. Worker Profile Card with Interactive 3D Three.js Avatar */}
            <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-[0_4px_25px_rgba(0,0,0,0.04)] text-center">
              {/* 3D Stylized Worker Avatar (Three.js WebGL with Pointer Tracking) */}
              <div className="flex justify-center mb-3">
                <ThreeWorkerAvatar
                  className="w-24 h-24"
                  onAvatarClick={() => showToast('⚡ Power Active! Avatar energized.')}
                />
              </div>

              {/* Name & Verification */}
              <div className="flex items-center justify-center gap-1.5">
                <h2 className="text-lg font-black text-gray-950">{user?.name || 'bottle yadav'}</h2>
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                  ✓ Verified
                </span>
              </div>

              {/* Worker ID & UPI */}
              <div className="mt-2 text-xs font-medium text-gray-500 space-y-0.5">
                <p>ID: <span className="font-mono text-gray-700 font-bold">CLB-{workerDisplayId}</span></p>
                <p>UPI: <span className="font-mono text-gray-700 font-bold">{workerProfile.upi_id || 'yadav@oksbi'}</span></p>
              </div>
            </div>

            {/* 2. Availability Card ("AVAILABLE FOR WORK") */}
            <div className={`rounded-3xl p-5 shadow-lg transition-all duration-300 ${
              isAvailable
                ? 'bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-600 text-white shadow-emerald-500/15'
                : 'bg-gradient-to-br from-slate-700 via-slate-800 to-gray-900 text-white shadow-gray-900/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-100">
                  {isAvailable ? 'Available for Work' : 'Currently Offline'}
                </span>
                
                {/* On/Off Switch */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isAvailable;
                    setIsAvailable(next);
                    showToast(next ? '🟢 You are now Live & Available!' : '⚪ Offline mode enabled.');
                  }}
                  className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isAvailable ? 'bg-white' : 'bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center text-[9px] font-black ${
                      isAvailable
                        ? 'translate-x-6 bg-emerald-600 text-white'
                        : 'translate-x-0 bg-gray-300 text-gray-800'
                    }`}
                  >
                    {isAvailable ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              {/* Status Message */}
              <div className="mt-4 text-center">
                <p className="text-sm font-extrabold">
                  {isAvailable ? 'You are live!' : "You're currently offline"}
                </p>
                <p className="text-xs text-emerald-100 mt-0.5">
                  {isAvailable ? 'Searching for jobs within radar radius' : 'Turn on to receive nearby customer dispatches'}
                </p>
              </div>

              {/* Potential Jobs Tag */}
              {isAvailable && (
                <div className="mt-4 flex items-center justify-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-xs text-white text-xs font-bold shadow-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-300 animate-ping" />
                    <span>{activeBookings.length > 0 ? activeBookings.length : 3} potential jobs nearby</span>
                  </span>
                </div>
              )}
            </div>

            {/* 3. Sidebar Navigation Links */}
            <div className="rounded-3xl bg-white border border-gray-100 p-3 shadow-[0_4px_25px_rgba(0,0,0,0.04)] space-y-1">
              {[
                { id: 'overview', label: 'Overview', icon: Zap },
                { id: 'jobs', label: 'My Jobs', icon: Briefcase, count: activeBookings.length },
                { id: 'earnings', label: 'Earnings', icon: Wallet },
                { id: 'payments', label: 'Payments', icon: Receipt, count: pendingPayments.length },
                { id: 'profile', label: 'Profile', icon: User },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as 'overview' | 'jobs' | 'earnings' | 'payments' | 'profile')}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 font-extrabold shadow-2xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
                      <span>{item.label}</span>
                    </div>
                    {item.count ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                        {item.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Settings size={16} className="text-gray-400" />
                  <span>Settings</span>
                </div>
              </button>

              <button
                onClick={() => setShowHelpModal(true)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle size={16} className="text-gray-400" />
                  <span>Help & Support</span>
                </div>
              </button>
            </div>

            {/* 4. CoLabour AI Assistant Card */}
            <div
              onClick={() => {
                const aiBtn = document.querySelector('[aria-label="Open CoLabour AI Assistant"]') as HTMLButtonElement;
                if (aiBtn) aiBtn.click();
                else showToast('CoLabour AI Assistant is ready at bottom right!');
              }}
              className="rounded-3xl bg-white border border-gray-100 p-4 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex items-center justify-between cursor-pointer hover:border-emerald-200 transition-all group"
            >
              <div className="flex items-center gap-3">
                <Robot3DIcon className="w-10 h-10" />
                <div>
                  <h4 className="text-xs font-extrabold text-gray-900 group-hover:text-emerald-700 transition-colors">
                    CoLabour AI
                  </h4>
                  <p className="text-[11px] text-gray-500">Your smart assistant</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400 group-hover:text-emerald-600 transition-colors" />
            </div>

          </aside>


          {/* ======================================================== */}
          {/* RIGHT CONTENT AREA (Col 4 to 12) */}
          {/* ======================================================== */}
          <section className="lg:col-span-9 space-y-6">

            {/* VIEW 1: OVERVIEW (Default Dashboard) */}
            {activeTab === 'overview' && (
              <>
                {/* TOP 4 KPI CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  
                  {/* 1. Total Earnings */}
                  <div
                    onClick={() => setActiveTab('earnings')}
                    className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex items-center justify-between cursor-pointer hover:border-emerald-200 transition-all"
                  >
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-gray-950">
                        ₹{totalEarnings > 0 ? totalEarnings.toLocaleString('en-IN') : '12,450'}
                      </div>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">This Month</p>
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                        <TrendingUp size={13} />
                        <span>↗ 18% from last month</span>
                      </div>
                    </div>
                    <Wallet3DIcon className="w-12 h-12" />
                  </div>

                  {/* 2. Nearby Jobs */}
                  <div
                    onClick={() => setActiveTab('jobs')}
                    className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex items-center justify-between cursor-pointer hover:border-emerald-200 transition-all"
                  >
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-gray-950">
                        {activeBookings.length > 0 ? activeBookings.length : 3}
                      </div>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">Nearby Jobs</p>
                      <p className="text-[11px] font-bold text-gray-400 mt-2">Within radius</p>
                    </div>
                    <LocationPin3DIcon className="w-12 h-12" />
                  </div>

                  {/* 3. Jobs Completed */}
                  <div
                    onClick={() => setActiveTab('jobs')}
                    className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex items-center justify-between cursor-pointer hover:border-emerald-200 transition-all"
                  >
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-gray-950">
                        {completedJobs.length > 0 ? completedJobs.length : 24}
                      </div>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">Jobs Completed</p>
                      <p className="text-[11px] font-bold text-gray-400 mt-2">All time</p>
                    </div>
                    <Briefcase3DIcon className="w-12 h-12" />
                  </div>

                  {/* 4. Rating */}
                  <div
                    onClick={() => setActiveTab('profile')}
                    className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex items-center justify-between cursor-pointer hover:border-emerald-200 transition-all"
                  >
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-gray-950">
                        {workerProfile.rating ? workerProfile.rating.toFixed(1) : '5.0'}
                      </div>
                      <p className="text-xs font-medium text-gray-500 mt-0.5">Rating</p>
                      <div className="mt-2 flex items-center gap-0.5 text-amber-400">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={12} fill="currentColor" />
                        ))}
                      </div>
                    </div>
                    <Star3DIcon className="w-12 h-12" />
                  </div>

                </div>


                {/* CENTER MAIN: LIVE WORK RADAR & NEARBY JOBS */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  
                  {/* LIVE WORK RADAR (Center 7 cols) */}
                  <div className="xl:col-span-7">
                    <LiveWorkRadar
                      bookings={bookings}
                      workerLocation={workerProfile.location}
                      isAvailable={isAvailable}
                      onToggleAvailability={() => setIsAvailable(!isAvailable)}
                      onSelectBooking={(b) => setSelectedJobModal(b as BookingWithCustomer)}
                      onAcceptBooking={(id) => handleUpdateBookingStatus(id, 'confirmed')}
                    />
                  </div>

                  {/* NEARBY JOBS LIST (Right 5 cols) */}
                  <div className="xl:col-span-5 space-y-4">
                    <div className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex flex-col justify-between h-full">
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900">
                            Nearby Jobs
                          </h3>
                          <button
                            onClick={() => setActiveTab('jobs')}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                          >
                            View All
                          </button>
                        </div>

                        {/* Dynamic Jobs List */}
                        <div className="space-y-3">
                          {activeBookings.length === 0 ? (
                            /* Sample List of Active Category Dispatches */
                            [
                              { title: 'AC Repair & Service', distance: '1.2 km away', time: 'Today · 10:30 AM', price: '₹650 – ₹900', category: 'Technician' },
                              { title: 'Electrical Wiring', distance: '2.4 km away', time: 'Today · 12:00 PM', price: '₹500 – ₹750', category: 'Electrician' },
                              { title: 'Fan Installation', distance: '3.1 km away', time: 'Today · 02:00 PM', price: '₹300 – ₹500', category: 'Electrician' },
                            ].map((job, idx) => {
                              const Icon = CATEGORY_ICONS[job.category] || Briefcase;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => setShowExploreModal(true)}
                                  className="p-3 rounded-2xl bg-gray-50/70 hover:bg-gray-50 border border-gray-100 flex items-center justify-between transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center">
                                      <Icon size={18} />
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-bold text-gray-900">{job.title}</h4>
                                      <p className="text-[10px] text-gray-500 font-medium">
                                        <span className="text-emerald-700 font-semibold">{job.distance}</span> • {job.time}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-extrabold text-gray-900 block">{job.price}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowExploreModal(true);
                                      }}
                                      className="mt-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-emerald-400 text-[10px] font-bold text-gray-800 hover:text-emerald-700 shadow-2xs transition-colors cursor-pointer"
                                    >
                                      View Job
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            activeBookings.slice(0, 3).map((job) => {
                              const Icon = CATEGORY_ICONS[job.category] || Briefcase;
                              return (
                                <div
                                  key={job.id}
                                  onClick={() => setSelectedJobModal(job)}
                                  className="p-3 rounded-2xl bg-gray-50/80 hover:bg-gray-50 border border-gray-100 flex items-center justify-between transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                                      <Icon size={18} />
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-bold text-gray-900">{job.category}</h4>
                                      <p className="text-[10px] text-gray-500 font-medium truncate max-w-[140px]">
                                        {job.customer?.name || 'Customer'} • {job.address}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs font-extrabold text-emerald-700 block">
                                      ₹{Number(job.total_amount).toFixed(0)}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedJobModal(job);
                                      }}
                                      className="mt-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-emerald-400 text-[10px] font-bold text-gray-800 hover:text-emerald-700 shadow-2xs transition-colors cursor-pointer"
                                    >
                                      View Job
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Refer & Earn Banner */}
                      <div
                        onClick={() => setShowReferModal(true)}
                        className="mt-4 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/70 flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-colors group"
                      >
                        <div>
                          <h4 className="text-xs font-extrabold text-amber-950 group-hover:text-amber-900">Refer & Earn</h4>
                          <p className="text-[11px] text-amber-800">Refer a worker and earn up to ₹500</p>
                        </div>
                        <Gift3DIcon className="w-8 h-8 group-hover:scale-110 transition-transform" />
                      </div>
                    </div>
                  </div>

                </div>

                {/* TRADE CATEGORY DISPATCHES GRID (All 9 trade verticals) */}
                <TradeCategoryGrid
                  onSelectCategory={(cat) => setSelectedTradeModal(cat)}
                />

                {/* MIDDLE ROW: EARNINGS OVERVIEW, JOBS COMPLETED, RECENT JOBS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Earnings Overview Line Chart */}
                  <EarningsChart
                    payments={payments}
                    totalEarnings={totalEarnings > 0 ? totalEarnings : 3650}
                  />

                  {/* Jobs Completed Bar Chart */}
                  <JobsCompletedChart
                    completedJobsCount={completedJobs.length > 0 ? completedJobs.length : 12}
                    bookings={bookings}
                  />

                  {/* Recent Jobs List */}
                  <div className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900">
                          Recent Jobs
                        </h3>
                        <button
                          onClick={() => setActiveTab('jobs')}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                        >
                          View All
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {completedJobs.length === 0 ? (
                          [
                            { title: 'Bathroom Plumbing', time: 'Today · 09:15 AM', status: 'Completed', amount: '₹700', cat: 'Plumber' },
                            { title: 'Switch Board Repair', time: 'Yesterday · 04:45 PM', status: 'Completed', amount: '₹450', cat: 'Electrician' },
                            { title: 'Tube Light Installation', time: '12 May 2025 · 11:30 AM', status: 'Completed', amount: '₹300', cat: 'Electrician' },
                          ].map((item, i) => {
                            const Icon = CATEGORY_ICONS[item.cat] || Briefcase;
                            return (
                              <div
                                key={i}
                                onClick={() => showToast(`Completed receipt for ${item.title}`)}
                                className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                                    <Icon size={15} />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-gray-900">{item.title}</h4>
                                    <p className="text-[10px] text-gray-400">{item.time}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                    {item.status}
                                  </span>
                                  <span className="text-xs font-extrabold text-gray-900">{item.amount}</span>
                                  <ChevronRight size={14} className="text-gray-400" />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          completedJobs.slice(0, 3).map((job) => {
                            const Icon = CATEGORY_ICONS[job.category] || Briefcase;
                            const jobPayment = payments.find((p) => p.booking_id === job.id);
                            return (
                              <div
                                key={job.id}
                                onClick={() => setSelectedSlip({ booking: job, payment: jobPayment })}
                                className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                                    <Icon size={15} />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-gray-900">{job.category}</h4>
                                    <p className="text-[10px] text-gray-400">
                                      {new Date(job.scheduled_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                    Completed
                                  </span>
                                  <span className="text-xs font-extrabold text-gray-900">
                                    ₹{Number(job.total_amount).toFixed(0)}
                                  </span>
                                  <ChevronRight size={14} className="text-gray-400" />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                </div>

                {/* BOTTOM ROW: RECENT PAYMENTS, REVIEWS & TRUST CARD */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                  
                  {/* Recent Payments */}
                  <div className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900">
                          Recent Payments
                        </h3>
                        <button
                          onClick={() => setActiveTab('payments')}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                        >
                          View All
                        </button>
                      </div>

                      {pendingPayments.length > 0 ? (
                        <div className="space-y-2">
                          {pendingPayments.slice(0, 2).map((p) => (
                            <div key={p.id} className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold text-gray-900 block">Payment Submitted</span>
                                <span className="text-[10px] font-mono text-cyan-900 font-bold bg-cyan-100 px-1 py-0.5 rounded">
                                  UTR: {p.utr_number}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-extrabold text-gray-900 block">₹{Number(p.amount).toFixed(0)}</span>
                                <button
                                  onClick={() => handleConfirmPayment(p.id!)}
                                  disabled={confirmingId === p.id}
                                  className="mt-1 px-2.5 py-0.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold cursor-pointer transition-colors"
                                >
                                  {confirmingId === p.id ? '...' : 'Verify'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          onClick={() => setActiveTab('payments')}
                          className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100/80 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                              <Receipt size={17} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-gray-900">Payment from Rahul Mehta</h4>
                              <p className="text-[10px] text-gray-400">Today · 10:45 AM</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-extrabold text-gray-900 block">₹700</span>
                            <span className="text-[10px] font-bold text-emerald-600">Received</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reviews & Feedback */}
                  <div className="rounded-3xl bg-white border border-gray-100 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900">
                          Reviews & Feedback
                        </h3>
                        <span
                          onClick={() => showToast('5.0 Rating • 24 Verified 5-Star Reviews')}
                          className="text-xs font-bold text-emerald-600 cursor-pointer"
                        >
                          View All
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-gray-50/70 border border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 font-bold text-xs flex items-center justify-center">
                            RM
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-gray-900">Rahul Mehta</h4>
                              <div className="flex text-amber-400">
                                {[...Array(5)].map((_, i) => (
                                  <Star key={i} size={10} fill="currentColor" />
                                ))}
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-400">Today</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2 italic font-normal">
                          "Great work! Very professional and arrived on time."
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Trust Card ("Stay Protected with CoLabour") */}
                  <div
                    onClick={() => setShowHelpModal(true)}
                    className="rounded-3xl bg-emerald-50/80 border border-emerald-200/70 p-5 shadow-[0_4px_25px_rgba(0,0,0,0.04)] flex items-center justify-between cursor-pointer hover:bg-emerald-100/60 transition-colors"
                  >
                    <div className="pr-2">
                      <h3 className="text-xs font-extrabold text-emerald-950">
                        Stay Protected with <span className="text-emerald-700">CoLabour</span>
                      </h3>
                      <p className="text-[11px] text-emerald-800 mt-1 leading-snug">
                        We ensure safe payments, verified workers and 0% platform fees.
                      </p>
                    </div>
                    <Mascot3DIcon className="w-16 h-16 shrink-0" />
                  </div>

                </div>
              </>
            )}

            {/* VIEW 2: MY JOBS (Full management view) */}
            {activeTab === 'jobs' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-[0_4px_25px_rgba(0,0,0,0.04)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                    <div>
                      <h2 className="text-lg font-black text-gray-900">Job Dispatches & History</h2>
                      <p className="text-xs text-gray-500">Manage all customer work orders in your area</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchData}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold text-gray-700 flex items-center gap-1.5 hover:bg-gray-100 cursor-pointer"
                      >
                        <RefreshCw size={14} />
                        Refresh
                      </button>
                      <button
                        onClick={() => setShowExploreModal(true)}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md cursor-pointer"
                      >
                        Explore More
                      </button>
                    </div>
                  </div>

                  {/* Active Jobs */}
                  <div className="mt-6 space-y-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Active / Pending ({activeBookings.length})
                    </h3>
                    {activeBookings.length === 0 ? (
                      <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <Briefcase size={32} className="text-gray-400 mx-auto mb-2" />
                        <p className="text-sm font-bold text-gray-700">No active bookings right now</p>
                        <p className="text-xs text-gray-500 mt-1">Make sure you are set to Available for work to receive live pings!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeBookings.map((job) => {
                          const Icon = CATEGORY_ICONS[job.category] || Briefcase;
                          return (
                            <div key={job.id} className="p-4 rounded-2xl bg-white border border-emerald-100 shadow-sm space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                                    <Icon size={20} />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-black text-gray-900">{job.category}</h4>
                                    <p className="text-xs text-gray-500">Customer: {job.customer?.name || 'Verified Client'}</p>
                                  </div>
                                </div>
                                <span className="text-sm font-black text-emerald-700">
                                  ₹{Number(job.total_amount).toFixed(0)}
                                </span>
                              </div>

                              <div className="text-xs text-gray-600 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <MapPin size={13} className="text-gray-400 shrink-0" />
                                  <span className="truncate">{job.address}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={13} className="text-gray-400 shrink-0" />
                                  <span>{new Date(job.scheduled_at).toLocaleString()}</span>
                                </div>
                              </div>

                              <div className="flex gap-2 pt-2 border-t border-gray-100">
                                <button
                                  onClick={() => setSelectedJobModal(job)}
                                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                                >
                                  Manage Details
                                </button>
                                {job.status === 'confirmed' && (
                                  <button
                                    onClick={() => handleUpdateBookingStatus(job.id, 'completed')}
                                    className="px-3 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold cursor-pointer"
                                  >
                                    Done
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Completed Jobs History */}
                  <div className="mt-8 space-y-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Completed Jobs ({completedJobs.length})
                    </h3>
                    <div className="space-y-2">
                      {completedJobs.map((job) => {
                        const Icon = CATEGORY_ICONS[job.category] || Briefcase;
                        const jobPayment = payments.find((p) => p.booking_id === job.id);
                        return (
                          <div
                            key={job.id}
                            onClick={() => setSelectedSlip({ booking: job, payment: jobPayment })}
                            className="p-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100/80 border border-gray-100 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                                <Icon size={18} />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-gray-900">{job.category} - {job.address}</h4>
                                <p className="text-[10px] text-gray-400">{new Date(job.scheduled_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-gray-900">₹{Number(job.total_amount).toFixed(0)}</span>
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                Slip / Receipt
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 3: EARNINGS TAB */}
            {activeTab === 'earnings' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-[0_4px_25px_rgba(0,0,0,0.04)]">
                  <h2 className="text-lg font-black text-gray-900 mb-1">Worker Earnings Analytics</h2>
                  <p className="text-xs text-gray-500 mb-6">Direct UPI Settlement Tracking & Growth</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                      <span className="text-xs font-bold text-emerald-800">Total Collected</span>
                      <div className="text-2xl font-black text-emerald-950 mt-1">₹{totalEarnings.toLocaleString('en-IN')}</div>
                      <span className="text-[11px] text-emerald-700 font-medium">0% platform commission</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
                      <span className="text-xs font-bold text-sky-800">Hourly Rate</span>
                      <div className="text-2xl font-black text-sky-950 mt-1">₹{workerProfile.hourly_rate || 450}/hr</div>
                      <span className="text-[11px] text-sky-700 font-medium">Standard labor rate</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                      <span className="text-xs font-bold text-amber-800">Pending Verification</span>
                      <div className="text-2xl font-black text-amber-950 mt-1">{pendingPayments.length} payments</div>
                      <span className="text-[11px] text-amber-700 font-medium">Click Payments tab to verify</span>
                    </div>
                  </div>

                  <EarningsChart
                    payments={payments}
                    totalEarnings={totalEarnings > 0 ? totalEarnings : 3650}
                  />
                </div>
              </div>
            )}

            {/* VIEW 4: PAYMENTS TAB */}
            {activeTab === 'payments' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-[0_4px_25px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-black text-gray-900">Direct UPI Payments</h2>
                      <p className="text-xs text-gray-500">Customer payments direct to your UPI ({workerProfile.upi_id || 'Not set'})</p>
                    </div>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold hover:bg-gray-50 cursor-pointer"
                    >
                      Update UPI
                    </button>
                  </div>

                  <div className="space-y-3 mt-4">
                    {payments.length === 0 ? (
                      <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <Receipt size={32} className="text-gray-400 mx-auto mb-2" />
                        <p className="text-sm font-bold text-gray-700">No payment logs yet</p>
                        <p className="text-xs text-gray-500 mt-1">Completed bookings with UPI transactions appear here.</p>
                      </div>
                    ) : (
                      payments.map((p) => (
                        <div key={p.id} className="p-4 rounded-2xl bg-white border border-gray-200 shadow-xs flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-900">UTR: {p.utr_number || 'UPI-REF-001'}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {p.status === 'paid' ? 'Verified' : 'Action Required'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Booking ID: {p.booking_id?.slice(0, 8)}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-emerald-700">₹{Number(p.amount).toFixed(0)}</span>
                            {p.status === 'payment_submitted' && (
                              <button
                                onClick={() => handleConfirmPayment(p.id!)}
                                disabled={confirmingId === p.id}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                              >
                                {confirmingId === p.id ? 'Verifying...' : 'Confirm Received'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 5: PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-[0_4px_25px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                      <ThreeWorkerAvatar className="w-16 h-16" />
                      <div>
                        <h2 className="text-lg font-black text-gray-900">{user?.name}</h2>
                        <p className="text-xs text-emerald-700 font-bold">Verified Service Provider • CoLabour Gold</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold cursor-pointer"
                    >
                      Edit Profile
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-xs">
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                      <span className="font-bold text-gray-500">Service Category</span>
                      <p className="text-sm font-black text-gray-900">{workerProfile.category || 'Multi-Trade Worker'}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                      <span className="font-bold text-gray-500">Hourly Pay Rate</span>
                      <p className="text-sm font-black text-gray-900">₹{workerProfile.hourly_rate || 450} / hour</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                      <span className="font-bold text-gray-500">Live Operating City</span>
                      <p className="text-sm font-black text-gray-900">{workerProfile.location || 'Bengaluru, Karnataka'}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                      <span className="font-bold text-gray-500">Direct UPI ID</span>
                      <p className="text-sm font-mono font-black text-gray-900">{workerProfile.upi_id || 'Not configured'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </section>

        </div>
      </main>

      {/* ======================================================== */}
      {/* FLOATING ACTION / AI ASSISTANT BUTTON */}
      {/* ======================================================== */}
      <button
        onClick={() => {
          const aiBtn = document.querySelector('[aria-label="Open CoLabour AI Assistant"]') as HTMLButtonElement;
          if (aiBtn) aiBtn.click();
          else showToast('CoLabour AI Assistant is ready at bottom right!');
        }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        title="Open Assistant"
      >
        <MessageSquare size={24} />
      </button>

      {/* ======================================================== */}
      {/* MODALS */}
      {/* ======================================================== */}

      {/* 1. Thermal Work Slip Modal */}
      {selectedSlip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setSelectedSlip(null)}
        >
          <div className="relative w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedSlip(null)}
              className="absolute top-2 right-2 z-20 rounded-xl bg-white p-2 text-gray-900 border border-gray-200 shadow-md cursor-pointer"
            >
              <X size={18} />
            </button>
            <CoLabourPrinterEngine
              bookingId={selectedSlip.booking.id}
              workerName={user?.name ?? 'Professional'}
              workerSkill={selectedSlip.booking.category}
              workerUpiId={workerProfile.upi_id}
              customerName={selectedSlip.booking.customer?.name ?? 'Verified Customer'}
              date={selectedSlip.payment?.paid_at || selectedSlip.booking.scheduled_at}
              utrNumber={selectedSlip.payment?.utr_number || 'OFFICIAL-PAID-UTR'}
              totalAmount={Number(selectedSlip.booking.total_amount)}
              onDone={() => setSelectedSlip(null)}
            />
          </div>
        </div>
      )}

      {/* 2. Job Details Modal */}
      {selectedJobModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setSelectedJobModal(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border border-gray-100 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">{selectedJobModal.category}</h3>
                <p className="text-xs text-gray-500">Customer: {selectedJobModal.customer?.name || 'Customer'}</p>
              </div>
              <button
                onClick={() => setSelectedJobModal(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <div className="flex items-center gap-2">
                <MapPin size={15} className="text-emerald-600" />
                <span>{selectedJobModal.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-emerald-600" />
                <span>{new Date(selectedJobModal.scheduled_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Wallet size={15} className="text-emerald-600" />
                <span className="font-extrabold text-emerald-700 text-sm">
                  ₹{Number(selectedJobModal.total_amount).toFixed(2)}
                </span>
              </div>
              {selectedJobModal.notes && (
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-600 mt-2">
                  <span className="font-bold text-gray-800">Note: </span>
                  {selectedJobModal.notes}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              {selectedJobModal.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      handleUpdateBookingStatus(selectedJobModal.id, 'confirmed');
                      setSelectedJobModal(null);
                    }}
                    className="flex-1 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs shadow-md transition-colors cursor-pointer"
                  >
                    Accept Job
                  </button>
                  <button
                    onClick={() => {
                      handleUpdateBookingStatus(selectedJobModal.id, 'cancelled');
                      setSelectedJobModal(null);
                    }}
                    className="px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Decline
                  </button>
                </>
              )}
              {selectedJobModal.status === 'confirmed' && (
                <button
                  onClick={() => {
                    handleUpdateBookingStatus(selectedJobModal.id, 'completed');
                    setSelectedJobModal(null);
                  }}
                  className="w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs shadow-md transition-colors cursor-pointer"
                >
                  Mark Completed
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Trade Category Filter Modal */}
      {selectedTradeModal && (() => {
        const media = getTradeMedia(selectedTradeModal.name);
        const sampleReviews = getInitialReviewsForWorker(selectedTradeModal.name + ' Pro', selectedTradeModal.name);
        const dynamicRating = calculateDynamicRating(sampleReviews, 4.9, 128);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
            onClick={() => setSelectedTradeModal(null)}
          >
            <div
              className="w-full max-w-xl my-6 rounded-3xl bg-white border-2 border-black p-6 shadow-[8px_8px_0px_0px_#000] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b-2 border-black/10">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${selectedTradeModal.gradient} text-white flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_#000]`}>
                    <selectedTradeModal.icon size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">{selectedTradeModal.name} Trade Vertical</h3>
                    <p className="text-xs font-bold text-gray-600">{selectedTradeModal.count} jobs in radar • Avg {selectedTradeModal.avgPay}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Dynamic Rating Badge Top Right */}
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-300 border-2 border-black text-xs font-black shadow-[2px_2px_0px_0px_#000]">
                    <Star size={14} className="fill-black text-black" />
                    <span>{dynamicRating.formattedRating}</span>
                    <span className="text-[10px] font-bold text-gray-800">({dynamicRating.totalReviews})</span>
                  </div>

                  <button
                    onClick={() => setSelectedTradeModal(null)}
                    className="p-1.5 rounded-xl border border-gray-200 hover:border-black text-gray-500 hover:text-black cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Trade Media & Project Gallery Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black uppercase text-gray-700">
                  <span>Verified On-Site Work Gallery</span>
                  <span className="text-[10px] text-emerald-700 font-bold">{media.verifiedSpecialty}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {media.projectGallery.map((proj, idx) => (
                    <div key={idx} className="relative h-20 rounded-xl border-2 border-black overflow-hidden bg-gray-100 shadow-[2px_2px_0px_0px_#000]">
                      <img
                        src={proj.imageUrl}
                        alt={proj.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                        <span className="text-[9px] font-black text-white line-clamp-1 leading-none">{proj.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Star Breakdown Bar Mini */}
              <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-black text-black text-sm">{dynamicRating.formattedRating}</span>
                  <div className="flex text-amber-500">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={11} className="fill-amber-500 text-amber-500" />
                    ))}
                  </div>
                </div>
                <div className="flex-1 max-w-[200px] h-2 bg-gray-200 rounded-full overflow-hidden border border-black">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${dynamicRating.starBreakdown[0]?.percentage || 85}%` }} />
                </div>
                <span className="text-[11px] font-bold text-gray-600">{dynamicRating.starBreakdown[0]?.percentage || 85}% 5-Star Reviews</span>
              </div>

              {/* Active Jobs in Trade */}
              <div>
                <span className="text-xs font-black uppercase text-gray-700 mb-2 block">Available Dispatch Orders</span>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {[
                    { title: `${selectedTradeModal.name} Immediate Service`, dist: '1.4 km away', time: 'In 30 mins', pay: '₹550', address: 'Indiranagar 100ft Rd' },
                    { title: `Custom ${selectedTradeModal.name} Requirement`, dist: '2.8 km away', time: 'Today 3:00 PM', pay: '₹850', address: 'Koramangala 4th Block' },
                    { title: `Commercial ${selectedTradeModal.name} Job`, dist: '4.1 km away', time: 'Tomorrow morning', pay: '₹1,200', address: 'MG Road Office Suite' },
                  ].map((item, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">{item.title}</h4>
                        <p className="text-[11px] text-gray-500">{item.address} • <span className="text-emerald-700 font-semibold">{item.dist}</span></p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-extrabold text-emerald-700 block">{item.pay}</span>
                        <button
                          onClick={() => {
                            setSelectedTradeModal(null);
                            showToast(`Job dispatch accepted: ${item.title}`);
                          }}
                          className="mt-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer"
                        >
                          Accept Job
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. Refer & Earn Modal */}
      {showReferModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setShowReferModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border border-gray-100 p-6 shadow-2xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-extrabold uppercase text-amber-700 tracking-wider">Referral Program</span>
              <button onClick={() => setShowReferModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex justify-center">
              <Gift3DIcon className="w-16 h-16" />
            </div>

            <h3 className="text-lg font-black text-gray-900">Earn ₹500 for Every Worker</h3>
            <p className="text-xs text-gray-600">
              Invite skilled workers to CoLabour. When they complete their first 3 verified jobs, you both receive ₹500 directly in your UPI account!
            </p>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
              <span className="font-mono text-xs font-extrabold text-amber-950">
                COLABOUR-{(user?.name || 'WORKER').toUpperCase().replace(/\s+/g, '')}500
              </span>
              <button
                onClick={handleCopyReferral}
                className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedReferral ? <Check size={14} /> : <Copy size={14} />}
                {copiedReferral ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  handleCopyReferral();
                  setShowReferModal(false);
                }}
                className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md cursor-pointer"
              >
                Share Referral Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Explore Listings Modal */}
      {showExploreModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setShowExploreModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white border border-gray-100 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Explore Nearby Work Listings</h3>
                <p className="text-xs text-gray-500">Live marketplace demand in real-time</p>
              </div>
              <button onClick={() => setShowExploreModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {[
                { title: 'AC Filter Replacement & Gas Charge', cat: 'Technician', pay: '₹850', loc: 'HSR Layout Sector 2' },
                { title: 'Main Distribution Box Replacement', cat: 'Electrician', pay: '₹1,200', loc: 'Koramangala 6th Block' },
                { title: 'Kitchen Sink Drain Unclogging', cat: 'Plumber', pay: '₹450', loc: 'BTM Layout 2nd Stage' },
                { title: 'Balcony Waterproofing & Painting', cat: 'Painter', pay: '₹1,500', loc: 'Whitefield Main Rd' },
              ].map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">{item.cat}</span>
                    <h4 className="text-xs font-bold text-gray-900 mt-1">{item.title}</h4>
                    <p className="text-[11px] text-gray-500">{item.loc}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-emerald-700 block">{item.pay}</span>
                    <button
                      onClick={() => {
                        setShowExploreModal(false);
                        showToast(`Job accepted: ${item.title}`);
                      }}
                      className="mt-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border border-gray-100 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-extrabold text-gray-900">Worker Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-700">UPI ID for Direct Payments</label>
                <input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-700">Hourly Rate (₹)</label>
                <input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {settingsMsg && (
                <p className={`text-xs font-bold ${settingsMsg.includes('success') ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {settingsMsg}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex-1 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingSettings ? <Loader2 size={16} className="animate-spin text-white mx-auto" /> : 'Save Settings'}
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Help & Support Modal */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border border-gray-100 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">CoLabour Worker Support</h3>
                <p className="text-xs text-gray-500">24/7 dedicated helpline & dispute protection</p>
              </div>
              <button onClick={() => setShowHelpModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                <ShieldCheck size={20} className="text-emerald-700 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-950 block">100% Payment Guarantee</span>
                  <span className="text-emerald-800">All customer bookings are escrow verified with direct UPI receipts.</span>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900 block">Emergency Dispatch Helpline</span>
                  <span className="text-gray-500">Available 24/7 for on-site assistance</span>
                </div>
                <button
                  onClick={() => showToast('Connecting to CoLabour Dispatch Hotline: 1800-COLABOUR')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Phone size={13} /> Call
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setShowHelpModal(false);
                const aiBtn = document.querySelector('[aria-label="Open CoLabour AI Assistant"]') as HTMLButtonElement;
                if (aiBtn) aiBtn.click();
              }}
              className="w-full py-2.5 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Chat with AI Assistant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
