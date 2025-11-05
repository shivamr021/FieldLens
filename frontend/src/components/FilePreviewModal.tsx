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

type Props = { isOpen: boolean; taskId: string; onClose: () => void };

type PhotoVM = {
  id?: string;
  _id?: string;
  s3Url?: string;
  localUrl?: string;
  type?: string;
  sector?: number | string; // may or may not exist
  createdAt?: string | number | Date;
  [k: string]: any;
};

// 14-step canonical order
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

const typeIndex = (t?: string) => {
  const i = TYPE_ORDER.findIndex(x => x.toLowerCase() === String(t || "").toLowerCase());
  return i === -1 ? 999 : i;
};

// Try read numeric sector if present
const readSector = (p: PhotoVM): number | null => {
  const raw = p.sector ?? p.Sector ?? p.meta?.sector ?? null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

// Sort helper for stability (createdAt -> _id)
const byTimeThenId = (a: PhotoVM, b: PhotoVM) => {
  const ta = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
  if (ta !== tb) return ta - tb;
  const ai = String(a._id || a.id || "");
  const bi = String(b._id || b.id || "");
  return ai.localeCompare(bi);
};

export default function FilePreviewModal({ isOpen, taskId, onClose }: Props) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [imageNames, setImageNames] = useState<Record<string, string>>({});
  const [editingImage, setEditingImage] = useState<string | null>(null);

  // fetch once (we’ll sectorize on the client)
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

  const photos: PhotoVM[] = (data?.photos as any[]) ?? [];

  // 1) Group photos by type, sorted by time/id
  const groupsByType = useMemo(() => {
    const map = new Map<string, PhotoVM[]>();
    photos.forEach((p) => {
      // --- RECOMMENDED FIX: Normalize key to uppercase to match TYPE_ORDER ---
      const key = (p.type || "UNKNOWN").toString().toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    // sort each group (so “nth photo” is deterministic)
    for (const [k, arr] of map) arr.sort(byTimeThenId);
    return map;
  }, [photos]);

  // 2) Detect available sectors
  //    If any photo has an explicit sector, we collect those.
  //    Otherwise we infer sector count = max group size (how many photos per type).
  const sectors = useMemo(() => {
    const explicit = new Set<number>();
    let inferredMax = 0;

    for (const arr of groupsByType.values()) {
      // explicit sectors present?
      arr.forEach((p) => {
        const s = readSector(p);
        if (s !== null) explicit.add(s);
      });
      // count per type to infer “number of sectors” if explicit missing
      if (arr.length > inferredMax) inferredMax = arr.length;
    }

    if (explicit.size > 0) {
      return Array.from(explicit).sort((a, b) => a - b);
    }
    // infer sectors as 1..max
    const count = Math.max(1, Math.min(inferredMax, 6)); // safety cap
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [groupsByType]);

  const [selectedSector, setSelectedSector] = useState<number | null>(null);

  // --- FIX 1: This effect now *only* depends on `sectors` ---
  // This prevents the user's selection from being reset incorrectly.
  useEffect(() => {
    if (sectors.length === 0) {
      return;
    }

    if (selectedSector == null) {
      // Case 1: No sector is selected (e.g., initial load), default to the first.
      setSelectedSector(sectors[0]);
    } else if (!sectors.includes(selectedSector)) {
      // Case 2: A sector is selected, but it's no longer in the list (e.g., data re-loaded).
      // Reset to the first valid sector.
      setSelectedSector(sectors[0]);
    }
    
  }, [sectors]); // <-- Only depend on `sectors`

  // 3) Build the sector view
  // --- FIX 2: This is the fully corrected logic ---
  const visiblePhotos: PhotoVM[] = useMemo(() => {
    if (!selectedSector) return [];

    const out: PhotoVM[] = [];
    
    for (const t of TYPE_ORDER) {
      const arr = groupsByType.get(t) || [];
      if (arr.length === 0) continue; // Skip if no photos for this type

      let chosen: PhotoVM | undefined = undefined;
      
      // 1. Check if this specific type-group has *any* explicit sectors.
      const hasExplicitSectors = arr.some((p) => readSector(p) !== null);

      if (hasExplicitSectors) {
        // STRATEGY 1: EXPLICIT
        // This group uses explicit sector tags. Find the one matching the
        // selected sector. If no photo is tagged for this sector,
        // we show nothing for this type (which is correct).
        chosen = arr.find((p) => readSector(p) === selectedSector);

      } else {
        // STRATEGY 2: INFERRED (FALLBACK)
        // This group does *not* use explicit tags.
        // We fall back to "Nth photo" logic (e.g., Sector 2 -> 2nd photo).
        const idx = selectedSector - 1;
        if (idx >= 0 && idx < arr.length) {
          chosen = arr[idx];
        }
      }

      if (chosen) {
        out.push(chosen);
      }
    }
    // Keep fixed order by TYPE_ORDER
    return out;
  }, [groupsByType, selectedSector]);

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

  const handleImageNameEdit = (id: string, value: string) => {
    setImageNames((prev) => ({ ...prev, [id]: value.trim() }));
    setEditingImage(null);
  };

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
                      {visiblePhotos.map((image) => {
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

        <div className="shrink-0 flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => downloadJobXlsxWithImages(taskId)} disabled={!data || loading}>
            <Download className="w-4 h-4 mr-2" />
            Download Excel (with images)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
