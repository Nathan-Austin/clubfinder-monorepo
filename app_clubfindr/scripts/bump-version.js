const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const appJson = require(appJsonPath);

// Increment Android versionCode
if (appJson.expo.android && appJson.expo.android.versionCode) {
  const oldVersion = appJson.expo.android.versionCode;
  appJson.expo.android.versionCode = oldVersion + 1;
  console.log(`✅ Bumped Android versionCode from ${oldVersion} to ${appJson.expo.android.versionCode}`);
} else {
  console.error('❌ Could not find expo.android.versionCode in app.json');
  process.exit(1);
}

// Write back to file
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
