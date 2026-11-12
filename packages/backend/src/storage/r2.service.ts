import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Ticket-scan storage. The bucket is private: objects are addressed by key and
 * read only through short-lived signed URLs. A lotto ticket is a bearer
 * instrument, so a scan must never be reachable through a permanent URL.
 */
class R2Service {
  private client: S3Client | null = null;

  private getClient(): S3Client {
    if (!this.client) {
      if (!config.R2_ACCOUNT_ID || !config.R2_ACCESS_KEY_ID || !config.R2_SECRET_ACCESS_KEY) {
        throw new Error('R2 credentials not configured');
      }
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID,
          secretAccessKey: config.R2_SECRET_ACCESS_KEY,
        },
      });
    }
    return this.client;
  }

  /** Uploads an object and returns its key (not a URL). */
  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    const client = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /** Returns a URL that can read `key` for `ttlSeconds`, then stops working. */
  async getSignedUrl(key: string, ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<string> {
    return presign(
      this.getClient(),
      new GetObjectCommand({ Bucket: config.R2_BUCKET_NAME, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

export const r2Service = new R2Service();
