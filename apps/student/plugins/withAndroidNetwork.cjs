const {withAndroidManifest, withDangerousMod} = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

function networkSecurityXml(localQa) {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="${localQa ? 'true' : 'false'}">
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;
}

function validateBuildUrl(value, localQa) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Set a valid EXPO_PUBLIC_API_URL.'); }
  if (url.username || url.password) throw new Error('API URL must not contain credentials.');
  if (url.protocol === 'https:') return;
  if (localQa && url.protocol === 'http:' && url.hostname === 'localhost') return;
  throw new Error('Android builds require HTTPS; --local-qa permits HTTP only to localhost through USB reverse.');
}

function withAndroidNetwork(config) {
  const localQa = process.env.HX_ANDROID_LOCAL_QA === '1';
  config = withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application[0];
    application.$['android:usesCleartextTraffic'] = 'false';
    application.$['android:networkSecurityConfig'] = '@xml/hostelxpress_network_security';
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(directory, {recursive: true});
    await fs.writeFile(path.join(directory, 'hostelxpress_network_security.xml'), networkSecurityXml(localQa));
    return mod;
  }]);
}
module.exports = withAndroidNetwork;
module.exports.networkSecurityXml = networkSecurityXml;
module.exports.validateBuildUrl = validateBuildUrl;
