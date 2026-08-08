const fs = require('fs');
let lines = fs.readFileSync('src/supabase/types/database.types.ts', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Update: {')) {
    let j = i;
    while (j < lines.length && !lines[j].includes('        };')) {
      j++;
    }
    if (j < lines.length && !lines[j+1].includes('Relationships:')) {
       lines.splice(j + 1, 0, '        Relationships: [];');
    }
  }
}
fs.writeFileSync('src/supabase/types/database.types.ts', lines.join('\n'));
