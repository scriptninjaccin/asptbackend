const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/api";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || "15000");
const VERBOSE = (process.env.SMOKE_VERBOSE || "true").toLowerCase() !== "false";

const withTimeout = async (promise, ms) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const logLine = (label, value) => {
  if (!VERBOSE) return;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  console.log(`[smoke] ${label}: ${text}`);
};

const requestJson = async (method, path, body) => {
  return withTimeout(async (signal) => {
    const url = `${API_BASE_URL}${path}`;
    logLine("request", { method, url, body: body ?? null });

    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (err) {
      throw new Error(`Non-JSON response (${res.status}) from ${method} ${path}: ${text.slice(0, 200)}`);
    }

    logLine("response", { method, url, status: res.status, data });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${method} ${path}: ${JSON.stringify(data)}`);
    }

    return data;
  }, TIMEOUT_MS);
};

const main = async () => {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Use Node 18+ or install a fetch polyfill.");
  }

  const runId = Date.now().toString();
  const studentId = `S-${runId}`;
  const admissionStudentId = `A-${runId}`;

  try {
    await requestJson("GET", "/health");
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    throw new Error(
      `Health check failed at ${API_BASE_URL}/health. Is the server running? Details: ${message}`
    );
  }

  const classes = await requestJson("GET", "/classes");
  const facilities = await requestJson("GET", "/facilities");
  const results = await requestJson("GET", "/results/summary");

  const admission = await requestJson("POST", "/admissions/applications", {
    studentId: admissionStudentId,
    studentName: "Test Student",
    fatherName: "Father",
    motherName: "Mother",
    className: "Class 10",
    dob: "2010-01-01",
    phone: "9999999999",
    email: "test@example.com",
    address: "Address",
    documents: ["doc1"]
  });
  const admissionId = admission.id;

  const admissionsList = await requestJson("GET", "/admin/admissions/applications");
  const admissionPatch = await requestJson("PATCH", `/admin/admissions/applications/${admissionId}`, {
    status: "approved"
  });
  const admissionApprove = await requestJson("POST", `/admin/admissions/applications/${admissionId}/approve`);
  const admissionReject = await requestJson("POST", `/admin/admissions/applications/${admissionId}/reject`, {
    reason: "Duplicate"
  });
  const admissionDelete = await requestJson("DELETE", `/admin/admissions/applications/${admissionId}`);

  const notice = await requestJson("POST", "/admin/notices", {
    title: `Notice ${runId}`,
    body: "Body",
    publishedAt: "2026-01-01"
  });
  const noticeId = notice.id;
  await requestJson("GET", `/admin/notices/${noticeId}`);
  const noticePatch = await requestJson("PATCH", `/admin/notices/${noticeId}`, {
    title: "Notice Updated"
  });
  const noticeDelete = await requestJson("DELETE", `/admin/notices/${noticeId}`);

  const student = await requestJson("POST", "/admin/students", {
    studentId,
    studentName: "Student Smoke",
    fatherName: "F",
    motherName: "M",
    className: "Class 9",
    phone: "1111111111",
    email: `s-${runId}@example.com`,
    address: "Addr",
    group: "student",
    monthlyFee: 3000
  });
  const createdStudentId = student.studentId;
  await requestJson("GET", `/admin/students/${createdStudentId}`);
  const studentPatch = await requestJson("PATCH", `/admin/students/${createdStudentId}`, {
    className: "Class 10"
  });
  const rolePatch = await requestJson("PATCH", `/admin/students/${createdStudentId}/role`, { group: "admin" });
  const studentDelete = await requestJson("DELETE", `/admin/students/${createdStudentId}`);

  const fee = await requestJson("POST", "/fees/payments", {
    studentId: createdStudentId,
    studentName: "Student Smoke",
    className: "Class 9",
    feeType: "tuition",
    transactionId: `TXN-${runId}`,
    baseAmount: 3000,
    gatewayCharge: 0,
    totalAmount: 3000
  });
  const paymentId = fee.records?.[0]?.id;
  if (!paymentId) {
    throw new Error("Fee payment did not return a record id");
  }
  await requestJson("GET", `/admin/fees/payments/${paymentId}`);
  const feePatch = await requestJson("PATCH", `/admin/fees/payments/${paymentId}`, { status: "approved" });
  const feeVerify = await requestJson("POST", `/admin/fees/payments/${paymentId}/verify`, {
    status: "approved"
  });
  const feeDelete = await requestJson("DELETE", `/admin/fees/payments/${paymentId}`);

  const gallery = await requestJson("POST", "/admin/gallery/media", {
    type: "photo",
    title: `Campus ${runId}`,
    caption: "Caption",
    src: "https://example.com/media/1"
  });
  const mediaId = gallery.id;
  await requestJson("GET", `/admin/gallery/media/${mediaId}`);
  const galleryPatch = await requestJson("PATCH", `/admin/gallery/media/${mediaId}`, { title: "Updated" });
  const galleryDelete = await requestJson("DELETE", `/admin/gallery/media/${mediaId}`);

  const noticesLatest = await requestJson("GET", "/notices/latest");
  const feesMe = await requestJson("GET", "/fees/payments/me");
  const galleryList = await requestJson("GET", "/gallery/media?type=photo");
  const classFees = await requestJson("GET", "/fees/class-fees");

  const result = {
    runId,
    health: true,
    classes: classes.classes?.length ?? 0,
    facilities: facilities.facilities?.length ?? 0,
    results: results.results?.length ?? 0,
    admissionsCount: Array.isArray(admissionsList.applications) ? admissionsList.applications.length : 0,
    admissionStatus: admissionPatch.status ?? null,
    admissionApproved: admissionApprove.application?.status ?? null,
    admissionRejected: admissionReject.application?.status ?? null,
    admissionDeleted: admissionDelete.deleted ?? null,
    noticeId,
    noticePatched: noticePatch.title ?? null,
    noticeDeleted: noticeDelete.deleted ?? null,
    studentId: createdStudentId,
    studentPatched: studentPatch.className ?? null,
    rolePatched: rolePatch.group ?? null,
    studentDeleted: studentDelete.deleted ?? null,
    paymentId,
    feePatched: feePatch.status ?? null,
    paymentStatus: feeVerify.status ?? null,
    paymentDeleted: feeDelete.deleted ?? null,
    mediaId,
    galleryPatched: galleryPatch.title ?? null,
    mediaDeleted: galleryDelete.deleted ?? null,
    noticesLatest: noticesLatest.notices?.length ?? 0,
    feesMeRecords: feesMe.records?.length ?? 0,
    galleryList: galleryList.items?.length ?? 0,
    classFees: Object.keys(classFees.fees || {}).length
  };

  console.log(JSON.stringify(result, null, 2));
};

main().catch((err) => {
  console.error("Smoke test failed.");
  console.error(err && err.message ? err.message : err);
  if (err && err.cause) {
    console.error("Cause:", err.cause);
  }
  console.error(`API_BASE_URL=${API_BASE_URL}`);
  process.exitCode = 1;
});
