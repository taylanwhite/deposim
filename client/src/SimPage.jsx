import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useConversation } from '@elevenlabs/react';

const API = '/api';

/* ===== Circular audio visualizer (wavelength indicator) ===== */
function AudioVisualizer({ getInputData, getOutputData, isSpeaking }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const inputData = getInputData?.();
      const outputData = getOutputData?.();
      const hasInput = inputData && inputData.length > 0;
      const hasOutput = outputData && outputData.length > 0;

      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 8;
      const barCount = 64;
      const smoothing = 0.7;
      const t = Date.now() / 1000;

      let prevInput = (canvas._prevInput = canvas._prevInput || new Uint8Array(barCount));
      let prevOutput = (canvas._prevOutput = canvas._prevOutput || new Uint8Array(barCount));

      for (let i = 0; i < barCount; i++) {
        let combined = 0;
        if (hasInput || hasOutput) {
          const inputIdx = hasInput ? Math.floor((i / barCount) * inputData.length) : 0;
          const outputIdx = hasOutput ? Math.floor((i / barCount) * outputData.length) : 0;
          const inputVal = hasInput ? inputData[inputIdx] / 255 : 0;
          const outputVal = hasOutput ? outputData[outputIdx] / 255 : 0;
          combined = Math.max(inputVal * 0.6, outputVal) * (isSpeaking ? 1.2 : 0.8);
        } else {
          // Idle animation — stronger pulse when agent is speaking
          const base = 0.15 + 0.08 * Math.sin(t * 2 + i * 0.2);
          const speakingBoost = isSpeaking ? 0.4 + 0.25 * Math.sin(t * 3) : 0;
          combined = (base + speakingBoost);
        }
        prevInput[i] = prevInput[i] * smoothing + combined * (1 - smoothing);
        prevOutput[i] = prevOutput[i] * smoothing + combined * (1 - smoothing);
      }
      canvas._prevInput = prevInput;
      canvas._prevOutput = prevOutput;

      for (let i = 0; i < barCount; i++) {
        const val = Math.max(prevInput[i], prevOutput[i]);
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const innerR = radius * 0.25;
        const barLen = innerR + val * radius * 0.65;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * barLen;
        const y2 = cy + Math.sin(angle) * barLen;

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `rgba(255,255,255,${0.3 + val * 0.7})`);
        gradient.addColorStop(0.4, `rgba(190,41,236,${0.2 + val * 0.6})`);
        gradient.addColorStop(1, `rgba(98,54,255,${0.1 + val * 0.5})`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [getInputData, getOutputData, isSpeaking]);

  return (
    <div className="sim-visualizer-wrap">
      <canvas ref={canvasRef} className="sim-visualizer" />
      <div className="sim-visualizer-phone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </div>
    </div>
  );
}

