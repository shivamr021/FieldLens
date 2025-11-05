// src/components/FilePreviewModal.tsx
import React, { useEffect, useMemo, useState } from "react";
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
} from "@/lib/api";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  isOpen: boolean;
  taskId: string;
  onClose: () => void;
};

type PhotoVM = {
  id?: string;
  _id?: string;
  s3Url?: string;
  localUrl?: string;
  type?: string;
  sector?: number | string;
  [k: string]: any;
};

// Canonical order so each sector appears in same layout
const TYPE_ORDER = [
  "INSTALLATION",
  "CLUTTER",
  "AZIMUTH",
  "A6 GROUNDING",
  "CPRI GROUNDING",
  "POWER TERM A6",
  "CPRI TERM A6",
  "TILT",
  "LABELLING",
  "ROXTEC",
  "A6 PANEL",
  "MCB POWER",
  "CPRI TERM SWITCH ...", // adjust if your exact strings differ
  "GROUNDING OGB T..."
];

const idxOfType = (t?: string) => {
  const i = TYPE_ORDER.findIndex(
    (x) => x.toLowerCase() === String(t || "").toLowerCase()
  );
  return i === -1 ? 999 : i;
};

export default function FilePreviewModal({ isOpen, taskId, onClose }: Props) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [imageNames, setImageNames] = useState<Record<string, string>>({});
  const [editingImage, setEditingImage] = useState<string | null>(null);

  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [sectorLoading, setSectorLoading] = useState(false);

  // 1) Initial load (no sector filter) just to get job + all photos, and discover which sectors exist
  useEffect(() => {
    if (!isOpen || !taskId) return;
    setLoading(true);
    setErr(null);
    setData(null);
    setImageNames({});
    setEditingImage(null);

    fetchJobDetail(taskId)
      .then((res) => {
        setData(res);
        // choose first available sector (1 if none)
        const s = Array.from(
          new Set(
            ((res.photos as any[]) ?? [])
              .map((p) => Number(p.sector))
              .filter((n) => Number.isFinite(n))
          )
        ).sort((a, b) => a - b);
        setSelectedSector(s.length ? s[0] : 1);
      })
      .catch((e: any) => setErr(e?.message ?? "Failed to load job"))
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  // Build sector options from whatever we received initially
  const sectors = useMemo(() => {
    const src = (data?.photos as any[] | undefined) ?? [];
    const s = Array.from(
      new Set(src.map((p) => Number(p.sector)).filter((n) => Number.isFinite(n)))
    ).sort((a, b) => a - b);
    return s.length ? s : [1];
  }, [data?.photos]);

  // 2) When sector changes, fetch server-filtered photos
  useEffect(() => {
    if (!isOpen || !taskId || selectedSector == null) return;
    setSectorLoading(true);
    setErr(null);

    // Use the same shape as fetchJobDetail returns: { job, photos }
    fetch(`/api/jobs/${taskId}?sector=${selectedSector}&t=${Date.now()}`, {
      headers: { "cache-control": "no-cache" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Sector fetch failed (${r.status})`);
        const res = await r.json();
        // keep job from previous, but replace photos with server-filtered
        setData((prev) => ({
          ...(res?.job ? res : { job: prev?.job, photos: res?.photos ?? [] }),
        }) as JobDetail);
      })
      .catch((e: any) => setErr(e?.message ?? "Failed to load sector photos"))
      .finally(() => setSectorLoading(false));
  }, [isOpen, taskId, selectedSector]);

  // 3) Sort (server already filtered by sector)
  const photosSorted = useMemo(() => {
    const src = (data?.photos as PhotoVM[] | undefined) ?? [];
    return [...src].sort((a, b) => idxOfType(a.type) - idxOfType(b.type));
  }, [data?.photos]);

  const handleImageNameEdit = (id: string, value: string) => {
    setImageNames((prev) => ({ ...prev, [id]: value.trim() }));
    setEditingImage(null);
  };

  const rows =
    data
      ? [
          { label: "Job ID", value: taskId },
          { label: "Worker Phone", value: (data as any).job?.workerPhone ?? "—" },
          { label: "Status", value: (data as any).job?.status ?? "—" },
          { label: "Sector", value: (data as any).job?.sector ?? "—" },
          { label: "MAC_Id", value: (data as any).job?.macId ?? "—" },
          { label: "RSN_Id", value: (data as any).job?.rsnId ?? "—" },
          { label: "AZIMUTH_Deg", value: (data as any).job?.azimuthDeg ?? "—" },
          {
            label: "Required Types",
            value: Array.isArray((data as any).job?.requiredTypes)
              ? (data as any).job?.requiredTypes.join(", ")
              : "—",
          },
          { label: "Total Photos", value: String((data?.photos as any[])?.length ?? 0) },
          { label: "Created At", value: String((data as any).job?.createdAt ?? "—") },
        ]
      : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Job Preview — {taskId}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="images" className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between pb-2">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="excel">Excel</TabsTrigger>
            </TabsList>

            {/* Sector selector */}
            {!!sectors.length && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sector</span>
                <Select
                  value={selectedSector?.toString() ?? ""}
                  onValueChange={(v) => setSelectedSector(Number(v))}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {`Sector ${s}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ---------- IMAGES TAB ---------- */}
          <TabsContent value="images" className="flex-1 min-h-0">
            <div className="h-full overflow-y-auto">
              {(loading || sectorLoading) && (
                <div className="rounded-lg border bg-muted p-6 text-muted-foreground">
                  {loading ? "Loading details…" : `Loading Sector ${selectedSector} photos…`}
                </div>
              )}
              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
                  {err}
                </div>
              )}
              {!loading && !sectorLoading && !err && (
                <>
                  {!photosSorted.length ? (
                    <div className="rounded-lg border bg-muted p-6 text-muted-foreground">
                      {selectedSector != null
                        ? `No photos for Sector ${selectedSector}.`
                        : "No photos yet."}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {photosSorted.map((image) => {
                        const key = image.id || image._id || `${image.type}-${image.s3Url}`;
                        const src = image.s3Url || image.localUrl;
                        return (
                          <figure key={key} className="shrink-0 w-32">
                            <div className="relative group">
                              {src ? (
                                <img
                                  src={src}
                                  alt={image.type || "Photo"}
                                  className="w-32 h-32 object-cover rounded-md border"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-32 h-32 flex items-center justify-center text-xs text-gray-400 rounded-md border bg-white">
                                  No Image
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingImage((image.id || image._id) as string)}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>

                            {(editingImage === image.id || editingImage === image._id) ? (
                              <Input
                                defaultValue={imageNames[(image.id || image._id) as string] || image.type || ""}
                                onBlur={(e) =>
                                  handleImageNameEdit(
                                    (image.id || image._id) as string,
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleImageNameEdit(
                                      (image.id || image._id) as string,
                                      (e.target as HTMLInputElement).value
                                    );
                                  }
                                }}
                                className="mt-1 h-7 text-xs"
                                autoFocus
                              />
                            ) : (
                              <figcaption
                                className="mt-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground truncate uppercase tracking-wide"
                                onClick={() => setEditingImage((image.id || image._id) as string)}
                                title={`${image.type ?? "Photo"}`}
                              >
                                {imageNames[(image.id || image._id) as string] || image.type || "PHOTO"}
                              </figcaption>
                            )}
                          </figure>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ---------- EXCEL TAB ---------- */}
          <TabsContent value="excel" className="flex-1 min-h-0">
            <div className="h-full overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Job Report Data</h3>
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
                  <thead className="bg-muted sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3 font-medium">Label</th>
                      <th className="text-left p-3 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data
                      ? [
                          { label: "Job ID", value: taskId },
                          { label: "Worker Phone", value: (data as any).job?.workerPhone ?? "—" },
                          { label: "Status", value: (data as any).job?.status ?? "—" },
                          { label: "Sector", value: (data as any).job?.sector ?? "—" },
                          { label: "MAC_Id", value: (data as any).job?.macId ?? "—" },
                          { label: "RSN_Id", value: (data as any).job?.rsnId ?? "—" },
                          { label: "AZIMUTH_Deg", value: (data as any).job?.azimuthDeg ?? "—" },
                          {
                            label: "Required Types",
                            value: Array.isArray((data as any).job?.requiredTypes)
                              ? (data as any).job?.requiredTypes.join(", ")
                              : "—",
                          },
                          { label: "Total Photos", value: String((data?.photos as any[])?.length ?? 0) },
                          { label: "Created At", value: String((data as any).job?.createdAt ?? "—") },
                        ]
                      : []
                    ).map((row, idx) => (
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

        {/* ---------- FOOTER ---------- */}
        <div className="shrink-0 flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => downloadJobXlsxWithImages(taskId)} disabled={!data || loading}>
            <Download className="w-4 h-4 mr-2" />
            Download Excel (with images)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
