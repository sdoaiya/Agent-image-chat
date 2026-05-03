export type TurnMode = "generate" | "reference";

export interface AttachmentRef {
  id: string;
  file: File;
  preview: string;
  source: "upload" | "workspace";
  name?: string;
}

export interface ModelCapabilities {
  supportsGenerate: boolean;
  supportsReferenceGeneration: boolean;
  resolutions: string[];
  maxReferenceImages: number;
  supportsMultiImageReference: boolean;
}
