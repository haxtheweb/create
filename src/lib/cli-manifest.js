// `hax list` and `hax completion` (haxtheweb/issues#3228): one machine
// readable description of the CLI, built from the commander program itself so
// it can never drift from what the CLI actually accepts.

// commander Option -> plain object
function optionInfo(option) {
  return {
    flags: option.flags,
    long: option.long || null,
    short: option.short || null,
    description: option.description || "",
    takesValue: !!(option.required || option.optional),
  };
}

function argumentInfo(arg) {
  return {
    name: arg.name(),
    required: !!arg.required,
    variadic: !!arg.variadic,
  };
}

/**
 * program: the commander root. actions: { [commandName]: [{value,label}] }
 * for commands whose first argument is an action (site, wc, skills, audit).
 */
export function buildCliManifest(
  program,
  actions = {},
  version = "",
  binName = "hax",
) {
  const commands = program.commands.map((cmd) => {
    const name = cmd.name();
    const list = actions[name] || [];
    return {
      name: name,
      aliases: cmd.aliases(),
      description: cmd.description() || "",
      arguments: (cmd.registeredArguments || []).map(argumentInfo),
      options: cmd.options.map(optionInfo),
      actions: list.map((a) => ({
        value: a.value,
        description: a.label || "",
      })),
    };
  });
  return {
    name: binName || program.name(),
    version: version,
    globalOptions: program.options.map(optionInfo),
    commands: commands,
  };
}

// plain-text listing for people
export function formatCliManifest(manifest) {
  const lines = [];
  for (const cmd of manifest.commands) {
    const alias = cmd.aliases.length ? ` (${cmd.aliases.join(", ")})` : "";
    lines.push(`${manifest.name} ${cmd.name}${alias}  ${cmd.description}`);
    for (const action of cmd.actions) {
      lines.push(`  ${action.value}  ${action.description}`);
    }
  }
  return lines.join("\n");
}

export const COMPLETION_SHELLS = ["bash", "zsh"];

// only word characters, : and - reach a generated script, so a label or
// option string can never break out of the quoting below
function shellWord(value) {
  return String(value).replace(/[^A-Za-z0-9:_@.-]/g, "");
}

function words(list) {
  return list.map(shellWord).filter(Boolean).join(" ");
}

function longFlags(options) {
  return options.map((o) => o.long).filter(Boolean);
}

function completionData(manifest) {
  const commandNames = [];
  const perCommand = [];
  for (const cmd of manifest.commands) {
    const names = [cmd.name, ...cmd.aliases];
    commandNames.push(...names);
    perCommand.push({
      names: names,
      actions: cmd.actions.map((a) => a.value),
      flags: [
        ...new Set([
          ...longFlags(cmd.options),
          ...longFlags(manifest.globalOptions),
        ]),
      ],
    });
  }
  return {
    commandNames: commandNames,
    globalFlags: longFlags(manifest.globalOptions),
    perCommand: perCommand,
  };
}

function bashScript(manifest) {
  const data = completionData(manifest);
  const bin = shellWord(manifest.name) || "hax";
  const fn = `_${bin.replace(/[^A-Za-z0-9_]/g, "_")}_completion`;
  const cases = data.perCommand
    .map(
      (c) =>
        `    ${c.names.map(shellWord).join("|")})\n` +
        `      actions="${words(c.actions)}"\n` +
        `      flags="${words(c.flags)}"\n` +
        `      ;;`,
    )
    .join("\n");
  return `# ${bin} bash completion. Add to ~/.bashrc: source <(${bin} completion bash)
${fn}() {
  local cur cmd actions flags
  cur="\${COMP_WORDS[COMP_CWORD]}"
  # ':' is a word break in bash; keep site:validate as one word
  COMP_WORDBREAKS=\${COMP_WORDBREAKS//:}
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${words(data.commandNames)} ${words(data.globalFlags)}" -- "$cur") )
    return 0
  fi
  cmd="\${COMP_WORDS[1]}"
  actions=""
  flags="${words(data.globalFlags)}"
  case "$cmd" in
${cases}
  esac
  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
  elif [ "$COMP_CWORD" -eq 2 ]; then
    COMPREPLY=( $(compgen -W "$actions" -- "$cur") )
  fi
  return 0
}
complete -F ${fn} ${bin}
`;
}

function zshScript(manifest) {
  const data = completionData(manifest);
  const bin = shellWord(manifest.name) || "hax";
  const cases = data.perCommand
    .map(
      (c) =>
        `    ${c.names.map(shellWord).join("|")})\n` +
        `      actions=(${words(c.actions)})\n` +
        `      flags=(${words(c.flags)})\n` +
        `      ;;`,
    )
    .join("\n");
  return `#compdef ${bin}
# ${bin} zsh completion. Add to ~/.zshrc after compinit: source <(${bin} completion zsh)
_${bin}() {
  local -a commands actions flags
  commands=(${words(data.commandNames)})
  flags=(${words(data.globalFlags)})
  if (( CURRENT == 2 )); then
    compadd -a commands
    compadd -a flags
    return
  fi
  actions=()
  case "\${words[2]}" in
${cases}
  esac
  if [[ "\${words[CURRENT]}" == -* ]]; then
    compadd -a flags
  elif (( CURRENT == 3 )); then
    compadd -a actions
  fi
}
compdef _${bin} ${bin}
`;
}

export function completionScript(shell, manifest) {
  if (shell === "zsh") {
    return zshScript(manifest);
  }
  return bashScript(manifest);
}
