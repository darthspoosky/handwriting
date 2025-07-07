import { config } from '@/lib/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: config.storage.s3.region });

export async function uploadToS3(buffer: Buffer, key: string): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: key,
    Body: buffer,
  }));

  return `https://${config.storage.s3.bucket}.s3.${config.storage.s3.region}.amazonaws.com/${key}`;
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: key,
  }));
}
