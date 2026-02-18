import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useConversation } from '@elevenlabs/react';
import { uploadRecordingToS3 } from './lib/s3MultipartUpload';
import { useT, useLangPrefix } from './i18n/LanguageContext';

const API = '/api';

const STAGE_NAMES = [
  'Background & Employment',
  'Accident & Aftermath',
  'Medical History',
  'Treatment & Condition',
];

/* ===== Mini Stage Donuts for SimPage ===== */
function SimStageProgress({ currentStage, stageData }) {
  const { t } = useT();
  return (
    <div className="stage-progress stage-progress-sim">
      {[1, 2, 3, 4].map((n, i) => {
        const stage = stageData?.stages?.find((s) => s.stage === n);
        const isCompleted = stage?.status === 'completed';
        const isCurrent = n === currentStage;
        const isRetake = stage?.retakeRecommended;
        const isLocked = !isCompleted && !isCurrent && n > currentStage;

        let stateClass = 'stage-donut-locked';
        if (isCompleted && isRetake) stateClass = 'stage-donut-retake';
        else if (isCompleted) stateClass = 'stage-donut-completed';
        else if (isCurrent) stateClass = 'stage-donut-active';

        return (
          <div key={n} className="stage-donut-wrap">
            {i > 0 && <div className={`stage-connector${n <= currentStage || isCompleted ? ' stage-connector-active' : ''}`} />}
            <div className={`stage-donut ${stateClass}`}>
              {isCompleted && !isRetake ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="stage-donut-check">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span className="stage-donut-num">{n}</span>
              )}
            </div>
            <span className="stage-label">{t(`sim.stage.short${n}`)}</span>
          </div>
        );
      })}
    </div>
  );
}

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
          const base = 0.15 + 0.08 * Math.sin(t * 2 + i * 0.2);
          const speakingBoost = isSpeaking ? 0.4 + 0.25 * Math.sin(t * 3) : 0;
          combined = base + speakingBoost;
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
  const { caseId, stage: stageParam } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const prefix = useLangPrefix();
  const stageNum = Math.max(1, Math.min(4, parseInt(stageParam, 10) || 1));

  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [phase, setPhase] = useState('consent'); // consent | ready | calling | postcall
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [postCallMessage, setPostCallMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [stageData, setStageData] = useState(null);
  const [stageEval, setStageEval] = useState(null); // { retakeRecommended, reason }
  const [evaluating, setEvaluating] = useState(false);
  const messagesEndRef = useRef(null);

  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const pipVideoRef = useRef(null);
  const conversationIdRef = useRef(null);
  const conversationRef = useRef(null);

  // Fetch signed URL + config when caseId/stage is set
  useEffect(() => {
    if (!caseId) return;
    fetch(API + '/sim/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, stage: stageNum }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setConfig(d);
      })
      .catch((err) => setConfigError(err.message));
  }, [caseId, stageNum]);

  // Fetch stage progress
  useEffect(() => {
    if (!caseId) return;
    fetch(`${API}/cases/${caseId}/stages`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStageData)
      .catch(() => {});
  }, [caseId]);

  const handleConnect = useCallback(
    (props) => {
      if (props?.conversationId) conversationIdRef.current = props.conversationId;
      setPhase('calling');
      setMessages([]);
      recordedChunks.current = [];
      if (pipVideoRef.current) pipVideoRef.current.srcObject = cameraStream;
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

  const runStageEvaluation = useCallback(async () => {
    setEvaluating(true);
    try {
      // Wait a bit for the webhook to process the simulation
      await new Promise((r) => setTimeout(r, 5000));

      // Find the latest simulation for this case + stage
      const simsResp = await fetch(`${API}/simulations?caseId=${caseId}`);
      const sims = simsResp.ok ? await simsResp.json() : [];
      const stageSim = sims.find((s) => s.stage === stageNum);

      if (stageSim) {
        // Generate stage summary for next stage
        await fetch(`${API}/cases/${caseId}/stage-summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simulationId: stageSim.id }),
        }).catch(() => {});

        // Evaluate whether retake is recommended
        const evalResp = await fetch(`${API}/simulations/${stageSim.id}/evaluate-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (evalResp.ok) {
          const evalData = await evalResp.json();
          setStageEval(evalData);
        }
      }
    } catch (err) {
      console.warn('[DepoSim] Stage evaluation failed:', err);
    } finally {
      setEvaluating(false);
    }
  }, [caseId, stageNum]);

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
    const convId = conversationIdRef.current || conversationRef.current?.getId?.() || '';
    const useCaseId = !convId && caseId;

    if (chunks.length > 0 && (convId || useCaseId)) {
      setPostCallMessage('uploading');
      const blob = new Blob(chunks, {
        type: mediaRecorder.current?.mimeType || 'video/webm',
      });

      uploadRecordingToS3(blob, {
        conversationId: convId || undefined,
        caseId,
        onProgress: ({ phase: p, pct }) => setPostCallMessage(p === 'analyzing' ? 'analyzing' : `uploading ${Math.round(pct)}%`),
      })
        .then((d) => {
          setPostCallMessage(d.ok ? 'complete' : `error: ${d.error || 'Upload failed'}`);
        })
        .catch((err) => setPostCallMessage(`error: ${err.message}`));
    } else {
      setPostCallMessage('complete');
    }

    // Run stage evaluation after call ends
    runStageEvaluation();
  }, [cameraStream, caseId, runStageEvaluation]);

  useEffect(() => {
    if ((phase === 'ready' || phase === 'calling') && cameraStream && pipVideoRef.current) {
      pipVideoRef.current.srcObject = cameraStream;
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
      setPhase('postcall');
      setPostCallMessage(`error: ${err?.message || 'Unknown error'}`);
    },
  });
  conversationRef.current = conversation;

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
      if (caseId) {
        fetch(`${API}/cases/${caseId}/record-consent`, { method: 'POST' }).catch(() => {});
      }
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
    conversation.endSession?.();
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

  // Consent phase
  if (phase === 'consent') {
    return (
      <div className="sim-page sim-page-dark">
        <div className="sim-consent">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          </a>
          <SimStageProgress currentStage={stageNum} stageData={stageData} />
          <h1>{t('sim.consent.title')}</h1>
          <p className="sim-subtitle">{t(`sim.stage.name${stageNum}`)}</p>
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

  // Ready to start call
  if (phase === 'ready') {
    return (
      <div className="sim-page sim-page-dark">
        <div className="sim-consent">
          <a href="https://deposim.com" target="_blank" rel="noopener noreferrer">
            <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
          </a>
          <SimStageProgress currentStage={stageNum} stageData={stageData} />
          <h1>{t('sim.ready.title')}</h1>
          <p className="sim-subtitle">{t('sim.ready.subtitle')}</p>
          <div className="sim-preview-wrap">
            <video ref={pipVideoRef} autoPlay muted playsInline />
          </div>
          <button className="sim-btn sim-btn-start sim-btn-primary" onClick={startCall}>
            {t('sim.ready.start')}
          </button>
        </div>
      </div>
    );
  }

  // Calling
  if (phase === 'calling') {
    return (
      <div className="sim-page sim-calling">
        <div className="sim-header sim-header-centered">
          <Link to={`${prefix}/cases`} className="sim-back">← {t('common.back')}</Link>
          <div className="sim-header-info">
            <span className="sim-deponent">
              {config?.case?.firstName != null && config?.case?.lastName != null
                ? `${config.case.lastName}, ${config.case.firstName}`
                : config?.case?.name || 'Deponent'}
            </span>
            <span className="sim-case-num">#{config?.case?.caseNumber || '—'} · {t(`sim.stage.short${stageNum}`)}</span>
          </div>
        </div>

        <div className="sim-call-area">
          <AudioVisualizer
            getInputData={conversation.getInputByteFrequencyData}
            getOutputData={conversation.getOutputByteFrequencyData}
            isSpeaking={conversation.isSpeaking}
          />
          <div className="sim-call-prompt">
            <p>{t('sim.calling.speak')}</p>
            <p className="sim-cta">{t('sim.calling.finished')}</p>
          </div>

          <div className="sim-conversation-history">
            <h4>{t('sim.calling.conversation')}</h4>
            <div className="sim-messages">
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

          <button className="sim-btn-end" onClick={endCall}>
            {t('sim.calling.endCall')}
          </button>
        </div>

        <div className="sim-pip">
          <video ref={pipVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          <span className="sim-pip-label">{t('sim.calling.you')}</span>
        </div>
      </div>
    );
  }

  // Post-call with stage evaluation
  const isLastStage = stageNum === 4;
  const nextStage = stageNum + 1;
  const currentStageName = t(`sim.stage.name${stageNum}`);
  const nextStageName = nextStage <= 4 ? t(`sim.stage.name${nextStage}`) : '';

  return (
    <div className="sim-page">
      <div className="sim-postcall">
        <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="sim-logo" />
        <SimStageProgress currentStage={stageNum} stageData={stageData} />

        <div className="sim-postcall-status">{t('sim.stage.stageComplete', { name: currentStageName })}</div>

        <div className="sim-postcall-name">
          {config?.case?.firstName != null && config?.case?.lastName != null
            ? `${config.case.lastName}, ${config.case.firstName}`
            : config?.case?.name || 'Deponent'}
          <span className="sim-postcall-case"> #{config?.case?.caseNumber || '—'}</span>
        </div>

        {(postCallMessage && postCallMessage !== 'complete') && (
          <div className="sim-postcall-body">
            {(postCallMessage === 'uploading' || postCallMessage.startsWith('uploading ')) && (
              <p>{t('sim.postcall.uploading')}</p>
            )}
            {postCallMessage === 'analyzing' && <p>{t('sim.postcall.analyzing')}</p>}
            {postCallMessage.startsWith('error:') && <p style={{ color: '#ed4956' }}>{postCallMessage}</p>}
          </div>
        )}

        {/* Stage evaluation */}
        {evaluating && (
          <div className="sim-postcall-eval">
            <p className="sim-postcall-eval-loading">{t('sim.stage.evaluating')}</p>
          </div>
        )}

        {!evaluating && stageEval && stageEval.retakeRecommended && (
          <div className="sim-postcall-eval sim-postcall-eval-retake">
            <p className="sim-postcall-eval-reason">{t('sim.stage.retakeRecommended')}</p>
            {stageEval.reason && <p className="sim-postcall-eval-detail">{stageEval.reason}</p>}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="sim-postcall-actions">
          {!isLastStage && (
            <button
              className="sim-btn sim-btn-primary sim-btn-continue"
              onClick={() => navigate(`${prefix}/sim/${caseId}/stage/${nextStage}`)}
            >
              {t('sim.stage.continue', { name: nextStageName })}
            </button>
          )}
          {isLastStage && (
            <div className="sim-postcall-all-complete">
              <h2>{t('sim.stage.allComplete')}</h2>
              <p>{t('sim.stage.allCompleteDesc')}</p>
            </div>
          )}
          <button
            className="sim-btn-ghost"
            onClick={() => {
              window.location.href = `${prefix}/sim/${caseId}/stage/${stageNum}`;
            }}
          >
            {t('sim.stage.retake', { name: currentStageName })}
          </button>
          <Link to={`${prefix}/cases`} className="sim-postcall-back-link">
            {t('sim.postcall.backToCases')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SimPage;
