/**
 * Wordmark Epibot — « { epibot } »
 * Accolades fines + "epibot" en gras bas-de-casse (piste V3).
 * Reprend le code Epitech { } (et le symbole du code). Utilise Archivo
 * (self-hosted, --font-display) donc rendu identique partout.
 *
 * `tone` : "light" = texte clair (sur fond bleu/sombre) ·
 *          "brand" = accolades + texte en bleu de marque (sur fond clair).
 */
export function Logo({
  size = 22,
  tone = 'light',
  className = '',
}: {
  size?: number;
  tone?: 'light' | 'brand';
  className?: string;
}) {
  const textColor = tone === 'brand' ? 'var(--color-accent)' : '#FFFFFF';
  const braceColor = tone === 'brand' ? 'var(--color-accent)' : 'rgba(255,255,255,0.85)';

  return (
    <span
      className={`inline-flex items-baseline font-display select-none ${className}`}
      style={{ fontSize: size, lineHeight: 1, letterSpacing: '-0.03em' }}
      aria-label="Epibot"
    >
      <span style={{ color: braceColor, fontWeight: 300, fontSize: '1.18em', margin: '0 0.1em' }}>
        {'{'}
      </span>
      <span style={{ color: textColor, fontWeight: 800 }}>epibot</span>
      <span style={{ color: braceColor, fontWeight: 300, fontSize: '1.18em', margin: '0 0.1em' }}>
        {'}'}
      </span>
    </span>
  );
}

/**
 * Monogramme compact « { e } » pour les espaces étroits (rail admin, favicon,
 * avatar). Même grammaire que le wordmark, réduite à l'initiale.
 */
export function LogoMark({
  size = 22,
  tone = 'light',
  className = '',
}: {
  size?: number;
  tone?: 'light' | 'brand';
  className?: string;
}) {
  const textColor = tone === 'brand' ? 'var(--color-accent)' : '#FFFFFF';
  const braceColor = tone === 'brand' ? 'var(--color-accent)' : 'rgba(255,255,255,0.85)';

  return (
    <span
      className={`inline-flex items-baseline font-display select-none ${className}`}
      style={{ fontSize: size, lineHeight: 1, letterSpacing: '-0.04em' }}
      aria-label="Epibot"
    >
      <span style={{ color: braceColor, fontWeight: 300 }}>{'{'}</span>
      <span style={{ color: textColor, fontWeight: 800, margin: '0 0.01em' }}>e</span>
      <span style={{ color: braceColor, fontWeight: 300 }}>{'}'}</span>
    </span>
  );
}
