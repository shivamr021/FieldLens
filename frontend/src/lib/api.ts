// src/lib/api.ts
import axios, { AxiosError } from "axios";

export type ID = string;

// ---- Server models (align with your FastAPI responses) ----
export interface Job {
  id: ID;                 // stringified ObjectId
  workerPhone: string;    // normalized on server
  requiredTypes: string[] | number[]; // depends on your schema, keep as (string|number)[]
  currentIndex: number;
  status: "new" | "in_progress" | "completed" | "cancelled" | string;
  // you can extend if your /jobs/{id} returns more fields
}

export interface CreateJobPayload {
  workerPhone: string;
  requiredTypes: (string | number)[];
}

export interface PhotoOut {
  id: ID;
  jobId: ID;
  type: string | number;
  s3Url: string;          // presigned URL from backend
  fields: Record<string, any>;
  checks: Record<string, any>;
  status?: string;
  reason?: string[];
}

export interface JobDetailResponse {
  job: Job & { _id?: string }; // server returns job with "_id" already converted in your code
  photos: PhotoOut[];
}

export interface JobTemplateResponse {
  requiredTypes: (string | number)[];
  labels: Record<string | number, string>;
  sector: number;
}

// ---- Axios instance ----
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  (typeof window !== "undefined" ? `${window.location.origin}/api` : "/api");

const apiClient = axios.create({
  baseURL: BASE_URL, // important: FastAPI is mounted with prefix "/api"
  timeout: 20_000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("authToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (e: AxiosError<any>) => {
    if (e.response) {
      const msg = e.response.data?.message || `Request failed (${e.response.status})`;
      return Promise.reject(new Error(msg));
    }
    if (e.code === "ECONNABORTED") return Promise.reject(new Error("Request timeout"));
    return Promise.reject(e);
  }
);

// ---- Public API matching your FastAPI routes ----
export const api = {
  // Health (optional)
  async health() {
    const { data } = await apiClient.get<{ status: string }>("/health".replace("/api","")); // server root is without /api
    return data;
  },

  // GET /api/jobs  -> List[JobOut]
  async listJobs() {
    const { data } = await apiClient.get<Job[]>("/jobs");
    return data;
  },

  // POST /api/jobs -> JobOut
  async createJob(payload: CreateJobPayload) {
    // server normalizes phone; just send raw input here
    const { data } = await apiClient.post<Job>("/jobs", payload);
    return data;
  },

  // GET /api/jobs/{job_id} -> { job, photos }
  async getJob(jobId: ID) {
    const { data } = await apiClient.get<JobDetailResponse>(`/jobs/${jobId}`);
    return data;
  },

  // GET /api/jobs/{job_id}/export.csv -> CSV file
  async downloadJobCsv(jobId: ID): Promise<Blob> {
    const { data } = await apiClient.get(`/jobs/${jobId}/export.csv`, {
      responseType: "blob",
    });
    return data; // blob
  },

  // GET /api/jobs/templates/sector/{sector} -> template + labels
  async getTemplateForSector(sector: number) {
    const { data } = await apiClient.get<JobTemplateResponse>(`/jobs/templates/sector/${sector}`);
    return data;
  },
};

// ---- Small helper to trigger file downloads from Blob ----
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
