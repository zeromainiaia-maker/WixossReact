declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;

declare const __GIT_SHA__: string;
/** バグ報告が「どのビルドの話か」を確定するための短い git sha（`C-0`）。git が無ければ 'nogit'。 */
export const GIT_SHA: string = __GIT_SHA__;
/** 報告に載せる版（`v0.505+ab12cd3`）。 */
export const BUILD_ID: string = `${APP_VERSION}+${GIT_SHA}`;
