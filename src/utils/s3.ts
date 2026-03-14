import { S3Client } from "@aws-sdk/client-s3";

let s3Client: S3Client | undefined;

export const getS3 = (): S3Client => {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1"
    });
  }

  return s3Client;
};

export const getNoticeBucket = (): string | undefined =>
  process.env.S3_NOTICES_BUCKET;

export const getNoticePublicBaseUrl = (): string | undefined =>
  process.env.S3_PUBLIC_BASE_URL;

export const getAdmissionsBucket = (): string | undefined =>
  process.env.S3_ADMISSIONS_BUCKET;

export const getAdmissionsPublicBaseUrl = (): string | undefined =>
  process.env.S3_ADMISSIONS_PUBLIC_BASE_URL;
