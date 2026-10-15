import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createDurablePartsStorage } from './durable-parts.js';

export function createStorage(config) {
  const options = {
    ...config.s3,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  const client = new S3Client(options);
  const signingClient = config.s3.signingEndpoint
    ? new S3Client({ ...options, endpoint: config.s3.signingEndpoint })
    : client;
  const input = (key, extra = {}) => ({ Bucket: config.s3.bucket, Key: key, ...extra });
  const send = (Command, data) =>
    client.send(new Command(data), { abortSignal: AbortSignal.timeout(30000) });
  const storage = {
    async create(key, fingerprint) {
      return (
        await send(
          CreateMultipartUploadCommand,
          input(key, { ContentType: 'application/octet-stream', Metadata: { fingerprint } }),
        )
      ).UploadId;
    },
    async parts(key, uploadId) {
      const parts = [];
      let marker;
      do {
        const result = await send(
          ListPartsCommand,
          input(key, { UploadId: uploadId, PartNumberMarker: marker }),
        );
        parts.push(...(result.Parts || []));
        marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
      } while (marker);
      return parts;
    },
    signPart(key, uploadId, number, size) {
      return getSignedUrl(
        signingClient,
        new UploadPartCommand(
          input(key, { UploadId: uploadId, PartNumber: number, ContentLength: size }),
        ),
        { expiresIn: 300 },
      );
    },
    complete(key, uploadId, parts) {
      return send(
        CompleteMultipartUploadCommand,
        input(key, {
          UploadId: uploadId,
          MultipartUpload: { Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) },
        }),
      );
    },
    abort(key, uploadId) {
      return send(AbortMultipartUploadCommand, input(key, { UploadId: uploadId }));
    },
    head(key) {
      return send(HeadObjectCommand, input(key));
    },
    get(key) {
      return send(GetObjectCommand, input(key));
    },
    remove(key) {
      return send(DeleteObjectCommand, input(key));
    },
    ready() {
      return send(HeadBucketCommand, { Bucket: config.s3.bucket });
    },
    download(key, name) {
      const safe = name.replace(/[\r\n"\\/]/g, '_');
      return getSignedUrl(
        signingClient,
        new GetObjectCommand(
          input(key, {
            ResponseContentDisposition: `attachment; filename="report"; filename*=UTF-8''${encodeURIComponent(safe)}`,
          }),
        ),
        { expiresIn: 60 },
      );
    },
  };
  return config.s3.durableParts
    ? createDurablePartsStorage(storage, client, signingClient, config.s3.bucket)
    : storage;
}