function SimPage() {
  const { caseId } = useParams();
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [phase, setPhase] = useState('consent'); // consent | ready | calling | postcall
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [postCallMessage, setPostCallMessage] = useState('');
  const [messages, setMessages] = useState([]); // { role: 'user'|'agent', text: string }[]
  const messagesEndRef = useRef(null);

  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const pipVideoRef = useRef(null);
  const conversationIdRef = useRef(null);

  // Fetch signed URL + config when caseId is set
  useEffect(() => {
    if (!caseId) return;
    fetch(API + '/sim/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setConfig(d);
      })
      .catch((err) => setConfigError(err.message));
  }, [caseId]);

  const handleConnect = useCallback(() => {
    setPhase('calling');
    setMessages([]);
    recordedChunks.current = [];
    if (cameraStream && pipVideoRef.current) {
      pipVideoRef.current.srcObject = cameraStream;
      try {
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4';
        mediaRecorder.current = new MediaRecorder(cameraStream, { mimeType });
        mediaRecorder.current.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.current.push(e.data);
        };
        mediaRecorder.current.start(5000);
      } catch (err) {
        console.warn('[DepoSim] MediaRecorder start failed:', err);
      }
    }
  }, [cameraStream]);

  const handleDisconnect = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    setPhase('postcall');

    const chunks = recordedChunks.current;
    const convId = conversationIdRef.current || '';
    const useCaseId = !convId && caseId;

    if (chunks.length > 0 && (convId || useCaseId)) {
      setPostCallMessage('uploading');
      const blob = new Blob(chunks, {
        type: (mediaRecorder.current?.mimeType) || 'video/webm',
      });
      const formData = new FormData();
      formData.append('video', blob, 'body-recording.webm');
      const url = convId
        ? `${API}/simulations/by-conversation/video?conversationId=${encodeURIComponent(convId)}&caseId=${encodeURIComponent(caseId)}`
        : `${API}/simulations/by-case/video?caseId=${encodeURIComponent(caseId)}`;

      fetch(url, { method: 'POST', body: formData })
        .then((r) => r.json())
        .then((d) => setPostCallMessage(d.ok ? 'complete' : `error: ${d.error || 'Upload failed'}`))
        .catch((err) => setPostCallMessage(`error: ${err.message}`));
    } else {
      setPostCallMessage('complete');
    }
  }, [cameraStream, caseId]);

  useEffect(() => {
    if ((phase === 'ready' || phase === 'calling') && cameraStream && pipVideoRef.current) {
      pipVideoRef.current.srcObject = cameraStream;
    }
  }, [phase, cameraStream]);

  const handleMessage = useCallback((event) => {
    if (!event) return;
    // Normalized format from React SDK: { source: 'ai'|'user', role, message }
    if (event.source === 'ai' && event.role === 'agent' && event.message) {
      setMessages((prev) => [...prev.filter((m) => m.role !== 'agent_streaming'), { role: 'agent', text: event.message }]);
      return;
    }
    if (event.source === 'user' && event.message) {
      setMessages((prev) => [...prev.filter((m) => m.role !== 'user_tentative'), { role: 'user', text: event.message }]);
      return;
    }
    // Raw WebSocket event format
    if (event.type === 'user_transcript' && event.user_transcription_event?.user_transcript) {
      setMessages((prev) => [...prev.filter((m) => m.role !== 'user_tentative'), { role: 'user', text: event.user_transcription_event.user_transcript }]);
    }
    if (event.type === 'tentative_user_transcript' && event.tentative_user_transcription_event?.user_transcript) {
      const txt = event.tentative_user_transcription_event.user_transcript;
      setMessages((prev) => {
        const rest = prev.filter((m) => m.role !== 'user_tentative');
        return [...rest, { role: 'user_tentative', text: txt }];
      });
    }
    if (event.type === 'agent_response' && event.agent_response_event?.agent_response) {
      setMessages((prev) => [...prev.filter((m) => m.role !== 'agent_streaming'), { role: 'agent', text: event.agent_response_event.agent_response }]);
    }
    if (event.type === 'agent_chat_response_part' && event.text_response_part?.text) {
      setMessages((prev) => {
        const rest = prev.filter((m) => m.role !== 'agent_streaming');
        const last = prev[prev.length - 1];
        const append = last?.role === 'agent_streaming' ? last.text + event.text_response_part.text : event.text_response_part.text;
        return [...rest, { role: 'agent_streaming', text: append }];
      });
    }
  }, []);

  const handleAgentChatPart = useCallback((part) => {
    if (!part) return;
    if (part.type === 'stop') {
      setMessages((prev) => {
        const rest = prev.filter((m) => m.role !== 'agent_streaming');
        const last = prev.find((m) => m.role === 'agent_streaming');
        if (last?.text) return [...rest, { role: 'agent', text: last.text }];
        return prev;
      });
      return;
    }
    if (part.text) {
      setMessages((prev) => {
        const rest = prev.filter((m) => m.role !== 'agent_streaming');
        const last = prev[prev.length - 1];
        const append = part.type === 'start' ? part.text : (last?.role === 'agent_streaming' ? last.text + part.text : part.text);
        return [...rest, { role: 'agent_streaming', text: append }];
      });
    }
  }, []);

  const conversation = useConversation({
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onMessage: handleMessage,
    onAgentChatResponsePart: handleAgentChatPart,
    onError: (err) => {
      console.error('[DepoSim] Conversation error:', err);
      setPhase('postcall');
      setPostCallMessage(`error: ${err?.message || 'Unknown error'}`);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const requestCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      setCameraStream(stream);
      setPhase('ready');
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || /denied/i.test(err.message);
      setCameraError(denied ? 'denied' : err.message);
    }
  };

  const startCall = async () => {
    if (!config?.signedUrl || !config?.dynamicVariables) return;
    try {
      conversationIdRef.current = null;
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const id = await conversation.startSession({
        signedUrl: config.signedUrl,
        connectionType: 'websocket',
        overrides: {
          agent: {
            prompt: { prompt: config.dynamicVariables.depo_prompt },
            firstMessage: config.dynamicVariables.first_message,
            language: 'en',
          },
          conversation: {
            // Explicitly enable transcript/response events (not all enabled by default)
            client_events: [
              'user_transcript',
              'tentative_user_transcript',
              'agent_response',
              'agent_chat_response_part',
            ],
          },
        },
        dynamicVariables: config.dynamicVariables,
      });
      conversationIdRef.current = id || null;
    } catch (err) {
      console.error('[DepoSim] Start session failed:', err);
      setPhase('ready');
    }
  };

  const endCall = () => {
    conversation.endSession?.();
  };

  if (!caseId) {
    return (
      <div className="sim-page">
        <div className="sim-consent">
          <p>No case selected. <Link to="/">Back to app</Link></p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="sim-page">
        <div className="sim-consent">
          <h1>DepoSim</h1>
          <p style={{ color: '#ed4956' }}>{configError}</p>
          <Link to="/" className="sim-btn">Back to app</Link>
        </div>
      </div>
    );
  }

  // Consent phase
  if (phase === 'consent') {
    return (
      <div className="sim-page sim-page-dark">
        <div className="sim-consent">
          <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          <h1>Prepare for Your Simulation</h1>
          <p className="sim-subtitle">We need camera and microphone access for body language analysis during the deposition.</p>
          <div className="sim-features">
            <div className="sim-feature">
              <span className="sim-feat-icon">📋</span>
              <span><strong>Body Language</strong> — We analyze posture, gestures, and stress indicators.</span>
            </div>
            <div className="sim-feature">
              <span className="sim-feat-icon">📊</span>
              <span><strong>Post-Session Report</strong> — Detailed breakdown after the simulation.</span>
            </div>
            <div className="sim-feature">
              <span className="sim-feat-icon">🔒</span>
              <span><strong>Private</strong> — Video is processed for analysis only, not stored.</span>
            </div>
          </div>
          {cameraError === 'denied' && (
            <div className="sim-camera-denied">
              <strong>Camera blocked</strong>
              <ol>
                <li>Click the lock icon in your address bar</li>
                <li>Set Camera to Allow</li>
                <li>Reload this page</li>
              </ol>
              <button onClick={() => window.location.reload()}>Reload Page</button>
            </div>
          )}
          {cameraError && cameraError !== 'denied' && (
            <p style={{ color: '#ed4956', fontSize: 14 }}>{cameraError}</p>
          )}
          <button className="sim-btn sim-btn-primary" onClick={requestCamera} disabled={!config}>
            Enable Camera & Microphone
          </button>
        </div>
      </div>
    );
  }

  // Ready to start call
  if (phase === 'ready') {
    return (
      <div className="sim-page sim-page-dark">
        <div className="sim-consent">
          <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          <h1>Ready</h1>
          <p className="sim-subtitle">Camera active. Tap below to start your deposition simulation.</p>
          <div className="sim-preview-wrap">
            <video ref={pipVideoRef} autoPlay muted playsInline />
          </div>
          <button className="sim-btn sim-btn-start" onClick={startCall}>
            Start Simulation
          </button>
        </div>
      </div>
    );
  }

  // Calling
  if (phase === 'calling') {
    return (
      <div className="sim-page sim-calling">
        <div className="sim-header">
          <Link to="/" className="sim-back">← Back</Link>
          <div className="sim-header-info">
            <span className="sim-case-num">Case #{config?.case?.caseNumber || '—'}</span>
            <span className="sim-deponent">{config?.case?.name || 'Deponent'}</span>
          </div>
        </div>

        <div className="sim-call-area">
          <AudioVisualizer
            getInputData={conversation.getInputByteFrequencyData}
            getOutputData={conversation.getOutputByteFrequencyData}
            isSpeaking={conversation.isSpeaking}
          />
          <div className="sim-call-prompt">
            <p>Speak normally — the AI opposing counsel will respond.</p>
            <p className="sim-cta">When finished, tap End Call below.</p>
          </div>

          <div className="sim-conversation-history">
            <h4>Conversation</h4>
            <div className="sim-messages">
              {messages.length === 0 && (
                <p className="sim-messages-empty">Messages will appear here as you speak.</p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`sim-msg sim-msg-${m.role}${m.role === 'user_tentative' || m.role === 'agent_streaming' ? ' sim-msg-streaming' : ''}`}
                >
                  <span className="sim-msg-role">{m.role === 'user' || m.role === 'user_tentative' ? 'You' : 'Counsel'}</span>
                  <span className="sim-msg-text">
                    {m.text}
                    {(m.role === 'user_tentative' || m.role === 'agent_streaming') && <span className="sim-msg-cursor" />}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <button className="sim-btn-end" onClick={endCall}>
            End Call & Upload
          </button>
        </div>

        {/* PiP camera */}
        <div className="sim-pip">
          <video ref={pipVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          <span className="sim-pip-label">You</span>
        </div>
      </div>
    );
  }

  // Post-call
  return (
    <div className="sim-page">
      <div className="sim-postcall">
        <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
        <div className="sim-postcall-case">Case #{config?.case?.caseNumber || '—'}</div>
        <div className="sim-postcall-name">{config?.case?.name || 'Deponent'}</div>
        <div className="sim-postcall-status">Session Complete</div>
        <div className="sim-postcall-body">
          {postCallMessage === 'uploading' && (
            <p>Uploading simulation analysis… Results will appear in your simulation detail.</p>
          )}
          {postCallMessage === 'complete' && (
            <p>View your simulation results and analysis in the app.</p>
          )}
          {postCallMessage.startsWith('error:') && (
            <p style={{ color: '#ed4956' }}>{postCallMessage}</p>
          )}
        </div>
        <Link to="/" className="sim-btn">Back to Cases</Link>
      </div>
    </div>
  );
}

export default SimPage;
