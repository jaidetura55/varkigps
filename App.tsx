
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LayoutGrid, RefreshCw, Crosshair, Image, MapPin, Users, ChevronRight, Settings, Check, X, Map as MapIcon, Navigation, AlertCircle } from 'lucide-react';
import { WatermarkOverlay } from './components/WatermarkOverlay';
import { AppMode, LocationData } from './types';
import { getAddressFromCoords } from './services/geocoding';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastGeocodeTimeRef = useRef<number>(0);
  const lastCoordsRef = useRef<{lat: number, lng: number} | null>(null);
  
  const [mode, setMode] = useState<AppMode>(AppMode.PHOTO);
  const [isRecording, setIsRecording] = useState(false);
  const [location, setLocation] = useState<LocationData>({
    latitude: 0,
    longitude: 0,
    address: 'Searching for GPS...'
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [tempCoords, setTempCoords] = useState({ lat: '', lng: '' });
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');

  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'photo' | 'video' } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const updateLocation = useCallback(async (lat: number, lng: number) => {
    const now = Date.now();
    const timeSinceLast = now - lastGeocodeTimeRef.current;
    
    const hasMovedSignificantly = !lastCoordsRef.current || 
      Math.abs(lastCoordsRef.current.lat - lat) > 0.0002 || 
      Math.abs(lastCoordsRef.current.lng - lng) > 0.0002;

    if (hasMovedSignificantly || timeSinceLast > 20000) {
      lastGeocodeTimeRef.current = now;
      lastCoordsRef.current = { lat, lng };
      const address = await getAddressFromCoords(lat, lng);
      setLocation({ latitude: lat, longitude: lng, address });
    } else {
      setLocation(prev => ({ ...prev, latitude: lat, longitude: lng }));
    }
  }, []);

  // Robust Geolocation Strategy
  useEffect(() => {
    if (isMockMode) return;

    const onSuccess = (pos: GeolocationPosition) => {
      setLocationError(null);
      updateLocation(pos.coords.latitude, pos.coords.longitude);
    };

    const onError = (error: GeolocationPositionError) => {
      console.warn("Location error:", error.message);
      let msg = "Location error";
      if (error.code === error.PERMISSION_DENIED) msg = "GPS Permission Denied";
      else if (error.code === error.POSITION_UNAVAILABLE) msg = "GPS Signal Lost";
      else if (error.code === error.TIMEOUT) msg = "GPS Request Timed Out";
      setLocationError(msg);

      if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
        navigator.geolocation.getCurrentPosition(onSuccess, () => {}, { enableHighAccuracy: false });
      }
    };

    if (navigator.geolocation) {
      const options = { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
      };
      
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
      const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      setLocationError("Browser lacks GPS support");
    }
  }, [isMockMode, updateLocation]);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: cameraFacing,
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: true
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    };
    initCamera();
  }, [cameraFacing]);

  const toggleCamera = () => {
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  };

  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const formattedDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });

  const drawFrameToCanvas = useCallback((canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (cameraFacing === 'user') {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Adjusted scale ratios for "more smaller"
    const paddingX = canvas.width * 0.035; // Reduced margin
    const paddingY = canvas.height * 0.035; // Reduced margin
    const fontSizeTime = canvas.width * 0.06; // Significantly reduced
    const fontSizeDate = canvas.width * 0.02; // Reduced
    const fontSizeLoc = canvas.width * 0.018; // Reduced
    const fontSizeVerified = canvas.width * 0.012; // Reduced

    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const verY = canvas.height - paddingY;
    const locY = verY - fontSizeVerified * 3;
    const lineY = locY - fontSizeLoc * 1.5;
    const dateY = lineY - fontSizeDate * 0.8;
    const timeY = dateY - fontSizeDate * 1.2;

    // 1. Time
    ctx.font = `bold ${fontSizeTime}px Roboto`;
    ctx.fillText(formattedTime, paddingX, timeY);
    
    // 2. Day & Date
    ctx.font = `500 ${fontSizeDate}px Roboto`;
    ctx.fillText(`${formattedDay} ${formattedDate}`, paddingX, dateY);
    
    // 3. Separator
    ctx.shadowBlur = 0;
    ctx.fillRect(paddingX, lineY, canvas.width * 0.30, 1.5);
    ctx.shadowBlur = 8;

    // 4. Pin Icon & Address
    const pinSize = fontSizeLoc * 0.8;
    ctx.beginPath();
    ctx.arc(paddingX + pinSize/2, locY - pinSize/2, pinSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(paddingX, locY - pinSize/2);
    ctx.lineTo(paddingX + pinSize/2, locY);
    ctx.lineTo(paddingX + pinSize, locY - pinSize/2);
    ctx.fill();

    ctx.font = `bold ${fontSizeLoc}px Roboto`;
    ctx.fillText(location.address, paddingX + pinSize + 8, locY);
    
    // 5. Verified text
    ctx.font = `500 ${fontSizeVerified}px Roboto`;
    ctx.fillText("Time & location verified by Marki", paddingX, verY);

    // 6. Branding
    ctx.textAlign = 'right';
    const brandSize = canvas.width * 0.03;
    const brandSubSize = canvas.width * 0.012;
    
    ctx.font = `bold ${brandSize}px Roboto`;
    ctx.fillText("Marki", canvas.width - paddingX, canvas.height - paddingY - brandSubSize * 1.8);
    // Branding dot
    ctx.beginPath();
    ctx.arc(canvas.width - paddingX + 5, canvas.height - paddingY - brandSubSize * 1.8 - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = `bold ${brandSubSize}px Roboto`;
    ctx.fillText("ACTUAL TIME", canvas.width - paddingX, canvas.height - paddingY);

  }, [cameraFacing, formattedTime, formattedDay, formattedDate, location.address]);

  const renderLoop = useCallback(() => {
    if (videoRef.current && canvasRef.current && isRecording) {
      drawFrameToCanvas(canvasRef.current, videoRef.current);
      requestRef.current = requestAnimationFrame(renderLoop);
    }
  }, [drawFrameToCanvas, isRecording]);

  useEffect(() => {
    if (isRecording) {
      requestRef.current = requestAnimationFrame(renderLoop);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRecording, renderLoop]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    drawFrameToCanvas(canvasRef.current, videoRef.current);
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.98);
    setPreviewMedia({ url: dataUrl, type: 'photo' });
  };

  const handleCapture = () => {
    if (mode === AppMode.PHOTO) {
      capturePhoto();
    } else if (mode === AppMode.VIDEO) {
      if (isRecording) {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
      } else {
        if (!canvasRef.current || !videoRef.current) return;
        drawFrameToCanvas(canvasRef.current, videoRef.current);
        const canvasStream = canvasRef.current.captureStream(30);
        const cameraStream = videoRef.current.srcObject as MediaStream;
        const audioTracks = cameraStream.getAudioTracks();
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks
        ]);
        const recorder = new MediaRecorder(combinedStream, {
          mimeType: 'video/webm;codecs=vp8,opus'
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setPreviewMedia({ url, type: 'video' });
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
      }
    }
  };

  const handleSaveMedia = () => {
    if (!previewMedia) return;
    const a = document.createElement('a');
    a.href = previewMedia.url;
    a.download = `MarkiGPS_${Date.now()}.${previewMedia.type === 'photo' ? 'jpg' : 'webm'}`;
    a.click();
    setPreviewMedia(null);
  };

  const handleDiscardMedia = () => {
    if (previewMedia?.type === 'video') {
      URL.revokeObjectURL(previewMedia.url);
    }
    setPreviewMedia(null);
  };

  const applyMockLocation = () => {
    const lat = parseFloat(tempCoords.lat);
    const lng = parseFloat(tempCoords.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setIsMockMode(true);
      updateLocation(lat, lng);
      setIsLocationModalOpen(false);
    }
  };

  const resetToRealGPS = () => {
    setIsMockMode(false);
    setIsLocationModalOpen(false);
  };

  const retryGPS = () => {
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => setLocationError(err.message),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-black text-white relative select-none">
      {/* Header */}
      <div className="absolute top-0 left-0 w-full p-5 flex justify-between items-center z-20">
        <button className="p-2 hover:bg-white/10 rounded-full transition">
          <LayoutGrid size={24} />
        </button>
        <div className="flex gap-3 items-center">
            <button 
              onClick={() => setIsLocationModalOpen(true)}
              className={`p-2 rounded-full transition ${isMockMode || locationError ? 'text-red-400 bg-red-400/20' : 'hover:bg-white/10'}`}
            >
                {locationError ? <AlertCircle size={24} /> : <MapPin size={24} />}
            </button>
            <button onClick={toggleCamera} className="p-2 hover:bg-white/10 rounded-full transition">
              <RefreshCw size={24} />
            </button>
        </div>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative bg-neutral-900 flex items-center justify-center overflow-hidden">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`h-full w-full object-cover transition-transform duration-500 ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        
        <WatermarkOverlay 
          time={formattedTime}
          date={formattedDate}
          day={formattedDay}
          address={location.address}
        />

        {locationError && !isMockMode && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[75%] bg-red-600/90 backdrop-blur-md px-5 py-3 rounded-xl flex flex-col items-center gap-2 border border-white/20 shadow-2xl z-30 text-center">
            <div className="flex items-center gap-2">
              <AlertCircle size={20} />
              <span className="font-bold text-sm">{locationError}</span>
            </div>
            <button 
              onClick={retryGPS}
              className="bg-white text-red-600 px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-neutral-100 transition"
            >
              Retry GPS
            </button>
          </div>
        )}

        {isRecording && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-600 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse shadow-lg">
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Recording</span>
          </div>
        )}

        {isMockMode && (
          <div className="absolute top-16 left-5 bg-blue-600/80 backdrop-blur-md px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border border-blue-400/30">
            <Navigation size={12} className="fill-white" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Mock GPS</span>
          </div>
        )}
      </div>

      {/* Footer Interface */}
      <div className="bg-white h-[32%] flex flex-col items-center justify-between py-5 px-4">
        <div className="flex items-center gap-1 px-2 py-0.5 bg-neutral-100 rounded-md text-neutral-400 text-xs font-medium">
          Cloud storage is off
          <ChevronRight size={12} />
        </div>

        <div className="flex justify-around items-center w-full mb-3">
          <div className="flex flex-col items-center gap-0.5 cursor-pointer">
            <div className="w-10 h-10 bg-neutral-200 rounded-md flex items-center justify-center overflow-hidden">
                <Image className="text-neutral-600" size={20} />
            </div>
            <span className="text-black text-[10px] font-medium">Album</span>
          </div>

          <div className="flex flex-col items-center gap-0.5 cursor-pointer">
            <div className="w-10 h-10 flex items-center justify-center">
                <MapPin className="text-black" size={22} />
            </div>
            <span className="text-black text-[10px] font-medium">Watermark</span>
          </div>

          <button 
            onClick={handleCapture}
            className={`w-16 h-16 rounded-full border-[3px] border-neutral-100 flex items-center justify-center p-0.5 transition transform active:scale-95 ${isRecording ? 'bg-red-500' : 'bg-blue-600'}`}
          >
            <div className={`w-full h-full rounded-full ${isRecording ? 'bg-red-400' : 'bg-blue-500'} border-2 border-white flex items-center justify-center`}>
              {isRecording ? (
                <div className="w-5 h-5 bg-white rounded-sm" />
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-white/50" />
              )}
            </div>
          </button>

          <div className="flex flex-col items-center gap-0.5 cursor-pointer opacity-40">
            <div className="w-10 h-10 flex items-center justify-center">
                <Settings className="text-black" size={22} />
            </div>
            <span className="text-black text-[10px] font-medium">Settings</span>
          </div>

          <div className="flex flex-col items-center gap-0.5 cursor-pointer">
            <div className="w-10 h-10 flex items-center justify-center">
                <Users className="text-black" size={22} />
            </div>
            <span className="text-black text-[10px] font-medium">Team</span>
          </div>
        </div>

        <div className="flex gap-6 text-neutral-400 font-bold text-base">
          <button 
            onClick={() => setMode(AppMode.EDIT)} 
            className={`transition ${mode === AppMode.EDIT ? 'text-black' : ''}`}
          >
            Edit
          </button>
          <button 
            onClick={() => { if(!isRecording) setMode(AppMode.PHOTO); }} 
            className={`relative transition ${mode === AppMode.PHOTO ? 'text-black' : ''}`}
          >
            Photo
            {mode === AppMode.PHOTO && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full" />}
          </button>
          <button 
            onClick={() => { if(!isRecording) setMode(AppMode.VIDEO); }} 
            className={`relative transition ${mode === AppMode.VIDEO ? 'text-black' : ''}`}
          >
            Video
            {mode === AppMode.VIDEO && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full" />}
          </button>
        </div>
      </div>

      {/* Location Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-sm rounded-2xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Manual GPS</h2>
              <button onClick={() => setIsLocationModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3 mb-6">
              <input 
                type="number" 
                placeholder="Latitude"
                value={tempCoords.lat}
                onChange={(e) => setTempCoords(prev => ({ ...prev, lat: e.target.value }))}
                className="w-full bg-neutral-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input 
                type="number" 
                placeholder="Longitude"
                value={tempCoords.lng}
                onChange={(e) => setTempCoords(prev => ({ ...prev, lng: e.target.value }))}
                className="w-full bg-neutral-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={applyMockLocation} className="w-full bg-blue-600 py-3 rounded-xl font-bold text-sm">Override GPS</button>
              <button onClick={resetToRealGPS} className="w-full bg-neutral-800 py-3 rounded-xl font-bold text-xs text-neutral-400">Restore Real GPS</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-5">
          <div className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-2xl mt-10 mb-6 bg-neutral-900">
            {previewMedia.type === 'photo' ? (
              <img src={previewMedia.url} className="h-full w-full object-contain" />
            ) : (
              <video src={previewMedia.url} className="h-full w-full object-contain" controls autoPlay loop />
            )}
          </div>
          <div className="w-full grid grid-cols-2 gap-3 h-16">
            <button onClick={handleDiscardMedia} className="bg-neutral-800 rounded-xl font-bold text-sm">Discard</button>
            <button onClick={handleSaveMedia} className="bg-blue-600 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20">Save</button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default App;
