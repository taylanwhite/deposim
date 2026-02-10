import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * WebcamRecorder – captures video from the user's camera at 640x480.
 *
 * Props:
 *   onRecordingComplete(blob: Blob) – called with the recorded video blob
 *   disabled: boolean – disables start/stop buttons
 */
export default function WebcamRecorder({ onRecordingComplete, disabled = false }) {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const [state, setState] = useState('idle'); // idle | previewing | recording | done
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopStream();
      clearInterval(timerRef.current);
    };
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startPreview = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setState('previewing');
    } catch (err) {
      setError('Camera access denied: ' + err.message);
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setElapsed(0);

    // Prefer webm (widely supported in browsers)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType,
      videoBitsPerSecond: 1_000_000, // 1 Mbps – keeps file small at 640x480
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onRecordingComplete(blob);
      setState('done');
      clearInterval(timerRef.current);
    };

    recorder.start(1000); // collect data every second
    mediaRecorderRef.current = recorder;
    setState('recording');

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopStream();
  }, []);

  const reset = useCallback(() => {
    stopStream();
    clearInterval(timerRef.current);
    chunksRef.current = [];
    setState('idle');
    setElapsed(0);
    setError(null);
  }, []);

  const formatTime = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="webcam-recorder">
      {/* Video preview */}
      <div className="webcam-preview-wrap">
        <video
          ref={videoRef}
          className="webcam-preview"
          autoPlay
          muted
          playsInline
          style={{ display: state === 'idle' || state === 'done' ? 'none' : 'block' }}
        />
        {state === 'idle' && (
          <div className="webcam-placeholder">
            <span>Camera off</span>
          </div>
        )}
        {state === 'done' && (
          <div className="webcam-placeholder done">
            <span>Recording complete</span>
          </div>
        )}
        {state === 'recording' && (
          <div className="webcam-timer">{formatTime(elapsed)}</div>
        )}
      </div>

      {/* Controls */}
      <div className="webcam-controls">
        {state === 'idle' && (
          <button type="button" className="btn" onClick={startPreview} disabled={disabled}>
            Start Camera
          </button>
        )}
        {state === 'previewing' && (
          <>
            <button type="button" className="btn primary rec-btn" onClick={startRecording} disabled={disabled}>
              Record
            </button>
            <button type="button" className="btn" onClick={reset}>
              Cancel
            </button>
          </>
        )}
        {state === 'recording' && (
          <button type="button" className="btn stop-btn" onClick={stopRecording} disabled={disabled}>
            Stop Recording
          </button>
        )}
        {state === 'done' && (
          <button type="button" className="btn" onClick={reset} disabled={disabled}>
            Record Again
          </button>
        )}
      </div>

      {error && <p className="error-text" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
