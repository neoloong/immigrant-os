// Remote-site shell: never point webDir at a static export of the live app.
// The owner must confirm this placeholder identifier before store registration.
// No CLI type import until app:install-tooling can resolve the official packages.
const config = {
  appId: 'com.neoloong.immigrantos',
  appName: 'Immigrant OS',
  webDir: 'mobile/www',
  server: {
    url: 'https://immigrant-os.neoloong.workers.dev',
    cleartext: false,
    // The Worker sits behind Cloudflare Access, which 302-redirects to the team
    // login domain. Capacitor hands any navigation to a host outside server.url
    // or allowNavigation to the system browser and cancels it in the WebView,
    // leaving the shell blank and the Access session cookie in Chrome instead
    // of the app. Keep the Access login flow inside the WebView:
    // - neoloong.cloudflareaccess.com: team login page + one-time PIN verify
    // - oauth-callbacks.cloudflareaccess.com / dash.cloudflare.com: the
    //   "Cloudflare account" identity provider round trip offered on that page
    // Exact hosts only (no wildcards): allowed hosts also get bridge access.
    allowNavigation: [
      'neoloong.cloudflareaccess.com',
      'oauth-callbacks.cloudflareaccess.com',
      'dash.cloudflare.com',
    ],
  },
  backgroundColor: '#f8f9f6',
};

export default config;
