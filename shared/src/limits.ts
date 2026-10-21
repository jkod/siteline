// Field limits enforced by the security rules and the UI (PRD section 10).
export const POST_TEXT_MAX = 5000;
export const COMMENT_TEXT_MAX = 2000;
export const UPDATE_MEDIA_MAX = 20;
export const QUESTION_MEDIA_MAX = 5;
export const COMMENT_MEDIA_MAX = 5;
export const NAME_MAX = 100;
export const TITLE_MAX = 120;
export const FEED_PAGE_SIZE = 20;

/** Photo sizes produced in the browser before upload (PRD 4.2). */
export const PHOTO_DISPLAY_MAX_PX = 2560;
export const PHOTO_THUMB_MAX_PX = 640;
export const PHOTO_JPEG_QUALITY = 0.8;
export const PHOTO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
