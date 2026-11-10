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
  },
  backgroundColor: '#f8f9f6',
};

export default config;
