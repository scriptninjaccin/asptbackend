import {
  adminAdmissionsApplicationsApplicationIdApprovePost,
  adminAdmissionsApplicationsApplicationIdDelete,
  adminAdmissionsApplicationsApplicationIdGet,
  adminAdmissionsApplicationsApplicationIdPatch,
  adminAdmissionsApplicationsApplicationIdRejectPost,
  adminAdmissionsApplicationsGet,
  admissionsApplicationsPost
} from "./lambdas/admissions";
import {
  adminFeesPaymentsGet,
  adminFeesPaymentsPaymentIdDelete,
  adminFeesPaymentsPaymentIdGet,
  adminFeesPaymentsPaymentIdPatch,
  adminFeesPaymentsPaymentIdVerifyPost,
  feesClassFeesGet,
  feesPaymentsMeGet,
  feesPaymentsPost
} from "./lambdas/fees";
import {
  adminGalleryMediaMediaIdDelete,
  adminGalleryMediaMediaIdGet,
  adminGalleryMediaMediaIdPatch,
  adminGalleryMediaPost,
  galleryMediaGet
} from "./lambdas/gallery";
import {
  adminNoticesNoticeIdDelete,
  adminNoticesNoticeIdGet,
  adminNoticesNoticeIdPatch,
  adminNoticesPost,
  noticesLatestGet
} from "./lambdas/notices";
import { classesGet, facilitiesGet, healthGet, resultsSummaryGet } from "./lambdas/public";
import {
  adminStudentsGet,
  adminStudentsPost,
  adminStudentsStudentIdDelete,
  adminStudentsStudentIdGet,
  adminStudentsStudentIdPatch,
  adminStudentsStudentIdRolePatch,
  studentsMeGet
} from "./lambdas/students";
import { Handler, RouteDef } from "./types/lambda";
import { methodNotAllowed } from "./utils/http";

export {
  healthGet,
  classesGet,
  facilitiesGet,
  resultsSummaryGet,
  admissionsApplicationsPost,
  adminAdmissionsApplicationsGet,
  adminAdmissionsApplicationsApplicationIdGet,
  adminAdmissionsApplicationsApplicationIdPatch,
  adminAdmissionsApplicationsApplicationIdDelete,
  adminAdmissionsApplicationsApplicationIdApprovePost,
  adminAdmissionsApplicationsApplicationIdRejectPost,
  noticesLatestGet,
  adminNoticesPost,
  adminNoticesNoticeIdGet,
  adminNoticesNoticeIdPatch,
  adminNoticesNoticeIdDelete,
  studentsMeGet,
  adminStudentsPost,
  adminStudentsGet,
  adminStudentsStudentIdGet,
  adminStudentsStudentIdPatch,
  adminStudentsStudentIdDelete,
  adminStudentsStudentIdRolePatch,
  feesClassFeesGet,
  feesPaymentsPost,
  feesPaymentsMeGet,
  adminFeesPaymentsGet,
  adminFeesPaymentsPaymentIdGet,
  adminFeesPaymentsPaymentIdPatch,
  adminFeesPaymentsPaymentIdDelete,
  adminFeesPaymentsPaymentIdVerifyPost,
  galleryMediaGet,
  adminGalleryMediaPost,
  adminGalleryMediaMediaIdGet,
  adminGalleryMediaMediaIdPatch,
  adminGalleryMediaMediaIdDelete
};

export const routeDefs: RouteDef[] = [
  { method: "GET", path: "/health", handler: healthGet },
  { method: "GET", path: "/classes", handler: classesGet },
  { method: "GET", path: "/facilities", handler: facilitiesGet },
  { method: "GET", path: "/results/summary", handler: resultsSummaryGet },
  { method: "POST", path: "/admissions/applications", handler: admissionsApplicationsPost },
  { method: "GET", path: "/admin/admissions/applications", handler: adminAdmissionsApplicationsGet },
  { method: "GET", path: "/admin/admissions/applications/:applicationId", handler: adminAdmissionsApplicationsApplicationIdGet },
  { method: "PATCH", path: "/admin/admissions/applications/:applicationId", handler: adminAdmissionsApplicationsApplicationIdPatch },
  { method: "DELETE", path: "/admin/admissions/applications/:applicationId", handler: adminAdmissionsApplicationsApplicationIdDelete },
  {
    method: "POST",
    path: "/admin/admissions/applications/:applicationId/approve",
    handler: adminAdmissionsApplicationsApplicationIdApprovePost
  },
  {
    method: "POST",
    path: "/admin/admissions/applications/:applicationId/reject",
    handler: adminAdmissionsApplicationsApplicationIdRejectPost
  },
  { method: "GET", path: "/notices/latest", handler: noticesLatestGet },
  { method: "POST", path: "/admin/notices", handler: adminNoticesPost },
  { method: "GET", path: "/admin/notices/:noticeId", handler: adminNoticesNoticeIdGet },
  { method: "PATCH", path: "/admin/notices/:noticeId", handler: adminNoticesNoticeIdPatch },
  { method: "DELETE", path: "/admin/notices/:noticeId", handler: adminNoticesNoticeIdDelete },
  { method: "GET", path: "/students/me", handler: studentsMeGet },
  { method: "POST", path: "/admin/students", handler: adminStudentsPost },
  { method: "GET", path: "/admin/students", handler: adminStudentsGet },
  { method: "GET", path: "/admin/students/:studentId", handler: adminStudentsStudentIdGet },
  { method: "PATCH", path: "/admin/students/:studentId", handler: adminStudentsStudentIdPatch },
  { method: "DELETE", path: "/admin/students/:studentId", handler: adminStudentsStudentIdDelete },
  { method: "PATCH", path: "/admin/students/:studentId/role", handler: adminStudentsStudentIdRolePatch },
  { method: "GET", path: "/fees/class-fees", handler: feesClassFeesGet },
  { method: "POST", path: "/fees/payments", handler: feesPaymentsPost },
  { method: "GET", path: "/fees/payments/me", handler: feesPaymentsMeGet },
  { method: "GET", path: "/admin/fees/payments", handler: adminFeesPaymentsGet },
  { method: "GET", path: "/admin/fees/payments/:paymentId", handler: adminFeesPaymentsPaymentIdGet },
  { method: "PATCH", path: "/admin/fees/payments/:paymentId", handler: adminFeesPaymentsPaymentIdPatch },
  { method: "DELETE", path: "/admin/fees/payments/:paymentId", handler: adminFeesPaymentsPaymentIdDelete },
  { method: "POST", path: "/admin/fees/payments/:paymentId/verify", handler: adminFeesPaymentsPaymentIdVerifyPost },
  { method: "GET", path: "/gallery/media", handler: galleryMediaGet },
  { method: "POST", path: "/admin/gallery/media", handler: adminGalleryMediaPost },
  { method: "GET", path: "/admin/gallery/media/:mediaId", handler: adminGalleryMediaMediaIdGet },
  { method: "PATCH", path: "/admin/gallery/media/:mediaId", handler: adminGalleryMediaMediaIdPatch },
  { method: "DELETE", path: "/admin/gallery/media/:mediaId", handler: adminGalleryMediaMediaIdDelete }
];

const toRegex = (path: string): RegExp => {
  const pattern = path.replace(/:[^/]+/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
};

export const route: Handler = async (event) => {
  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath || event.requestContext.http.path;

  const match = routeDefs.find((def) => def.method === method && toRegex(def.path).test(path));

  if (!match) {
    return methodNotAllowed();
  }

  return match.handler(event);
};
