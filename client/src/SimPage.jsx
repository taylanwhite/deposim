import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useConversation } from '@elevenlabs/react';
import { uploadRecordingToS3 } from './lib/s3MultipartUpload';
import { useT, useLangPrefix } from './i18n/LanguageContext';

const API = '/api';
const CONSENT_KEY = (caseId) => `deposim_consent_${caseId}`;

function stopStreamTracks(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (_) {}
  });
}

/**
 * Create an audio mixer that captures both microphone input and the
 * ElevenLabs agent voice into a single MediaStream for recording.
 *
 * The ElevenLabs SDK plays agent audio through a hidden <audio> element
 * appended to document.body, with srcObject set to a MediaStreamDestination
 * stream. We detect that element (via MutationObserver + polling) and feed
 * its stream into our AudioContext mixer alongside the mic tracks.
 */
function createAudioCapture(micTracks) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const dest = ctx.createMediaStreamDestination();
  const ownMicTracks = [...micTracks];

  if (micTracks.length > 0) {
    const micSource = ctx.createMediaStreamSource(new MediaStream(micTracks));
    micSource.connect(dest);
  }

  let agentConnected = false;

  function tryConnectAgentAudio(el) {
    if (agentConnected) return;
    const stream = el.srcObject;
    if (!(stream instanceof MediaStream)) return;
    if (stream.getAudioTracks().length === 0) return;
    try {
      const src = ctx.createMediaStreamSource(stream);
      src.connect(dest);
      agentConnected = true;
      console.log('[DepoSim] Agent audio connected to recording mixer');
    } catch (e) {
      console.warn('[DepoSim] Failed to connect agent audio:', e);
    }
  }

  function scan() {
    if (agentConnected) return;
    document.querySelectorAll('audio').forEach(tryConnectAgentAudio);
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });

  const pollId = setInterval(() => {
    scan();
    if (agentConnected) clearInterval(pollId);
  }, 150);

  const pollTimeout = setTimeout(() => {
    clearInterval(pollId);
    observer.disconnect();
  }, 30_000);

  return {
    stream: dest.stream,
    cleanup() {
      observer.disconnect();
      clearInterval(pollId);
      clearTimeout(pollTimeout);
      ownMicTracks.forEach((t) => { try { t.stop(); } catch (_) {} });
      try { ctx.close(); } catch (_) {}
    },
  };
}

