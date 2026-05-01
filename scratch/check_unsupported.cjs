
const fs = require('fs');

// Read App.tsx to find mappings
const appTsx = fs.readFileSync('c:/dev/ample/AmpleWeb/src/App.tsx', 'utf8');

// Simple regex to extract machine names from the list
const machineRegex = /<string>([^<]+)<\/string>\s*<\/dict>/g;
const modelsPlist = fs.readFileSync('c:/dev/ample/AmpleWeb/public/resources/models.plist', 'utf8');
let match;
const allMachines = [];
const valRegex = /<key>value<\/key>\s*<string>([^<]+)<\/string>/g;

while ((match = valRegex.exec(modelsPlist)) !== null) {
  allMachines.push(match[1]);
}

console.log(`Total machines in plist: ${allMachines.length}`);

// Check mapping in App.tsx
const unmapped = allMachines.filter(m => {
  // If it's not in getEmulatorForMachine specifically
  // or covered by a startsWith check
  const checkStr = `machineName.startsWith('${m.substring(0, 4)}'`; // Loose check
  // Actually let's look for specific mappings
  return !appTsx.includes(`'${m}'`) && !appTsx.includes(`startsWith('${m.substring(0, 3)}'`);
});

console.log('Unmapped or loosely mapped machines:');
console.log(JSON.stringify(unmapped, null, 2));
