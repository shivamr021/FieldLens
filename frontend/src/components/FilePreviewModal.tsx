import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit3, Download, Folder, Image as ImageIcon } from "lucide-react";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
}

// Mock data for demonstration
const mockFolders = [
  {
    name: "Folder 1",
    images: Array.from({ length: 14 }, (_, i) => ({
      id: `f1_img_${i + 1}`,
      name: `image_${i + 1}.jpg`,
      url: `https://picsum.photos/300/200?random=${i + 1}`,
    }))
  },
  {
    name: "Folder 2", 
    images: Array.from({ length: 14 }, (_, i) => ({
      id: `f2_img_${i + 1}`,
      name: `photo_${i + 1}.jpg`,
      url: `https://picsum.photos/300/200?random=${i + 15}`,
    }))
  },
  {
    name: "Folder 3",
    images: Array.from({ length: 14 }, (_, i) => ({
      id: `f3_img_${i + 1}`,
      name: `scan_${i + 1}.jpg`,
      url: `https://picsum.photos/300/200?random=${i + 29}`,
    }))
  }
];

const mockExcelData = [
  { label: "Task ID", value: "TSK_001" },
  { label: "Phone Number", value: "+1234567890" },
  { label: "Status", value: "Completed" },
  { label: "Processed Images", value: "42" },
  { label: "Success Rate", value: "98.5%" },
  { label: "Processing Time", value: "2m 34s" },
];

export function FilePreviewModal({ isOpen, onClose, taskId }: FilePreviewModalProps) {
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [imageNames, setImageNames] = useState<Record<string, string>>({});

  const handleImageNameEdit = (imageId: string, newName: string) => {
    setImageNames(prev => ({ ...prev, [imageId]: newName }));
    setEditingImage(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Task Preview - {taskId}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="folders" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="folders">Image Folders</TabsTrigger>
            <TabsTrigger value="excel">Excel Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="mt-4 overflow-y-auto h-[calc(100%-8rem)]">
            <div className="space-y-6">
              {mockFolders.map((folder, folderIndex) => (
                <div key={folderIndex} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Folder className="w-5 h-5 text-primary" />
                    <h3 className="font-medium">{folder.name}</h3>
                    <Badge variant="secondary">{folder.images.length} images</Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {folder.images.map((image) => (
                      <div key={image.id} className="space-y-2">
                        <div className="relative group">
                          <img
                            src={image.url}
                            alt={imageNames[image.id] || image.name}
                            className="w-full h-24 object-cover rounded-md border"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingImage(image.id)}
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {editingImage === image.id ? (
                          <Input
                            defaultValue={imageNames[image.id] || image.name}
                            onBlur={(e) => handleImageNameEdit(image.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleImageNameEdit(image.id, e.currentTarget.value);
                              }
                            }}
                            className="text-xs"
                            autoFocus
                          />
                        ) : (
                          <p 
                            className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                            onClick={() => setEditingImage(image.id)}
                          >
                            {imageNames[image.id] || image.name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="excel" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Task Report Data</h3>
                <Button size="sm" variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download Excel
                </Button>
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-medium">Label</th>
                      <th className="text-left p-3 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockExcelData.map((row, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-3 font-medium">{row.label}</td>
                        <td className="p-3">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Export as ZIP
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}