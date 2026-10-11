// One capacity contract for local storage, recovery transport and run admission.
// These bounds do not change the version-one Brain or encryption formats.
export const MAX_BRAIN_BYTES = 128 * 1024 * 1024;
export const MAX_ENVELOPE_BYTES = 180 * 1024 * 1024;
export const MAX_TRANSFER_BYTES = 192 * 1024 * 1024;
export const BRAIN_INTAKE_BYTES = MAX_BRAIN_BYTES - 2 * 1024 * 1024;
export const MAX_FOLDER_BATCH_FILES = 100;
export const MAX_FOLDER_BATCH_BYTES = 4 * 1024 * 1024;
