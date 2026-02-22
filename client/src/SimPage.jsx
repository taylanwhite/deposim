import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useConversation } from '@elevenlabs/react';
import { uploadRecordingToS3 } from './lib/s3MultipartUpload';
import { useT, useLangPrefix } from './i18n/LanguageContext';

const API = '/api';
const CONSENT_KEY = (caseId) => `deposim_consent_${caseId}`;

function SimPage() {
  const { caseId, stage: stageParam } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const prefix = useLangPrefix();
  const stageNum = Math.max(1, Math.min(4, parseInt(stageParam, 10) || 1));

  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [phase, setPhase] = useState(() => {
    try {
      if (caseId && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CONSENT_KEY(caseId))) return 'ready';
    } catch (_) {}
    return 'consent';
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stageData, setStageData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const effectiveStage = stageData?.currentStage ?? stageNum;
  const totalStages = stageData?.stages?.length ?? 4;
  const messagesEndRef = useRef(null);

  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const conversationIdRef = useRef(null);
  const conversationRef = useRef(null);
  const redirectToStageRef = useRef(null);
  const touchStartX = useRef(null);

  const requestCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setPhase('ready');
      try {
        if (caseId) sessionStorage.setItem(CONSENT_KEY(caseId), '1');
      } catch (_) {}
      if (caseId) {
        fetch(`${API}/cases/${caseId}/record-consent`, { method: 'POST' }).catch(() => {});
      }
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || /denied/i.test(err.message);
      setCameraError(denied ? 'denied' : err.message);
    }
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    setConfig(null);
    setConfigError(null);
    fetch(API + '/sim/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, stage: effectiveStage }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setConfig(d);
      })
      .catch((err) => setConfigError(err.message));
  }, [caseId, effectiveStage]);

  useEffect(() => {
    if (!caseId) return;
    const url = userRole === 'client'
      ? `${API}/client/cases/${caseId}/stages`
      : `${API}/cases/${caseId}/stages`;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStageData)
      .catch(() => {});
  }, [caseId, userRole]);

  useEffect(() => {
    fetch(`${API}/client/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUserRole(d?.accessLevel === 'client' ? 'client' : 'staff'))
      .catch(() => setUserRole('staff'));
  }, []);

  // Re-request camera when landing on a new stage with consent already given
  useEffect(() => {
    if (phase === 'ready' && !cameraStream && caseId && typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CONSENT_KEY(caseId))) {
      requestCamera();
    }
  }, [phase, caseId, cameraStream, requestCamera]);

  // Redirect after saving: either to another stage (swipe/chevron) or to case (Back to Case)
  useEffect(() => {
    if (phase !== 'saving') return;
    const toStage = redirectToStageRef.current;
    if (toStage != null) {
      redirectToStageRef.current = null;
      const path = `${prefix}/sim/${caseId}/stage/${toStage}`.replace(/\/+/g, '/');
      navigate(path, { replace: true });
      return;
    }
    const timer = setTimeout(() => {
      const dest = userRole === 'client'
        ? `${prefix}/client/cases/${caseId}`
        : `${prefix}/cases/${caseId}`;
      navigate(dest);
    }, 2000);
    return () => clearTimeout(timer);
  }, [phase, userRole, prefix, caseId, navigate]);

  const handleConnect = useCallback(
    (props) => {
      if (props?.conversationId) conversationIdRef.current = props.conversationId;
      setPhase('calling');
      setMessages([]);
      recordedChunks.current = [];
      if (videoRef.current) videoRef.current.srcObject = cameraStream;
      if (cameraStream) {
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
          mediaRecorder.current.start(1000);
        } catch (err) {
          console.warn('[DepoSim] MediaRecorder start failed:', err);
        }
      }
    },
    [cameraStream],
  );

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
    }
    cameraStreamRef.current = null;
    setCameraStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
    stopCamera();
    setPhase('saving');

    // Fire-and-forget upload
    const chunks = recordedChunks.current;
    const convId = conversationIdRef.current || conversationRef.current?.getId?.() || '';
    if (chunks.length > 0 && (convId || caseId)) {
      const blob = new Blob(chunks, {
        type: mediaRecorder.current?.mimeType || 'video/webm',
      });
      uploadRecordingToS3(blob, {
        conversationId: convId || undefined,
        caseId,
      }).catch((err) => console.warn('[DepoSim] Upload error:', err));
    }

    // Fire-and-forget: poll for sim then trigger server-side evaluation
    const capturedCaseId = caseId;
    const capturedStage = effectiveStage;
    (async () => {
      try {
        let simId = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((r) => setTimeout(r, attempt === 0 ? 5000 : 3000));
          const resp = await fetch(`${API}/cases/${capturedCaseId}/stages`);
          if (!resp.ok) continue;
          const data = await resp.json();
          const stageInfo = data.stages?.find((s) => s.stage === capturedStage);
          if (stageInfo?.simulationId) {
            simId = stageInfo.simulationId;
            break;
          }
        }
        if (simId) {
          fetch(`${API}/cases/${capturedCaseId}/stage-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ simulationId: simId }),
          }).catch(() => {});
          fetch(`${API}/simulations/${simId}/evaluate-stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => {});
        }
      } catch { /* background evaluation - safe to ignore */ }
    })();
  }, [stopCamera, caseId, effectiveStage]);

  useEffect(() => {
    if ((phase === 'ready' || phase === 'calling') && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [phase, cameraStream]);

  const handleMessage = useCallback((event) => {
    if (!event) return;
    if (event.source === 'ai' && event.role === 'agent' && event.message) {
      setMessages((prev) => [...prev.filter((m) => m.role !== 'agent_streaming'), { role: 'agent', text: event.message }]);
      return;
    }
    if (event.source === 'user' && event.message) {
      setMessages((prev) => [...prev.filter((m) => m.role !== 'user_tentative'), { role: 'user', text: event.message }]);
      return;
    }
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
        const append = part.type === 'start' ? part.text : last?.role === 'agent_streaming' ? last.text + part.text : part.text;
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
      setPhase('saving');
    },
  });
  conversationRef.current = conversation;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
            client_events: ['user_transcript', 'tentative_user_transcript', 'agent_response', 'agent_chat_response_part'],
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
    stopCamera();
    conversation.endSession?.();
  };

  const goToPrevStage = () => {
    if (effectiveStage <= 1) return;
    redirectToStageRef.current = effectiveStage - 1;
    endCall();
  };

  const goToNextStage = () => {
    if (effectiveStage >= totalStages) return;
    redirectToStageRef.current = effectiveStage + 1;
    endCall();
  };

  const goBackToCase = () => {
    redirectToStageRef.current = null;
    endCall();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e) => {
    const startX = touchStartX.current;
    if (startX == null) return;
    touchStartX.current = null;
    const endX = e.changedTouches?.[0]?.clientX;
    if (endX == null) return;
    const delta = endX - startX;
    const threshold = 60;
    if (delta < -threshold) goToNextStage();
    else if (delta > threshold) goToPrevStage();
  };

  if (!caseId) {
    return (
      <div className="sim-page">
        <div className="sim-consent">
          <p>{t('common.noCase')} <Link to={`${prefix}/cases`}>{t('common.backToApp')}</Link></p>
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
          <Link to={`${prefix}/cases`} className="sim-btn">{t('common.backToApp')}</Link>
        </div>
      </div>
    );
  }

  // Consent phase — mic/cam enable splash
  if (phase === 'consent') {
    return (
      <div className="sim-page sim-page-dark">
        <div className="sim-consent">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          </a>
          <h1>{t('sim.consent.title')}</h1>
          <p className="sim-subtitle">{t('sim.consent.subtitle')}</p>
          <div className="sim-features">
            <div className="sim-feature">
              <span className="sim-feat-icon">📋</span>
              <span><strong>{t('sim.consent.bodyLanguage')}</strong> — {t('sim.consent.bodyLanguageDesc')}</span>
            </div>
            <div className="sim-feature">
              <span className="sim-feat-icon">📊</span>
              <span><strong>{t('sim.consent.report')}</strong> — {t('sim.consent.reportDesc')}</span>
            </div>
          </div>
          {cameraError === 'denied' && (
            <div className="sim-camera-denied">
              <strong>{t('sim.consent.cameraBlocked')}</strong>
              <ol>
                <li>{t('sim.consent.cameraBlockedStep1')}</li>
                <li>{t('sim.consent.cameraBlockedStep2')}</li>
                <li>{t('sim.consent.cameraBlockedStep3')}</li>
              </ol>
              <button onClick={() => window.location.reload()}>{t('sim.consent.reloadPage')}</button>
            </div>
          )}
          {cameraError && cameraError !== 'denied' && <p style={{ color: '#ed4956', fontSize: 14 }}>{cameraError}</p>}
          <button className="sim-btn sim-btn-primary" onClick={requestCamera} disabled={!config}>
            {t('sim.consent.enableCamera')}
          </button>
        </div>
      </div>
    );
  }

  // Ready phase — video/audio test
  if (phase === 'ready') {
    return (
      <div className="sim-page">
        <div className="sim-consent">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          </a>
          <div className="sim-preview-wrap">
            <video ref={videoRef} autoPlay muted playsInline />
          </div>
          <button className="sim-btn sim-btn-start sim-btn-primary" onClick={startCall} disabled={!config}>
            {t('sim.ready.start')}
          </button>
        </div>
      </div>
    );
  }

  // Calling phase — sim screen: white header (logo) | full-width video | thread | bottom nav (prev | Back to Case | next)
  if (phase === 'calling') {
    const canPrev = effectiveStage > 1;
    const canNext = effectiveStage < totalStages;
    return (
      <div
        className="sim-page sim-calling sim-calling-white"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className="sim-calling-header">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer" className="sim-calling-logo-link">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-calling-logo" />
          </a>
        </header>
        <video ref={videoRef} autoPlay muted playsInline className="sim-calling-video" />
        <div className="sim-calling-thread">
          <div className="sim-messages sim-messages-full">
            {messages.length === 0 && <p className="sim-messages-empty">{t('sim.calling.messagesEmpty')}</p>}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`sim-msg sim-msg-${m.role}${m.role === 'user_tentative' || m.role === 'agent_streaming' ? ' sim-msg-streaming' : ''}`}
              >
                <span className="sim-msg-role">{m.role === 'user' || m.role === 'user_tentative' ? t('sim.calling.you') : t('sim.calling.counsel')}</span>
                <span className="sim-msg-text">
                  {m.text}
                  {(m.role === 'user_tentative' || m.role === 'agent_streaming') && <span className="sim-msg-cursor" />}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
        <nav className="sim-calling-nav">
          <button
            type="button"
            className="sim-calling-chevron"
            onClick={goToPrevStage}
            disabled={!canPrev}
            aria-label={t('sim.nav.prevStage')}
            title={t('sim.nav.prevStage')}
          >
            ‹
          </button>
          <button type="button" className="sim-btn sim-btn-back-to-case" onClick={goBackToCase}>
            {t('sim.nav.backToCase')}
          </button>
          <button
            type="button"
            className="sim-calling-chevron"
            onClick={goToNextStage}
            disabled={!canNext}
            aria-label={t('sim.nav.nextStage')}
            title={t('sim.nav.nextStage')}
          >
            ›
          </button>
        </nav>
      </div>
    );
  }

  // Saving phase — brief transition before redirect to case page
  return (
    <div className="sim-page sim-page-dark">
      <div className="sim-saving">
        <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
        <div className="sim-saving-spinner" />
        <p className="sim-saving-text">{t('sim.saving')}</p>
      </div>
    </div>
  );
}

export default SimPage;
