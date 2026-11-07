// Swaps each README video slot (<!-- video:slug --> … <!-- /video -->) for an
// inline GitHub video player. GitHub only plays videos hosted on
// github.com/user-attachments, so upload the MP4s first (drag them into any
// issue/PR comment box, copy the links, don't submit) and list them in a JSON
// file: { "01-modes": "https://github.com/user-attachments/assets/…", … }
// Usage: node scripts/demo/readme-videos.mjs <urls.json> [README.md]
import fs from "node:fs";

const [urlsFile, readme = "README.md"] = process.argv.slice(2);
const urls = JSON.parse(fs.readFileSync(urlsFile, "utf8"));
let md = fs.readFileSync(readme, "utf8");
let swapped = 0;
md = md.replace(/<!-- video:([\w-]+) -->\n[\s\S]*?\n<!-- \/video -->/g, (block, slug) => {
  const url = urls[slug];
  if (!url) return block;
  swapped++;
  // A bare user-attachments URL on its own line renders as a video player.
  return `<!-- video:${slug} -->\n\n${url}\n\n<!-- /video -->`;
});
fs.writeFileSync(readme, md);
console.log(`swapped ${swapped} video slot(s) in ${readme}`);
