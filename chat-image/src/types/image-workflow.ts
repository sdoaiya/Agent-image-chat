export type TurnMode = "generate";

export interface AttachmentRef {
  id: string;
  file: File;
  preview: string;
  source: "upload" | "workspace";
  name?: string;
}

export interface ModelCapabilities {
  supportsGenerate: boolean;
  resolutions: string[];
  maxReferenceImages: number;
  supportsMultiImageReference: boolean;
  supportsEdit?: boolean;
  supportsUpscale?: boolean;
  upscaleFactors?: string[];
  supportsMask?: boolean;
}
