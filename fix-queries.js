const fs = require('fs');

const fixFile = (path) => {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/await supabase\n\s*\.from/g, 'await (supabase as any)\n      .from');
  content = content.replace(/await supabaseAdmin\n\s*\.from/g, 'await (supabaseAdmin as any)\n      .from');
  content = content.replace(/await supabase\.from/g, 'await (supabase as any).from');
  content = content.replace(/await supabaseAdmin\.from/g, 'await (supabaseAdmin as any).from');
  fs.writeFileSync(path, content);
};

fixFile('src/supabase/queries.ts');
fixFile('src/routes/verification.ts');
