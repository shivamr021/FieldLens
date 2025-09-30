import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// shadcn/ui form primitives
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";

import { useForm, useFieldArray, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const phoneE164 = /^\+?[1-9]\d{6,14}$/;

const FormSchema = z.object({
  whatsappNumber: z.string().regex(phoneE164, "Use E.164 format like +1234567890"),
  sectorNumber: z.string().min(1, "Sector Number is required"),
  // assignedTo: z.string().optional().default(""),
  // priority: z.enum(["low", "medium", "high", "urgent"]).optional().or(z.literal("")),
  // description: z.string().optional().default(""),
  // metadata: z
  //   .array(z.object({ key: z.string().min(1, "Key required"), value: z.string().min(1, "Value required") }))
  //   .default([]),
});

type FormValues = z.infer<typeof FormSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CreateTaskDialogRHF({ open, onOpenChange }: Props) {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      whatsappNumber: "",
      sectorNumber: "",
    },
    mode: "onSubmit",
  });

  // const { fields, append, remove } = useFieldArray({
  //   control: form.control,
  //   name: "metadata",
  // });

  // Convert metadata array → object on submit
  // const metadataObject = useMemo(() => {
  //   const out: Record<string, string> = {};
  //   for (const row of form.getValues("metadata")) {
  //     if (row.key) out[row.key] = row.value;
  //   }
  //   return out;
  // }, [form.watch("metadata")]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
    };

    // TODO: replace with your API call
    // await createTask(payload);
    toast({
      title: "Job Created",
      description: `Job has been created and assigned to ${values.whatsappNumber} in ${values.sectorNumber}`,
    });

    form.reset();
    onOpenChange(false);
  };

  const closeAndReset = () => {
    form.reset();
    onOpenChange(false);
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
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="whatsappNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Whatsapp Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="+91" {...field} />
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
                          <Input type="tel" placeholder="1,2,3,4" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Actions */}
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
