import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eye, Download, Phone, Calendar, User } from "lucide-react";
import { downloadJobZip } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    phoneNumber: string;
    status: TaskStatus;
    createdAt: string;
    assignedTo?: string;
    metadata?: Record<string, any>;
  };
  onPreview: (taskId: string) => void;
}

// map uppercase backend statuses to your Tailwind color classes
const statusClasses: Record<TaskStatus, string> = {
  PENDING: "bg-warning text-warning-foreground",
  IN_PROGRESS: "bg-info text-info-foreground",
  DONE: "bg-success text-success-foreground",
  FAILED: "bg-destructive text-destructive-foreground",
};

function prettyStatus(s: TaskStatus) {
  switch (s) {
    case "PENDING":
      return "Pending";
    case "IN_PROGRESS":
      return "In Progress";
    case "DONE":
      return "Completed";
    case "FAILED":
      return "Failed";
  }
}

export function TaskCard({ task, onPreview }: TaskCardProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleExport = async (taskId: string) => {
    setDownloading(true);
    toast({ title: "Export started", description: `Preparing ZIP for ${taskId}...` });
    try {
      await downloadJobZip(taskId);
      toast({ title: "Export complete", description: "ZIP downloaded." });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-foreground">{task.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">ID: {task.id}</p>
          </div>
          <Badge className={statusClasses[task.status]}>{prettyStatus(task.status)}</Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center text-sm text-muted-foreground">
            <Phone className="w-4 h-4 mr-2" />
            {task.phoneNumber}
          </div>

          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="w-4 h-4 mr-2" />
            {new Date(task.createdAt).toLocaleString()}
          </div>

          {task.assignedTo && (
            <div className="flex items-center text-sm text-muted-foreground">
              <User className="w-4 h-4 mr-2" />
              {task.assignedTo}
            </div>
          )}

          <div className="flex gap-2 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPreview(task.id)}
              className="flex-1"
            >
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>

            {task.status === "DONE" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => handleExport(task.id)}
                className="flex-1"
                disabled={downloading}
              >
                <Download className="w-4 h-4 mr-1" />
                {downloading ? "Exporting…" : "Export"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
