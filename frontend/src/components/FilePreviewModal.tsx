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

// If you have shadcn Select installed, use it for a nicer dropdown:
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

// Keep your canonical 14-step order so each sector shows in a consistent layout
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
  "CPRI TERM SWITCH ...", // adjust to exact string if needed
  "GROUNDING OGB T..."    // adjust to exact string if needed
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

  // sector state
  const sectors = useMemo(() => {
    if (!data?.photos) return [];
    const s = Array.from(
      new Set(
        data.photos
          .map((p: any) => Number(p.sector))
          .filter((n) => !Number.isNaN(n))
      )
    ).sort((a, b) => a - b);
    return s.length ? s : [1]; // fallback to Sector 1 if none found
  }, [data?.photos]);

  const [selectedSector, setSelectedSector] = useState<number | null>(null);

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
        // choose default sector once we know available sectors
        const s = Array.from(
          new Set(
            (res.photos || [])
              .map((p: any) => Number(p.sector))
              .filter((n: number) => !Number.isNaN(n))
          )
        ).sort((a, b) => a - b);
        setSelectedSector(s.length ? s[0] : 1);
      })
      .catch((e: any) => setErr(e?.message ?? "Failed to load job"))
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  const handleImageNameEdit = (id: string, value: string) => {
    setImageNames((prev) => ({ ...prev, [id]: value.trim() }));
    setEditingImage(null);
  };

  // Client-side sector filter + type order
  const visiblePhotos = useMemo(() => {
    if (!data?.photos) return [];
    const filtered = data.photos.filter(
      (p: any) => selectedSector == null || Number(p.sector) === Number(selectedSector)
    );
    return [...filtered].sort((a: any, b: any) => idxOfType(a.type) - idxOfType(b.type));
  }, [data?.photos, selectedSector]);

  // --- Optional: Server-side fetch when sector changes ---
  // If you add an API like GET /api/jobs/:id?sector=N, you can use this block instead of the client-side filter above.
  /*
  useEffect(() => {
    if (!isOpen || !taskId || selectedSector == null) return;
    setLoading(true);
    setErr(null);

    fetch(`/api/jobs/${taskId}?sector=${selectedSector}`)
      .then((r) => r.json())
      .then((res) => {
        // expecting { job, photos }
        setData((prev) => (res ? res : prev));
      })
      .catch((e) => setErr(e?.message ?? "Failed to load sector photos"))
      .finally(() => setLoading(false));
  }, [isOpen, taskId, selectedSector]);
  */

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
          { label: "Total Photos", value: String((data.photos?.length ?? 0)) },
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

            {/* Sector selector on the right */}
            {sectors.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sector</span>
                {/* shadcn Select */}
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
                {/* If you don't have shadcn Select, replace the above with:
                  <select
                    value={selectedSector ?? ""}
                    onChange={(e) => setSelectedSector(Number(e.target.value))}
                    className="border rounded-md px-3 py-2 text-sm"
                  >
                    {sectors.map((s) => (
                      <option key={s} value={s}>{`Sector ${s}`}</option>
                    ))}
                  </select>
                */}
              </div>
            )}
          </div>

          {/* ---------- IMAGES TAB ---------- */}
          <TabsContent value="images" className="flex-1 min-h-0">
            <div className="h-full overflow-y-auto">
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
                  {(!visiblePhotos || visiblePhotos.length === 0) ? (
                    <div className="rounded-lg border bg-muted p-6 text-muted-foreground">
                      {selectedSector != null
                        ? `No photos for Sector ${selectedSector}.`
                        : "No photos yet."}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {visiblePhotos.map((image: any) => (
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
                              className="mt-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground truncate uppercase tracking-wide"
                              onClick={() => setEditingImage(image.id)}
                              title={`${image.type} • Sector ${image.sector}`}
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
