const fs = require('fs');
let lines = fs.readFileSync('src/supabase/types/database.types.ts', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Relationships: [];')) {
     lines[i] = lines[i].replace('Relationships: [];', 'Relationships: { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[]; }[];');
  }
}
fs.writeFileSync('src/supabase/types/database.types.ts', lines.join('\n'));
