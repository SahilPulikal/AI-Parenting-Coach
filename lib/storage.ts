import { parseStored, serialize, type Conversation } from "./conversations";

// The only module that touches localStorage. Call these from client components after
// hydration (inside effects or event handlers), never during server rendering.
// Conversations stay in this browser: nothing here is sent to the server, and no
// credentials are ever stored.

const KEY = "ai-parenting-coach:conversations";

export function loadConversations(): Conversation[] {
  try {
    return parseStored(window.localStorage.getItem(KEY));
  } catch {
    return []; // storage blocked or unavailable
  }
}

/** Returns false when the write failed (quota exceeded, storage blocked, private mode). */
export function saveConversations(list: Conversation[]): boolean {
  try {
    if (list.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, serialize(list));
    return true;
  } catch {
    return false;
  }
}
