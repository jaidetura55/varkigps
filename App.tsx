import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  LayoutGrid, RefreshCw, Image as ImageIcon, MapPin, Users, 
  ChevronRight, Settings, Check, X, Navigation, AlertCircle, 
  Camera, Upload, Download, Trash2, Eye, Sliders, ShieldCheck,
  Video as VideoIcon, Sparkles
} from 'lucide-react';
import { WatermarkOverlay } from './components/WatermarkOverlay';
import { AppMode, LocationData } from './types';
import { getAddressFromCoords } from './services/geocoding';

interface CapturedMedia {
  id: string;
  url: string;
  type: 'photo' | 'video';
  timestamp: Date;
  address: string;
}

const LOCATION_PRESETS = [
  { name: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869 },
  { name: 'New York', lat: 40.7128, lng: -74.0060 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 }
];

export const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const requestRef = useRef<number | null>(null);
  const simAnimationRef = useRef<number | null>(null);
  const lastGeocodeTimeRef = useRef<number>(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // App & Camera State
  const [mode, setMode] = useState<AppMode>(AppMode.PHOTO);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSimulatedCamera, setIsSimulatedCamera] = useState(false);
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);

  // Location State
  const [location, setLocation] = useState<LocationData>({
    latitude: 0,
    longitude: 0,
    address: 'Searching for GPS...'
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);

  // Modals & UI State
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempCoords, setTempCoords] = useState({ lat: '3.1390', lng: '101.6869' });
  
  // Customization State
  const [watermarkBrand, setWatermarkBrand] = useState('Marki');
  const [showVerifiedBadge, setShowVerifiedBadge] = useState(true);
  const [showLatLonInWatermark, setShowLatLonInWatermark] = useState(false);

  // Media Capture State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'photo' | 'video' } | null>(null);
  const [album, setAlbum] = useState<CapturedMedia[]>([]);
  const [shutterFlash, setShutterFlash] = useState(false);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Video recording timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRecording) {
      setRecordingSeconds(0);
      timer = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  // Update Location & Geocode
  const updateLocation = useCallback(async (lat: number, lng: number) => {
    const now = Date.now();
    const timeSinceLast = now - lastGeocodeTimeRef.current;
    
    const hasMovedSignificantly = !lastCoordsRef.current || 
      Math.abs(lastCoordsRef.current.lat - lat) > 0.0002 || 
      Math.abs(lastCoordsRef.current.lng - lng) > 0.0002;

    if (hasMovedSignificantly || timeSinceLast > 15000) {
      lastGeocodeTimeRef.current = now;
      lastCoordsRef.current = { lat, lng };
      
      const addr = await getAddressFromCoords(lat, lng);
      setLocation({ latitude: lat, longitude: lng, address: addr });
    } else {
      setLocation(prev => ({ ...prev, latitude: lat, longitude: lng }));
    }
  }, []);

  // Geolocation Setup
  useEffect(() => {
    if (isMockMode) return;

    const onSuccess = (pos: GeolocationPosition) => {
      setLocationError(null);
      updateLocation(pos.coords.latitude, pos.coords.longitude);
    };

    const onError = (error: GeolocationPositionError) => {
      let msg = "Location unavailable";
      if (error.code === error.PERMISSION_DENIED) msg = "GPS permission denied";
      else if (error.code === error.POSITION_UNAVAILABLE) msg = "GPS signal lost";
      else if (error.code === error.TIMEOUT) msg = "GPS request timed out";
      setLocationError(msg);

      // Fallback default coordinates if no location has been found yet
      if (!lastCoordsRef.current) {
        updateLocation(3.1390, 101.6869);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const options = { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 5000 
      };
      
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
      const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setLocationError("Browser lacks GPS support");
      updateLocation(3.1390, 101.6869);
    }
  }, [isMockMode, updateLocation]);

  // Robust Camera Initialization
  useEffect(() => {
    let isCancelled = false;

    const initCamera = async () => {
      // If user uploaded an image, don't force-open physical camera
      if (uploadedImageSrc) return;

      // Stop previous streams safely
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      setCameraError(null);

      // Check if getUserMedia is supported in current environment
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("navigator.mediaDevices.getUserMedia not supported; using simulated camera.");
        setIsSimulatedCamera(true);
        setIsCameraActive(false);
        setCameraError("Camera hardware not accessible; running in Virtual Camera mode");
        return;
      }

      let acquiredStream: MediaStream | null = null;

      // Strategy 1: Ideal facingMode without audio (avoids "Requested device not found" from missing mics or exact camera)
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: cameraFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      } catch (err: any) {
        console.warn("Camera Strategy 1 failed, trying fallback:", err?.message || err);
      }

      // Strategy 2: Relaxed resolution constraint
      if (!acquiredStream) {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: { ideal: cameraFacing }
            },
            audio: false
          });
        } catch (err: any) {
          console.warn("Camera Strategy 2 failed, trying any video device:", err?.message || err);
        }
      }

      // Strategy 3: Any available video device
      if (!acquiredStream) {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } catch (err: any) {
          console.warn("Camera Strategy 3 failed:", err?.message || err);
        }
      }

      if (isCancelled) {
        acquiredStream?.getTracks().forEach(track => track.stop());
        return;
      }

      if (acquiredStream) {
        setIsCameraActive(true);
        setIsSimulatedCamera(false);
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = acquiredStream;
          videoRef.current.play().catch(e => console.warn("Video play error:", e));
        }
      } else {
        // Fall back gracefully to interactive simulation mode
        console.info("Falling back to Virtual Camera mode");
        setIsCameraActive(false);
        setIsSimulatedCamera(true);
        setCameraError("No physical camera detected. Virtual Camera mode is active.");
      }
    };

    initCamera();

    return () => {
      isCancelled = true;
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacing, uploadedImageSrc]);

  // Toggle Camera Facing Mode or Mirror Mode
  const toggleCamera = () => {
    if (isSimulatedCamera) {
      setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
    } else {
      setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
    }
  };

  // Re-attempt connecting physical camera
  const retryCamera = () => {
    setUploadedImageSrc(null);
    uploadedImageRef.current = null;
    setIsSimulatedCamera(false);
    setCameraFacing(prev => prev); // re-trigger effect
  };

  // Handle Upload Image to Stamp
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setUploadedImageSrc(src);
      const img = new Image();
      img.onload = () => {
        uploadedImageRef.current = img;
        setIsSimulatedCamera(true);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // Simulation Viewfinder Canvas Animation
  useEffect(() => {
    if (!isSimulatedCamera && isCameraActive && !uploadedImageSrc) {
      if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
      return;
    }

    const simCanvas = simulationCanvasRef.current;
    if (!simCanvas) return;
    const ctx = simCanvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    const renderSim = () => {
      tick++;
      const w = simCanvas.width = simCanvas.clientWidth || 800;
      const h = simCanvas.height = simCanvas.clientHeight || 1200;

      if (uploadedImageRef.current) {
        // Draw uploaded image covering canvas
        const img = uploadedImageRef.current;
        const scale = Math.max(w / img.width, h / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        const nx = (w - nw) / 2;
        const ny = (h - nh) / 2;
        ctx.drawImage(img, nx, ny, nw, nh);
      } else {
        // Draw interactive field scenery simulation
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        if (cameraFacing === 'user') {
          // Soft indoor / portrait lighting
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(0.6, '#0f172a');
          grad.addColorStop(1, '#020617');
        } else {
          // Outdoor construction / engineering inspection field lighting
          grad.addColorStop(0, '#0284c7');
          grad.addColorStop(0.4, '#38bdf8');
          grad.addColorStop(0.55, '#fef08a');
          grad.addColorStop(0.6, '#15803d');
          grad.addColorStop(1, '#14532d');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Distant hills/structures
        if (cameraFacing === 'environment') {
          ctx.fillStyle = 'rgba(21, 128, 61, 0.7)';
          ctx.beginPath();
          ctx.moveTo(0, h * 0.65);
          for (let x = 0; x <= w; x += 40) {
            const y = h * 0.65 + Math.sin((x + tick * 0.5) * 0.01) * 20;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fill();

          // Field grid lines (engineering perspective)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          for (let i = 1; i <= 6; i++) {
            ctx.beginPath();
            ctx.moveTo(w * 0.5, h * 0.6);
            ctx.lineTo((i / 6) * w, h);
            ctx.stroke();
          }
        } else {
          // Portrait silhouette
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.42, w * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(w * 0.5, h * 0.75, w * 0.35, h * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Camera Viewfinder Reticle / Crosshair
        const cx = w / 2;
        const cy = h * 0.45;
        const r = 40 + Math.sin(tick * 0.05) * 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(cx - r - 10, cy);
        ctx.lineTo(cx - r + 5, cy);
        ctx.moveTo(cx + r - 5, cy);
        ctx.lineTo(cx + r + 10, cy);
        ctx.moveTo(cx, cy - r - 10);
        ctx.lineTo(cx, cy - r + 5);
        ctx.moveTo(cx, cy + r - 5);
        ctx.lineTo(cx, cy + r + 10);
        ctx.stroke();
      }

      simAnimationRef.current = requestAnimationFrame(renderSim);
    };

    renderSim();

    return () => {
      if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
    };
  }, [isSimulatedCamera, isCameraActive, cameraFacing, uploadedImageSrc]);

  // Formatted date & time strings
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const formattedDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });

  // Draw full frame with high-resolution watermark to Canvas
  const drawFrameToCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let targetWidth = 1280;
    let targetHeight = 720;

    const video = videoRef.current;
    const hasLiveVideo = !isSimulatedCamera && video && video.readyState >= 2 && video.videoWidth > 0;

    if (hasLiveVideo) {
      targetWidth = video.videoWidth;
      targetHeight = video.videoHeight;
    } else if (uploadedImageRef.current) {
      targetWidth = uploadedImageRef.current.width;
      targetHeight = uploadedImageRef.current.height;
    } else if (simulationCanvasRef.current) {
      targetWidth = simulationCanvasRef.current.width || 1280;
      targetHeight = simulationCanvasRef.current.height || 720;
    }

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Background (Video / Uploaded Image / Simulation Canvas)
    if (hasLiveVideo) {
      if (cameraFacing === 'user') {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    } else if (uploadedImageRef.current) {
      ctx.drawImage(uploadedImageRef.current, 0, 0, canvas.width, canvas.height);
    } else if (simulationCanvasRef.current) {
      ctx.drawImage(simulationCanvasRef.current, 0, 0, canvas.width, canvas.height);
    }

    // 2. Compute Responsive Typography & Margins for Watermark
    const baseScale = Math.min(canvas.width, canvas.height);
    const paddingX = canvas.width * 0.04;
    const paddingY = canvas.height * 0.04;
    
    const fontSizeTime = Math.max(28, Math.round(baseScale * 0.065));
    const fontSizeDate = Math.max(12, Math.round(baseScale * 0.022));
    const fontSizeLoc = Math.max(11, Math.round(baseScale * 0.02));
    const fontSizeVerified = Math.max(9, Math.round(baseScale * 0.014));
    const brandSize = Math.max(18, Math.round(baseScale * 0.032));
    const brandSubSize = Math.max(8, Math.round(baseScale * 0.013));

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const verY = canvas.height - paddingY;
    const locY = verY - fontSizeVerified * 2.8;
    const lineY = locY - fontSizeLoc * 1.5;
    const dateY = lineY - fontSizeDate * 0.8;
    const timeY = dateY - fontSizeDate * 1.2;

    // Time
    ctx.font = `bold ${fontSizeTime}px Roboto, sans-serif`;
    ctx.fillText(formattedTime, paddingX, timeY);

    // Day & Date
    ctx.font = `500 ${fontSizeDate}px Roboto, sans-serif`;
    ctx.fillText(`${formattedDay} ${formattedDate}`, paddingX, dateY);

    // Separator line
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(paddingX, lineY, Math.min(canvas.width * 0.35, 240), 2);
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#FFFFFF';

    // Location Pin Icon
    const pinRadius = fontSizeLoc * 0.45;
    const pinCenterX = paddingX + pinRadius;
    const pinCenterY = locY - pinRadius;

    ctx.beginPath();
    ctx.arc(pinCenterX, pinCenterY, pinRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(paddingX, pinCenterY);
    ctx.lineTo(pinCenterX, locY);
    ctx.lineTo(paddingX + pinRadius * 2, pinCenterY);
    ctx.fill();

    // Location Text
    ctx.font = `bold ${fontSizeLoc}px Roboto, sans-serif`;
    const fullLocText = showLatLonInWatermark 
      ? `${location.address} (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`
      : location.address;

    // Truncate if too wide for canvas
    const maxLocWidth = canvas.width * 0.65;
    let displayLoc = fullLocText;
    if (ctx.measureText(displayLoc).width > maxLocWidth) {
      while (displayLoc.length > 5 && ctx.measureText(displayLoc + '...').width > maxLocWidth) {
        displayLoc = displayLoc.slice(0, -1);
      }
      displayLoc += '...';
    }
    ctx.fillText(displayLoc, paddingX + pinRadius * 2 + 8, locY);

    // Verified badge
    if (showVerifiedBadge) {
      ctx.font = `500 ${fontSizeVerified}px Roboto, sans-serif`;
      ctx.fillText(`Time & location verified by ${watermarkBrand}`, paddingX, verY);
    }

    // Right Branding Watermark
    ctx.textAlign = 'right';
    ctx.font = `bold ${brandSize}px Roboto, sans-serif`;
    ctx.fillText(watermarkBrand, canvas.width - paddingX, canvas.height - paddingY - brandSubSize * 1.6);

    // Branding Dot
    ctx.beginPath();
    ctx.arc(canvas.width - paddingX + 5, canvas.height - paddingY - brandSubSize * 1.6 - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `bold ${brandSubSize}px Roboto, sans-serif`;
    ctx.fillText("ACTUAL TIME", canvas.width - paddingX, canvas.height - paddingY);
  }, [
    isSimulatedCamera, cameraFacing, formattedTime, formattedDay, 
    formattedDate, location.address, location.latitude, location.longitude,
    showLatLonInWatermark, showVerifiedBadge, watermarkBrand
  ]);

  // Video recording loop
  const recordingRenderLoop = useCallback(() => {
    if (canvasRef.current && isRecording) {
      drawFrameToCanvas(canvasRef.current);
      requestRef.current = requestAnimationFrame(recordingRenderLoop);
    }
  }, [drawFrameToCanvas, isRecording]);

  useEffect(() => {
    if (isRecording) {
      requestRef.current = requestAnimationFrame(recordingRenderLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRecording, recordingRenderLoop]);

  // Capture Photo
  const capturePhoto = () => {
    if (!canvasRef.current) return;
    
    // Trigger shutter flash animation
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 200);

    drawFrameToCanvas(canvasRef.current);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.98);
    const newMedia: CapturedMedia = {
      id: `photo_${Date.now()}`,
      url: dataUrl,
      type: 'photo',
      timestamp: new Date(),
      address: location.address
    };

    setAlbum(prev => [newMedia, ...prev]);
    setPreviewMedia({ url: dataUrl, type: 'photo' });
  };

  // Start / Stop Video Recording
  const handleToggleVideoRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (!canvasRef.current) return;
      drawFrameToCanvas(canvasRef.current);

      try {
        const canvasStream = canvasRef.current.captureStream(30);
        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

        // Safely attempt to add microphone audio if available
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioTrack = micStream.getAudioTracks()[0];
            if (audioTrack) tracks.push(audioTrack);
          }
        } catch {
          // Microphone not available; record video without audio track smoothly
        }

        const combinedStream = new MediaStream(tracks);

        // Safe mimeType resolution
        let mimeType = 'video/webm';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
            mimeType = 'video/webm;codecs=vp8,opus';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            mimeType = 'video/webm';
          } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/mp4';
          }
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const newMedia: CapturedMedia = {
            id: `video_${Date.now()}`,
            url,
            type: 'video',
            timestamp: new Date(),
            address: location.address
          };
          setAlbum(prev => [newMedia, ...prev]);
          setPreviewMedia({ url, type: 'video' });
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000);
        setIsRecording(true);
      } catch (err) {
        console.error("Video recording error:", err);
      }
    }
  };

  const handleCapture = () => {
    if (mode === AppMode.PHOTO) {
      capturePhoto();
    } else if (mode === AppMode.VIDEO) {
      handleToggleVideoRecording();
    } else if (mode === AppMode.EDIT) {
      setIsSettingsModalOpen(true);
    }
  };

  const handleSaveMedia = (mediaToSave = previewMedia) => {
    if (!mediaToSave) return;
    const a = document.createElement('a');
    a.href = mediaToSave.url;
    a.download = `MarkiGPS_${Date.now()}.${mediaToSave.type === 'photo' ? 'jpg' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDiscardMedia = () => {
    if (previewMedia?.type === 'video') {
      URL.revokeObjectURL(previewMedia.url);
    }
    setPreviewMedia(null);
  };

  const deleteFromAlbum = (id: string) => {
    setAlbum(prev => prev.filter(m => m.id !== id));
  };

  // Mock / Override Location
  const applyMockLocation = () => {
    const lat = parseFloat(tempCoords.lat);
    const lng = parseFloat(tempCoords.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setIsMockMode(true);
      updateLocation(lat, lng);
      setIsLocationModalOpen(false);
    }
  };

  const applyPresetLocation = (preset: { name: string; lat: number; lng: number }) => {
    setTempCoords({ lat: preset.lat.toString(), lng: preset.lng.toString() });
    setIsMockMode(true);
    updateLocation(preset.lat, preset.lng);
    setIsLocationModalOpen(false);
  };

  const resetToRealGPS = () => {
    setIsMockMode(false);
    setIsLocationModalOpen(false);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
        (err) => setLocationError(err.message),
        { enableHighAccuracy: true }
      );
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-black text-white relative select-none overflow-hidden font-sans">
      {/* Hidden File Input for Image Upload */}
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*" 
        className="hidden" 
        onChange={handleImageUpload} 
      />

      {/* Top Header Controls */}
      <div className="absolute top-0 left-0 w-full p-4 sm:p-5 flex justify-between items-center z-30 pointer-events-auto">
        <button 
          onClick={() => setIsSettingsModalOpen(true)}
          className="p-2.5 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition border border-white/10"
          title="Watermark & Settings"
        >
          <Sliders size={20} />
        </button>

        <div className="flex gap-2.5 items-center">
          {/* Location Status / Override Button */}
          <button 
            onClick={() => setIsLocationModalOpen(true)}
            className={`px-3 py-1.5 rounded-full backdrop-blur-md transition flex items-center gap-1.5 border text-xs font-semibold ${
              isMockMode 
                ? 'bg-blue-600/80 border-blue-400 text-white' 
                : locationError 
                ? 'bg-amber-600/80 border-amber-400 text-white' 
                : 'bg-black/40 border-white/10 text-white hover:bg-black/60'
            }`}
            title="GPS Location Controls"
          >
            {isMockMode ? (
              <>
                <Navigation size={14} className="fill-white" />
                <span>Mock GPS</span>
              </>
            ) : locationError ? (
              <>
                <AlertCircle size={14} />
                <span>GPS Warning</span>
              </>
            ) : (
              <>
                <MapPin size={14} />
                <span>GPS Active</span>
              </>
            )}
          </button>

          {/* Switch Camera / Facing Mode */}
          <button 
            onClick={toggleCamera} 
            className="p-2.5 bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition border border-white/10"
            title={cameraFacing === 'user' ? 'Switch to Rear Camera' : 'Switch to Front Camera'}
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>

      {/* Camera / Viewfinder Center Area */}
      <div className="flex-1 relative bg-neutral-950 flex items-center justify-center overflow-hidden">
        {/* Real Video Element */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`h-full w-full object-cover transition-all duration-300 ${
            !isCameraActive || isSimulatedCamera ? 'hidden' : 'block'
          } ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {/* Virtual / Simulation Viewfinder Canvas */}
        <canvas 
          ref={simulationCanvasRef} 
          className={`h-full w-full object-cover transition-all duration-300 ${
            !isCameraActive || isSimulatedCamera ? 'block' : 'hidden'
          }`}
        />

        {/* Shutter Flash Animation */}
        {shutterFlash && (
          <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-200 pointer-events-none" />
        )}

        {/* Real-Time Live Watermark Overlay */}
        <WatermarkOverlay 
          time={formattedTime}
          date={formattedDate}
          day={formattedDay}
          address={showLatLonInWatermark ? `${location.address} (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})` : location.address}
          isVerified={showVerifiedBadge}
        />

        {/* Camera Notice Banner if in Virtual mode */}
        {isSimulatedCamera && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-neutral-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full flex items-center gap-2 border border-white/15 text-xs text-neutral-300 z-20 shadow-xl">
            <Sparkles size={13} className="text-amber-400" />
            <span>Virtual Camera Viewfinder</span>
            <button 
              onClick={retryCamera}
              className="ml-1 text-[11px] font-bold text-blue-400 underline hover:text-blue-300"
            >
              Retry Cam
            </button>
          </div>
        )}

        {/* Uploaded image banner */}
        {uploadedImageSrc && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-semibold z-20 shadow-lg">
            <ImageIcon size={12} />
            <span>Custom Photo Loaded</span>
            <button 
              onClick={() => { setUploadedImageSrc(null); uploadedImageRef.current = null; }}
              className="ml-1 text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* GPS Warning Overlay */}
        {locationError && !isMockMode && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[85%] max-w-sm bg-amber-950/90 backdrop-blur-md px-4 py-2.5 rounded-xl flex items-center justify-between gap-3 border border-amber-500/40 shadow-2xl z-25">
            <div className="flex items-center gap-2 text-amber-200 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 text-amber-400" />
              <span>{locationError}</span>
            </div>
            <button 
              onClick={() => setIsLocationModalOpen(true)}
              className="bg-amber-500 text-black px-2.5 py-1 rounded-lg font-bold text-[11px] shrink-0 hover:bg-amber-400 transition"
            >
              Set GPS
            </button>
          </div>
        )}

        {/* Video Recording Indicator */}
        {isRecording && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-600/95 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 animate-pulse shadow-lg z-20 border border-white/20">
            <div className="w-2 h-2 bg-white rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white">
              REC {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Footer Interface */}
      <div className="bg-white text-neutral-900 h-[28%] min-h-[190px] flex flex-col items-center justify-between py-3.5 px-4 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] z-20">
        {/* Mode switcher banner */}
        <div className="flex items-center gap-1.5 px-3 py-0.5 bg-neutral-100 rounded-full text-neutral-500 text-[11px] font-medium">
          <span>High-Precision GPS Watermark</span>
          <ShieldCheck size={12} className="text-emerald-600" />
        </div>

        {/* Main Controls Row */}
        <div className="flex justify-around items-center w-full max-w-md my-1">
          {/* Album Gallery */}
          <div 
            onClick={() => setIsAlbumModalOpen(true)}
            className="flex flex-col items-center gap-1 cursor-pointer transition hover:opacity-80 active:scale-95"
          >
            <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 rounded-xl flex items-center justify-center overflow-hidden relative shadow-xs">
              {album.length > 0 ? (
                album[0].type === 'photo' ? (
                  <img src={album[0].url} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                    <VideoIcon size={16} className="text-white" />
                  </div>
                )
              ) : (
                <ImageIcon className="text-neutral-500" size={20} />
              )}
              {album.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {album.length}
                </span>
              )}
            </div>
            <span className="text-neutral-700 text-[11px] font-semibold">Album</span>
          </div>

          {/* Upload Photo Button */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1 cursor-pointer transition hover:opacity-80 active:scale-95"
            title="Upload photo to apply watermark"
          >
            <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 rounded-xl flex items-center justify-center shadow-xs">
              <Upload className="text-neutral-700" size={19} />
            </div>
            <span className="text-neutral-700 text-[11px] font-semibold">Stamp</span>
          </div>

          {/* Shutter / Capture Button */}
          <button 
            onClick={handleCapture}
            className={`w-16 h-16 rounded-full border-[3px] border-neutral-200 flex items-center justify-center p-0.5 transition transform active:scale-90 shadow-md ${
              isRecording ? 'bg-red-500' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={mode === AppMode.PHOTO ? 'Take Photo' : 'Record Video'}
          >
            <div className={`w-full h-full rounded-full ${
              isRecording ? 'bg-red-400' : 'bg-blue-500'
            } border-2 border-white flex items-center justify-center shadow-inner`}>
              {isRecording ? (
                <div className="w-5 h-5 bg-white rounded-sm" />
              ) : mode === AppMode.PHOTO ? (
                <div className="w-6 h-6 rounded-full border-2 border-white/80" />
              ) : (
                <div className="w-5 h-5 bg-white rounded-full" />
              )}
            </div>
          </button>

          {/* Watermark Config */}
          <div 
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex flex-col items-center gap-1 cursor-pointer transition hover:opacity-80 active:scale-95"
          >
            <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 rounded-xl flex items-center justify-center shadow-xs">
              <Settings className="text-neutral-700" size={19} />
            </div>
            <span className="text-neutral-700 text-[11px] font-semibold">Style</span>
          </div>

          {/* Manual Location Preset */}
          <div 
            onClick={() => setIsLocationModalOpen(true)}
            className="flex flex-col items-center gap-1 cursor-pointer transition hover:opacity-80 active:scale-95"
          >
            <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 rounded-xl flex items-center justify-center shadow-xs">
              <MapPin className="text-neutral-700" size={19} />
            </div>
            <span className="text-neutral-700 text-[11px] font-semibold">Location</span>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex gap-8 text-neutral-400 font-bold text-sm mb-1">
          <button 
            onClick={() => { if (!isRecording) setMode(AppMode.PHOTO); }} 
            className={`relative py-1 transition ${mode === AppMode.PHOTO ? 'text-black font-extrabold' : 'hover:text-neutral-600'}`}
          >
            Photo
            {mode === AppMode.PHOTO && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full" />}
          </button>
          
          <button 
            onClick={() => { if (!isRecording) setMode(AppMode.VIDEO); }} 
            className={`relative py-1 transition ${mode === AppMode.VIDEO ? 'text-black font-extrabold' : 'hover:text-neutral-600'}`}
          >
            Video
            {mode === AppMode.VIDEO && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full" />}
          </button>

          <button 
            onClick={() => setIsSettingsModalOpen(true)} 
            className={`relative py-1 transition ${mode === AppMode.EDIT ? 'text-black font-extrabold' : 'hover:text-neutral-600'}`}
          >
            Edit
          </button>
        </div>
      </div>

      {/* Manual GPS & Presets Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-sm rounded-3xl p-6 border border-white/15 text-white shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <MapPin size={20} className="text-blue-400" />
                <h2 className="text-base font-bold">GPS Location Controls</h2>
              </div>
              <button 
                onClick={() => setIsLocationModalOpen(false)}
                className="p-1 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="mb-4">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                Quick Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {LOCATION_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => applyPresetLocation(preset)}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-blue-600 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Coordinates Inputs */}
            <div className="space-y-2.5 mb-5">
              <div>
                <label className="text-[11px] font-medium text-neutral-400 mb-1 block">Latitude</label>
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 3.1390"
                  value={tempCoords.lat}
                  onChange={(e) => setTempCoords(prev => ({ ...prev, lat: e.target.value }))}
                  className="w-full bg-neutral-800 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-neutral-400 mb-1 block">Longitude</label>
                <input 
                  type="number" 
                  step="any"
                  placeholder="e.g. 101.6869"
                  value={tempCoords.lng}
                  onChange={(e) => setTempCoords(prev => ({ ...prev, lng: e.target.value }))}
                  className="w-full bg-neutral-800 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={applyMockLocation} 
                className="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl font-bold text-sm shadow-md transition"
              >
                Apply Custom Coordinates
              </button>
              <button 
                onClick={resetToRealGPS} 
                className="w-full bg-neutral-800 hover:bg-neutral-700 py-2.5 rounded-xl font-semibold text-xs text-neutral-300 transition"
              >
                Restore Device Real GPS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings / Watermark Customizer Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-sm rounded-3xl p-6 border border-white/15 text-white shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Sliders size={20} className="text-blue-400" />
                <h2 className="text-base font-bold">Watermark Customizer</h2>
              </div>
              <button 
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-neutral-300 mb-1.5 block">Brand / Company Name</label>
                <input 
                  type="text" 
                  value={watermarkBrand}
                  onChange={(e) => setWatermarkBrand(e.target.value)}
                  className="w-full bg-neutral-800 rounded-xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-neutral-800/70 rounded-xl border border-white/5">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Show Verified Badge</div>
                  <div className="text-[10px] text-neutral-400">"Time & location verified"</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={showVerifiedBadge}
                  onChange={(e) => setShowVerifiedBadge(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-neutral-800/70 rounded-xl border border-white/5">
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Display Raw Lat/Lon</div>
                  <div className="text-[10px] text-neutral-400">Append coordinates to address</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={showLatLonInWatermark}
                  onChange={(e) => setShowLatLonInWatermark(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            <button 
              onClick={() => setIsSettingsModalOpen(false)} 
              className="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl font-bold text-sm transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Album / Gallery Modal */}
      {isAlbumModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col p-4">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ImageIcon size={20} className="text-blue-400" />
              <h2 className="text-base font-bold">Captured Media ({album.length})</h2>
            </div>
            <button 
              onClick={() => setIsAlbumModalOpen(false)}
              className="p-1 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {album.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-2">
              <Camera size={40} className="stroke-1 opacity-50" />
              <p className="text-sm">No photos or videos captured yet.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
              {album.map(item => (
                <div key={item.id} className="relative bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 flex flex-col">
                  <div className="aspect-square relative overflow-hidden bg-black cursor-pointer" onClick={() => setPreviewMedia({ url: item.url, type: item.type })}>
                    {item.type === 'photo' ? (
                      <img src={item.url} className="w-full h-full object-cover" />
                    ) : (
                      <video src={item.url} className="w-full h-full object-cover" />
                    )}
                    {item.type === 'video' && (
                      <div className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <VideoIcon size={10} /> VIDEO
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 flex items-center justify-between text-xs bg-neutral-900/90">
                    <span className="text-[10px] text-neutral-400 truncate max-w-[100px]">
                      {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSaveMedia(item)} 
                        className="text-blue-400 hover:text-blue-300 p-1"
                        title="Download"
                      >
                        <Download size={14} />
                      </button>
                      <button 
                        onClick={() => deleteFromAlbum(item.id)} 
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Media Preview & Save Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in">
          <div className="w-full flex justify-between items-center text-white py-2">
            <span className="font-bold text-sm">
              Preview Watermarked {previewMedia.type === 'photo' ? 'Photo' : 'Video'}
            </span>
            <button 
              onClick={handleDiscardMedia}
              className="p-1 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white"
            >
              <X size={22} />
            </button>
          </div>

          <div className="flex-1 w-full max-w-xl flex items-center justify-center overflow-hidden rounded-2xl my-3 bg-neutral-950 border border-white/10 shadow-2xl">
            {previewMedia.type === 'photo' ? (
              <img src={previewMedia.url} className="h-full w-full object-contain" />
            ) : (
              <video src={previewMedia.url} className="h-full w-full object-contain" controls autoPlay loop />
            )}
          </div>

          <div className="w-full max-w-xl grid grid-cols-2 gap-3 h-14">
            <button 
              onClick={handleDiscardMedia} 
              className="bg-neutral-800 hover:bg-neutral-700 rounded-2xl font-bold text-sm text-neutral-200 transition"
            >
              Discard
            </button>
            <button 
              onClick={() => handleSaveMedia()} 
              className="bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold text-sm text-white shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition"
            >
              <Download size={16} />
              Save to Device
            </button>
          </div>
        </div>
      )}

      {/* Hidden Working Canvas for Snapshot & Recording */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
