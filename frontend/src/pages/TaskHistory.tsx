import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, Filter, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Mock historical data
const mockHistory = [
  {
    id: "TSK_045",
    title: "Market Research Survey",
    phoneNumber: "+1555123456",
    status: 'completed' as const,
    createdAt: "2024-01-10",
    completedAt: "2024-01-11",
    assignedTo: "Alice Johnson",
    duration: "1h 23m",
    filesGenerated: 42,
  },
  {
    id: "TSK_044",
    title: "Customer Satisfaction Call",
    phoneNumber: "+1555987654",
    status: 'failed' as const,
    createdAt: "2024-01-09",
    completedAt: "2024-01-09",
    assignedTo: "Bob Smith",
    duration: "0h 15m",
    filesGenerated: 0,
    error: "Connection timeout",
  },
  {
    id: "TSK_043",
    title: "Product Demo Follow-up",
    phoneNumber: "+1555456789",
    status: 'completed' as const,
    createdAt: "2024-01-08",
    completedAt: "2024-01-08",
    assignedTo: "Carol Davis",
    duration: "0h 45m",
    filesGenerated: 28,
  },
];

const statusColors = {
  completed: 'bg-success text-success-foreground',
  failed: 'bg-destructive text-destructive-foreground',
  pending: 'bg-warning text-warning-foreground',
  processing: 'bg-info text-info-foreground',
};

export default function TaskHistory() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredHistory = mockHistory.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.phoneNumber.includes(searchQuery) ||
                         task.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/')}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Task History</h1>
          <p className="text-muted-foreground">View completed and past automation tasks</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by task ID, title, or phone number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Task History ({filteredHistory.length} tasks)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredHistory.map((task) => (
              <div 
                key={task.id} 
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-foreground">{task.title}</h3>
                      <Badge className={statusColors[task.status]}>
                        {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Task ID:</span> {task.id}
                      </div>
                      <div>
                        <span className="font-medium">Phone:</span> {task.phoneNumber}
                      </div>
                      <div>
                        <span className="font-medium">Assigned to:</span> {task.assignedTo}
                      </div>
                      <div>
                        <span className="font-medium">Duration:</span> {task.duration}
                      </div>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Created:</span> {new Date(task.createdAt).toLocaleDateString()}
                      {task.completedAt && (
                        <>
                          {" • "}
                          <span className="font-medium">Completed:</span> {new Date(task.completedAt).toLocaleDateString()}
                        </>
                      )}
                    </div>
                    
                    {task.error && (
                      <div className="text-sm text-destructive">
                        <span className="font-medium">Error:</span> {task.error}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {task.status === 'completed' && (
                      <>
                        <Badge variant="secondary">
                          {task.filesGenerated} files
                        </Badge>
                        <Button size="sm" variant="outline">
                          <Download className="w-4 h-4 mr-1" />
                          Export
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {filteredHistory.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No tasks found matching your criteria.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}