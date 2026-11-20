import type {StudioEngine} from './engine';
// Keep the running renderer across React UI refreshes during local editing.
export const runtime:{engine:StudioEngine|null}={engine:null};
