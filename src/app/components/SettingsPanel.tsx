import { AboutSection } from './AboutSection';
import { SiteAccess } from './SiteAccess';
import { ThemeToggle } from './ThemeToggle';

/**
 * The settings popover, as a stack of bands rather than a list of actions.
 *
 * Each section owns whether it appears at all — Site access renders nothing
 * outside the extension — which is why the sections are components rather
 * than data passed to a generic renderer: a section that hid its contents but
 * kept its own heading would be the one broken row in the panel.
 *
 * Ordering runs from the setting people change most to the one they read
 * once. Support sits inside About because it is about the project, not a
 * fourth thing to configure.
 */
export function SettingsPanel() {
  return (
    <>
      <section className="settings-section" aria-label="Appearance">
        <div className="settings-legend">Appearance</div>
        <ThemeToggle />
      </section>
      <SiteAccess />
      <AboutSection />
    </>
  );
}
