// src/lib/api.ts
import axios from "axios";

const BASE =
  import.meta.env.VITE_API_BASE_URL || // <- preferred key
  import.meta.env.VITE_API_URL ||      // fallback if you already use this
  `${window.location.origin.replace(/\/$/, "")}/api`;

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true, // REQUIRED so the HttpOnly session cookie is sent
  headers: {
    "X-Requested-With": "XMLHttpRequest",
  },
});

// ---- Global 401 handler -> redirect to /login ----
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      // avoid loop if already on /login
      const onLogin = window.location.pathname.startsWith("/login");
      if (!onLogin) {
        const to = "/login";
        try {
          // preserve where user was going
          const from = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`${to}?from=${from}`);
        } catch {
          window.location.assign(to);
        }
      }
    }
    return Promise.reject(err);
  }
);

// ---------- Types ----------
export type BackendJob = {
  id: string;
  workerPhone: string;
  requiredTypes: string[];
  currentIndex: number;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED";
  sector?: number;
  createdAt?: string | null;
};

export type PhotoItem = {
  id: string;
  jobId: string;
  type: string;
  s3Url: string;
  fields?: Record<string, any>;
  checks?: Record<string, any>;
  status?: string;
  reason?: string[];
};

export type JobDetail = {
  job: {
    id: string;               // <-- backend returns "id" (not _id)
    workerPhone: string;
    requiredTypes: string[];
    currentIndex: number;
    status: string;
    sector?: number;
    macId?: string;
    rsnId?: string;
    azimuthDeg?: number | string;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
  photos: PhotoItem[];
};

// ---------- Helpers ----------
function downloadBlob(data: BlobPart, suggestedName: string, contentDisposition?: string) {
  // Try to read "filename=..." from Content-Disposition
  let filename = suggestedName;
  const m = /filename\*?=(?:UTF-8'')?("?)([^";]+)\1/i.exec(contentDisposition || "");
  if (m?.[2]) filename = decodeURIComponent(m[2]);

  const url = URL.createObjectURL(new Blob([data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- API calls ----------
export async function fetchJobs(): Promise<BackendJob[]> {
  const { data } = await api.get("/jobs");
  return data;
}

export async function fetchJobDetail(id: string): Promise<JobDetail> {
  const { data } = await api.get(`/jobs/${encodeURIComponent(id)}`);
  return data;
}

export async function createJob(input: {
  workerPhone: string;
  requiredTypes: string[];
  sector?: number;
}): Promise<BackendJob> {
  const { data } = await api.post("/jobs", input);
  return data;
}

export async function downloadJobXlsx(id: string) {
  const res = await api.get(`/jobs/${encodeURIComponent(id)}/export.xlsx`, {
    responseType: "blob",
  });
  downloadBlob(res.data, `job_${id}.xlsx`, res.headers["content-disposition"]);
}

export async function downloadJobZip(id: string) {
  const res = await api.get(`/jobs/${encodeURIComponent(id)}/export.zip`, {
    responseType: "blob",
  });
  downloadBlob(res.data, `job_${id}.zip`, res.headers["content-disposition"]);
}

export async function downloadJobXlsxWithImages(id: string) {
  const res = await api.get(`/jobs/${encodeURIComponent(id)}/export_with_images.xlsx`, {
    responseType: "blob",
  });
  downloadBlob(res.data, `job_${id}_with_images.xlsx`, res.headers["content-disposition"]);
}

export async function getSectorTemplate(sector: number) {
  const { data } = await api.get(`/jobs/templates/sector/${sector}`);
  return data as {
    requiredTypes: string[];
    labels: Record<string, string>;
    sector: number;
  };
}
