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

  // fetch once
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

  // 1) Group photos by type
  const groupsByType = useMemo(() => {
    const map = new Map<string, PhotoVM[]>();
    photos.forEach((p) => {
      const key = (p.type || "UNKNOWN").toString().toUpperCase(); // Normalized
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    for (const [k, arr] of map) arr.sort(byTimeThenId);
    return map;
  }, [photos]);

  // 2) Detect available sectors
  const sectors = useMemo(() => {
    const explicit = new Set<number>();
    let inferredMax = 0;

    for (const arr of groupsByType.values()) {
      arr.forEach((p) => {
        const s = readSector(p);
        if (s !== null) explicit.add(s);
      });
      if (arr.length > inferredMax) inferredMax = arr.length;
    }

    if (explicit.size > 0) {
      return Array.from(explicit).sort((a, b) => a - b);
    }
    const count = Math.max(1, Math.min(inferredMax, 6));
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [groupsByType]);

  // --- CHANGED 1: State is now a string ---
  const [selectedSector, setSelectedSector] = useState<string>("");

  // --- CHANGED 2: useEffect works with strings ---
  useEffect(() => {
    if (sectors.length === 0) {
      setSelectedSector(""); // Reset to empty string
      return;
    }

    // Get first sector as a string
    const firstSector = sectors[0].toString();

    if (selectedSector === "") {
      // Case 1: No sector selected (initial load)
      setSelectedSector(firstSector);
    } else if (!sectors.map(s => s.toString()).includes(selectedSector)) {
      // Case 2: Selected sector is no longer valid
      setSelectedSector(firstSector);
    }
    
  }, [sectors]); // Only depends on sectors list

  // 3) Build the sector view
  const visiblePhotos: PhotoVM[] = useMemo(() => {
    // --- DEBUGGING: Check your browser console (F12) ---
    console.log(`--- Re-running visiblePhotos for sector: "${selectedSector}" ---`);

    // --- CHANGED 4: Convert string state to number for logic ---
    const currentSectorNum = Number(selectedSector);
    if (!currentSectorNum) {
      console.log("No valid sector number, returning empty.");
      return []; // No valid sector selected
    }

    const out: PhotoVM[] = [];
    
    for (const t of TYPE_ORDER) {
      const arr = groupsByType.get(t) || [];
      if (arr.length === 0) continue; 

      let chosen: PhotoVM | undefined = undefined;
      
      const hasExplicitSectors = arr.some((p) => readSector(p) !== null);

      if (hasExplicitSectors) {
        // STRATEGY 1: EXPLICIT
        chosen = arr.find((p) => readSector(p) === currentSectorNum);
        
      } else {
        // STRATEGY 2: INFERRED (FALLBACK)
        const idx = currentSectorNum - 1; // 1-based index to 0-based
        if (idx >= 0 && idx < arr.length) {
          chosen = arr[idx];
        }
      }

      if (chosen) {
        out.push(chosen);
      }
    }
    
    console.log(`--- Found ${out.length} photos for sector ${currentSectorNum} ---`);
    return out;
  }, [groupsByType, selectedSector]); // Dependency is now the string state

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
          </DialeftgTitle>
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
                {/* --- CHANGED 3: Select component now uses string state directly --- */}
                <Select
                  value={selectedSector}
                  onValueChange={(v) => setSelectedSector(v)}
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
                      {selectedSector != ""
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
