export type UserGroup = "admin" | "student";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type PaymentStatus = "pending" | "approved" | "rejected";
export type GalleryType = "photo" | "video";

export interface User {
  studentId: string;
  studentName: string;
  fatherName: string;
  motherName: string;
  className: string;
  phone: string;
  email: string;
  address: string;
  group: UserGroup;
  monthlyFee: number;
  deletedAt: string | null;
}

export interface FeeSummary {
  paidMonths: number;
  unpaidMonths: number;
  pendingVerification: number;
  totalPaidAmount: number;
  totalDueAmount: number;
}

export interface AdmissionApplication {
  id: string;
  studentId: string;
  studentName: string;
  fatherName: string;
  motherName: string;
  className: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  documents: Array<{
    name?: string;
    type?: string;
    url?: string;
  }>;
  createdAt: string;
  status: ApplicationStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  deletedAt: string | null;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  attachment?: {
    name?: string;
    type?: string;
    dataUrl?: string;
    url?: string;
  } | null;
  deletedAt: string | null;
}

export interface FeePaymentRecord {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  feeType: string;
  month: string | null;
  paymentMode: string;
  method: string;
  transactionId: string;
  baseAmount: number;
  gatewayCharge: number;
  totalAmount: number;
  proof: string;
  receiptUrl: string | null;
  status: PaymentStatus;
  submittedAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  deletedAt: string | null;
}

export interface GalleryItem {
  id: string;
  type: GalleryType;
  title: string;
  caption: string;
  src: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface Facility {
  title: string;
  description: string;
}

export interface ResultSummary {
  year: string;
  passRate: string;
  distinction: number;
  merit: number;
}

export interface ErrorResponse {
  message: string;
  code: string;
}
