import {atom} from 'nanostores';

// Top-level app view: home (project list) → project (dashboard) → dialogue (workbench).
export type AppView = 'home' | 'project' | 'dialogue';

export const $appView = atom<AppView>('home');
