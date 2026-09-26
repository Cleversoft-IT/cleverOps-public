import { stringify } from 'smol-toml';

// Sottoinsieme YAML dei metadati agent: scalari quotati e blocchi > / |.
// Le istruzioni dopo il frontmatter restano intatte, comprese virgolette e Unicode.
export function parseAgent(markdown, fallbackName) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const fields = {};
  if (match) {
    const lines = match[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const field = lines[i].match(/^([a-z_]+):\s*(.*)$/);
      if (!field || !['name', 'description'].includes(field[1])) continue;
      let value = field[2];
      if (/^[>|][+-]?$/.test(value)) {
        const folded = value[0] === '>';
        const block = [];
        while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1])) block.push(lines[++i].replace(/^\s+/, ''));
        value = block.join(folded ? ' ' : '\n').trim();
      } else if (value.startsWith('"')) {
        // YAML consente anche scalari su più righe, come gli esempi Claude.
        while (!value.endsWith('"') && i + 1 < lines.length) value += '\n' + lines[++i];
        try { value = JSON.parse(value); } catch { value = value.slice(1, -1).replace(/\\"/g, '"'); }
      } else if (value.startsWith("'")) {
        while (!value.endsWith("'") && i + 1 < lines.length) value += '\n' + lines[++i];
        value = value.slice(1, -1).replace(/''/g, "'");
      }
      fields[field[1]] = value;
    }
  }
  return {
    name: fields.name || fallbackName,
    description: (fields.description || fallbackName).replace(/<example\b[^>]*>[\s\S]*?<\/example>/gi, '').trim(),
    developer_instructions: (match ? markdown.slice(match[0].length) : markdown).trim(),
  };
}
export const codexAgent = (markdown, name) => stringify(parseAgent(markdown, name));
