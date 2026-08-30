import { storage } from './state/storage-adapter';

/**
 * Deliberately its own key rather than a field on AppData: this records what
 * *this install* has already been asked, not anything the user authored. In
 * AppData it would ride along in a backup, and restoring that backup onto a
 * fresh machine would suppress the first-run choice on an install that has
 * granted nothing.
 */
// Frozen from first release for the same reason as STORAGE_KEY: changing it
// re-shows the first-run panel to everyone who has already answered it.
export const ONBOARDING_KEY = 'localrest:onboarding';

export type Onboarding = {
  /**
   * Whether the first-run site-access choice has been made. Once true the
   * panel never returns — whichever way it was answered, and including a
   * dismissal. Settings ⚙ → Site access is the way back.
   */
  siteAccessAsked: boolean;
};

const FIRST_RUN: Onboarding = { siteAccessAsked: false };

/** Exported for its own test; anything unrecognised reads as a first run. */
export function coerceOnboarding(stored: unknown): Onboarding {
  if (typeof stored !== 'object' || stored === null) return { ...FIRST_RUN };
  return { siteAccessAsked: (stored as Record<string, unknown>)['siteAccessAsked'] === true };
}

export async function readOnboarding(): Promise<Onboarding> {
  try {
    return coerceOnboarding(await storage.read(ONBOARDING_KEY));
  } catch {
    return { ...FIRST_RUN };
  }
}

export async function markSiteAccessAsked(): Promise<void> {
  try {
    await storage.write(ONBOARDING_KEY, { siteAccessAsked: true } satisfies Onboarding);
  } catch {
    // Swallowed on purpose. The cost is the panel appearing once more on the
    // next launch, which is a smaller failure than throwing out of the click
    // handler that is mid-way through granting a permission.
  }
}
