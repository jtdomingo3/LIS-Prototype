const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ejs')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Use a regex that allows > inside <%= %> by just lazily matching until the first > that is NOT part of %>
      // A simpler way: split by "<form" and then for each part, find the first ">" that closes it.
      let modified = false;
      
      const parts = content.split('<form');
      for (let i = 1; i < parts.length; i++) {
        let part = parts[i];
        // find the end of the form tag. We have to be careful about %>
        // Just find the first > that is not immediately preceded by %
        let closeIdx = -1;
        for (let j = 0; j < part.length; j++) {
          if (part[j] === '>') {
             if (j > 0 && part[j-1] === '%') {
                continue; // it's %>
             }
             closeIdx = j;
             break;
          }
        }
        
        if (closeIdx !== -1) {
          const formTag = part.substring(0, closeIdx + 1);
          if (/method=["'](POST|post|put|delete)["']/i.test(formTag)) {
            // Check if it already has _csrf right after
            const rest = part.substring(closeIdx + 1);
            if (!rest.match(/^\s*<input[^>]*name=["']_csrf["']/)) {
               parts[i] = formTag + '\n  <input type="hidden" name="_csrf" value="<%= typeof csrfToken !== \'undefined\' ? csrfToken : \'\' %>">' + rest;
               modified = true;
            }
          }
        }
      }

      if (modified) {
        content = parts.join('<form');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated:', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'views'));
console.log('Done.');
