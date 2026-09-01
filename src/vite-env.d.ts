/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_ADMIN_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
