const fs = require('fs');
let lines = fs.readFileSync('src/supabase/types/database.types.ts', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Relationships: [];')) {
     lines[i] = lines[i].replace('Relationships: [];', 'Relationships: any;');
  }
}
fs.writeFileSync('src/supabase/types/database.types.ts', lines.join('\n'));
