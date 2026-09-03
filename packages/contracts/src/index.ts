import { z } from "zod";

export const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

export const passwordSchema = z.string().min(12).max(128);

export const authRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const providerCapabilitiesSchema = z.object({
  accessMode: z.enum(["server_oauth", "user_picker"]),
  canEnumerateLibrary: z.boolean(),
  canFilterByDateServerSide: z.boolean(),
  canReadMediaBytes: z.boolean(),
  canReadCaptureTime: z.boolean(),
  canReadLocation: z.boolean(),
  canReadExif: z.boolean(),
  canGetThumbnail: z.boolean(),
  canGetOriginal: z.boolean(),
  canOpenInProvider: z.boolean()
});

export const providerMediaSchema = z.object({
  providerAssetId: z.string().min(1),
  mediaKind: z.enum(["image", "video", "other"]),
  capturedAtUtc: z.string().datetime().nullable(),
  capturedAtLocal: z.string().datetime({ local: true }).nullable(),
  capturedOffsetMinutes: z.number().int().min(-840).max(840).nullable(),
  capturedTimeSource: z.enum(["exif", "provider", "file_mtime", "unknown"]),
  contentHash: z.string().nullable(),
  eTag: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mimeType: z.string().nullable(),
  filename: z.string().nullable(),
  providerMetadata: z.record(z.unknown())
});

export const discoveryPageSchema = z.object({
  status: z.enum(["complete", "partial", "user_action_required", "failed"]),
  items: z.array(providerMediaSchema),
  nextCursor: z.string().nullable(),
  syncCursor: z.string().nullable(),
  warning: z.string().nullable()
});

export const providerDescriptorSchema = z.object({
  type: z.string().min(1),
  displayName: z.string().min(1),
  configured: z.boolean(),
  capabilities: providerCapabilitiesSchema
});

export const dateRangeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  timezone: z.string().min(1)
}).refine((range) => range.startDate <= range.endDate, {
  message: "startDate must not be after endDate"
});

export type AuthRequest = z.infer<typeof authRequestSchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;
export type ProviderMedia = z.infer<typeof providerMediaSchema>;
export type DiscoveryPage = z.infer<typeof discoveryPageSchema>;
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
