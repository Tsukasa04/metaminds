import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import {
  SlidersHorizontal,
  Radio,
  Zap,
  Maximize2,
  Phone,
  MessageSquare,
  Navigation,
  CheckCircle2,
  X
} from 'lucide-react';
import { type Booking } from '@/lib/supabase';
import {
  calculateHaversineDistance,
  calculateReachTimeMinutes,
  DEFAULT_COORDINATES,
  getUserLiveCoordinates,
  getCoordinatesFromLocation,
  type GeoCoordinates,
} from '@/lib/geo';
import { useLanguage } from '@/context/LanguageContext';

// Configuration & Mock Tracking Datasets
export const TRACKING_DATA = {
  activeWorker: {
    name: 'Ramesh Sharma',
    trade: 'Electrician',
    rating: 4.9,
    phone: '+91 98201 45678',
    avatarBg: 'bg-amber-400',
    initialDistanceKm: 3.8,
    initialEtaMins: 14,
    stepFraction: 0.08, // Step movement rate per interval
  },
  sampleDispatches: [
    {
      id: 'job-radar-1',
      title: 'Emergency MCB & High Voltage Fuse Repair',
      category: 'Electrician',
      amount: 850,
      type: 'high_pay' as const,
      offsetLat: 0.012,
      offsetLng: 0.015,
      address: 'Indiranagar 100ft Rd, 2nd Stage',
      timeEstimate: 'Immediate • 25 mins',
    },
    {
      id: 'job-radar-2',
      title: 'Complete Bathroom Pipeline Leakage Fix',
      category: 'Plumber',
      amount: 1100,
      type: 'high_pay' as const,
      offsetLat: -0.018,
      offsetLng: 0.022,
      address: 'Koramangala 4th Block, 80ft Road',
      timeEstimate: 'Today • 40 mins',
    },
    {
      id: 'job-radar-3',
      title: 'Split AC Deep Foam Jet Servicing',
      category: 'Technician',
      amount: 750,
      type: 'new_job' as const,
      offsetLat: 0.024,
      offsetLng: -0.016,
      address: 'HSR Layout Sector 2, 19th Main',
      timeEstimate: 'New Job • 15 mins',
    },
    {
      id: 'job-radar-4',
      title: 'Modular Kitchen Cabinet Hinge Alignment',
      category: 'Carpenter',
      amount: 600,
      type: 'new_job' as const,
      offsetLat: -0.022,
      offsetLng: -0.025,
      address: 'Jayanagar 4th T Block',
      timeEstimate: 'New Job • 30 mins',
    },
    {
      id: 'job-radar-5',
      title: 'Living Room Accent Wall Texture Painting',
      category: 'Painter',
      amount: 1450,
      type: 'high_pay' as const,
      offsetLat: 0.032,
      offsetLng: 0.035,
      address: 'Whitefield Main Road, Palm Meadows',
      timeEstimate: 'Tomorrow • 9:00 AM',
    },
    {
      id: 'job-radar-6',
      title: 'Deep House Vacuuming & Window Scrubbing',
      category: 'Cleaner',
      amount: 650,
      type: 'nearby_task' as const,
      offsetLat: -0.014,
      offsetLng: -0.012,
      address: 'BTM Layout 2nd Stage, Ring Road',
      timeEstimate: 'Today • 1 hr',
    },
  ]
};

interface LiveWorkRadarProps {
  bookings: Booking[];
  workerLocation?: string | null;
  isAvailable?: boolean;
  onToggleAvailability?: () => void;
  onSelectBooking?: (booking: Booking) => void;
  onAcceptBooking?: (bookingId: string) => void;
}

interface RadarJobItem {
  id: string;
  booking: Booking;
  title: string;
  category: string;
  amount: number;
  lat: number;
  lng: number;
  distanceKm: number;
  type: 'high_pay' | 'new_job' | 'nearby_task';
  address: string;
  timeEstimate: string;
}

