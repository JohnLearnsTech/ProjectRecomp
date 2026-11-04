// Supabase's OAuth server sends the consent step to <site_url>/oauth/consent. While the Site URL
// is the app's own recomp://auth/callback, that arrives here as /auth/callback/oauth/consent,
// so point it at the consent screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return path.replace(/^(recomp:\/\/\/?)?\/?auth\/callback\/oauth\/consent/, (_m, scheme) => (scheme ? 'recomp:///' : '/') + 'oauth/consent');
  } catch {
    return path;
  }
}
