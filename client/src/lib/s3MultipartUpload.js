/**
 * S3 multipart upload for large video recordings.
 * Uses presigned URLs - file never flows through our API.
 * Part size: 10 MB (good balance for large files).
 */

const PART_SIZE = 10 * 1024 * 1024; // 10 MB
const API = '/api';

/**
 * Upload a video blob via S3 multipart upload.
 * @param {Blob} blob - The video blob to upload
 * @param {Object} opts - { conversationId?, caseId, onProgress?(pct) }
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function uploadRecordingToS3(blob, opts) {
  const { conversationId, caseId, onProgress } = opts || {};
  if (!caseId) return { ok: false, error: 'caseId required' };

  const ext = blob.type?.includes('mp4') ? 'mp4' : 'webm';

  // Split blob into parts (S3 min 5 MB except last part)
  const parts = [];
  for (let i = 0; i < blob.size; i += PART_SIZE) {
    parts.push(blob.slice(i, Math.min(i + PART_SIZE, blob.size)));
  }
  const partNumbers = parts.map((_, i) => i + 1);

  // 1. Init
  const initRes = await fetch(`${API}/simulations/video/upload-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: conversationId || null, caseId }),
  });
  const initData = await initRes.json();
  if (!initData.ok) return { ok: false, error: initData.error || 'Upload init failed' };
  const { uploadId, key } = initData;

  // 2. Get presigned URLs
  const urlsRes = await fetch(`${API}/simulations/video/upload-urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, key, partNumbers }),
  });
  const urlsData = await urlsRes.json();
  if (!urlsData.ok) return { ok: false, error: urlsData.error || 'Failed to get upload URLs' };
  const { urls } = urlsData;

  // 3. Upload each part (sequential to avoid memory spikes; can parallelize with limit)
  const completedParts = [];
  for (let i = 0; i < parts.length; i++) {
    const partNum = i + 1;
    const url = urls[partNum];
    if (!url) return { ok: false, error: `No URL for part ${partNum}` };

    const res = await fetch(url, {
      method: 'PUT',
      body: parts[i],
    });
    if (!res.ok) return { ok: false, error: `Part ${partNum} upload failed: ${res.status}` };

    const etag = res.headers.get('ETag');
    if (!etag) return { ok: false, error: `Part ${partNum} missing ETag` };
    completedParts.push({ partNumber: partNum, etag });

    onProgress?.({ phase: 'upload', pct: ((i + 1) / parts.length) * 100 });
  }

  onProgress?.({ phase: 'analyzing', pct: 100 });

  // 4. Complete (server downloads from S3, runs Gemini analysis)
  const completeRes = await fetch(`${API}/simulations/video/upload-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      key,
      parts: completedParts,
      conversationId: conversationId || null,
      caseId,
    }),
  });
  const completeData = await completeRes.json();
  if (!completeData.ok) return { ok: false, error: completeData.error || 'Upload complete failed' };

  return { ok: true };
}
