// src/pages/CreateTask.tsx
import { useMemo } from "react";
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

const phoneE164 = /^\+?[1-9]\d{6,14}$/;

const FormSchema = z.object({
  whatsappNumber: z.string().regex(phoneE164, "Use E.164 format like +1234567890"),
  sectorNumber: z.string().min(1, "Sector Number is required"),
});

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (job: BackendJob) => void; // <-- notify parent
};

export default function CreateTaskDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { whatsappNumber: "", sectorNumber: "" },
    mode: "onSubmit",
  });

  const closeAndReset = () => {
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const sector = Number(values.sectorNumber);
      // fetch sector template to get requiredTypes
      const tpl = await getSectorTemplate(sector);
      const requiredTypes = tpl.requiredTypes ?? [];

      const newJob = await createJob({
        workerPhone: values.whatsappNumber,
        requiredTypes,
        sector,
      });

      toast({
        title: "Job Created",
        description: `Job ${newJob.id} created for ${newJob.workerPhone} (sector ${newJob.sector ?? "—"})`,
      });

      onCreated?.(newJob);       // <-- let dashboard add it immediately
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
          <DialogDescription>Set up a new Twilio automation task</DialogDescription>
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
                        <FormLabel>Whatsapp Number *</FormLabel>
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
                          <Input type="number" min={0} placeholder="e.g. 1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter className="gap-2 sm:gap-3">
                  <Button type="button" variant="outline" onClick={closeAndReset}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting} className="min-w-28">
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
