// src/components/FilePreviewModal.tsx
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Edit3, Image as ImageIcon } from "lucide-react";

import {
  fetchJobDetail,
  downloadJobXlsx,
  downloadJobXlsxWithImages,
  type JobDetail,
  type PhotoItem,
} from "@/lib/api";

type Props = {
  isOpen: boolean;
  taskId: string;
  onClose: () => void;
};

export default function FilePreviewModal({ isOpen, taskId, onClose }: Props) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  
  const [imageNames, setImageNames] = useState<Record<string, string>>({});
  const [editingImage, setEditingImage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !taskId) return;
    setLoading(true);
    setErr(null);
    setData(null);
    setImageNames({});
    setEditingImage(null);

    fetchJobDetail(taskId)
      .then((res) => setData(res))
      .catch((e: any) => setErr(e?.message ?? "Failed to load job"))
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  const handleImageNameEdit = (id: string, value: string) => {
    setImageNames((prev) => ({ ...prev, [id]: value.trim() }));
    setEditingImage(null);
  };

  const rows = [
    { label: "Job ID", value: taskId },
    { label: "Worker Phone", value: data?.job.workerPhone ?? "—" },
    { label: "Status", value: data?.job.status ?? "—" },
    { label: "Sector", value: data?.job.sector ?? "—" },
    {
      label: "Required Types",
      value: Array.isArray(data?.job.requiredTypes)
        ? data?.job.requiredTypes.join(", ")
        : "—",
    },
    { label: "Total Photos", value: String(data?.photos?.length ?? 0) },
    { label: "Created At", value: data?.job.createdAt ?? "—" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Job Preview — {taskId}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="images" className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="excel">Excel Preview</TabsTrigger>
            </TabsList>
          </div>

          {/* ---------- IMAGES TAB ---------- */}
          <TabsContent
            value="images"
            className="mt-4 overflow-y-auto h-[calc(100%-8rem)]"
          >
            {loading && (
              <div className="rounded-lg border bg-muted p-6 text-muted-foreground">
                Loading details…
              </div>
            )}
            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
                {err}
              </div>
            )}

            {!loading && !err && (
              <>
                {(!data?.photos || data.photos.length === 0) ? (
                  <div className="rounded-lg border bg-muted p-6 text-muted-foreground">
                    No photos yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {data.photos.map((image) => (
                      <figure key={image.id} className="shrink-0 w-32">
                        <div className="relative group">
                          <img
                            src={image.s3Url}
                            alt={image.type}
                            className="w-32 h-32 object-cover rounded-md border"
                            loading="lazy"
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
                            defaultValue={imageNames[image.id] || image.type}
                            onBlur={(e) => handleImageNameEdit(image.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleImageNameEdit(
                                  image.id,
                                  (e.target as HTMLInputElement).value
                                );
                              }
                            }}
                            className="mt-1 h-7 text-xs"
                            autoFocus
                          />
                        ) : (
                          <figcaption
                            className="mt-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground truncate"
                            onClick={() => setEditingImage(image.id)}
                            title={image.s3Url}
                          >
                            {imageNames[image.id] || image.type}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ---------- EXCEL TAB ---------- */}
          <TabsContent value="excel" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Task Report Data</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadJobXlsx(taskId)}
                  disabled={!data || loading}
                >
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
                    {rows.map((row, idx) => (
                      <tr key={idx} className="border-t">
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

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => downloadJobXlsxWithImages(taskId)}
            disabled={!data || loading}
          >
            <Download className="w-4 h-4 mr-2" />
            Download Excel (with images)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
