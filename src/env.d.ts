interface Window {
  sailor?: {
    save(content: string): Promise<boolean>;
    open(): Promise<string | null>;
    saveImage(dataUrl: string): Promise<boolean>;
    saveStep(content: string): Promise<boolean>;
  };
}
