import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, MapPin, Wallet, Clock, Loader2, ArrowRight, Briefcase, CheckCircle,
  Receipt, AlertCircle, Eye, X, Star, Lock
} from 'lucide-react';
import { NeonButton } from '@/components/ui/NeonButton';
import { Badge } from '@/components/ui/Badge';
import { AnimatedCounter } from '@/components/ui/Shared';
import { type Booking, type Payment, type WorkerWithUser } from '@/lib/supabase';
import { CATEGORY_ICONS, getCategoryStyle } from '@/lib/categories';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerDashboardData, fetchWorkerProfile } from '@/lib/dataService';
import { CoLabourPrinterEngine } from '@/components/CoLabourPrinterEngine';
import { WorkerDetailModal } from '@/components/WorkerDetailModal';
import { useLanguage } from '@/context/LanguageContext';

interface BookingWithWorker extends Booking {
  worker?: { id: string; category: string; hourly_rate: number; users?: { name: string } | null } | null;
}

interface PaymentWithBooking extends Payment {
  bookings?: { id: string; category: string } | null;
}

export function CustomerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<BookingWithWorker[]>([]);
  const [payments, setPayments] = useState<PaymentWithBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<{ booking: BookingWithWorker; payment?: PaymentWithBooking } | null>(null);
  
  // Rating modal state
  const [selectedWorkerForReview, setSelectedWorkerForReview] = useState<WorkerWithUser | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchCustomerDashboardData(user.id);
      setBookings(data.bookings as BookingWithWorker[]);
      setPayments(data.payments as PaymentWithBooking[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (user) fetchData();
    else setLoading(false);
  }, [user, authLoading, fetchData]);

  // Poll for status updates
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [user, fetchData]);

  const handleOpenRating = async (workerId: string) => {
    try {
      const workerData = await fetchWorkerProfile(workerId);
      if (workerData) {
        setSelectedWorkerForReview(workerData);
        setIsReviewModalOpen(true);
      }
    } catch (err) {
      console.error('Error fetching worker profile for rating:', err);
    }
  };

  const activeBookings = bookings.filter((b) => ['pending', 'confirmed', 'in_progress', 'payment_submitted'].includes(b.status));
  const completedBookings = bookings.filter((b) => b.status === 'paid' || b.status === 'completed');
  const totalSpent = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingPayments = payments.filter((p) => p.status === 'pending' || p.status === 'payment_submitted');

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-16">
        <Loader2 size={32} className="animate-spin text-neon-emerald" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-transparent pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b-2 border-black/10 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 border-2 border-black rounded-full text-xs font-black text-black shadow-[2px_2px_0px_0px_#000] mb-2 uppercase tracking-wide">
              <CheckCircle size={13} className="text-emerald-700" /> Live Customer Console
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-black tracking-tight">My Customer Dashboard</h1>
            <p className="text-sm font-semibold text-gray-700 mt-1">Welcome back, <span className="text-black font-black underline decoration-emerald-500">{user?.name}</span></p>
          </div>
          <Link to="/workers">
            <NeonButton variant="emerald"><Briefcase size={16} /> Book a Worker</NeonButton>
          </Link>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Calendar} label="Active Bookings" value={activeBookings.length} color="cyan" />
          <StatCard icon={CheckCircle} label="Completed & Paid" value={completedBookings.length} color="emerald" />
          <StatCard icon={Wallet} label="Total Spent" value={`₹${totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} color="violet" />
          <StatCard icon={Clock} label="Pending Payments" value={pendingPayments.length} color="amber" />
        </div>

        {/* Pending payments alert */}
        {pendingPayments.length > 0 && (
          <div className="mb-8 bg-amber-50 border-2 border-black p-5 rounded-2xl shadow-[5px_5px_0px_0px_#000] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-400 border-2 border-black rounded-xl text-black shadow-[2px_2px_0px_0px_#000]">
                <AlertCircle size={24} />
              </div>
              <div>
                <p className="text-base font-black text-black">Action Required: {pendingPayments.length} pending payment(s)</p>
                <p className="text-xs font-semibold text-gray-700">Complete or track your UPI payment to settle your booking with 0% fees</p>
              </div>
            </div>
            {pendingPayments[0] && (
              <Link to={`/payment/${pendingPayments[0].booking_id}`}>
                <NeonButton size="sm" variant="emerald">Open Payment Gateway <ArrowRight size={14} /></NeonButton>
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Active bookings */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-xl font-black text-black">
                <Clock size={20} className="text-black" /> Active Bookings
              </h2>
              <span className="px-2.5 py-0.5 bg-black text-white text-xs font-black rounded-full">
                {activeBookings.length}
              </span>
            </div>
            <div className="space-y-4">
              {activeBookings.length === 0 ? (
                <div className="bg-white border-2 border-black rounded-2xl p-8 text-center shadow-[4px_4px_0px_0px_#000]">
                  <p className="text-gray-600 font-bold mb-4">No active bookings right now</p>
                  <Link to="/workers"><NeonButton variant="ghost" size="sm">Browse Verified Workers</NeonButton></Link>
                </div>
              ) : (
                activeBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </div>
          </div>

          {/* Completed & receipts */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-xl font-black text-black">
                <Receipt size={20} className="text-black" /> History & Official POS Slips
              </h2>
              <span className="px-2.5 py-0.5 bg-emerald-400 border border-black text-black text-xs font-black rounded-full">
                {completedBookings.length}
              </span>
            </div>
            <div className="space-y-4">
              {completedBookings.length === 0 ? (
                <div className="bg-white border-2 border-black rounded-2xl p-8 text-center text-gray-600 font-bold shadow-[4px_4px_0px_0px_#000]">
                  No completed bookings yet
                </div>
              ) : (
                completedBookings.map((booking) => {
                  const p = payments.find((pay) => pay.booking_id === booking.id);
                  return (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      showReceipt
                      onViewSlip={() => setSelectedSlip({ booking, payment: p })}
                      onRateWorker={() => handleOpenRating(booking.worker_id)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Worker Rating & Review Modal */}
      {isReviewModalOpen && selectedWorkerForReview && (
        <WorkerDetailModal
          isOpen={isReviewModalOpen}
          worker={selectedWorkerForReview}
          allowReviewOverride={true}
          onClose={() => {
            setIsReviewModalOpen(false);
            setSelectedWorkerForReview(null);
          }}
          onReviewAdded={() => {
            fetchData();
          }}
        />
      )}

      {/* Slip Modal */}
      {selectedSlip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setSelectedSlip(null)}
        >
          <div className="relative w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedSlip(null)}
              className="absolute top-2 right-2 z-20 rounded-full bg-white p-2 text-black hover:bg-gray-200 border-2 border-black shadow-[2px_2px_0px_0px_#000]"
            >
              <X size={18} />
            </button>
            <CoLabourPrinterEngine
              bookingId={selectedSlip.booking.id}
              workerName={selectedSlip.booking.worker?.users?.name ?? 'Professional Worker'}
              workerSkill={selectedSlip.booking.category}
              customerName={user?.name ?? 'Verified Customer'}
              date={selectedSlip.payment?.paid_at || selectedSlip.booking.scheduled_at}
              utrNumber={selectedSlip.payment?.utr_number || 'UPI-OFFICIAL-UTR'}
              totalAmount={Number(selectedSlip.booking.total_amount)}
              onDone={() => setSelectedSlip(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Wallet; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-900 border-2 border-black',
    cyan: 'bg-cyan-100 text-cyan-900 border-2 border-black',
    violet: 'bg-purple-100 text-purple-900 border-2 border-black',
    amber: 'bg-amber-100 text-amber-900 border-2 border-black',
  };
  return (
    <div className="bg-white border-2 border-black p-5 rounded-2xl shadow-[5px_5px_0px_0px_#000]">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 shadow-[2px_2px_0px_0px_#000] ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl sm:text-3xl font-black text-black tracking-tight">{typeof value === 'number' ? <AnimatedCounter value={value} /> : value}</p>
      <p className="text-xs font-bold text-gray-600 mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function BookingCard({
  booking,
  showReceipt,
  onViewSlip,
  onRateWorker,
}: {
  booking: BookingWithWorker;
  showReceipt?: boolean;
  onViewSlip?: () => void;
  onRateWorker?: () => void;
}) {
  const { t } = useLanguage();
  const statusColors: Record<string, 'amber' | 'cyan' | 'violet' | 'emerald' | 'gray'> = {
    pending: 'amber',
    confirmed: 'cyan',
    in_progress: 'violet',
    payment_submitted: 'cyan',
    completed: 'emerald',
    paid: 'emerald',
    cancelled: 'gray',
  };
  const variant = statusColors[booking.status] ?? 'gray';
  const Icon = CATEGORY_ICONS[booking.category] ?? Briefcase;
  const style = getCategoryStyle(booking.category);
  const isSettled = booking.status === 'paid' || booking.status === 'completed';

  return (
    <div className="bg-white border-2 border-black p-5 rounded-2xl shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-xl border-2 border-black ${style.bg} flex items-center justify-center shadow-[2px_2px_0px_0px_#000]`}>
            <Icon className={style.text} size={24} />
          </div>
          <div>
            <h3 className="font-black text-black text-base">{booking.worker?.users?.name ?? 'Worker'}</h3>
            <p className="text-xs font-bold text-gray-600">{booking.category}</p>
          </div>
        </div>
        <Badge variant={variant}>{booking.status === 'confirmed' ? 'Accepted' : booking.status.replace('_', ' ')}</Badge>
      </div>
      
      <div className="space-y-1.5 text-xs font-semibold text-gray-700 mb-3 bg-gray-50 border border-black/10 p-3 rounded-xl">
        <div className="flex items-center gap-2"><Calendar size={14} className="text-black" /> {new Date(booking.scheduled_at).toLocaleString()}</div>
        <div className="flex items-center gap-2"><MapPin size={14} className="text-black" /> {booking.address}</div>
        <div className="flex items-center gap-2 font-bold text-black"><Wallet size={14} /> ₹{Number(booking.total_amount).toFixed(2)}</div>
      </div>

      {/* Unpaid / Pending Rating Lock Notice */}
      {!isSettled && (
        <div className="mb-3 p-2.5 rounded-xl bg-stone-100 border border-stone-300 text-[11px] font-bold text-stone-600 flex items-center gap-2">
          <Lock size={13} className="text-stone-500 shrink-0" />
          <span>{t('ratingLockedNotice')}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        {booking.status === 'pending' && (
          <Link to={`/payment/${booking.id}`} className="w-full">
            <NeonButton size="sm" variant="amber" fullWidth>Waiting for Acceptance <ArrowRight size={14} /></NeonButton>
          </Link>
        )}
        {booking.status === 'confirmed' && (
          <Link to={`/payment/${booking.id}`} className="w-full">
            <NeonButton size="sm" variant="emerald" fullWidth>Pay Worker via UPI <ArrowRight size={14} /></NeonButton>
          </Link>
        )}
        {booking.status === 'payment_submitted' && (
          <Link to={`/payment/${booking.id}`} className="w-full">
            <NeonButton size="sm" variant="cyan" fullWidth>Track Verification <ArrowRight size={14} /></NeonButton>
          </Link>
        )}
        {showReceipt && isSettled && (
          <div className="flex flex-wrap items-center justify-between gap-2 w-full pt-1">
            <span className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-400 font-bold">
              <CheckCircle size={14} /> Payment Settled
            </span>
            <div className="flex items-center gap-2">
              {onRateWorker && (
                <button
                  type="button"
                  onClick={onRateWorker}
                  className="px-3 py-1.5 rounded-xl border-2 border-stone-900 bg-amber-400 hover:bg-amber-300 font-black text-xs text-stone-900 shadow-[2px_2px_0px_0px_#1c1917] flex items-center gap-1.5 cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
                >
                  <Star size={13} className="fill-stone-900" /> {t('rateAndReviewWorker')}
                </button>
              )}
              {onViewSlip && (
                <NeonButton size="sm" variant="ghost" onClick={onViewSlip} className="text-xs">
                  <Eye size={14} /> View CoLabour Slip
                </NeonButton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