export function LiveWorkRadar({
  bookings,
  workerLocation,
  isAvailable = true,
  onToggleAvailability,
  onSelectBooking,
  onAcceptBooking,
}: LiveWorkRadarProps) {
  const { t } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const trackingLayerRef = useRef<L.LayerGroup | null>(null);
  const radarCircleRef = useRef<L.Circle | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const movingWorkerMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  const [radius, setRadius] = useState<number>(15);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [minPay, setMinPay] = useState<number>(0);
  const [userCoords, setUserCoords] = useState<GeoCoordinates>(() => {
    if (workerLocation) {
      return getCoordinatesFromLocation(workerLocation);
    }
    return DEFAULT_COORDINATES;
  });
  const [acceptedJobs, setAcceptedJobs] = useState<Record<string, boolean>>({});
  const [selectedJob, setSelectedJob] = useState<RadarJobItem | null>(null);

  // Live Dynamic Island HUD Tracking State
  const [trackingActive, setTrackingActive] = useState<boolean>(true);
  const [workerProgress, setWorkerProgress] = useState<number>(0); // 0 (start) to 1 (arrived)
  const [liveDistanceKm, setLiveDistanceKm] = useState<number>(TRACKING_DATA.activeWorker.initialDistanceKm);
  const [liveEtaMins, setLiveEtaMins] = useState<number>(TRACKING_DATA.activeWorker.initialEtaMins);
  const [hasArrived, setHasArrived] = useState<boolean>(false);
  const [showArrivalToast, setShowArrivalToast] = useState<boolean>(false);
  const [actionAlert, setActionAlert] = useState<string | null>(null);

  // Initial Dispatch Origin for Animated Worker
  const dispatchOrigin = useMemo<GeoCoordinates>(() => {
    return {
      lat: userCoords.lat + 0.026,
      lng: userCoords.lng - 0.024,
    };
  }, [userCoords]);

  // Calibrate GPS
  const handleCalibrateGps = async () => {
    setGpsLoading(true);
    try {
      const coords = await getUserLiveCoordinates();
      setUserCoords(coords);
      setGpsActive(true);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([coords.lat, coords.lng], 13, { duration: 1.2 });
      }
    } catch {
      // fallback to current coordinates
    } finally {
      setGpsLoading(false);
    }
  };

  useEffect(() => {
    handleCalibrateGps();
  }, []);

  // Compute Radar Jobs
  const radarJobs = useMemo<RadarJobItem[]>(() => {
    const propJobs: RadarJobItem[] = (bookings || [])
      .filter((b) => b.status === 'pending' || b.status === 'confirmed')
      .map((b, idx) => {
        const amt = Number(b.total_amount) || 500;
        const jobType: 'high_pay' | 'new_job' | 'nearby_task' =
          amt >= 750 ? 'high_pay' : idx % 2 === 0 ? 'new_job' : 'nearby_task';
        const latOffset = ((idx * 37) % 30 - 15) * 0.0025;
        const lngOffset = ((idx * 53) % 30 - 15) * 0.0025;
        const distKm = calculateHaversineDistance(
          userCoords.lat,
          userCoords.lng,
          userCoords.lat + latOffset,
          userCoords.lng + lngOffset
        );

        return {
          id: b.id,
          booking: b,
          title: `${b.category} Service Request`,
          category: b.category,
          amount: amt,
          lat: userCoords.lat + latOffset,
          lng: userCoords.lng + lngOffset,
          distanceKm: distKm,
          type: jobType,
          address: b.address || `${b.category} Service Location`,
          timeEstimate: 'Live Dispatch',
        };
      });

    const sampleList = TRACKING_DATA.sampleDispatches.map((item) => {
      const dist = calculateHaversineDistance(
        userCoords.lat,
        userCoords.lng,
        userCoords.lat + item.offsetLat,
        userCoords.lng + item.offsetLng
      );

      const syntheticBooking: Booking = {
        id: item.id,
        worker_id: 'worker-sample',
        customer_id: 'cust-sample',
        category: item.category,
        status: 'pending',
        scheduled_date: new Date().toISOString(),
        hours_worked: 2,
        total_amount: item.amount,
        address: item.address,
        created_at: new Date().toISOString(),
        payment_status: 'pending',
      };

      return {
        id: item.id,
        booking: syntheticBooking,
        title: item.title,
        category: item.category,
        amount: item.amount,
        lat: userCoords.lat + item.offsetLat,
        lng: userCoords.lng + item.offsetLng,
        distanceKm: dist,
        type: item.type,
        address: item.address,
        timeEstimate: item.timeEstimate,
      };
    });

    const combined = [...propJobs, ...sampleList];

    return combined.filter((job) => {
      if (job.distanceKm > radius) return false;
      if (selectedCategory !== 'all' && job.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
      if (minPay > 0 && job.amount < minPay) return false;
      return true;
    });
  }, [bookings, userCoords, radius, selectedCategory, minPay]);

  // Initialize Real Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [userCoords.lat, userCoords.lng],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
      });

      // CartoDB Voyager Clean Vector/Raster Tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Attribution
      L.control
        .attribution({
          position: 'bottomright',
          prefix: '<span class="text-[9px] text-stone-600 font-black">Leaflet &copy; OpenStreetMap</span>',
        })
        .addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      const trackingLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      trackingLayerRef.current = trackingLayer;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Center, Radar Circle, and User Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setView([userCoords.lat, userCoords.lng], map.getZoom() || 13);

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }
    if (radarCircleRef.current) {
      radarCircleRef.current.remove();
    }

    // 1. Radar Circle Overlay
    const radarCircle = L.circle([userCoords.lat, userCoords.lng], {
      radius: radius * 1000,
      color: '#0d9488', // teal-600
      weight: 2,
      dashArray: '6, 6',
      fillColor: '#2dd4bf', // teal-400
      fillOpacity: 0.08,
    }).addTo(map);
    radarCircleRef.current = radarCircle;

    // 2. Custom Animated Pulse Marker for User Destination / Home
    const userPulseHtml = `
      <div class="relative flex items-center justify-center w-12 h-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
        <div class="absolute inset-0 rounded-full bg-teal-400 opacity-60 animate-ping"></div>
        <div class="absolute inset-2 rounded-full bg-teal-500 opacity-40 animate-pulse"></div>
        <div class="relative w-8 h-8 rounded-2xl bg-teal-300 border-2 border-stone-900 flex items-center justify-center text-stone-900 font-black text-xs shadow-[2px_2px_0px_0px_#1c1917]">
          📍
        </div>
        <div class="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-stone-900 text-white text-[10px] font-black px-2 py-0.5 rounded-md border border-white/40 shadow-sm pointer-events-none">
          ${t('youAreHere', 'You Are Here')}
        </div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userPulseHtml,
      className: 'user-pulse-marker',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    const userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    userMarker.bindPopup(`
      <div class="p-3 text-center font-sans">
        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 border border-teal-400 text-[10px] font-black text-teal-950 mb-1">
          📍 Verified Location Base
        </div>
        <h4 class="font-black text-xs text-stone-900">${workerLocation || 'Current Coordinates Base'}</h4>
        <p class="text-[10px] font-bold text-stone-600 mt-1">Radar Radius: ${radius} km</p>
      </div>
    `, { className: 'colabour-leaflet-popup' });

    userMarkerRef.current = userMarker;
  }, [userCoords, radius, workerLocation, t]);

  // Render Clickable Markers for Radar Jobs
  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    if (!markersLayer) return;

    markersLayer.clearLayers();

    radarJobs.forEach((job) => {
      const isAccepted = !!acceptedJobs[job.id];
      const isHigh = job.type === 'high_pay';
      const isNew = job.type === 'new_job';

      const markerBg = isAccepted
        ? 'bg-stone-500'
        : isHigh
        ? 'bg-emerald-400'
        : isNew
        ? 'bg-amber-300'
        : 'bg-teal-300';

      const tagBg = isHigh ? 'bg-emerald-100 text-emerald-950' : isNew ? 'bg-amber-100 text-amber-950' : 'bg-teal-100 text-teal-950';

      const pinHtml = `
        <div class="relative flex flex-col items-center cursor-pointer group" style="transform: translate(-50%, -100%);">
          <div class="relative flex items-center justify-center w-10 h-10 rounded-2xl ${markerBg} text-stone-900 border-2 border-stone-900 shadow-[2px_2px_0px_0px_#1c1917] group-hover:scale-110 transition-transform duration-200">
            <span class="font-black text-xs">${isHigh ? '₹' : isNew ? '✦' : '⚡'}</span>
            ${
              isHigh
                ? '<div class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border border-stone-900 animate-ping"></div>'
                : ''
            }
          </div>
          <div class="w-2.5 h-2.5 bg-stone-900 rotate-45 -mt-1.5 shadow-xs"></div>
          <div class="mt-1 px-1.5 py-0.5 rounded-md ${tagBg} border border-stone-900 text-[10px] font-black shadow-[1px_1px_0px_0px_#1c1917] whitespace-nowrap">
            ₹${job.amount} • ${job.distanceKm.toFixed(1)}km
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: pinHtml,
        className: `job-pin-${job.id}`,
        iconSize: [40, 50],
        iconAnchor: [20, 50],
      });

      const marker = L.marker([job.lat, job.lng], { icon: customIcon });
      const reachMins = calculateReachTimeMinutes(job.distanceKm);

      const popupHtml = `
        <div class="w-60 p-3 bg-white font-sans text-stone-900 rounded-xl border-2 border-stone-900 shadow-[3px_3px_0px_0px_#1c1917]">
          <div class="flex items-center justify-between gap-2 pb-2 border-b-2 border-stone-200">
            <span class="px-2 py-0.5 rounded-md border border-stone-900 ${tagBg} text-[10px] font-black uppercase">
              ${job.category}
            </span>
            <span class="text-sm font-black text-emerald-800">
              ₹${job.amount}
            </span>
          </div>

          <div class="mt-2">
            <h4 class="font-black text-xs text-stone-900 leading-tight">${job.title}</h4>
            <p class="text-[11px] font-bold text-stone-600 mt-1 truncate">📍 ${job.address}</p>
          </div>

          <div class="mt-2 flex items-center justify-between text-[10px] font-bold text-stone-800 bg-stone-50 border border-stone-300 px-2 py-1 rounded-lg">
            <span>🚗 ${job.distanceKm.toFixed(1)} km away</span>
            <span class="text-emerald-800 font-black">~${reachMins} mins ETA</span>
          </div>

          <div class="mt-3 flex items-center gap-2">
            <button
              id="accept-btn-${job.id}"
              class="flex-1 py-2 px-3 rounded-xl border-2 border-stone-900 font-black text-xs uppercase shadow-[2px_2px_0px_0px_#1c1917] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
                isAccepted
                  ? 'bg-stone-200 text-stone-600'
                  : 'bg-teal-300 hover:bg-teal-200 text-stone-900'
              }"
            >
              ${isAccepted ? '✓ Accepted' : 'Accept Job'}
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'colabour-leaflet-popup' });

      marker.on('popupopen', () => {
        const acceptBtn = document.getElementById(`accept-btn-${job.id}`);
        if (acceptBtn) {
          acceptBtn.onclick = (e) => {
            e.stopPropagation();
            setAcceptedJobs((prev) => ({ ...prev, [job.id]: true }));
            onAcceptBooking?.(job.id);
            marker.closePopup();
          };
        }
      });

      marker.on('click', () => {
        setSelectedJob(job);
        onSelectBooking?.(job.booking);
      });

      markersLayer.addLayer(marker);
    });
  }, [radarJobs, acceptedJobs, onAcceptBooking, onSelectBooking]);

  // =========================================================================
  // REAL-TIME LIVE WORKER STEP-BY-STEP MOVEMENT ENGINE & POLYLINES
  // =========================================================================
  useEffect(() => {
    if (!trackingActive) return;

    const interval = setInterval(() => {
      setWorkerProgress((prev) => {
        if (prev >= 1) {
          if (!hasArrived) {
            setHasArrived(true);
            setShowArrivalToast(true);
            setTimeout(() => setShowArrivalToast(false), 5000);
          }
          return 1;
        }
        const next = Math.min(1, prev + 0.05);
        const remainingDist = (1 - next) * TRACKING_DATA.activeWorker.initialDistanceKm;
        const remainingEta = Math.ceil((1 - next) * TRACKING_DATA.activeWorker.initialEtaMins);
        setLiveDistanceKm(Number(remainingDist.toFixed(1)));
        setLiveEtaMins(remainingEta);

        if (next >= 1 && !hasArrived) {
          setHasArrived(true);
          setShowArrivalToast(true);
          setTimeout(() => setShowArrivalToast(false), 5000);
        }
        return next;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [trackingActive, hasArrived]);

  // Update Moving Worker Marker on Map along Dotted Polyline Route
  useEffect(() => {
    const map = mapInstanceRef.current;
    const trackingLayer = trackingLayerRef.current;
    if (!map || !trackingLayer) return;

    // Calculate intermediate interpolated position
    const currentLat = dispatchOrigin.lat + (userCoords.lat - dispatchOrigin.lat) * workerProgress;
    const currentLng = dispatchOrigin.lng + (userCoords.lng - dispatchOrigin.lng) * workerProgress;

    // Remove previous moving marker and polyline
    if (movingWorkerMarkerRef.current) {
      movingWorkerMarkerRef.current.remove();
    }
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
    }

    // 1. Draw Dotted Teal Route Polyline
    const routePolyline = L.polyline(
      [
        [dispatchOrigin.lat, dispatchOrigin.lng],
        [userCoords.lat, userCoords.lng],
      ],
      {
        color: '#0d9488', // teal-600
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.85,
        lineCap: 'round',
      }
    ).addTo(trackingLayer);
    routePolylineRef.current = routePolyline;

    // 2. Render Custom Moving Worker Marker with Van/Person Icon & Shadow
    const workerMarkerHtml = `
      <div class="relative flex flex-col items-center cursor-pointer group" style="transform: translate(-50%, -50%);">
        <div class="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-teal-300 border-2 border-stone-900 shadow-[3px_3px_0px_0px_#1c1917] transition-all duration-300">
          <span class="text-base">⚡</span>
          <div class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border border-stone-900 animate-ping"></div>
        </div>
        <div class="mt-1 px-2 py-0.5 rounded-md bg-stone-900 text-white text-[10px] font-black shadow-sm whitespace-nowrap">
          ${TRACKING_DATA.activeWorker.name} (${TRACKING_DATA.activeWorker.trade})
        </div>
      </div>
    `;

    const movingWorkerIcon = L.divIcon({
      html: workerMarkerHtml,
      className: 'live-moving-worker-icon',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const movingMarker = L.marker([currentLat, currentLng], {
      icon: movingWorkerIcon,
      zIndexOffset: 1200,
    }).addTo(trackingLayer);

    movingMarker.bindPopup(`
      <div class="p-3 font-sans text-center">
        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-200 border border-stone-900 text-[10px] font-black text-stone-900 mb-1">
          🚗 Live In-Transit Dispatch
        </div>
        <h4 class="font-black text-xs text-stone-900">${TRACKING_DATA.activeWorker.name}</h4>
        <p class="text-[11px] font-bold text-stone-700 mt-1">${TRACKING_DATA.activeWorker.trade} • ★ ${TRACKING_DATA.activeWorker.rating}</p>
        <p class="text-[10px] font-black text-teal-800 mt-1">
          ${hasArrived ? '✓ Arrived at your location' : `Arriving in ${liveEtaMins} mins (${liveDistanceKm} km away)`}
        </p>
      </div>
    `, { className: 'colabour-leaflet-popup' });

    movingWorkerMarkerRef.current = movingMarker;
  }, [workerProgress, dispatchOrigin, userCoords, liveDistanceKm, liveEtaMins, hasArrived]);

  const handleFitBounds = () => {
    if (mapInstanceRef.current && radarCircleRef.current) {
      mapInstanceRef.current.flyToBounds(radarCircleRef.current.getBounds(), {
        padding: [30, 30],
        duration: 0.8,
      });
    }
  };

  const handleQuickCall = () => {
    setActionAlert(`Calling ${TRACKING_DATA.activeWorker.name} at ${TRACKING_DATA.activeWorker.phone}...`);
    setTimeout(() => setActionAlert(null), 3000);
  };

  const handleQuickChat = () => {
    setActionAlert(`Opening secure direct chat channel with ${TRACKING_DATA.activeWorker.name}...`);
    setTimeout(() => setActionAlert(null), 3000);
  };

  const handleRestartTracking = () => {
    setWorkerProgress(0);
    setHasArrived(false);
    setLiveDistanceKm(TRACKING_DATA.activeWorker.initialDistanceKm);
    setLiveEtaMins(TRACKING_DATA.activeWorker.initialEtaMins);
    setTrackingActive(true);
  };

  return (
    <div className="relative rounded-3xl bg-white border-2 border-stone-900 p-4 sm:p-5 shadow-[4px_4px_0px_0px_#1c1917] overflow-hidden">
      
      {/* =========================================================================
          FLOATING TOP DYNAMIC ISLAND / HUD (z-index: 9999)
         ========================================================================= */}
      {trackingActive && (
        <div
          id="floating-dynamic-island-hud"
          className="absolute top-6 left-1/2 -translate-x-1/2 z-[9999] w-[94%] max-w-xl rounded-2xl bg-stone-900 text-white border-2 border-stone-900 shadow-[6px_6px_0px_0px_rgba(28,25,23,0.8)] px-3.5 py-2.5 flex items-center justify-between gap-2.5 backdrop-blur-md transition-all duration-300"
        >
          {/* Left: Pulsing Live Indicator + Worker Mini Avatar */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-xl bg-teal-300 text-stone-900 border border-white/30 flex items-center justify-center font-black text-xs">
                ⚡
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 border border-stone-900" />
              </span>
            </div>
            <div className="min-w-0 truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-white truncate">
                  {TRACKING_DATA.activeWorker.name}
                </span>
                <span className="px-1.5 py-0.2 rounded bg-amber-400 text-stone-950 font-black text-[9px]">
                  ★ {TRACKING_DATA.activeWorker.rating}
                </span>
              </div>
              <span className="text-[10px] font-bold text-stone-300 block truncate">
                {TRACKING_DATA.activeWorker.trade} • {t('liveTracking', 'Live Dispatch')}
              </span>
            </div>
          </div>

          {/* Center: Live Countdown ETA */}
          <div className="text-center px-2 py-1 rounded-xl bg-stone-800 border border-stone-700/80 shrink-0">
            {hasArrived ? (
              <span className="text-[11px] font-black text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={13} /> {t('arrived', 'Arrived!')}
              </span>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono font-black text-teal-300">
                  ⚡ {t('arrivingIn', 'Arriving in')} {liveEtaMins} {t('mins', 'mins')}
                </span>
                <span className="text-[9px] font-mono text-stone-300">
                  ({liveDistanceKm} {t('kmAway', 'km away')})
                </span>
              </div>
            )}
          </div>

          {/* Right: Quick Action Buttons: [📞 Call] [💬 Chat] */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleQuickCall}
              title="Call Worker"
              className="p-1.5 rounded-lg bg-teal-300 hover:bg-teal-200 text-stone-900 border border-stone-900 font-black text-[11px] shadow-[1px_1px_0px_0px_#000] cursor-pointer transition-all flex items-center gap-1"
            >
              <Phone size={12} />
              <span className="hidden sm:inline">{t('callWorker', 'Call')}</span>
            </button>
            <button
              onClick={handleQuickChat}
              title="Chat with Worker"
              className="p-1.5 rounded-lg bg-white hover:bg-stone-100 text-stone-900 border border-stone-900 font-black text-[11px] shadow-[1px_1px_0px_0px_#000] cursor-pointer transition-all flex items-center gap-1"
            >
              <MessageSquare size={12} />
              <span className="hidden sm:inline">{t('chatWorker', 'Chat')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Arrival Success Toast */}
      {showArrivalToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[10000] bg-teal-300 border-2 border-stone-900 rounded-2xl px-4 py-2.5 shadow-[4px_4px_0px_0px_#1c1917] text-stone-900 font-black text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle2 size={16} className="text-stone-900" />
          <span>{t('workerArrived', '🎉 Worker has arrived at your destination!')}</span>
          <button
            onClick={() => setShowArrivalToast(false)}
            className="ml-2 text-stone-900 hover:text-stone-700 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Action Toast Alert */}
      {actionAlert && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[10000] bg-stone-900 text-white border-2 border-white/40 rounded-2xl px-4 py-2 shadow-lg text-xs font-black flex items-center gap-2">
          <Zap size={14} className="text-teal-300" />
          <span>{actionAlert}</span>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3.5 w-3.5">
            {isAvailable ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border border-stone-900" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border border-stone-900" />
            )}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-wider text-stone-900">
                {t('liveRadar', 'Live Work Radar')}
              </h2>
              <span className="rounded-md bg-teal-300 border border-stone-900 px-1.5 py-0.2 text-[10px] font-black text-stone-900">
                100% Real Map
              </span>
            </div>
            <span className="text-[11px] font-bold text-stone-600">
              {isAvailable
                ? `${radarJobs.length} live job dispatches plotted on GPS grid`
                : t('pausedOffline', 'Radar Paused (Offline Mode)')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tracking Mode Toggle / Reset */}
          <button
            onClick={handleRestartTracking}
            title="Restart Dispatch Route Simulation"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 border-stone-900 bg-white hover:bg-teal-100 text-stone-900 text-xs font-black shadow-[2px_2px_0px_0px_#1c1917] cursor-pointer transition-all"
          >
            <Navigation size={12} />
            <span className="hidden sm:inline">Simulate Route</span>
          </button>

          {/* Radius Selector */}
          <div className="relative">
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="appearance-none bg-white hover:bg-stone-50 border-2 border-stone-900 rounded-xl px-3 py-1.5 pr-8 text-xs font-black text-stone-900 cursor-pointer shadow-[2px_2px_0px_0px_#1c1917] outline-none transition-all"
            >
              <option value={5}>5 km Radius</option>
              <option value={10}>10 km Radius</option>
              <option value={15}>15 km Radius</option>
              <option value={25}>25 km Radius</option>
              <option value={50}>50 km Radius</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-stone-900">
              ▼
            </span>
          </div>

          {/* Recenter / Fit bounds */}
          <button
            onClick={handleFitBounds}
            title="Recenter Radar Boundary"
            className="p-2 rounded-xl border-2 border-stone-900 bg-white hover:bg-amber-200 text-stone-900 shadow-[2px_2px_0px_0px_#1c1917] cursor-pointer transition-colors"
          >
            <Maximize2 size={14} />
          </button>

          {/* Filter toggle button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            title="Radar Filters"
            className={`p-2 rounded-xl border-2 border-stone-900 transition-colors cursor-pointer shadow-[2px_2px_0px_0px_#1c1917] ${
              showFilters || selectedCategory !== 'all' || minPay > 0
                ? 'bg-teal-300 text-stone-900 font-black'
                : 'bg-white hover:bg-stone-100 text-stone-900'
            }`}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="mb-4 p-3 bg-stone-50 border-2 border-stone-900 rounded-2xl flex flex-wrap items-center gap-3 text-xs shadow-[3px_3px_0px_0px_#1c1917]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase text-stone-700">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border-2 border-stone-900 rounded-lg px-2 py-1 text-xs font-bold text-stone-900 outline-none"
            >
              <option value="all">All Trade Categories</option>
              <option value="Electrician">Electrician</option>
              <option value="Plumber">Plumber</option>
              <option value="Carpenter">Carpenter</option>
              <option value="Painter">Painter</option>
              <option value="Cleaner">Cleaner</option>
              <option value="Technician">Technician</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase text-stone-700">Min Pay:</span>
            <select
              value={minPay}
              onChange={(e) => setMinPay(Number(e.target.value))}
              className="bg-white border-2 border-stone-900 rounded-lg px-2 py-1 text-xs font-bold text-stone-900 outline-none"
            >
              <option value={0}>Any Amount</option>
              <option value={500}>₹500+</option>
              <option value={750}>₹750+ (High Pay)</option>
              <option value={1000}>₹1000+</option>
            </select>
          </div>

          {(selectedCategory !== 'all' || minPay > 0) && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setMinPay(0);
              }}
              className="text-[11px] font-black text-rose-700 hover:text-rose-900 underline ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Real Leaflet Map Canvas Container */}
      <div className="relative w-full h-[360px] sm:h-[430px] rounded-2xl border-2 border-stone-900 overflow-hidden shadow-[3px_3px_0px_0px_#1c1917]">
        
        {/* Leaflet Map DOM Element */}
        <div
          ref={mapContainerRef}
          className="colabour-leaflet-map w-full h-full z-0 cursor-grab active:cursor-grabbing bg-[#EBF3EC]"
        />

        {/* Translucent Radar Scanner Overlay (pointer-events: none) */}
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-hidden">
          {isAvailable && (
            <>
              <div className="absolute w-44 h-44 rounded-full border-2 border-teal-500/40 animate-radar-sonar" />
              <div className="absolute w-72 h-72 rounded-full border border-teal-500/30 animate-radar-sonar [animation-delay:1.2s]" />

              <div className="absolute w-[500px] h-[500px] rounded-full animate-radar-sweep opacity-25">
                <div className="w-1/2 h-1/2 origin-bottom-right bg-gradient-to-tl from-teal-500/40 via-teal-400/10 to-transparent rounded-tl-full" />
              </div>
            </>
          )}

          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="w-full h-[1px] bg-stone-900" />
            <div className="h-full w-[1px] bg-stone-900 absolute" />
          </div>
        </div>

        {/* Offline Overlay if Worker is Unavailable */}
        {!isAvailable && (
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-white rounded-3xl p-6 shadow-[6px_6px_0px_0px_#1c1917] border-2 border-stone-900 max-w-sm">
              <span className="inline-block px-3 py-1 rounded-xl bg-amber-200 border-2 border-stone-900 text-stone-900 font-black text-xs mb-3 shadow-[2px_2px_0px_0px_#1c1917]">
                {t('pausedOffline', 'PAUSED • RADAR OFFLINE')}
              </span>
              <h3 className="text-base font-black text-stone-900 mb-1">Radar Scanning Inactive</h3>
              <p className="text-xs font-bold text-stone-600 mb-4">
                {t('radarOfflineHelp', 'Switch to Available to broadcast your location and receive live dispatches.')}
              </p>
              {onToggleAvailability && (
                <button
                  onClick={onToggleAvailability}
                  className="w-full py-2.5 rounded-xl bg-teal-300 hover:bg-teal-200 text-stone-900 border-2 border-stone-900 font-black text-xs uppercase tracking-wider shadow-[3px_3px_0px_0px_#1c1917] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                >
                  {t('goAvailable', 'Go Available Now')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Marker Legend at Bottom-Left */}
        <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1.5 rounded-2xl bg-white/95 backdrop-blur-xs border-2 border-stone-900 px-3 py-2 text-[11px] font-black text-stone-900 shadow-[3px_3px_0px_0px_#1c1917]">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-400 border border-stone-900" />
            <span>High Paying Jobs (₹750+)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-300 border border-stone-900" />
            <span>New Dispatches</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-teal-300 border border-stone-900" />
            <span>Nearby Tasks</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-stone-900/10 text-[10px] text-stone-600">
            <span>🟢 Ring: {radius} km Live Radius</span>
          </div>
        </div>

        {/* Live GPS Calibrate Button at Bottom-Right */}
        <div className="absolute bottom-3 right-3 z-20">
          <button
            onClick={handleCalibrateGps}
            disabled={gpsLoading}
            className="flex items-center gap-1.5 rounded-2xl bg-teal-200 hover:bg-teal-300 border-2 border-stone-900 px-3 py-2 text-xs font-black text-stone-900 shadow-[3px_3px_0px_0px_#1c1917] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
          >
            <Radio size={14} className={gpsActive ? 'animate-pulse text-emerald-900' : 'text-stone-700'} />
            <span>{gpsLoading ? 'Calibrating...' : gpsActive ? t('gpsCalibrated', 'GPS Calibrated') : t('calibrateGps', 'Calibrate GPS')}</span>
          </button>
        </div>
      </div>

      {/* Selected Job Quick Preview Bar */}
      {selectedJob && (
        <div className="mt-3 p-3.5 rounded-2xl bg-teal-50 border-2 border-stone-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[3px_3px_0px_0px_#1c1917]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-300 border-2 border-stone-900 flex items-center justify-center font-black text-stone-900 shadow-[1px_1px_0px_0px_#1c1917]">
              <Zap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-xs text-stone-900">{selectedJob.title}</span>
                <span className="px-2 py-0.2 rounded-md bg-teal-200 border border-stone-900 font-black text-[10px] text-stone-900">
                  ₹{selectedJob.amount}
                </span>
              </div>
              <p className="text-[11px] font-bold text-stone-700">
                {selectedJob.address} • <span className="text-emerald-900">{selectedJob.distanceKm.toFixed(1)} km away</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAcceptedJobs((prev) => ({ ...prev, [selectedJob.id]: true }));
                onAcceptBooking?.(selectedJob.id);
              }}
              className="px-4 py-2 rounded-xl bg-teal-300 hover:bg-teal-200 text-stone-900 border-2 border-stone-900 font-black text-xs shadow-[2px_2px_0px_0px_#1c1917] cursor-pointer"
            >
              {acceptedJobs[selectedJob.id] ? t('jobAccepted', '✓ Job Accepted') : t('acceptDispatch', 'Accept Dispatch')}
            </button>
            <button
              onClick={() => setSelectedJob(null)}
              className="px-2.5 py-2 rounded-xl bg-white border-2 border-stone-900 text-xs font-black text-stone-900 shadow-[2px_2px_0px_0px_#1c1917] cursor-pointer"
            >
              {t('dismiss', 'Dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
