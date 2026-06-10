import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

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
    return `${config.R2_PUBLIC_URL}/${key}`;
  }
}

export const r2Service = new R2Service();
