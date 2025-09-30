import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Archive, Calendar, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Mock export data
const mockExports = [
  {
    id: "EXP_001",
    taskId: "TSK_045",
    taskTitle: "Market Research Survey", 
    createdAt: "2024-01-11",
    size: "15.2 MB",
    fileCount: 42,
    status: 'ready' as const,
    downloadUrl: "#",
  },
  {
    id: "EXP_002",
    taskId: "TSK_043",
    taskTitle: "Product Demo Follow-up",
    createdAt: "2024-01-08",
    size: "8.7 MB", 
    fileCount: 28,
    status: 'ready' as const,
    downloadUrl: "#",
  },
  {
    id: "EXP_003",
    taskId: "TSK_041",
    taskTitle: "Customer Feedback Collection",
    createdAt: "2024-01-05",
    size: "22.1 MB",
    fileCount: 56,
    status: 'archived' as const,
    downloadUrl: "#",
  },
];

const statusColors = {
  ready: 'bg-success text-success-foreground',
  processing: 'bg-info text-info-foreground', 
  archived: 'bg-muted text-muted-foreground',
  expired: 'bg-destructive text-destructive-foreground',
};

export default function Exports() {
  const navigate = useNavigate();
  const [downloads] = useState<Record<string, boolean>>({});

  const handleDownload = (exportItem: any) => {
    // Simulate download
    const link = document.createElement('a');
    link.href = exportItem.downloadUrl;
    link.download = `${exportItem.taskId}_export.zip`;
    link.click();
  };

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
          <h1 className="text-2xl font-semibold text-foreground">Export Files</h1>
          <p className="text-muted-foreground">Download and manage exported task files</p>
        </div>
      </div>

      {/* Export Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready Downloads</CardTitle>
            <Download className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockExports.filter(e => e.status === 'ready').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileText className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockExports.reduce((acc, exp) => acc + exp.fileCount, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
            <Archive className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">46.0 MB</div>
          </CardContent>
        </Card>
      </div>

      {/* Export List */}
      <Card>
        <CardHeader>
          <CardTitle>Available Exports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockExports.map((exportItem) => (
              <div 
                key={exportItem.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-foreground">{exportItem.taskTitle}</h3>
                      <Badge className={statusColors[exportItem.status]}>
                        {exportItem.status.charAt(0).toUpperCase() + exportItem.status.slice(1)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Export ID:</span> {exportItem.id}
                      </div>
                      <div>
                        <span className="font-medium">Task ID:</span> {exportItem.taskId}
                      </div>
                      <div>
                        <span className="font-medium">File Count:</span> {exportItem.fileCount}
                      </div>
                      <div>
                        <span className="font-medium">Size:</span> {exportItem.size}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Created: {new Date(exportItem.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {exportItem.status === 'ready' && (
                      <Button 
                        onClick={() => handleDownload(exportItem)}
                        className="gap-2"
                        disabled={downloads[exportItem.id]}
                      >
                        <Download className="w-4 h-4" />
                        {downloads[exportItem.id] ? 'Downloading...' : 'Download ZIP'}
                      </Button>
                    )}
                    
                    {exportItem.status === 'archived' && (
                      <Button variant="outline" disabled>
                        <Archive className="w-4 h-4 mr-2" />
                        Archived
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {mockExports.length === 0 && (
              <div className="text-center py-12">
                <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No exports available yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Completed tasks will appear here for download.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}