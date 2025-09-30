import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Eye, Download, Phone, Calendar, User } from "lucide-react";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    phoneNumber: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: string;
    assignedTo?: string;
    metadata?: Record<string, any>;
  };
  onPreview: (taskId: string) => void;
  onExport: (taskId: string) => void;
}

const statusColors = {
  pending: 'bg-warning text-warning-foreground',
  processing: 'bg-info text-info-foreground',
  completed: 'bg-success text-success-foreground',
  failed: 'bg-destructive text-destructive-foreground',
};

export function TaskCard({ task, onPreview, onExport }: TaskCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-foreground">{task.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">ID: {task.id}</p>
          </div>
          <Badge className={statusColors[task.status]}>
            {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
          </Badge>
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
            {new Date(task.createdAt).toLocaleDateString()}
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
            
            {task.status === 'completed' && (
              <Button 
                size="sm" 
                variant="default" 
                onClick={() => onExport(task.id)}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}