function SimPage() {
  const { caseId, stage: stageParam } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const prefix = useLangPrefix();
  const stageNum = Math.max(1, Math.min(4, parseInt(stageParam, 10) || 1));

  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [phase, setPhase] = useState('consent');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stageData, setStageData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [manualStageSelect, setManualStageSelect] = useState(false);
  const messagesEndRef = useRef(null);

  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const conversationIdRef = useRef(null);
  const conversationRef = useRef(null);
  const configRef = useRef(null);
  const uploadStartedRef = useRef(false);
  const doVideoUploadRef = useRef(null);
  const redirectToStageRef = useRef(null);
  const prevStageNum = useRef(stageNum);
  const sessionActive = useRef(false);
  const endingRef = useRef(false);
  const finishRecordingRef = useRef(null);
  const audioCaptureRef = useRef(null);

  // When user leaves the tab/page (close, navigate away, or browser back), stop camera
  useEffect(() => {
    const stopCameraNow = () => {
      const stream = cameraStreamRef.current;
      stopStreamTracks(stream);
      cameraStreamRef.current = null;
      setCameraStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    const onHide = stopCameraNow;
    const onPopState = () => {
      // Browser back/forward: stop camera immediately so the light goes off
      stopCameraNow();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const requestCamera = useCallback(async (options = {}) => {
    const { keepPhase } = options;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      if (!keepPhase) setPhase('ready');
      if (!keepPhase) {
        try {
          if (caseId) sessionStorage.setItem(CONSENT_KEY(caseId), '1');
        } catch (_) {}
        if (caseId) {
          fetch(`${API}/cases/${caseId}/record-consent`, { method: 'POST' }).catch(() => {});
        }
      }
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || /denied/i.test(err.message);
      setCameraError(denied ? 'denied' : err.message);
    }
  }, [caseId]);

  // FIX #1: Use stageNum from URL directly — never override with currentStage
  useEffect(() => {
    if (!caseId) return;
    setConfig(null);
    setConfigError(null);
    fetch(API + '/sim/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, stage: stageNum, simulationId: stageData?.simulationId || undefined }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setConfig(d);
      })
      .catch((err) => setConfigError(err.message));
  }, [caseId, stageNum, stageData?.simulationId]);

  useEffect(() => { configRef.current = config; }, [config]);

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

  // FIX #3: Reset state when stageParam changes (navigating between stages)
  useEffect(() => {
    if (prevStageNum.current === stageNum) return;
    prevStageNum.current = stageNum;
    setMessages([]);
    setConfig(null);
    sessionActive.current = false;
    startingRef.current = false;
    setIsStarting(false);
    setManualStageSelect(false);
    recordedChunks.current = [];
    const hasConsent = typeof sessionStorage !== 'undefined' && caseId && sessionStorage.getItem(CONSENT_KEY(caseId));
    if (hasConsent) {
      setPhase('ready');
      if (!cameraStreamRef.current) requestCamera();
    } else {
      setPhase('consent');
    }
  }, [stageNum, caseId, requestCamera]);

  // Redirect after saving
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
      sessionActive.current = true;
      uploadStartedRef.current = false;
      endingRef.current = false;
      setPhase('calling');
      setMessages([]);
      recordedChunks.current = [];
      if (videoRef.current && cameraStreamRef.current) {
        videoRef.current.srcObject = cameraStreamRef.current;
      }
      const stream = cameraStreamRef.current;
      if (stream) {
        try {
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
              ? 'video/webm;codecs=vp8,opus'
              : MediaRecorder.isTypeSupported('video/webm')
                ? 'video/webm'
                : 'video/mp4';
          const videoTracks = stream.getVideoTracks().filter(t => t.readyState === 'live');
          const audioTracks = audioCaptureRef.current?.stream.getAudioTracks() || [];
          if (videoTracks.length === 0) {
            console.error('[DepoSim] No live video tracks for recording');
          } else {
            const recordingStream = new MediaStream([...videoTracks, ...audioTracks]);
            mediaRecorder.current = new MediaRecorder(recordingStream, { mimeType });
            mediaRecorder.current.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) recordedChunks.current.push(e.data);
            };
            mediaRecorder.current.onstop = () => {
              console.log('[DepoSim] MediaRecorder stopped, chunks:', recordedChunks.current.length);
              if (!endingRef.current) finishRecordingRef.current?.();
            };
            mediaRecorder.current.start(1000);
            console.log('[DepoSim] MediaRecorder started', { mimeType, tracks: recordingStream.getTracks().map(t => `${t.kind}:${t.readyState}`) });
            videoTracks[0].addEventListener('ended', () => {
              console.warn('[DepoSim] Video track ended during session, chunks so far:', recordedChunks.current.length);
            }, { once: true });
          }
        } catch (err) {
          console.warn('[DepoSim] MediaRecorder start failed:', err);
        }
      }
    },
    [],
  );

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    stopStreamTracks(stream);
    cameraStreamRef.current = null;
    setCameraStream(null);
    audioCaptureRef.current?.cleanup();
    audioCaptureRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Stop camera when entering saving phase
  useEffect(() => {
    if (phase === 'saving') stopCamera();
  }, [phase, stopCamera]);

  // Stop camera on unmount only (avoids Strict Mode double-mount killing the stream)
  const mountedAtRef = useRef(null);
  useEffect(() => {
    mountedAtRef.current = Date.now();
    return () => {
      if (mountedAtRef.current != null && Date.now() - mountedAtRef.current > 300) {
        stopCamera();
      }
    };
  }, [stopCamera]);

  const fireAndForgetEvaluation = useCallback(() => {
    const capturedCaseId = caseId;
    const capturedStage = stageNum;
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
            body: JSON.stringify({ simulationId: simId, stage: capturedStage }),
          }).catch(() => {});
          fetch(`${API}/simulations/${simId}/evaluate-stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage: capturedStage }),
          }).catch(() => {});
        }
      } catch { /* background evaluation - safe to ignore */ }
    })();
  }, [caseId, stageNum]);

  const doVideoUpload = useCallback(() => {
    if (uploadStartedRef.current) return;
    const chunks = recordedChunks.current;
    if (!caseId || chunks.length === 0) {
      console.warn('[DepoSim] doVideoUpload: skipped', { caseId, chunks: chunks.length });
      return;
    }
    uploadStartedRef.current = true;
    const mimeType = mediaRecorder.current?.mimeType || 'video/webm';
    const blob = new Blob(chunks, { type: mimeType });
    const convId = conversationIdRef.current || conversationRef.current?.getId?.() || '';
    console.log('[DepoSim] Starting video upload', { chunks: chunks.length, size: blob.size, simulationId: configRef.current?.simulationId, stage: stageNum });
    uploadRecordingToS3(blob, {
      simulationId: configRef.current?.simulationId || undefined,
      conversationId: convId || undefined,
      caseId,
      stage: stageNum,
    }).catch((err) => console.warn('[DepoSim] Upload error:', err));
  }, [caseId, stageNum]);
  doVideoUploadRef.current = doVideoUpload;

  const finishRecording = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    try {
      const recorder = mediaRecorder.current;
      if (recorder && recorder.state !== 'inactive') {
        await Promise.race([
          new Promise((resolve) => {
            recorder.addEventListener('stop', resolve, { once: true });
            try { recorder.stop(); } catch (_) { resolve(); }
          }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }

      console.log('[DepoSim] finishRecording: flushed', {
        chunks: recordedChunks.current.length,
        tracks: cameraStreamRef.current?.getTracks().map(t => `${t.kind}:${t.readyState}`),
      });

      doVideoUploadRef.current?.();

      sessionActive.current = false;
      try { conversationRef.current?.endSession?.(); } catch (_) {}

      stopCamera();
      fireAndForgetEvaluation();
      setPhase('saving');
    } catch (err) {
      console.error('[DepoSim] finishRecording error:', err);
      stopCamera();
      setPhase('saving');
    }
  }, [stopCamera, fireAndForgetEvaluation]);
  finishRecordingRef.current = finishRecording;

  const handleDisconnect = useCallback(() => {
    finishRecordingRef.current?.();
  }, []);

  // Attach stream to video whenever we have one
  useEffect(() => {
    if ((phase === 'ready' || phase === 'calling') && videoRef.current) {
      const stream = cameraStreamRef.current || cameraStream;
      if (stream && stream.active) {
        videoRef.current.srcObject = stream;
      }
    }
  }, [phase, cameraStream]);

  // If we're in ready/calling but stream was cleared (e.g. Strict Mode), re-acquire camera
  const recoveringRef = useRef(false);
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'calling') return;
    if (cameraStreamRef.current) return;
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    requestCamera({ keepPhase: true })
      .finally(() => { recoveringRef.current = false; });
  }, [phase, requestCamera]);

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
      finishRecordingRef.current?.();
    },
  });
  conversationRef.current = conversation;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startingRef = useRef(false);
  const startCall = async () => {
    if (startingRef.current || isStarting) return;
    if (!config?.signedUrl || !config?.dynamicVariables) return;
    startingRef.current = true;
    setIsStarting(true);
    const dv = config.dynamicVariables;
    if (!dv.depo_prompt || !dv.first_message) {
      console.error('[DepoSim] Voice agent requires depo_prompt and first_message; they were not provided.');
      startingRef.current = false;
      setIsStarting(false);
      return;
    }
    try {
      // Set up audio capture (mic + agent output) before releasing mic for the SDK
      const stream = cameraStreamRef.current;
      if (stream) {
        const micClones = stream.getAudioTracks()
          .filter((t) => t.readyState === 'live')
          .map((t) => t.clone());
        stream.getAudioTracks().forEach((t) => t.stop());
        audioCaptureRef.current = createAudioCapture(micClones);
      }

      conversationIdRef.current = null;
      await conversation.startSession({
        signedUrl: config.signedUrl,
        connectionType: 'websocket',
        overrides: {
          agent: {
            language: 'en',
          },
          conversation: {
            client_events: ['user_transcript', 'tentative_user_transcript', 'agent_response', 'agent_chat_response_part'],
          },
        },
        dynamicVariables: config.dynamicVariables,
      });
    } catch (err) {
      console.error('[DepoSim] Start session failed:', err);
      startingRef.current = false;
      setIsStarting(false);
      setPhase('ready');
    }
  };

  const endCall = useCallback(() => {
    finishRecordingRef.current?.();
  }, []);

  const goBackToCase = () => {
    redirectToStageRef.current = null;
    endCall();
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

  if (phase === 'consent') {
    return (
      <div className="sim-page sim-calling-white">
        <div className="sim-consent">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          </a>
          <h1>{t('sim.consent.title')}</h1>
          <p className="sim-subtitle">{t('sim.consent.subtitle')}</p>
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
          <button className="sim-btn sim-btn-primary" onClick={requestCamera}>
            {t('sim.consent.enableCamera')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'ready') {
    const hasStream = !!(cameraStream && cameraStreamRef.current);
    const hasAttempted = stageData?.stages?.some(s => s.status === 'completed' || s.simulationId);
    const buttonLabel = (!hasAttempted || manualStageSelect) ? t('sim.ready.start') : t('sim.ready.start');
    const stageShortNames = [t('sim.stage.short1'), t('sim.stage.short2'), t('sim.stage.short3'), t('sim.stage.short4')];
    const casePath = userRole === 'client'
      ? `${prefix}/client/cases/${caseId}`
      : `${prefix}/cases/${caseId}`;
    return (
      <div className="sim-page sim-calling-white">
        <div className="sim-consent">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          </a>
          {!hasStream && cameraError ? (
            <>
              <div className="sim-camera-denied">
                <strong>{cameraError === 'denied' ? t('sim.consent.cameraBlocked') : t('sim.consent.permissionsRequired')}</strong>
                {cameraError === 'denied' ? (
                  <ol>
                    <li>{t('sim.consent.cameraBlockedStep1')}</li>
                    <li>{t('sim.consent.cameraBlockedStep2')}</li>
                    <li>{t('sim.consent.cameraBlockedStep3')}</li>
                  </ol>
                ) : (
                  <p>{t('sim.consent.permissionsRequired')}</p>
                )}
                {cameraError === 'denied' ? (
                  <button onClick={() => window.location.reload()}>{t('sim.consent.reloadPage')}</button>
                ) : (
                  <button onClick={requestCamera}>{t('sim.consent.retryPermissions')}</button>
                )}
              </div>
              {cameraError !== 'denied' && (
                <p style={{ color: '#ed4956', fontSize: 14, marginTop: 8 }}>{cameraError}</p>
              )}
            </>
          ) : (
            <div className="sim-preview-wrap">
              <video ref={videoRef} autoPlay muted playsInline />
            </div>
          )}
          {stageData?.stages && (
            <div className="stage-progress stage-progress-sim">
              {[1, 2, 3, 4].map((n, i) => {
                const stage = stageData.stages?.find(s => s.stage === n);
                const status = stage?.status || (n === 1 ? 'available' : 'locked');
                const isCurrent = n === stageNum;
                const isCompleted = status === 'completed';
                let stateClass = 'stage-donut-locked';
                if (isCurrent) stateClass = 'stage-donut-selected';
                else if (isCompleted) stateClass = 'stage-donut-completed';
                else if (status === 'available') stateClass = 'stage-donut-active';
                return (
                  <div key={n} className="stage-donut-wrap">
                    {i > 0 && <div className={`stage-connector${n <= stageNum ? ' stage-connector-active' : ''}`} />}
                    <button
                      type="button"
                      className={`stage-donut ${stateClass}`}
                      onClick={() => {
                        setManualStageSelect(true);
                        if (n !== stageNum) {
                          navigate(`${prefix}/sim/${caseId}/stage/${n}`, { replace: true });
                        }
                      }}
                    >
                      {isCompleted ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="stage-donut-check">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <span className="stage-donut-num">{n}</span>
                      )}
                    </button>
                    <span className={`stage-label${isCurrent ? ' stage-label-selected' : ''}`}>{stageShortNames[n - 1]}</span>
                  </div>
                );
              })}
            </div>
          )}
          <button
            className="sim-btn sim-btn-start sim-btn-primary"
            onClick={startCall}
            disabled={!config || !hasStream || isStarting}
          >
            {isStarting ? t('common.loading') : buttonLabel}
          </button>
          <Link to={casePath} className="sim-btn sim-btn-outline" style={{ marginTop: 12 }}>
            {t('sim.ready.returnToCase')}
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'calling') {
    return (
      <div className="sim-page sim-calling sim-calling-white">
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
          <button type="button" className="sim-btn sim-btn-back-to-case" onClick={goBackToCase}>
            {t('sim.nav.backToCase')}
          </button>
        </nav>
      </div>
    );
  }

  // Saving phase
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
