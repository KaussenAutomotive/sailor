interface Window {
  sailor?: {
    save(content: string): Promise<boolean>;
    open(): Promise<string | null>;
  };
}
