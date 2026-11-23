const assignments = /^[A-Za-z_][\w]*=/;

export function shellCommands(script, position) {
  if (/(?:^|\s)<<-?\s*[\w'"]/.test(script)) return [];
  const commands = [];
  const lines = script.split('\n');
  let words = [];
  let word = '';
  let quote;
  let wordLine;
  let line = position.line;
  let redirect = false;
  const push = () => {
    if (wordLine !== undefined && !redirect) words.push({ text: word, line: wordLine });
    word = '';
    wordLine = undefined;
  };
  const end = (separator) => {
    push();
    if (words.length) commands.push({ words, separator });
    words = [];
    redirect = false;
  };
  for (const [index, text] of lines.entries()) {
    let continued = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\\' && quote !== "'") {
        if (i === text.length - 1) {
          continued = true;
          break;
        }
        wordLine ??= line;
        word += text[++i];
      } else if (quote) {
        if (char === quote) quote = undefined;
        else word += char;
      } else if (char === '"' || char === "'") {
        wordLine ??= line;
        quote = char;
      } else if (char === '#' && wordLine === undefined) {
        break;
      } else if (/\s/.test(char)) {
        push();
      } else if (';&|'.includes(char)) {
        const doubled = char === text[i + 1];
        end(doubled ? char + char : char);
        if (doubled) i++;
      } else if ('<>'.includes(char)) {
        push();
        redirect = true;
      } else {
        wordLine ??= line;
        word += char;
      }
    }
    if (!continued) {
      if (quote) word += '\n';
      else if (position.folded && text.trim() && lines[index + 1]?.trim()) push();
      else end('\n');
    }
    line++;
  }
  end('\n');
  return commands;
}

export function executable(words) {
  let index = 0;
  while (index < words.length && (assignments.test(words[index].text)
    || ['env', 'sudo', 'command', 'then', 'do'].includes(words[index].text))) index++;
  return words.slice(index);
}

export function upgradesNpm(args) {
  const command = args.find((part) => !part.startsWith('-'));
  if (!['i', 'install'].includes(command)
    || !args.some((part) => ['-g', '--global', '--global=true'].includes(part))) return undefined;
  if (args.includes('npm@latest')) return 'latest';
  if (args.includes('npm') && !args.some((part) => /^--tag(?:=|$)/.test(part))) return 'bare';
  return undefined;
}

export function npxPackages(args) {
  const packages = [];
  for (let index = 0; index < args.length; index++) {
    const part = args[index];
    if (['--no', '--no-install', '--yes=false'].includes(part)) return [];
    if (['--package', '-p'].includes(part)) packages.push(args[++index]);
    else if (part.startsWith('--package=')) packages.push(part.slice('--package='.length));
    else if (part === '--') return packages.length ? packages : [args[index + 1]];
    else if (['--yes', '-y', '--quiet', '-q', '--yes=true'].includes(part)) continue;
    else if (part.startsWith('-')) return [];
    else return packages.length ? packages : [part];
  }
  return packages;
}
