/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_MAILBOX_SYNC_URL?: string;
	readonly VITE_MAILBOX_API_URL?: string;
	readonly VITE_CRM_API_BASE_URL?: string;
	readonly VITE_CRM_BACKEND_URL?: string;
	readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
