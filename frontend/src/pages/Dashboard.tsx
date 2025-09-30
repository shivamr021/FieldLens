import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TaskCard } from "@/components/TaskCard";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { Plus, Search, Activity, Users, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import CreateTaskDialog from "./CreateTask";

// Mock data for demonstration
const mockTasks = [
  {
    id: "TSK_001",
    title: "Customer Survey Analysis",
    phoneNumber: "+1234567890",
    status: 'completed' as const,
    createdAt: "2024-01-15",
    assignedTo: "John Doe",
  },
  {
    id: "TSK_002", 
    title: "Product Feedback Collection",
    phoneNumber: "+0987654321",
    status: 'processing' as const,
    createdAt: "2024-01-14",
    assignedTo: "Jane Smith",
  },
  {
    id: "TSK_003",
    title: "Lead Qualification Call",
    phoneNumber: "+1122334455",
    status: 'pending' as const,
    createdAt: "2024-01-13",
  },
];

const stats = [
  { title: "Total Tasks", value: "127", icon: Activity, color: "text-primary" },
  {title:"TODO",value:"20",icon: Activity, color:"text-primary"},
  { title: "Completed", value: "89", icon: CheckCircle, color: "text-success" },
  { title: "Pending", value: "12", icon: Clock, color: "text-warning" },
];

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTask, setPreviewTask] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const filteredTasks = mockTasks.filter(task =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.phoneNumber.includes(searchQuery) ||
    task.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePreview = (taskId: string) => {
    setPreviewTask(taskId);
  };

  const handleExport = (taskId: string) => {
    toast({
      title: "Export Started",
      description: `Preparing ZIP file for task ${taskId}...`,
    });
    
    // Simulate export process
    setTimeout(() => {
      toast({
        title: "Export Complete",
        description: "Your ZIP file is ready for download.",
      });
    }, 2000);
  };
  const [openCreate, setOpenCreate] = useState(false);
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
      <CreateTaskDialog open={openCreate} onOpenChange={setOpenCreate} />
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Tasks */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks by ID, title, or phone number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPreview={handlePreview}
              onExport={handleExport}
            />
          ))}
        </div>

        {filteredTasks.length === 0 && (
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