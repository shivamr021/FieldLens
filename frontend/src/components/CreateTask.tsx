// src/pages/CreateTask.tsx
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createJob, getSectorTemplate, type BackendJob } from "@/lib/api";

// Simple E.164 check (+country then 7-14 digits)
const phoneE164 = /^\+?[1-9]\d{6,14}$/;

const FormSchema = z.object({
  whatsappNumber: z.string().regex(phoneE164, "Use E.164 format like +1234567890"),
  sectorNumber: z.string().min(1, "Sector Number is required"),
});

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (job: BackendJob) => void;
};

// A tiny pill for visualizing requiredTypes
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

export default function CreateTaskDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { whatsappNumber: "", sectorNumber: "" },
    mode: "onSubmit",
  });

  // Template state
  const [tplLoading, setTplLoading] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const [requiredTypes, setRequiredTypes] = useState<string[]>([]);

  const sector = useMemo(() => {
    const raw = form.getValues("sectorNumber");
    const n = Number(raw);
    return Number.isFinite(n) && raw !== "" ? n : null;
  }, [form.watch("sectorNumber")]);

  // Fetch template each time a valid sector is entered
  useEffect(() => {
    let abort = false;
    async function load() {
      setTplError(null);
      setRequiredTypes([]);
      if (sector === null) return;
      setTplLoading(true);
      try {
        const tpl = await getSectorTemplate(sector);
        if (!abort) {
          const types = Array.isArray(tpl?.requiredTypes) ? tpl.requiredTypes : [];
          setRequiredTypes(types);
        }
      } catch (e: any) {
        if (!abort) {
          setTplError(e?.message ?? "Failed to load template");
        }
      } finally {
        if (!abort) setTplLoading(false);
      }
    }
    load();
    return () => {
      abort = true;
    };
  }, [sector]);

  const closeAndReset = () => {
    form.reset();
    setTplError(null);
    setRequiredTypes([]);
    setTplLoading(false);
    onOpenChange(false);
  };

  // Gentle normalization: if the user forgot the "+", add it.
  const normalizePhone = (v: string) => (v.startsWith("+") ? v : `+${v}`);

  const onSubmit = async (values: FormValues) => {
    try {
      if (sector === null) {
        form.setError("sectorNumber", { type: "manual", message: "Enter a valid sector" });
        return;
      }
      if (tplLoading) {
        toast({ title: "Please wait", description: "Loading sector template…" });
        return;
      }
      if (!requiredTypes.length) {
        toast({
          title: "Template not ready",
          description:
            tplError ??
            "No required photo types were returned for this sector. Please recheck the sector number.",
          variant: "destructive",
        });
        return;
      }

      const newJob = await createJob({
        workerPhone: normalizePhone(values.whatsappNumber.trim()),
        requiredTypes,
        sector,
      });

      toast({
        title: "Job Created",
        description: `Job ${newJob.id} created for ${newJob.workerPhone} (sector ${newJob.sector ?? "—"})`,
      });

      onCreated?.(newJob);
      closeAndReset();
    } catch (e: any) {
      toast({
        title: "Create failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : closeAndReset())}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>Set up a new WhatsApp field-collection job</DialogDescription>
        </DialogHeader>

        <Card className="shadow-none border-0">
          <CardHeader className="px-6 pt-0">
            <CardTitle className="text-base text-muted-foreground">Task Details</CardTitle>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="whatsappNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="+91..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sectorNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sector Number *</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} placeholder="e.g. 2" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Template Preview */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Required Photos</div>
                    {tplLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        Loading template…
                      </div>
                    )}
                  </div>

                  {tplError && (
                    <p className="mt-2 text-sm text-red-600">
                      {tplError} — cannot create a job until template loads.
                    </p>
                  )}

                  {!tplLoading && !tplError && (
                    <>
                      {requiredTypes.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {requiredTypes.map((t) => (
                            <Chip key={t}>{t}</Chip>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Enter a valid sector to load template types.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-3">
                  <Button type="button" variant="outline" onClick={closeAndReset}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="min-w-28"
                    disabled={form.formState.isSubmitting || tplLoading || !requiredTypes.length}
                  >
                    {form.formState.isSubmitting ? "Creating…" : "Create Task"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
