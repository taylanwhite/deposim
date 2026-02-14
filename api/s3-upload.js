/**
 * S3 multipart upload helpers for large recording uploads.
 * Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or IAM role), S3_BUCKET
 */

const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let _s3 = null;
function getS3() {
  if (!_s3) {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION || 'us-east-1';
    if (!bucket) throw new Error('S3_BUCKET is not set');
    _s3 = new S3Client({ region });
  }
  return _s3;
}

function getBucket() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not set');
  return bucket;
}

/** Generate a unique S3 key for a recording. */
function generateRecordingKey(caseId, conversationId, ext = 'webm') {
  const id = conversationId || `case-${Date.now()}`;
  const uuid = require('crypto').randomUUID();
  return `recordings/${caseId}/${id}/${uuid}.${ext}`;
}

/**
 * Initiate multipart upload. Returns { uploadId, key }.
 */
async function createMultipartUpload(key, contentType = 'video/webm') {
  const s3 = getS3();
  const bucket = getBucket();
  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    })
  );
  return { uploadId: UploadId, key };
}

/**
 * Get presigned URLs for upload parts.
 */
async function getPresignedUploadUrls(key, uploadId, partNumbers, expiresIn = 3600) {
  const s3 = getS3();
  const bucket = getBucket();
  const urls = {};
  await Promise.all(
    partNumbers.map(async (partNumber) => {
      const url = await getSignedUrl(
        s3,
        new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn }
      );
      urls[partNumber] = url;
    })
  );
  return urls;
}

/**
 * Complete multipart upload. Returns the S3 key.
 */
async function completeMultipartUpload(key, uploadId, parts) {
  const s3 = getS3();
  const bucket = getBucket();
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
  return key;
}

/**
 * Download object from S3 to a local temp file. Returns path.
 */
async function downloadToTemp(key) {
  const s3 = getS3();
  const bucket = getBucket();
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { pipeline } = require('stream/promises');

  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const tmpPath = path.join(os.tmpdir(), `deposim-${Date.now()}-${require('crypto').randomUUID()}.webm`);
  const writeStream = fs.createWriteStream(tmpPath);
  await pipeline(Body, writeStream);
  return tmpPath;
}

/**
 * Get a presigned URL for streaming the recording (1 hour expiry).
 */
async function getPresignedViewUrl(key, expiresIn = 3600) {
  const s3 = getS3();
  const bucket = getBucket();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

module.exports = {
  getS3,
  getBucket,
  generateRecordingKey,
  createMultipartUpload,
  getPresignedUploadUrls,
  completeMultipartUpload,
  downloadToTemp,
  getPresignedViewUrl,
};
