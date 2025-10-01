import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api",
  withCredentials: true, // keep if backend uses cookies, else remove
});

// Job types from backend
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
    _id: string;
    workerPhone: string;
    requiredTypes: string[];
    currentIndex: number;
    status: string;
    sector?: number;
    createdAt?: string | null;
  };
  photos: PhotoItem[];
};
// ---------------- API FUNCTIONS ----------------

export async function fetchJobs(): Promise<BackendJob[]> {
  const { data } = await api.get("/jobs");
  console.log(data);
  
  return data;
}

export async function fetchJobDetail(id: string) {
  const { data } = await api.get(`/jobs/${id}`);
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
  const { data } = await api.get(`/jobs/${id}/export.xlsx`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `job_${id}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
export async function downloadJobZip(id: string) {
  const { data } = await api.get(`/jobs/${encodeURIComponent(id)}/export.zip`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(new Blob([data], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `job_${id}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadJobXlsxWithImages(id: string) {
  const { data } = await api.get(`/jobs/${id}/export_with_images.xlsx`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `job_${id}_with_images.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function getSectorTemplate(sector: number) {
  const { data } = await api.get(`/jobs/templates/sector/${sector}`);
  return data as {
    requiredTypes: string[];
    labels: Record<string, string>;
    sector: number;
  };
}
