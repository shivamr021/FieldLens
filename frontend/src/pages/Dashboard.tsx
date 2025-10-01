// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TaskCard } from "@/components/TaskCard";
import FilePreviewModal from "@/components/FilePreviewModal";
import { Plus, Search, Activity, Users, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import CreateTaskDialog from "../components/CreateTask"; // must call onCreated(newJob)
import { fetchJobs, type BackendJob } from "@/lib/api";

// ────────────────────────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { toast } = useToast();

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTask, setPreviewTask] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  // Backend data
  const [jobs, setJobs] = useState<BackendJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load jobs from backend
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await fetchJobs();
        setJobs(data);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load jobs");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // When a job is created in the dialog, prepend it instantly
  const handleCreated = (job: BackendJob) => {
    setJobs((prev) => [job, ...prev]);
    toast({
      title: "Job created",
      description: `Job ${job.id} for ${job.workerPhone} added.`,
    });
    setOpenCreate(false);
  };

  // Map backend -> TaskCard props
  const uiTasks = useMemo(() => {
    const toIsoCreated = (j: BackendJob) => {
      if (j.createdAt) return j.createdAt;
      // fallback from Mongo ObjectId
      try {
        const secs = parseInt(j.id.slice(0, 8), 16);
        return new Date(secs * 1000).toISOString();
      } catch {
        return new Date().toISOString();
      }
    };
    const toUpper = (s: string) => (s ? s.toUpperCase() : s);

    return jobs.map((j) => ({
      id: j.id,
      // Always show WhatsApp in the title for consistency
      title: `Job • ${j.workerPhone}`,
      phoneNumber: j.workerPhone,
      status: toUpper(j.status) as "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED",
      createdAt: toIsoCreated(j),
      // keep sector if you want to show later: sector: j.sector
    }));
  }, [jobs]);

  // Live stats from jobs
  const liveStats = useMemo(() => {
    const total = uiTasks.length;
    const pending = uiTasks.filter((t) => t.status === "PENDING").length;
    const processing = uiTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const completed = uiTasks.filter((t) => t.status === "DONE").length;
    const failed = uiTasks.filter((t) => t.status === "FAILED").length;
    return { total, pending, processing, completed, failed };
  }, [uiTasks]);

  // Search filter
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return uiTasks;
    return uiTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.phoneNumber.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    );
  }, [uiTasks, searchQuery]);

  // Actions
  const handlePreview = (taskId: string) => setPreviewTask(taskId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Manage your Twilio and ML automation tasks</p>
        </div>
        <Button onClick={() => setOpenCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Task
        </Button>
      </div>

      {/* Create Task Dialog (notices parent onCreated) */}
      <CreateTaskDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={handleCreated}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tasks</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveStats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveStats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveStats.processing}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveStats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Task Grid */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks by ID, title, or phone number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading && <div className="text-muted-foreground">Loading jobs…</div>}
        {err && <div className="text-destructive">Error: {err}</div>}

        {!loading && !err && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} onPreview={handlePreview} />
            ))}
          </div>
        )}

        {!loading && !err && filteredTasks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No tasks found matching your search.</p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewTask}
        onClose={() => setPreviewTask(null)}
        taskId={previewTask || ""}
      />
    </div>
  );
}
